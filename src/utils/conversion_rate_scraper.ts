/**
 * Oracle conversion-rate scraper helpers with overflow / digit-limit validation.
 * Rejects rates and notionals whose digit count would risk unsafe numeric overflow.
 */

import {
  digitCount,
  parseIntegerInput,
  MAX_SAFE_DIGITS,
} from "./digit-limit-validator.js";

export { MAX_SAFE_DIGITS };

export const ERROR_CODES = {
  EXCESSIVE_DIGITS: "OVERFLOW_EXCESSIVE_DIGITS",
  INVALID_RATE: "OVERFLOW_INVALID_RATE",
  PRODUCT_OVERFLOW: "OVERFLOW_PRODUCT_EXCEEDED",
} as const;

export type OverflowErrorCode =
  (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ValidationResult =
  | { ok: true; value: bigint }
  | { ok: false; error: string; code: OverflowErrorCode };

/**
 * Validate an oracle conversion rate against digit limits.
 */
export function validateConversionRate(
  rate: string | number | bigint
): ValidationResult {
  return parseIntegerInput(
    rate,
    "rate",
    ERROR_CODES.INVALID_RATE,
    ERROR_CODES.EXCESSIVE_DIGITS
  );
}

/**
 * Convert a notional by rate after validating both operands for overflow.
 * Rate is treated as an integer scaled factor (e.g. fixed-point).
 */
export function applyConversionRate(
  notional: string | number | bigint,
  rate: string | number | bigint
): ValidationResult {
  const amount = parseIntegerInput(
    notional,
    "notional",
    ERROR_CODES.INVALID_RATE,
    ERROR_CODES.EXCESSIVE_DIGITS
  );
  if (!amount.ok) {
    return amount;
  }

  const factor = validateConversionRate(rate);
  if (!factor.ok) {
    return factor;
  }

  const product = amount.value * factor.value;
  if (digitCount(product.toString()) > MAX_SAFE_DIGITS) {
    return {
      ok: false,
      error: `converted value exceeds maximum of ${MAX_SAFE_DIGITS} digits`,
      code: ERROR_CODES.PRODUCT_OVERFLOW,
    };
  }

  return { ok: true, value: product };
}
