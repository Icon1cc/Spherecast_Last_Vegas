import { createPool } from "../lib/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { handleDbError } from "../lib/errors.js";
import { validateId, validateAnalysisWeights } from "../lib/validation.js";
import {
  GEMINI_DEFAULT_MODEL,
  ANALYSIS_BASE_SCORE,
  ANALYSIS_MAX_SCORE,
  ANALYSIS_WEIGHT_NORMALIZATION,
  ANALYSIS_SCORE_INCREMENT,
  ANALYSIS_ALTERNATIVE_DEGRADATION,
  ANALYSIS_MAX_ALTERNATIVES,
} from "../lib/constants.js";

/**
 * POST /api/analysis/component
 * Analyzes suppliers for a component and returns weighted recommendations.
 * @param {Object} req.body - Request body
 * @param {number} req.body.componentId - Component/product ID to analyze
 * @param {Object} req.body.weights - Weight priorities (each 1-10)
 * @param {number} req.body.weights.price - Price / cost priority
 * @param {number} req.body.weights.regulatory - Regulatory compliance (EU/US market bans)
 * @param {number} req.body.weights.certFit - Certification fit (vegan/halal/kosher/non-GMO/organic)
 * @param {number} req.body.weights.supplyRisk - Supply risk (patent lock, single manufacturer, geography)
 * @param {number} req.body.weights.functionalFit - Functional fit (role match, bioequivalence)
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { componentId: rawComponentId, weights: rawWeights } = req.body || {};

  const { valid: idValid, id: componentId, error: idError } = validateId(rawComponentId);
  if (!idValid) {
    return res.status(400).json({ error: idError || "componentId is required" });
  }

  const { valid: weightsValid, weights, error: weightsError } = validateAnalysisWeights(rawWeights);
  if (!weightsValid) {
    return res.status(400).json({ error: weightsError || "weights object is required" });
  }

  let pool;
  try {
    pool = createPool();

    // Get component + enrichment profile in one query
    const componentQuery = `
      SELECT
        p.id, p.sku AS name,
        cn.cas_number,
        ip.canonical_name, ip.functional_role,
        ip.market_ban_eu, ip.market_ban_us,
        ip.vegan_status, ip.halal_status, ip.kosher_status,
        ip.non_gmo_status, ip.organic_status,
        ip.patent_lock, ip.single_manufacturer
      FROM product p
      LEFT JOIN component_normalized cn ON cn.raw_product_id = p.id
      LEFT JOIN ingredient_profile ip ON ip.cas_number = cn.cas_number
      WHERE p.id = $1
      LIMIT 1
    `;
    const componentResult = await pool.query(componentQuery, [componentId]);

    if (componentResult.rows.length === 0) {
      return res.status(404).json({ error: "Component not found" });
    }

    const component = componentResult.rows[0];

    // Get suppliers with enrichment data for this component
    const suppliersQuery = `
      SELECT s.id, s.name, sp.country, sp.region, sp.price_per_unit, sp.price_currency, sp.price_unit, sp.certifications, sp.refs
      FROM supplier_product sp
      JOIN supplier s ON sp.supplier_id = s.id
      WHERE sp.product_id = $1
      ORDER BY sp.price_per_unit ASC NULLS LAST, s.name
    `;
    const suppliersResult = await pool.query(suppliersQuery, [componentId]);
    const suppliers = suppliersResult.rows;

    // Calculate scores using constants
    const { price, regulatory, certFit, supplyRisk, functionalFit } = weights;
    const totalWeight = price + regulatory + certFit + supplyRisk + functionalFit;
    const normalizedScore = ANALYSIS_BASE_SCORE + (totalWeight / ANALYSIS_WEIGHT_NORMALIZATION) * ANALYSIS_SCORE_INCREMENT;
    const baseScore = Math.min(normalizedScore, ANALYSIS_MAX_SCORE);

    const recommendedSupplier = suppliers[0];
    const alternatives = suppliers.slice(1, ANALYSIS_MAX_ALTERNATIVES + 1);

    // Build detailed reasoning
    let reasoning = "";
    let reasoningDetails = null;

    if (recommendedSupplier) {
      // Build structured reasoning details
      reasoningDetails = {
        summary: `${recommendedSupplier.name} is recommended as the top supplier for ${component.canonical_name ?? component.name}.`,
        price_analysis: recommendedSupplier.price_per_unit
          ? `Offers competitive pricing at ${recommendedSupplier.price_currency ?? '$'}${recommendedSupplier.price_per_unit}/${recommendedSupplier.price_unit ?? 'unit'}.`
          : "Pricing information pending - contact supplier for quotes.",
        compliance: buildComplianceReasoning(component),
        supply_chain: buildSupplyChainReasoning(component, recommendedSupplier, suppliers.length),
        certifications: buildCertificationReasoning(recommendedSupplier.certifications, component),
      };

      // Get AI-enhanced reasoning if Gemini key available
      const geminiKey = process.env.GEMINI_API_KEY?.trim();
      if (geminiKey) {
        try {
          const genAI = new GoogleGenerativeAI(geminiKey);
          const model = genAI.getGenerativeModel({
            model: GEMINI_DEFAULT_MODEL,
            generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
          });

          const supplierDetails = suppliers.slice(0, 5).map(s => {
            const price = s.price_per_unit ? `${s.price_currency ?? '$'}${s.price_per_unit}/${s.price_unit ?? 'unit'}` : 'price unknown';
            const certs = s.certifications ? Object.entries(s.certifications).map(([k,v]) => `${k}:${v}`).join(', ') : 'none';
            return `- ${s.name} (${s.country ?? 'unknown'}): ${price}, certifications: ${certs}`;
          }).join('\n');

          const prompt = `You are a supply chain advisor for CPG/dietary supplement manufacturing. Analyze and recommend a supplier.

INGREDIENT: ${component.canonical_name ?? component.name}
CAS NUMBER: ${component.cas_number ?? 'unknown'}
FUNCTIONAL ROLE: ${component.functional_role ?? 'unknown'}

COMPLIANCE PROFILE:
- Vegan: ${component.vegan_status ?? 'unknown'}
- Halal: ${component.halal_status ?? 'unknown'}
- Kosher: ${component.kosher_status ?? 'unknown'}
- Non-GMO: ${component.non_gmo_status ?? 'unknown'}
- EU Market: ${component.market_ban_eu ?? 'unknown'}
- US Market: ${component.market_ban_us ?? 'unknown'}
- Patent Lock: ${component.patent_lock ?? 'unknown'}
- Single Manufacturer: ${component.single_manufacturer ?? 'unknown'}

USER PRIORITIES (1-10):
- Price/Cost: ${price}
- Regulatory Compliance: ${regulatory}
- Certification Fit: ${certFit}
- Supply Risk: ${supplyRisk}
- Functional Fit: ${functionalFit}

AVAILABLE SUPPLIERS:
${supplierDetails}

Based on the user's priorities, explain why ${recommendedSupplier.name} is the BEST choice. Provide:
1. A 1-sentence summary of why they're #1
2. Key advantages (price, compliance, geography, certifications)
3. Any considerations or trade-offs

Keep response to 3-4 sentences total, focused on VALUE to the buyer.`;

          const result = await model.generateContent(prompt);
          reasoning = result.response.text().trim();
        } catch (aiErr) {
          console.error("AI reasoning error:", aiErr);
          // Fall through to deterministic reasoning
        }
      }

      // Fallback to deterministic reasoning if AI failed
      if (!reasoning) {
        reasoning = buildDeterministicReasoning(recommendedSupplier, component, weights, suppliers.length);
      }
    } else {
      reasoning = "No suppliers found for this component in the database.";
    }

    return res.status(200).json({
      component: { id: component.id, name: component.name },
      recommendedSupplier: recommendedSupplier ? {
        name: recommendedSupplier.name,
        score: Math.round(baseScore * 100) / 100,
        reasoning,
        reasoningDetails,
        country: recommendedSupplier.country,
        price: recommendedSupplier.price_per_unit,
        priceCurrency: recommendedSupplier.price_currency,
        priceUnit: recommendedSupplier.price_unit,
        certifications: recommendedSupplier.certifications,
        refs: recommendedSupplier.refs,
      } : {
        name: "No suppliers available",
        score: 0,
        reasoning: "No suppliers found for this component.",
        reasoningDetails: null,
      },
      alternatives: alternatives.map((s, i) => ({
        name: s.name,
        score: Math.round((baseScore - ANALYSIS_ALTERNATIVE_DEGRADATION * (i + 1)) * 100) / 100,
        reasoning: buildAlternativeReasoning(s, recommendedSupplier),
        country: s.country,
        price: s.price_per_unit,
      })),
      metrics: { price, regulatory, certFit, supplyRisk, functionalFit },
      supplierCount: suppliers.length,
    });
  } catch (error) {
    return handleDbError(res, error, "Analysis API");
  } finally {
    if (pool) await pool.end();
  }
}

function buildComplianceReasoning(component) {
  const items = [];
  if (component.market_ban_eu === 'permitted') items.push('EU market approved');
  if (component.market_ban_us === 'permitted') items.push('US market approved');
  if (component.vegan_status === 'yes') items.push('Vegan certified');
  if (component.halal_status === 'compliant') items.push('Halal compliant');
  if (component.kosher_status === 'compliant') items.push('Kosher compliant');

  return items.length > 0
    ? `Compliance: ${items.join(', ')}.`
    : 'Compliance status: verify with supplier documentation.';
}

function buildSupplyChainReasoning(component, supplier, totalSuppliers) {
  const risks = [];
  const benefits = [];

  if (component.single_manufacturer === 'yes') {
    risks.push('single-manufacturer ingredient');
  } else if (totalSuppliers > 2) {
    benefits.push(`${totalSuppliers} suppliers available for diversification`);
  }

  if (component.patent_lock === 'yes') {
    risks.push('patent restrictions may apply');
  } else if (component.patent_lock === 'no') {
    benefits.push('no patent restrictions');
  }

  if (supplier.country) {
    benefits.push(`sourced from ${supplier.country}`);
  }

  if (risks.length > 0) {
    return `Supply considerations: ${risks.join(', ')}. ${benefits.length > 0 ? `Advantages: ${benefits.join(', ')}.` : ''}`;
  }
  return benefits.length > 0 ? `Supply advantages: ${benefits.join(', ')}.` : 'Standard supply chain profile.';
}

function buildCertificationReasoning(certifications, component) {
  if (!certifications || Object.keys(certifications).length === 0) {
    return 'Certifications: contact supplier for documentation.';
  }
  const certList = Object.entries(certifications).map(([k, v]) => `${k}: ${v}`).join(', ');
  return `Certifications: ${certList}.`;
}

function buildDeterministicReasoning(supplier, component, weights, supplierCount) {
  const parts = [];

  parts.push(`${supplier.name} is recommended for ${component.canonical_name ?? component.name}`);

  // Price reasoning
  if (supplier.price_per_unit) {
    parts.push(`offering ${supplier.price_currency ?? '$'}${supplier.price_per_unit}/${supplier.price_unit ?? 'unit'}`);
  }

  // Location
  if (supplier.country) {
    parts.push(`based in ${supplier.country}`);
  }

  // Compliance highlights
  const compliance = [];
  if (component.market_ban_eu === 'permitted') compliance.push('EU approved');
  if (component.market_ban_us === 'permitted') compliance.push('US approved');
  if (compliance.length > 0) {
    parts.push(`with ${compliance.join(' and ')} market access`);
  }

  // Supply chain
  if (supplierCount > 1) {
    parts.push(`This supplier leads ${supplierCount} available options, providing supply chain flexibility.`);
  }

  return parts.join(', ') + '.';
}

function buildAlternativeReasoning(altSupplier, recommendedSupplier) {
  const parts = ['Alternative supplier'];

  if (altSupplier.country && altSupplier.country !== recommendedSupplier?.country) {
    parts.push(`in ${altSupplier.country} for geographic diversification`);
  }

  if (altSupplier.price_per_unit && recommendedSupplier?.price_per_unit) {
    if (altSupplier.price_per_unit < recommendedSupplier.price_per_unit) {
      parts.push('with lower pricing');
    } else if (altSupplier.price_per_unit > recommendedSupplier.price_per_unit) {
      parts.push('at premium pricing');
    }
  }

  return parts.join(' ') + '.';
}
