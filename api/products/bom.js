import { createPool } from "../lib/db.js";
import { handleDbError } from "../lib/errors.js";
import { validateId } from "../lib/validation.js";
import { CACHE_CONTROL_HEADER, PRODUCT_TYPE_RAW_MATERIAL } from "../lib/constants.js";

/**
 * GET /api/products/bom?id=:productId
 * Fetches Bill of Materials (BOM) components for a finished-good product.
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.id - Product ID (required)
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { valid, id: productId, error: validationError } = validateId(req.query.id);
  if (!valid) {
    return res.status(400).json({ error: validationError || "Product ID required" });
  }

  let pool;
  try {
    pool = createPool();

    const bomResult = await pool.query(
      `SELECT b.id as bom_id FROM bom b WHERE b.produced_product_id = $1`,
      [productId]
    );

    if (bomResult.rows.length === 0) {
      return res.status(200).json({ components: [] });
    }

    const bomId = bomResult.rows[0].bom_id;
    const componentsResult = await pool.query(
      `SELECT p.id, p.sku as name,
              CASE WHEN p.type = $1 THEN 'Raw Material' ELSE 'Component' END as category
       FROM bom_component bc
       JOIN product p ON bc.consumed_product_id = p.id
       WHERE bc.bom_id = $2
       ORDER BY p.sku`,
      [PRODUCT_TYPE_RAW_MATERIAL, bomId]
    );

    res.setHeader("Cache-Control", CACHE_CONTROL_HEADER);
    return res.status(200).json({
      bomId,
      components: componentsResult.rows,
    });
  } catch (error) {
    return handleDbError(res, error, "BOM API");
  } finally {
    if (pool) await pool.end();
  }
}
