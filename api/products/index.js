import { createPool } from "../lib/db.js";
import { handleDbError } from "../lib/errors.js";
import { parsePaginationParams } from "../lib/validation.js";
import { CACHE_CONTROL_HEADER, PRODUCT_TYPE_FINISHED_GOOD } from "../lib/constants.js";

/**
 * GET /api/products
 * Fetches paginated list of finished-good products with optional search.
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.page] - Page number (1-indexed, default: 1)
 * @param {string} [req.query.limit] - Items per page (default: 20, max: 100)
 * @param {string} [req.query.search] - Search term for product/company name
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let pool;
  try {
    pool = createPool();

    const { page, limit, offset } = parsePaginationParams(req.query);
    const search = (req.query.search || "").trim();

    let countQuery = `
      SELECT COUNT(*) as total
      FROM product p
      JOIN company c ON p.company_id = c.id
      WHERE p.type = $1
    `;

    let dataQuery = `
      SELECT p.id, p.sku as name, p.type, c.name as company
      FROM product p
      JOIN company c ON p.company_id = c.id
      WHERE p.type = $1
    `;

    const params = [PRODUCT_TYPE_FINISHED_GOOD];

    if (search) {
      const searchCondition = ` AND (p.sku ILIKE $2 OR c.name ILIKE $2)`;
      countQuery += searchCondition;
      dataQuery += searchCondition;
      params.push(`%${search}%`);
    }

    dataQuery += ` ORDER BY c.name, p.sku LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [countResult, productsResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(dataQuery, [...params, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0]?.total || "0");

    res.setHeader("Cache-Control", CACHE_CONTROL_HEADER);
    return res.status(200).json({
      products: productsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleDbError(res, error, "Products API");
  } finally {
    if (pool) await pool.end();
  }
}
