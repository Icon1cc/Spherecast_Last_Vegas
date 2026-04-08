import { createPool } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let pool;
  try {
    pool = createPool();

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    let countQuery = `
      SELECT COUNT(*) as total
      FROM product p
      JOIN company c ON p.company_id = c.id
      WHERE p.type = 'finished-good'
    `;

    let dataQuery = `
      SELECT p.id, p.sku as name, p.type, c.name as company
      FROM product p
      JOIN company c ON p.company_id = c.id
      WHERE p.type = 'finished-good'
    `;

    const params = [];

    if (search) {
      const searchCondition = ` AND (p.sku ILIKE $1 OR c.name ILIKE $1)`;
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

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
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
    console.error("Products API error:", error);
    return res.status(500).json({ error: "Failed to fetch products" });
  } finally {
    if (pool) await pool.end();
  }
}
