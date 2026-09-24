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
 * Warning codes emitted when a parameter is malformed or mismatched.
 *
 * These codes let callers distinguish calculation exceptions without having to
 * parse human-readable error messages, and keep the response body shape stable
 * across the different failure modes.
 */
export type StablecoinCentsMultiplierWarningCode =
  | 'INVALID_DECIMALS'
  | 'EMPTY_AMOUNT'
  | 'INVALID_AMOUNT_FORMAT'
  | 'AMOUNT_OUT_OF_RANGE';

/**
 * Structured warning describing a single parameter exception.
 */
export interface StablecoinCentsMultiplierWarning {
  /** Stable machine-readable code for the exception. */
  code: StablecoinCentsMultiplierWarningCode;
  /** Name of the parameter that triggered the exception. */
  parameter: 'amount' | 'decimals';
  /** Human-readable description of the exception. */
  message: string;
}

/**
 * Error thrown in strict mode that carries the structured warning payload so
 * that mismatched parameter structures can be reported consistently.
 */
export class StablecoinCentsMultiplierError extends Error {
  public readonly code: StablecoinCentsMultiplierWarningCode;
  public readonly parameter: 'amount' | 'decimals';
  public readonly warnings: StablecoinCentsMultiplierWarning[];

  constructor(warning: StablecoinCentsMultiplierWarning) {
    super(warning.message);
    this.name = 'StablecoinCentsMultiplierError';
    this.code = warning.code;
    this.parameter = warning.parameter;
    this.warnings = [warning];
  }
}

/**
 * Builds the structured warning for a given exception code.
 */
function buildWarning(
  code: StablecoinCentsMultiplierWarningCode,
  parameter: 'amount' | 'decimals',
  message: string,
): StablecoinCentsMultiplierWarning {
  return { code, parameter, message };
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
    const warning = buildWarning(
      'INVALID_DECIMALS',
      'decimals',
      `decimals must be a non-negative integer, received ${decimals}`,
    );
    if (strict) {
      throw new StablecoinCentsMultiplierError(warning);
    }
    return null;
  }

  const raw = typeof amount === 'number' ? amount.toString() : amount;
  const trimmed = raw.trim();

  if (trimmed === '') {
    const warning = buildWarning('EMPTY_AMOUNT', 'amount', 'amount must not be empty');
    if (strict) {
      throw new StablecoinCentsMultiplierError(warning);
    }
    return null;
  }

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match || (match[2] === '' && (match[3] === undefined || match[3] === ''))) {
    const warning = buildWarning(
      'INVALID_AMOUNT_FORMAT',
      'amount',
      `amount is not a valid decimal string: ${raw}`,
    );
    if (strict) {
      throw new StablecoinCentsMultiplierError(warning);
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
    const warning = buildWarning(
      'AMOUNT_OUT_OF_RANGE',
      'amount',
      `amount exceeds safe integer range: ${raw}`,
    );
    if (strict) {
      throw new StablecoinCentsMultiplierError(warning);
    }
    return null;
  }

  return sign * cents;
}

export default stablecoin_cents_multiplier;
