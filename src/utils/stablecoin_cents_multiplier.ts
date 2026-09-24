/**
 * Stablecoin cents multiplier helper with overflow / digit-limit validation.
 * Rejects amounts and multipliers whose digit count would risk unsafe numeric overflow.
 */

/** Max decimal digits allowed for an amount or multiplier (below Number.MAX_SAFE_INTEGER). */
export const MAX_SAFE_DIGITS = 15;

export const ERROR_CODES = {
  EXCESSIVE_DIGITS: "OVERFLOW_EXCESSIVE_DIGITS",
  INVALID_MULTIPLIER: "OVERFLOW_INVALID_MULTIPLIER",
  PRODUCT_OVERFLOW: "OVERFLOW_PRODUCT_EXCEEDED",
} as const;

export type OverflowErrorCode =
  (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ValidationResult =
  | { ok: true; value: bigint }
  | { ok: false; error: string; code: OverflowErrorCode };

function digitCount(normalized: string): number {
  const digits = normalized.replace(/^-/, "").replace(/^0+(?=\d)/, "");
  return digits.length === 0 ? 1 : digits.length;
}

function parseIntegerInput(
  input: string | number | bigint,
  label: string,
  invalidCode: OverflowErrorCode
): ValidationResult {
  let raw: string;

  if (typeof input === "bigint") {
    raw = input.toString();
  } else if (typeof input === "number") {
    if (!Number.isFinite(input) || !Number.isInteger(input)) {
      return {
        ok: false,
        error: `${label} must be a finite integer`,
        code: invalidCode,
      };
    }
    raw = String(input);
  } else {
    raw = input.trim();
    if (!/^-?\d+$/.test(raw)) {
      return {
        ok: false,
        error: `${label} must be an integer numeric value`,
        code: invalidCode,
      };
    }
  }

  if (digitCount(raw) > MAX_SAFE_DIGITS) {
    return {
      ok: false,
      error: `${label} exceeds maximum of ${MAX_SAFE_DIGITS} digits`,
      code: ERROR_CODES.EXCESSIVE_DIGITS,
    };
  }

  return { ok: true, value: BigInt(raw) };
}

/**
 * Validate a cents multiplier against digit limits.
 */
export function validateCentsMultiplier(
  multiplier: string | number | bigint
): ValidationResult {
  return parseIntegerInput(multiplier, "multiplier", ERROR_CODES.INVALID_MULTIPLIER);
}

/** Alias for validateCentsMultiplier */
export const validateMultiplier = validateCentsMultiplier;

/**
 * Multiply a stablecoin cents amount by a multiplier factor after validating both operands for overflow.
 */
export function applyCentsMultiplier(
  amount: string | number | bigint,
  multiplier: string | number | bigint
): ValidationResult {
  const amountCheck = parseIntegerInput(
    amount,
    "amount",
    ERROR_CODES.INVALID_MULTIPLIER
  );
  if (!amountCheck.ok) {
    return amountCheck;
  }

  const factor = validateCentsMultiplier(multiplier);
  if (!factor.ok) {
    return factor;
  }

  const product = amountCheck.value * factor.value;
  if (digitCount(product.toString()) > MAX_SAFE_DIGITS) {
    return {
      ok: false,
      error: `multiplied value exceeds maximum of ${MAX_SAFE_DIGITS} digits`,
      code: ERROR_CODES.PRODUCT_OVERFLOW,
    };
  }

  return { ok: true, value: product };
}

/** Alias for applyCentsMultiplier */
export const multiplyStablecoinCents = applyCentsMultiplier;
