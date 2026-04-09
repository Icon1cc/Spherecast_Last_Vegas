/**
 * @fileoverview Shared error handling utilities for API routes.
 * Provides consistent error sanitization, classification, and response formatting.
 */

/**
 * Sanitizes error messages by removing sensitive information like credentials.
 * @param {string|null|undefined} message - The raw error message
 * @returns {string} Sanitized error message safe for client response
 */
export function sanitizeErrorMessage(message) {
  if (!message) return "Unknown error";
  return String(message)
    .replace(/(postgres(ql)?:\/\/)([^@]+)@/gi, "$1***@")
    .replace(/password=\S+/gi, "password=***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

/**
 * Database error classification result.
 * @typedef {Object} ClassifiedError
 * @property {number} status - HTTP status code
 * @property {Object} body - Response body
 * @property {string} body.error - User-friendly error message
 * @property {string} body.details - Additional context for debugging
 */

/**
 * Classifies database errors into user-friendly responses.
 * @param {Error|unknown} error - The caught error
 * @returns {ClassifiedError|null} Classified error or null if not a known DB error
 */
export function classifyDbError(error) {
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

  if (
    message.includes('relation "product" does not exist') ||
    message.includes('relation "company" does not exist')
  ) {
    return {
      status: 500,
      body: {
        error: "Database schema missing",
        details: "Required tables (product, company) are missing. Run the schema migration.",
      },
    };
  }

  if (
    message.includes('relation "bom" does not exist') ||
    message.includes('relation "bom_component" does not exist')
  ) {
    return {
      status: 500,
      body: {
        error: "Database schema missing",
        details: "Required tables (bom, bom_component) are missing. Run the schema migration.",
      },
    };
  }

  if (
    message.includes('relation "supplier" does not exist') ||
    message.includes('relation "supplier_product" does not exist')
  ) {
    return {
      status: 500,
      body: {
        error: "Database schema missing",
        details: "Required tables (supplier, supplier_product) are missing. Run the schema migration.",
      },
    };
  }

  if (message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT")) {
    return {
      status: 503,
      body: {
        error: "Database unavailable",
        details: "Could not connect to the database. Please try again later.",
      },
    };
  }

  return null;
}

/**
 * Creates a standardized error response.
 * @param {import('http').ServerResponse} res - Express/Vercel response object
 * @param {number} status - HTTP status code
 * @param {string} error - Error message
 * @param {string} [details] - Optional details
 * @returns {void}
 */
export function sendErrorResponse(res, status, error, details = undefined) {
  const body = { error };
  if (details) {
    body.details = details;
  }
  return res.status(status).json(body);
}

/**
 * Handles database errors with proper classification and logging.
 * @param {import('http').ServerResponse} res - Express/Vercel response object
 * @param {Error|unknown} error - The caught error
 * @param {string} context - Context for logging (e.g., "Products API")
 * @returns {void}
 */
export function handleDbError(res, error, context) {
  console.error(`${context} error:`, error);

  const classified = classifyDbError(error);
  if (classified) {
    return res.status(classified.status).json(classified.body);
  }

  return sendErrorResponse(
    res,
    500,
    `Failed to complete ${context.toLowerCase()}`,
    sanitizeErrorMessage(error instanceof Error ? error.message : String(error))
  );
}

export default {
  sanitizeErrorMessage,
  classifyDbError,
  sendErrorResponse,
  handleDbError,
};
