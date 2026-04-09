import { substitutionHandler } from "./[componentId].js";

/**
 * GET /api/substitution/component?id=:componentId
 * Stable non-dynamic alias for environments where dynamic function routing
 * can fall through to static rewrites.
 */
export default async function handler(req, res) {
  const componentId = req.query.id ?? req.query.componentId;
  const patchedReq = {
    ...req,
    query: {
      ...req.query,
      componentId,
    },
  };

  return substitutionHandler(patchedReq, res);
}
