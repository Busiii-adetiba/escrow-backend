/**
 * Fee share calculator with round-half-to-even (banker's) rounding.
 * Deducts a basis-points fee from a base amount without biasing the
 * remainder consistently up or down, and guarantees feeAmount + netAmount
 * always reconstructs the original base amount exactly (no leaked remainder).
 */

/** Max decimal digits allowed for a single fee-bearing amount (below Number.MAX_SAFE_INTEGER). */
export const MAX_SAFE_DIGITS = 15;

/** Basis-points denominator (10000 bps = 100%). */
const BPS_DENOMINATOR = 10_000n;

export const ERROR_CODES = {
  EXCESSIVE_DIGITS: "FEE_EXCESSIVE_DIGITS",
  INVALID_AMOUNT: "FEE_INVALID_AMOUNT",
  INVALID_RATE: "FEE_INVALID_RATE",
} as const;

export type FeeErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type FeeValidationResult =
  | { ok: true; value: bigint }
  | { ok: false; error: string; code: FeeErrorCode };

export type FeeDeductionResult =
  | { ok: true; feeAmount: bigint; netAmount: bigint }
  | { ok: false; error: string; code: FeeErrorCode };

function digitCount(normalized: string): number {
  const digits = normalized.replace(/^-/, "").replace(/^0+(?=\d)/, "");
  return digits.length === 0 ? 1 : digits.length;
}

/**
 * Parse and validate a non-negative base amount against digit limits.
 */
export function validateBaseAmount(
  input: string | number | bigint,
  label = "baseAmount"
): FeeValidationResult {
  let raw: string;

  if (typeof input === "bigint") {
    raw = input.toString();
  } else if (typeof input === "number") {
    if (!Number.isFinite(input) || !Number.isInteger(input)) {
      return {
        ok: false,
        error: `${label} must be a finite integer`,
        code: ERROR_CODES.INVALID_AMOUNT,
      };
    }
    raw = String(input);
  } else {
    if (typeof input !== "string") {
      return {
        ok: false,
        error: `${label} must be a string, number, or bigint`,
        code: ERROR_CODES.INVALID_AMOUNT,
      };
    }
    raw = input.trim();
    if (!/^\d+$/.test(raw)) {
      return {
        ok: false,
        error: `${label} must be a non-negative integer numeric value`,
        code: ERROR_CODES.INVALID_AMOUNT,
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

  const value = BigInt(raw);
  if (value < 0n) {
    return {
      ok: false,
      error: `${label} must be a non-negative integer`,
      code: ERROR_CODES.INVALID_AMOUNT,
    };
  }

  return { ok: true, value };
}

/**
 * Validate a fee rate expressed in basis points (0-10000, i.e. 0%-100%).
 */
export function validateFeeRateBps(feeRateBps: number): FeeValidationResult {
  if (
    typeof feeRateBps !== "number" ||
    !Number.isFinite(feeRateBps) ||
    !Number.isInteger(feeRateBps)
  ) {
    return {
      ok: false,
      error: "feeRateBps must be a finite integer",
      code: ERROR_CODES.INVALID_RATE,
    };
  }

  if (feeRateBps < 0 || feeRateBps > 10_000) {
    return {
      ok: false,
      error: "feeRateBps must be between 0 and 10000",
      code: ERROR_CODES.INVALID_RATE,
    };
  }

  return { ok: true, value: BigInt(feeRateBps) };
}

/**
 * Deduct a fee (in basis points) from a base amount, rounding the fractional
 * remainder to the nearest even value instead of always truncating or always
 * rounding up. This avoids a one-directional rounding bias when the same
 * rate is applied repeatedly across many transactions, while feeAmount and
 * netAmount always sum back to baseAmount exactly.
 */
export function calculateFeeDeduction(
  baseAmount: string | number | bigint,
  feeRateBps: number
): FeeDeductionResult {
  const base = validateBaseAmount(baseAmount);
  if (!base.ok) {
    return base;
  }

  const rate = validateFeeRateBps(feeRateBps);
  if (!rate.ok) {
    return rate;
  }

  const numerator = base.value * rate.value;
  const quotient = numerator / BPS_DENOMINATOR;
  const remainder = numerator % BPS_DENOMINATOR;

  let feeAmount = quotient;
  const twiceRemainder = remainder * 2n;
  if (twiceRemainder > BPS_DENOMINATOR) {
    feeAmount += 1n;
  } else if (twiceRemainder === BPS_DENOMINATOR && quotient % 2n !== 0n) {
    feeAmount += 1n;
  }

  const netAmount = base.value - feeAmount;

  return { ok: true, feeAmount, netAmount };
}
