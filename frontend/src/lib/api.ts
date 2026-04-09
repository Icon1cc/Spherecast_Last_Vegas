// API client for SupplyWise backend

export interface Product {
  id: number;
  name: string;
  company: string;
  type?: string;
}

export interface ProductsResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BomComponent {
  id: number;
  name: string;
  category: string;
}

export interface BomResponse {
  bomId?: number;
  components: BomComponent[];
}

export interface ChatResponse {
  response: string;
  timestamp: string;
}

export interface AnalysisWeights {
  price: number;
  regulatory: number;
  certFit: number;
  supplyRisk: number;
  functionalFit: number;
}

export interface Supplier {
  name: string;
  score: number;
  reasoning: string;
  country?: string;
  price?: number;
}

export interface ReasoningDetails {
  summary: string;
  price_analysis: string;
  compliance: string;
  supply_chain: string;
  certifications: string;
}

export interface RecommendedSupplier extends Supplier {
  reasoningDetails?: ReasoningDetails | null;
  priceCurrency?: string;
  priceUnit?: string;
  certifications?: Record<string, string>;
  refs?: Array<{ url: string; note?: string }>;
}

export interface AnalysisResponse {
  component: {
    id: number;
    name: string;
  };
  recommendedSupplier: RecommendedSupplier;
  alternatives: Supplier[];
  metrics: AnalysisWeights;
  supplierCount: number;
}

async function buildApiError(response: Response, fallbackMessage: string): Promise<Error> {
  try {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const error = typeof payload?.error === "string" ? payload.error : "";
      const details = typeof payload?.details === "string" ? payload.details : "";
      const message = [error, details].filter(Boolean).join(": ").trim();
      return new Error(message ? `${fallbackMessage}: ${message}` : fallbackMessage);
    }

    const text = (await response.text()).trim();
    return new Error(text ? `${fallbackMessage}: ${text}` : fallbackMessage);
  } catch {
    return new Error(fallbackMessage);
  }
}

// Fetch products with pagination and search
export async function getProducts(
  page = 1,
  limit = 20,
  search = ""
): Promise<ProductsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  if (search) params.set("search", search);

  const response = await fetch(`/api/products?${params}`);
  if (!response.ok) {
    throw await buildApiError(response, "Failed to fetch products");
  }
  return response.json();
}

// Fetch BOM components for a product
export async function getProductBom(productId: number): Promise<BomResponse> {
  const response = await fetch(`/api/products/bom?id=${productId}`);
  if (!response.ok) {
    throw await buildApiError(response, "Failed to fetch BOM");
  }
  return response.json();
}

// Send chat message and get AI response
export async function sendChatMessage(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<ChatResponse> {
  const response = await fetch("/api/chat/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to send message");
  }
  return response.json();
}

export interface SubstitutionRef {
  url: string;
  note?: string;
}

export interface SubstitutionTier1 {
  supplier_id: number;
  supplier_name: string;
  country: string | null;
  region: string | null;
  price_per_unit: number | null;
  price_unit: string | null;
  price_moq: string | null;
  price_currency: string | null;
  certifications: Record<string, string> | null;
  sup_url: string | null;
  product_page_url: string | null;
  spec_sheet_url: string | null;
  refs: SubstitutionRef[] | null;
  score?: number;
}

export interface SubstitutionTier2 {
  cas_number: string;
  canonical_name: string;
  vegan_status: string | null;
  halal_status: string | null;
  kosher_status: string | null;
  market_ban_eu: string | null;
  market_ban_us: string | null;
  patent_lock: string | null;
  supplier_id: number;
  supplier_name: string;
  country: string | null;
  price_per_unit: number | null;
  certifications: Record<string, string> | null;
  score?: number;
}

export interface SubstitutionReasoning {
  functional_equivalence: string;
  compliance_fit: string;
  supply_risk: string;
  cost_impact: string | null;
}

export interface SubstitutionResponse {
  component: {
    id: number;
    name: string;
    cas_number: string | null;
    canonical_name: string | null;
    functional_role: string | null;
  };
  complianceProfile: {
    vegan_status: string | null;
    vegetarian_status: string | null;
    halal_status: string | null;
    kosher_status: string | null;
    non_gmo_status: string | null;
    organic_status: string | null;
    market_ban_eu: string | null;
    market_ban_us: string | null;
    patent_lock: string | null;
    single_manufacturer: string | null;
    allergen_flags: string[] | null;
    label_form_claim: string | null;
    health_claim_form: string | null;
  };
  tier1: SubstitutionTier1[];
  tier2: SubstitutionTier2[];
  aiRecommendation: {
    recommendation: string;
    tier: number;
    confidence: number;
    reasoning: SubstitutionReasoning;
    sources?: SubstitutionRef[];
  } | null;
  weights: AnalysisWeights;
}

// Analyze component suppliers with weighted scoring
export async function getComponentAnalysis(
  componentId: number,
  weights: AnalysisWeights
): Promise<AnalysisResponse> {
  const response = await fetch("/api/analysis/component", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ componentId, weights }),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to analyze component");
  }
  return response.json();
}

// Fetch tiered substitution candidates for a component
export async function getSubstitutionCandidates(
  componentId: number,
  weights?: Partial<AnalysisWeights>
): Promise<SubstitutionResponse> {
  const params = new URLSearchParams({ id: componentId.toString() });
  if (weights) {
    const weightsParam = Object.entries(weights).map(([k, v]) => `${k}:${v}`).join(",");
    if (weightsParam) params.set("weights", weightsParam);
  }

  const url = `/api/substitution/component?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw await buildApiError(response, "Failed to fetch substitution candidates");
  }
  return response.json();
}
