/**
 * Stablecoin cents multiplier helper with overflow / digit-limit validation and configurable rounding policies.
 * Rejects stablecoin cents amounts, multipliers, and divisors whose digit count would risk unsafe numeric overflow.
 * Handles division remainders using integer arithmetic and configurable rounding policies (default: round-to-nearest-even / banker's rounding).
 */

/** Max decimal digits allowed for a stablecoin cents amount, multiplier, or divisor. */
export const MAX_SAFE_DIGITS = 15;

export const ERROR_CODES = {
  EXCESSIVE_DIGITS: "OVERFLOW_EXCESSIVE_DIGITS",
  INVALID_MULTIPLIER: "OVERFLOW_INVALID_MULTIPLIER",
  INVALID_AMOUNT: "OVERFLOW_INVALID_AMOUNT",
  PRODUCT_OVERFLOW: "OVERFLOW_PRODUCT_EXCEEDED",
  INVALID_DIVISOR: "OVERFLOW_INVALID_DIVISOR",
  DIVISION_BY_ZERO: "OVERFLOW_DIVISION_BY_ZERO",
  INVALID_ROUNDING_MODE: "INVALID_ROUNDING_MODE",
} as const;

export type OverflowErrorCode =
  (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type RoundingPolicy =
  | "half-even"
  | "round-to-nearest-even"
  | "half-up"
  | "truncate"
  | "ceil";

export interface ApplyMultiplierOptions {
  divisor?: string | number | bigint;
  roundingMode?: RoundingPolicy;
}

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
    if (typeof input !== "string") {
      return {
        ok: false,
        error: `${label} must be a string, number, or bigint`,
        code: invalidCode,
      };
    }
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
 * Validate a multiplier against digit limits.
 */
export function validateMultiplier(
  multiplier: string | number | bigint
): ValidationResult {
  return parseIntegerInput(multiplier, "multiplier", ERROR_CODES.INVALID_MULTIPLIER);
}

/**
 * Validate a stablecoin cents amount against digit limits.
 */
export function validateStablecoinCents(
  amount: string | number | bigint
): ValidationResult {
  return parseIntegerInput(amount, "amount", ERROR_CODES.INVALID_AMOUNT);
}

/**
 * Validate a divisor against digit limits and non-zero requirement.
 */
export function validateDivisor(
  divisor: string | number | bigint
): ValidationResult {
  const parsed = parseIntegerInput(divisor, "divisor", ERROR_CODES.INVALID_DIVISOR);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.value === 0n) {
    return {
      ok: false,
      error: "divisor cannot be zero",
      code: ERROR_CODES.DIVISION_BY_ZERO,
    };
  }
  return parsed;
}

/**
 * Perform deterministic integer division and apply rounding policy on the remainder.
 * Banker's rounding (round-to-nearest-even) breaks exact half ties to the nearest even integer.
 */
function roundIntegerDivision(
  numerator: bigint,
  divisor: bigint,
  mode: RoundingPolicy
): bigint {
  let N = numerator;
  let D = divisor;

  if (D < 0n) {
    N = -N;
    D = -D;
  }

  const q = N / D;
  const r = N % D;

  if (r === 0n) {
    return q;
  }

  const sign = N >= 0n ? 1n : -1n;
  const absR = r >= 0n ? r : -r;
  const twiceR = 2n * absR;

  if (mode === "truncate") {
    return q;
  }

  if (mode === "ceil") {
    return N > 0n ? q + 1n : q;
  }

  if (mode === "half-up") {
    if (twiceR >= D) {
      return q + sign;
    }
    return q;
  }

  // mode is "half-even" or "round-to-nearest-even" (default)
  // Tie-breaking rule for Banker's Rounding / Round-to-Nearest-Even:
  // - If twice the remainder is strictly less than divisor: round towards 0 (keep q).
  // - If twice the remainder is strictly greater than divisor: round away from 0 (q + sign).
  // - If twice the remainder equals divisor (exact half):
  //     - If q is even (q % 2n === 0n): keep q.
  //     - If q is odd (q % 2n !== 0n): round to nearest even (q + sign).
  if (twiceR < D) {
    return q;
  } else if (twiceR > D) {
    return q + sign;
  } else {
    // Exact halfway tie
    if (q % 2n === 0n) {
      return q;
    } else {
      return q + sign;
    }
  }
}

/**
 * Multiply stablecoin cents amount by multiplier and optional divisor after validating operands.
 * Applies rounding policy (default: round-to-nearest-even) when division remainders occur.
 */
export function applyStablecoinCentsMultiplier(
  amount: string | number | bigint,
  multiplier: string | number | bigint,
  divisorOrOptions?: string | number | bigint | ApplyMultiplierOptions,
  roundingModeParam?: RoundingPolicy
): ValidationResult {
  const centsResult = validateStablecoinCents(amount);
  if (!centsResult.ok) {
    return centsResult;
  }

  const multiplierResult = validateMultiplier(multiplier);
  if (!multiplierResult.ok) {
    return multiplierResult;
  }

  let divisorInput: string | number | bigint = 1n;
  let mode: RoundingPolicy = roundingModeParam ?? "half-even";

  if (divisorOrOptions !== undefined && divisorOrOptions !== null) {
    if (
      typeof divisorOrOptions === "object" &&
      typeof divisorOrOptions !== "bigint"
    ) {
      if (divisorOrOptions.divisor !== undefined) {
        divisorInput = divisorOrOptions.divisor;
      }
      if (divisorOrOptions.roundingMode !== undefined) {
        mode = divisorOrOptions.roundingMode;
      }
    } else {
      divisorInput = divisorOrOptions;
    }
  }

  const validModes: RoundingPolicy[] = [
    "half-even",
    "round-to-nearest-even",
    "half-up",
    "truncate",
    "ceil",
  ];
  if (!validModes.includes(mode)) {
    return {
      ok: false,
      error: `Invalid rounding mode: ${String(mode)}`,
      code: ERROR_CODES.INVALID_ROUNDING_MODE,
    };
  }

  const divisorResult = validateDivisor(divisorInput);
  if (!divisorResult.ok) {
    return divisorResult;
  }

  const product = centsResult.value * multiplierResult.value;
  if (digitCount(product.toString()) > MAX_SAFE_DIGITS) {
    return {
      ok: false,
      error: `multiplied cents value exceeds maximum of ${MAX_SAFE_DIGITS} digits`,
      code: ERROR_CODES.PRODUCT_OVERFLOW,
    };
  }

  const finalValue = roundIntegerDivision(product, divisorResult.value, mode);
  if (digitCount(finalValue.toString()) > MAX_SAFE_DIGITS) {
    return {
      ok: false,
      error: `multiplied cents value exceeds maximum of ${MAX_SAFE_DIGITS} digits`,
      code: ERROR_CODES.PRODUCT_OVERFLOW,
    };
  }

  return { ok: true, value: finalValue };
}
