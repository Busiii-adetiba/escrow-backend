/**
 * Integer precision conversion helper for stablecoin amounts.
 *
 * Converts a human-readable stablecoin amount (e.g. "12.34") into an integer
 * number of cents without ever touching floating point arithmetic, so that
 * values such as 0.1 + 0.2 style rounding errors can never leak into ledger
 * balances.
 */

export interface StablecoinCentsMultiplierOptions {
  /** Number of decimal places the stablecoin supports (default: 2). */
  decimals?: number;
  /** When true, throw on malformed input instead of returning null. */
  strict?: boolean;
}

/**
 * Multiplies a stablecoin amount by 100 and returns the integer number of
 * cents. The multiplication is performed on the decimal string representation
 * so that no binary floating point rounding is introduced.
 *
 * @param amount Stablecoin amount as a string or number (e.g. "12.34", 12.34).
 * @param options Optional conversion settings.
 * @returns The integer number of cents, or null when the input is invalid and
 *          `strict` is not enabled.
 */
export function stablecoin_cents_multiplier(
  amount: string | number,
  options: StablecoinCentsMultiplierOptions = {},
): number | null {
  const { decimals = 2, strict = false } = options;

  if (decimals < 0 || !Number.isInteger(decimals)) {
    if (strict) {
      throw new RangeError(`decimals must be a non-negative integer, received ${decimals}`);
    }
    return null;
  }

  const raw = typeof amount === 'number' ? amount.toString() : amount;
  const trimmed = raw.trim();

  if (trimmed === '') {
    if (strict) {
      throw new TypeError('amount must not be empty');
    }
    return null;
  }

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match || (match[2] === '' && (match[3] === undefined || match[3] === ''))) {
    if (strict) {
      throw new TypeError(`amount is not a valid decimal string: ${raw}`);
    }
    return null;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const wholePart = match[2] === '' ? '0' : match[2];
  const fractionPart = match[3] ?? '';

  // Pad or truncate the fractional part to the requested number of decimals.
  const paddedFraction = (fractionPart + '0'.repeat(decimals)).slice(0, decimals);

  // Build the integer cents value from the digit strings only.
  const centsDigits = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, '');
  const cents = Number(centsDigits);

  if (!Number.isSafeInteger(cents)) {
    if (strict) {
      throw new RangeError(`amount exceeds safe integer range: ${raw}`);
    }
    return null;
  }

  return sign * cents;
}

export default stablecoin_cents_multiplier;
