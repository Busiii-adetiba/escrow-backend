/**
 * Token decimals converter with overflow / digit-limit validation.
 * Converts between a Soroban token's raw on-chain integer amount and its
 * human-readable decimal amount, rejecting inputs whose digit count or
 * decimals value would risk unsafe numeric overflow when scaling by
 * 10^decimals.
 */

/** Max decimal digits allowed for a single amount (below Number.MAX_SAFE_INTEGER). */
export const MAX_SAFE_DIGITS = 15;

/**
 * Practical upper bound for a token's `decimals` value used by this converter.
 * The SEP-41 token interface technically allows `decimals()` to be any u32
 * (up to 255), but real Soroban/Stellar tokens use values in the 0-18 range.
 * Capping at 18 keeps the 10^decimals scaling factor safe to combine with
 * MAX_SAFE_DIGITS without risking silent precision loss or overflow.
 */
export const MAX_TOKEN_DECIMALS = 18;

export const ERROR_CODES = {
  EXCESSIVE_DIGITS: "DECIMALS_EXCESSIVE_DIGITS",
  INVALID_AMOUNT: "DECIMALS_INVALID_AMOUNT",
  INVALID_DECIMALS: "DECIMALS_INVALID_DECIMALS",
  CONVERSION_OVERFLOW: "DECIMALS_CONVERSION_OVERFLOW",
  INVALID_SCHEMA: "DECIMALS_INVALID_SCHEMA",
} as const;

export type DecimalsErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ConversionResult =
  | { ok: true; value: bigint }
  | { ok: false; error: string; code: DecimalsErrorCode };

/**
 * Configuration options for database precision schema and column mapping.
 */
export interface DbPrecisionSchema {
  /** Column scale (decimal places). Defaults to token decimals if not specified. */
  scale?: number;
  /** Maximum safe precision (total digits). Defaults to MAX_SAFE_DIGITS (15). */
  precision?: number;
  /**
   * Whether to format with fixed decimal scale by padding fractional digits
   * with trailing zeroes to match the column scale (e.g. "1.5000000" for decimals=7).
   * Defaults to true for database precision schemas.
   */
  fixedScale?: boolean;
  /**
   * Whether input is raw units, human units, or auto-detected.
   * Defaults to "auto".
   */
  inputType?: "auto" | "raw" | "human";
  /** Custom column names for database storage mapping. */
  columns?: {
    rawAmount?: string;
    formattedAmount?: string;
    decimals?: string;
  };
}

/**
 * Attributes for a database row storing a token amount with full precision.
 */
export interface DbStorageRow {
  /** Raw on-chain integer amount string (exact integer, no precision loss). */
  raw_amount: string;
  /** Decimal amount string formatted to match database precision schema. */
  formatted_amount: string;
  /** Token decimals (scale). */
  decimals: number;
  /** Alias for raw_amount in camelCase. */
  rawAmount: string;
  /** Alias for formatted_amount in camelCase. */
  formattedAmount: string;
  /** Human-readable string with trimmed trailing zeroes. */
  trimmed_amount: string;
  /** Dynamic custom column mapping if custom column names were configured. */
  [key: string]: string | number;
}

export type DbStorageColumns = DbStorageRow;

export type DbFormatResult =
  | {
      ok: true;
      value: DbStorageRow;
      columns: DbStorageRow;
      row: DbStorageRow;
    }
  | { ok: false; error: string; code: DecimalsErrorCode };

function digitCount(normalized: string): number {
  const digits = normalized.replace(/^-/, "").replace(/^0+(?=\d)/, "");
  return digits.length === 0 ? 1 : digits.length;
}

/**
 * Validate a token's `decimals` value against the practical safe range.
 */
export function validateDecimals(
  decimals: number
): { ok: true } | { ok: false; error: string; code: DecimalsErrorCode } {
  if (
    typeof decimals !== "number" ||
    !Number.isFinite(decimals) ||
    !Number.isInteger(decimals)
  ) {
    return {
      ok: false,
      error: "decimals must be a finite integer",
      code: ERROR_CODES.INVALID_DECIMALS,
    };
  }

  if (decimals < 0 || decimals > MAX_TOKEN_DECIMALS) {
    return {
      ok: false,
      error: `decimals must be between 0 and ${MAX_TOKEN_DECIMALS}`,
      code: ERROR_CODES.INVALID_DECIMALS,
    };
  }

  return { ok: true };
}

/**
 * Parse and validate a raw (integer, on-chain) token amount against digit limits.
 * Rejects negative amounts as token balances/transfers cannot be negative.
 */
export function validateRawAmount(
  input: string | number | bigint,
  label = "amount"
): ConversionResult {
  let raw: string;

  if (typeof input === "bigint") {
    if (input < 0n) {
      return {
        ok: false,
        error: `${label} cannot be negative`,
        code: ERROR_CODES.INVALID_AMOUNT,
      };
    }
    raw = input.toString();
  } else if (typeof input === "number") {
    if (!Number.isFinite(input) || !Number.isInteger(input)) {
      return {
        ok: false,
        error: `${label} must be a finite integer`,
        code: ERROR_CODES.INVALID_AMOUNT,
      };
    }
    if (input < 0 || Object.is(input, -0)) {
      return {
        ok: false,
        error: `${label} cannot be negative`,
        code: ERROR_CODES.INVALID_AMOUNT,
      };
    }
    raw = String(input);
  } else {
    raw = input.trim();
    if (raw.startsWith("-")) {
      return {
        ok: false,
        error: `${label} cannot be negative`,
        code: ERROR_CODES.INVALID_AMOUNT,
      };
    }
    if (!/^\d+$/.test(raw)) {
      return {
        ok: false,
        error: `${label} must be an integer numeric value`,
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

  return { ok: true, value: BigInt(raw) };
}

/**
 * Convert a human-readable decimal amount (e.g. "12.5") into raw integer
 * units by scaling with the token's decimals value (raw = human * 10^decimals).
 * Rejects negative amounts as token amounts cannot be negative.
 */
export function toRawUnits(
  humanAmount: string | number,
  decimals: number
): ConversionResult {
  const decimalsCheck = validateDecimals(decimals);
  if (!decimalsCheck.ok) {
    return decimalsCheck;
  }

  if (
    typeof humanAmount === "number" &&
    !Number.isFinite(humanAmount)
  ) {
    return {
      ok: false,
      error: "amount must be a finite number",
      code: ERROR_CODES.INVALID_AMOUNT,
    };
  }

  if (
    typeof humanAmount === "number" &&
    (humanAmount < 0 || Object.is(humanAmount, -0))
  ) {
    return {
      ok: false,
      error: "amount cannot be negative",
      code: ERROR_CODES.INVALID_AMOUNT,
    };
  }

  const raw = String(humanAmount).trim();
  if (raw.startsWith("-")) {
    return {
      ok: false,
      error: "amount cannot be negative",
      code: ERROR_CODES.INVALID_AMOUNT,
    };
  }

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return {
      ok: false,
      error: "amount must be a numeric decimal value",
      code: ERROR_CODES.INVALID_AMOUNT,
    };
  }

  const [wholePart, fractionalPart = ""] = raw.split(".");

  if (fractionalPart.length > decimals) {
    return {
      ok: false,
      error: `amount has more fractional digits than decimals (${decimals}) allows`,
      code: ERROR_CODES.INVALID_AMOUNT,
    };
  }

  const paddedFractional = fractionalPart.padEnd(decimals, "0");
  const combined = `${wholePart}${paddedFractional}`.replace(/^0+(?=\d)/, "");

  if (digitCount(combined) > MAX_SAFE_DIGITS) {
    return {
      ok: false,
      error: `converted amount would exceed maximum of ${MAX_SAFE_DIGITS} digits`,
      code: ERROR_CODES.CONVERSION_OVERFLOW,
    };
  }

  const value = BigInt(combined);
  return { ok: true, value };
}

export interface ToHumanUnitsOptions {
  /**
   * When true, preserves fractional zeros up to `decimals` (fixed scale),
   * matching database precision schemas (e.g. "1.5000000" for 7 decimals).
   * Defaults to false (trimmed trailing zeros, e.g. "1.5").
   */
  fixedScale?: boolean;
}

/**
 * Convert a raw integer token amount back into a human-readable decimal
 * string by inserting the decimal point at the position given by decimals.
 * Rejects negative amounts as token amounts cannot be negative.
 *
 * @param rawAmount - The raw integer amount (bigint, number, or string)
 * @param decimals - Token decimal places (0 to 18)
 * @param options - Formatting options, e.g. fixedScale to preserve trailing zeroes
 */
export function toHumanUnits(
  rawAmount: string | number | bigint,
  decimals: number,
  options?: ToHumanUnitsOptions
): { ok: true; value: string } | { ok: false; error: string; code: DecimalsErrorCode } {
  const decimalsCheck = validateDecimals(decimals);
  if (!decimalsCheck.ok) {
    return decimalsCheck;
  }

  const rawCheck = validateRawAmount(rawAmount, "rawAmount");
  if (!rawCheck.ok) {
    return rawCheck;
  }

  const digits = rawCheck.value.toString();

  if (decimals === 0) {
    return { ok: true, value: digits };
  }

  const padded = digits.padStart(decimals + 1, "0");
  const wholePart = padded.slice(0, padded.length - decimals);
  const fractionalPart = padded.slice(padded.length - decimals);
  const trimmedFractional = options?.fixedScale
    ? fractionalPart
    : fractionalPart.replace(/0+$/, "");

  const value = trimmedFractional.length > 0
    ? `${wholePart}.${trimmedFractional}`
    : wholePart;

  return { ok: true, value };
}

/**
 * Format a raw token amount to a decimal string matching a database precision schema's fixed scale.
 */
export function formatToDbPrecision(
  rawAmount: string | number | bigint,
  decimals: number,
  options?: { fixedScale?: boolean; precision?: number }
): { ok: true; value: string } | { ok: false; error: string; code: DecimalsErrorCode } {
  return toHumanUnits(rawAmount, decimals, { fixedScale: options?.fixedScale ?? true });
}

/**
 * Validate a database precision schema configuration.
 */
export function validateDbPrecisionSchema(
  schema: DbPrecisionSchema
): { ok: true } | { ok: false; error: string; code: DecimalsErrorCode } {
  if (schema.scale !== undefined) {
    const scaleCheck = validateDecimals(schema.scale);
    if (!scaleCheck.ok) {
      return scaleCheck;
    }
  }

  if (schema.precision !== undefined) {
    if (
      typeof schema.precision !== "number" ||
      !Number.isFinite(schema.precision) ||
      !Number.isInteger(schema.precision) ||
      schema.precision <= 0
    ) {
      return {
        ok: false,
        error: "schema precision must be a positive integer",
        code: ERROR_CODES.INVALID_SCHEMA,
      };
    }
    if (schema.precision > MAX_SAFE_DIGITS) {
      return {
        ok: false,
        error: `schema precision cannot exceed ${MAX_SAFE_DIGITS} digits`,
        code: ERROR_CODES.INVALID_SCHEMA,
      };
    }
    if (schema.scale !== undefined && schema.scale > schema.precision) {
      return {
        ok: false,
        error: "schema scale cannot exceed precision",
        code: ERROR_CODES.INVALID_SCHEMA,
      };
    }
  }

  return { ok: true };
}

/**
 * Format values calculated by token_decimals_converter to match database
 * precision schemas, producing row attributes that preserve full precision.
 *
 * @param amount - The raw integer amount (bigint, integer string/number) or human decimal amount (string/number with decimal point)
 * @param decimals - The token decimals scale (0 to 18)
 * @param schema - Optional database precision schema options (scale, precision, fixedScale, column mappings)
 */
export function formatForDbStorage(
  amount: string | number | bigint | ConversionResult | { ok: true; value: string },
  decimals: number,
  schema?: DbPrecisionSchema
): DbFormatResult {
  const decimalsCheck = validateDecimals(decimals);
  if (!decimalsCheck.ok) {
    return decimalsCheck;
  }

  if (schema) {
    const schemaCheck = validateDbPrecisionSchema(schema);
    if (!schemaCheck.ok) {
      return schemaCheck;
    }
  }

  let unwrapped: string | number | bigint;
  if (typeof amount === "object" && amount !== null && "ok" in amount) {
    if (!amount.ok) {
      return amount;
    }
    unwrapped = amount.value;
  } else {
    unwrapped = amount;
  }

  const effectiveScale = schema?.scale !== undefined ? schema.scale : decimals;
  const isFixedScale = schema?.fixedScale ?? true;
  const inputType = schema?.inputType ?? "auto";

  let rawBigInt: bigint;
  let rawStr: string;

  if (typeof unwrapped === "bigint") {
    if (inputType === "human") {
      const rawResult = toRawUnits(unwrapped.toString(), effectiveScale);
      if (!rawResult.ok) {
        return rawResult;
      }
      rawBigInt = rawResult.value;
      rawStr = rawBigInt.toString();
    } else {
      const rawCheck = validateRawAmount(unwrapped, "amount");
      if (!rawCheck.ok) {
        return rawCheck;
      }
      rawBigInt = rawCheck.value;
      rawStr = rawBigInt.toString();
    }
  } else if (typeof unwrapped === "number") {
    if (!Number.isFinite(unwrapped)) {
      return {
        ok: false,
        error: "amount must be a finite number",
        code: ERROR_CODES.INVALID_AMOUNT,
      };
    }
    if (unwrapped < 0 || Object.is(unwrapped, -0)) {
      return {
        ok: false,
        error: "amount cannot be negative",
        code: ERROR_CODES.INVALID_AMOUNT,
      };
    }
    if (inputType === "human" || !Number.isInteger(unwrapped)) {
      const rawResult = toRawUnits(unwrapped, effectiveScale);
      if (!rawResult.ok) {
        return rawResult;
      }
      rawBigInt = rawResult.value;
      rawStr = rawBigInt.toString();
    } else {
      const rawCheck = validateRawAmount(unwrapped, "amount");
      if (!rawCheck.ok) {
        return rawCheck;
      }
      rawBigInt = rawCheck.value;
      rawStr = rawBigInt.toString();
    }
  } else {
    const trimmed = unwrapped.trim();
    if (trimmed.startsWith("-")) {
      return {
        ok: false,
        error: "amount cannot be negative",
        code: ERROR_CODES.INVALID_AMOUNT,
      };
    }
    if (inputType === "human" || trimmed.includes(".")) {
      const rawResult = toRawUnits(trimmed, effectiveScale);
      if (!rawResult.ok) {
        return rawResult;
      }
      rawBigInt = rawResult.value;
      rawStr = rawBigInt.toString();
    } else {
      const rawCheck = validateRawAmount(trimmed, "amount");
      if (!rawCheck.ok) {
        return rawCheck;
      }
      rawBigInt = rawCheck.value;
      rawStr = rawBigInt.toString();
    }
  }

  const maxDigits = schema?.precision ?? MAX_SAFE_DIGITS;
  if (digitCount(rawStr) > maxDigits) {
    return {
      ok: false,
      error: `amount exceeds maximum allowed precision of ${maxDigits} digits`,
      code: ERROR_CODES.EXCESSIVE_DIGITS,
    };
  }

  const formattedResult = toHumanUnits(rawBigInt, effectiveScale, { fixedScale: isFixedScale });
  if (!formattedResult.ok) {
    return formattedResult;
  }

  const trimmedResult = toHumanUnits(rawBigInt, effectiveScale, { fixedScale: false });
  const trimmedAmount = trimmedResult.ok ? trimmedResult.value : formattedResult.value;

  const rawCol = schema?.columns?.rawAmount ?? "raw_amount";
  const formattedCol = schema?.columns?.formattedAmount ?? "formatted_amount";
  const decimalsCol = schema?.columns?.decimals ?? "decimals";

  const row: DbStorageRow = {
    raw_amount: rawStr,
    formatted_amount: formattedResult.value,
    decimals: effectiveScale,
    rawAmount: rawStr,
    formattedAmount: formattedResult.value,
    trimmed_amount: trimmedAmount,
    [rawCol]: rawStr,
    [formattedCol]: formattedResult.value,
    [decimalsCol]: effectiveScale,
  };

  return {
    ok: true,
    value: row,
    columns: row,
    row,
  };
}

/**
 * Format raw integer amount explicitly for database storage.
 */
export function formatRawForDbStorage(
  rawAmount: string | number | bigint,
  decimals: number,
  schema?: DbPrecisionSchema
): DbFormatResult {
  return formatForDbStorage(rawAmount, decimals, { ...schema, inputType: "raw" });
}

/**
 * Format human decimal amount explicitly for database storage.
 */
export function formatHumanForDbStorage(
  humanAmount: string | number,
  decimals: number,
  schema?: DbPrecisionSchema
): DbFormatResult {
  return formatForDbStorage(humanAmount, decimals, { ...schema, inputType: "human" });
}

/**
 * Alias for formatForDbStorage.
 */
export const formatDbColumns = formatForDbStorage;

/**
 * Alias for formatForDbStorage matching the exact issue name.
 */
export const formatColumnsForDbStorage = formatForDbStorage;

/**
 * Factory to configure format columns for database storage with default schema rules.
 */
export function configureFormatColumns(defaultSchema?: DbPrecisionSchema) {
  return {
    schema: defaultSchema,
    format: (
      amount: string | number | bigint | ConversionResult | { ok: true; value: string },
      decimals?: number,
      overrideSchema?: DbPrecisionSchema
    ) =>
      formatForDbStorage(
        amount,
        decimals ?? defaultSchema?.scale ?? 7,
        { ...defaultSchema, ...overrideSchema }
      ),
    formatRaw: (
      rawAmount: string | number | bigint,
      decimals?: number,
      overrideSchema?: DbPrecisionSchema
    ) =>
      formatRawForDbStorage(
        rawAmount,
        decimals ?? defaultSchema?.scale ?? 7,
        { ...defaultSchema, ...overrideSchema }
      ),
    formatHuman: (
      humanAmount: string | number,
      decimals?: number,
      overrideSchema?: DbPrecisionSchema
    ) =>
      formatHumanForDbStorage(
        humanAmount,
        decimals ?? defaultSchema?.scale ?? 7,
        { ...defaultSchema, ...overrideSchema }
      ),
    validateSchema: (schema: DbPrecisionSchema) => validateDbPrecisionSchema(schema),
  };
}
