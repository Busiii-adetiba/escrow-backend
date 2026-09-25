/**
 * Oracle conversion-rate scraper helpers with overflow / digit-limit validation,
 * and round-half-to-even rounding for division remainders.
 *
 * ## Design notes
 *
 * All core arithmetic is performed in `bigint` to avoid IEEE-754 float drift.
 * Rates are treated as integer-scaled fixed-point factors; callers own the
 * scale/exponent.
 *
 * ### Rounding
 * Division that produces a remainder is rounded with the "round-half-to-even"
 * (banker's rounding) protocol: halfway cases round to the nearest *even*
 * digit. This eliminates the systematic upward bias produced by the more
 * common "round half up" rule and is consistent with IEEE 754 default rounding
 * and the approach used by `fee_deduction_calculator`.
 */

/** Max decimal digits allowed for a conversion rate or notional (below Number.MAX_SAFE_INTEGER). */
export const MAX_SAFE_DIGITS = 15;

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
 * Validate an oracle conversion rate against digit limits.
 */
export function validateConversionRate(
  rate: string | number | bigint
): ValidationResult {
  return parseIntegerInput(rate, "rate", ERROR_CODES.INVALID_RATE);
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
    ERROR_CODES.INVALID_RATE
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

// ---------------------------------------------------------------------------
// Round-half-to-even (banker's rounding) for division remainders
// ---------------------------------------------------------------------------

/**
 * Divide `numerator` by `divisor` using round-half-to-even (banker's rounding).
 *
 * Pure integer arithmetic (bigint) — no float intermediate. The halfway case
 * (remainder * 2 === divisor) rounds to the nearest even integer, which
 * eliminates the systematic positive bias of "round half up".
 *
 * @example
 * divideRoundHalfEven(5n, 2n)  // 2n — halfway rounds to even (2, not 3)
 * divideRoundHalfEven(7n, 2n)  // 4n — halfway rounds to even (4, not 3)
 * divideRoundHalfEven(3n, 2n)  // 2n — halfway rounds to even (2, not 1)
 */
export function divideRoundHalfEven(numerator: bigint, divisor: bigint): bigint {
  if (divisor === 0n) {
    throw new RangeError("divideRoundHalfEven: divisor must not be zero");
  }

  const quotient = numerator / divisor;
  const remainder = numerator - quotient * divisor;

  // Absolute values for comparison (handles negative inputs)
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const absDivisor = divisor < 0n ? -divisor : divisor;
  const doubleRemainder = absRemainder * 2n;

  if (doubleRemainder < absDivisor) {
    // Below halfway → truncate (round toward zero)
    return quotient;
  }

  if (doubleRemainder > absDivisor) {
    // Above halfway → round away from zero
    const direction = (numerator < 0n) !== (divisor < 0n) ? -1n : 1n;
    return quotient + direction;
  }

  // Exactly halfway → round to the nearest even integer
  const isQuotientEven = quotient % 2n === 0n;
  if (isQuotientEven) {
    return quotient;
  }
  const direction = (numerator < 0n) !== (divisor < 0n) ? -1n : 1n;
  return quotient + direction;
}

/**
 * Scale a bigint `value` by a rational `numerator / denominator` and round
 * the result using round-half-to-even.
 *
 * Useful for applying fractional conversion rates that cannot be expressed as
 * integers without loss of precision.
 *
 * @example
 * scaleWithRounding(100n, 1n, 3n)  // 33n  (100/3 = 33.333… → 33)
 * scaleWithRounding(100n, 2n, 3n)  // 67n  (200/3 = 66.666… → 67)
 */
export function scaleWithRounding(
  value: bigint,
  scaleNumerator: bigint,
  scaleDenominator: bigint
): bigint {
  if (scaleDenominator === 0n) {
    throw new RangeError("scaleWithRounding: scaleDenominator must not be zero");
  }
  return divideRoundHalfEven(value * scaleNumerator, scaleDenominator);
}
