import { createPool } from "../../lib/db.js";

function sanitizeErrorMessage(message) {
  if (!message) return "Unknown error";
  return String(message)
    .replace(/(postgres(ql)?:\/\/)([^@]+)@/gi, "$1***@")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function classifyDbError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Database connection string not found")) {
    return {
      status: 500,
      body: {
        error: "Database not configured",
        details: "Set POSTGRES_URL in Vercel environment variables and redeploy.",
      },
    };
  }

  if (message.includes('relation "bom" does not exist') || message.includes('relation "bom_component" does not exist')) {
    return {
      status: 500,
      body: {
        error: "Database schema missing",
        details: "Required tables are missing. Run postgres schema + migration on your Vercel Postgres DB.",
      },
    };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Product ID required" });
  }

  let pool;
  try {
    pool = createPool();

    // Get BOM for this product
    const bomResult = await pool.query(
      `SELECT b.id as bom_id FROM bom b WHERE b.produced_product_id = $1`,
      [id]
    );

    if (bomResult.rows.length === 0) {
      return res.status(200).json({ components: [] });
    }

    const bomId = bomResult.rows[0].bom_id;

    // Get components (raw materials)
    const componentsResult = await pool.query(
      `SELECT p.id, p.sku as name,
              CASE WHEN p.type = 'raw-material' THEN 'Raw Material' ELSE 'Component' END as category
       FROM bom_component bc
       JOIN product p ON bc.consumed_product_id = p.id
       WHERE bc.bom_id = $1
       ORDER BY p.sku`,
      [bomId]
    );

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res.status(200).json({
      bomId,
      components: componentsResult.rows,
    });
  } catch (error) {
    console.error("BOM API error:", error);
    const classified = classifyDbError(error);
    if (classified) {
      return res.status(classified.status).json(classified.body);
    }
    return res.status(500).json({
      error: "Failed to fetch BOM",
      details: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
    });
  } finally {
    if (pool) await pool.end();
  }
}
