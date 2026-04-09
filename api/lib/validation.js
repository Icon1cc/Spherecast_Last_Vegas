/**
 * @fileoverview Input validation utilities for API routes.
 * Provides reusable validators for common input patterns.
 */

import {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MIN_LIMIT,
  MAX_LIMIT,
} from "./constants.js";

/**
 * Pagination parameters result.
 * @typedef {Object} PaginationParams
 * @property {number} page - Current page number (1-indexed)
 * @property {number} limit - Items per page
 * @property {number} offset - SQL offset value
 */

/**
 * Parses and validates pagination parameters from query string.
 * @param {Object} query - Request query object
 * @param {string} [query.page] - Page number (1-indexed)
 * @param {string} [query.limit] - Items per page
 * @returns {PaginationParams} Validated pagination parameters
 */
export function parsePaginationParams(query) {
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);

  const page = Number.isNaN(rawPage) || rawPage < 1 ? DEFAULT_PAGE : rawPage;
  const limit = Number.isNaN(rawLimit)
    ? DEFAULT_LIMIT
    : Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, rawLimit));

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

/**
 * Validates that a value is a positive integer.
 * @param {string|number|undefined} value - Value to validate
 * @returns {{ valid: boolean, value: number|null, error: string|null }}
 */
export function validatePositiveInteger(value) {
  if (value === undefined || value === null || value === "") {
    return { valid: false, value: null, error: "Value is required" };
  }

  const parsed = parseInt(String(value), 10);

  if (Number.isNaN(parsed)) {
    return { valid: false, value: null, error: "Value must be a valid integer" };
  }

  if (parsed < 1) {
    return { valid: false, value: null, error: "Value must be a positive integer" };
  }

  return { valid: true, value: parsed, error: null };
}

/**
 * Validates a product/component ID from request.
 * @param {string|number|undefined} id - ID to validate
 * @returns {{ valid: boolean, id: number|null, error: string|null }}
 */
export function validateId(id) {
  const result = validatePositiveInteger(id);
  return {
    valid: result.valid,
    id: result.value,
    error: result.error ? `ID validation failed: ${result.error}` : null,
  };
}

/**
 * Validates analysis weights from request body.
 * @param {Object} weights - Weights object
 * @returns {{ valid: boolean, weights: Object|null, error: string|null }}
 */
export function validateAnalysisWeights(weights) {
  if (!weights || typeof weights !== "object") {
    return { valid: false, weights: null, error: "Weights object is required" };
  }

  const requiredFields = ["price", "quality", "compliance", "consolidation", "leadTime"];
  const normalizedWeights = {};

  for (const field of requiredFields) {
    const value = weights[field];

    if (value === undefined || value === null) {
      return { valid: false, weights: null, error: `Missing required weight: ${field}` };
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      return { valid: false, weights: null, error: `Invalid weight value for ${field}` };
    }

    // Clamp weights between 1 and 10
    normalizedWeights[field] = Math.max(1, Math.min(10, parsed));
  }

  return { valid: true, weights: normalizedWeights, error: null };
}

/**
 * Validates a non-empty string.
 * @param {unknown} value - Value to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {{ valid: boolean, value: string|null, error: string|null }}
 */
export function validateNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    return { valid: false, value: null, error: `${fieldName} must be a string` };
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return { valid: false, value: null, error: `${fieldName} cannot be empty` };
  }

  return { valid: true, value: trimmed, error: null };
}

/**
 * Validates an optional string with a default value.
 * @param {unknown} value - Value to validate
 * @param {string} defaultValue - Default value if invalid/empty
 * @returns {string} The validated string or default
 */
export function validateOptionalString(value, defaultValue) {
  if (typeof value !== "string" || !value.trim()) {
    return defaultValue;
  }
  return value.trim();
}

/**
 * Validates an optional integer within a range.
 * @param {unknown} value - Value to validate
 * @param {number} defaultValue - Default value if invalid
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} The validated integer or default
 */
export function validateOptionalIntegerInRange(value, defaultValue, min, max) {
  const parsed = parseInt(String(value ?? ""), 10);

  if (Number.isNaN(parsed)) {
    return defaultValue;
  }

  return Math.max(min, Math.min(max, parsed));
}

/**
 * Validates that the request method is allowed.
 * @param {import('http').IncomingMessage} req - Request object
 * @param {import('http').ServerResponse} res - Response object
 * @param {string|string[]} allowedMethods - Allowed HTTP method(s)
 * @returns {boolean} True if method is allowed, false otherwise (response sent)
 */
export function validateMethod(req, res, allowedMethods) {
  const methods = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];

  if (!methods.includes(req.method)) {
    res.setHeader("Allow", methods.join(", "));
    res.status(405).json({ error: "Method not allowed" });
    return false;
  }

  return true;
}

export default {
  parsePaginationParams,
  validatePositiveInteger,
  validateId,
  validateAnalysisWeights,
  validateNonEmptyString,
  validateOptionalString,
  validateOptionalIntegerInRange,
  validateMethod,
};
