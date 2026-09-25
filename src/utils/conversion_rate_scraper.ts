/**
 * Oracle conversion-rate scraper helpers with overflow / digit-limit validation,
 * round-half-to-even rounding, and unknown asset ticker fallbacks.
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
 *
 * ### Unknown tickers
 * `resolveAssetTicker` returns a `TickerResolution` that always succeeds —
 * unknown tickers produce a `{ known: false }` fallback instead of throwing.
 * Callers can inspect the `known` flag and decide whether to proceed, reject,
 * or emit a warning without crashing the scraper.
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

// ---------------------------------------------------------------------------
// Unknown asset ticker fallbacks
// ---------------------------------------------------------------------------

/**
 * Well-known Stellar asset tickers with their decimal precision (stroops/units)
 * and a human-readable label.
 */
export interface KnownAssetConfig {
  /** Ticker symbol (e.g. "XLM", "USDC") */
  ticker: string;
  /**
   * Number of decimal places the asset uses.
   * XLM uses 7 (1 XLM = 10^7 stroops); most Stellar tokens use 7.
   */
  decimals: number;
  /** Human-readable asset name */
  label: string;
}

const KNOWN_ASSETS: Record<string, KnownAssetConfig> = {
  XLM:  { ticker: "XLM",  decimals: 7, label: "Stellar Lumens" },
  USDC: { ticker: "USDC", decimals: 7, label: "USD Coin (Stellar)" },
  USDT: { ticker: "USDT", decimals: 7, label: "Tether (Stellar)" },
  BTC:  { ticker: "BTC",  decimals: 7, label: "Bitcoin (Stellar)" },
  ETH:  { ticker: "ETH",  decimals: 7, label: "Ether (Stellar)" },
};

/**
 * Result of a ticker resolution. Callers must inspect `known` before relying
 * on `config` — an unknown ticker always carries the default fallback config.
 */
export type TickerResolution =
  | { known: true;  ticker: string; config: KnownAssetConfig }
  | { known: false; ticker: string; config: KnownAssetConfig; fallback: true };

/**
 * Default fallback configuration used for any ticker not present in
 * `KNOWN_ASSETS`. Uses 7 decimal places (Stellar-native precision) so that
 * downstream formatters produce a valid DB value even for novel token types.
 */
export const DEFAULT_ASSET_FALLBACK: KnownAssetConfig = {
  ticker: "UNKNOWN",
  decimals: 7,
  label: "Unknown Stellar Token",
};

/**
 * Resolve an asset ticker string to its configuration, returning a typed
 * fallback for any ticker not found in the registry.
 *
 * This function **never throws**. Callers receive either:
 * - `{ known: true, config }` — a recognised ticker with its full config, or
 * - `{ known: false, config, fallback: true }` — an unrecognised ticker with
 *   the default fallback config, so the scraper can continue safely.
 *
 * @example
 * resolveAssetTicker("XLM")       // { known: true,  ticker: "XLM",     config: { decimals: 7, … } }
 * resolveAssetTicker("NOVEL_TOK") // { known: false, ticker: "NOVEL_TOK", config: DEFAULT_ASSET_FALLBACK, fallback: true }
 */
export function resolveAssetTicker(rawTicker: string): TickerResolution {
  const ticker = rawTicker.trim().toUpperCase();
  const config = KNOWN_ASSETS[ticker];

  if (config !== undefined) {
    return { known: true, ticker, config };
  }

  return {
    known: false,
    ticker: rawTicker.trim(),
    config: { ...DEFAULT_ASSET_FALLBACK, ticker: rawTicker.trim() },
    fallback: true,
  };
}
