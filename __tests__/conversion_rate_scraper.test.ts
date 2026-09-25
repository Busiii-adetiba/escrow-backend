import {
  MAX_SAFE_DIGITS,
  ERROR_CODES,
  validateConversionRate,
  applyConversionRate,
} from "../src/utils/conversion_rate_scraper.js";

describe("conversion_rate_scraper mathematics and overflow validation", () => {
  describe("validateConversionRate", () => {
    it("accepts valid rates across string, number, and bigint types", () => {
      // String input
      const resString = validateConversionRate("123456789012345");
      expect(resString).toEqual({ ok: true, value: 123456789012345n });

      // Number input (within JS safe integer)
      const resNumber = validateConversionRate(987654321);
      expect(resNumber).toEqual({ ok: true, value: 987654321n });

      // BigInt input
      const resBigInt = validateConversionRate(100000000000000n);
      expect(resBigInt).toEqual({ ok: true, value: 100000000000000n });
    });

    it("handles zero and negative integers correctly within digit limit", () => {
      // Zero value (1 digit)
      const resZero = validateConversionRate("0");
      expect(resZero).toEqual({ ok: true, value: 0n });

      // Negative value: -999,999,999,999,999 (15 digits excluding sign)
      const resNeg = validateConversionRate("-999999999999999");
      expect(resNeg).toEqual({ ok: true, value: -999999999999999n });
    });

    it("normalizes leading zeros when calculating digit count", () => {
      // "000123456789" has 9 significant digits
      const result = validateConversionRate("000123456789");
      expect(result).toEqual({ ok: true, value: 123456789n });
    });

    it("accepts exactly MAX_SAFE_DIGITS (15 digits) and rejects 16 digits", () => {
      // Exactly 15 digits: 999,999,999,999,999
      const maxSafeString = "9".repeat(MAX_SAFE_DIGITS);
      const validRes = validateConversionRate(maxSafeString);
      expect(validRes.ok).toBe(true);
      if (validRes.ok) {
        expect(validRes.value).toBe(999999999999999n);
      }

      // 16 digits: 1,000,000,000,000,000
      const overflowString = "1" + "0".repeat(MAX_SAFE_DIGITS);
      const invalidRes = validateConversionRate(overflowString);
      expect(invalidRes).toEqual({
        ok: false,
        error: "rate exceeds maximum of 15 digits",
        code: ERROR_CODES.EXCESSIVE_DIGITS,
      });
    });

    it("rejects non-integer inputs and floating-point strings/numbers", () => {
      // Decimal point string
      const resFloatString = validateConversionRate("123.456");
      expect(resFloatString).toEqual({
        ok: false,
        error: "rate must be an integer numeric value",
        code: ERROR_CODES.INVALID_RATE,
      });

      // Float number
      const resFloatNumber = validateConversionRate(12.34);
      expect(resFloatNumber).toEqual({
        ok: false,
        error: "rate must be a finite integer",
        code: ERROR_CODES.INVALID_RATE,
      });

      // Non-numeric string
      const resAlpha = validateConversionRate("1000g");
      expect(resAlpha).toEqual({
        ok: false,
        error: "rate must be an integer numeric value",
        code: ERROR_CODES.INVALID_RATE,
      });

      // Non-finite numbers
      expect(validateConversionRate(NaN)).toEqual({
        ok: false,
        error: "rate must be a finite integer",
        code: ERROR_CODES.INVALID_RATE,
      });
      expect(validateConversionRate(Infinity)).toEqual({
        ok: false,
        error: "rate must be a finite integer",
        code: ERROR_CODES.INVALID_RATE,
      });
    });
  });

  describe("applyConversionRate detailed mathematical calculations", () => {
    it("calculates conversion for 7-decimal fixed-point oracle rate and token amount", () => {
      // Math:
      // Notional = 25,000,000 stroops (2.5 XLM at 10^7 scale)
      // Rate = 1,250,000 ($0.125 USD/XLM scaled by 10^7)
      // Calculation: 25,000,000 * 1,250,000 = 31,250,000,000,000 (14 digits)
      const notional = "25000000";
      const rate = "1250000";
      const expectedBigInt = 31250000000000n;

      const result = applyConversionRate(notional, rate);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expectedBigInt);
      }
    });

    it("verifies non-trivial asymmetric fixed-point rate multiplication", () => {
      // Math:
      // Source amount = 123,456,789
      // Conversion factor = 987,654
      // Product = 123,456,789 * 987,654 = 121,932,591,483,006 (15 digits)
      const notional = 123456789n;
      const rate = "987654";
      const expectedProduct = 121932591483006n;

      const result = applyConversionRate(notional, rate);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expectedProduct);
      }
    });

    it("correctly evaluates non-integer result before unscaling factor", () => {
      // Math:
      // Notional = 1,000,001
      // Rate = 333,333
      // Product = 1,000,001 * 333,333 = 333,333,333,333 (12 digits)
      const notional = "1000001";
      const rate = "333333";
      const expectedProduct = 333333333333n;

      const result = applyConversionRate(notional, rate);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expectedProduct);
      }
    });

    it("verifies directional multiplier behaviour to prevent ratio inversion", () => {
      // Scenario: Converting Token A to Token B where Token A price is $2.00 (scaled: 200)
      // and Token B price is $0.50 (scaled: 50).
      // Conversion rate factor R = PriceA / PriceB = 200 / 50 = 4 (scaled: 4)
      // Notional of 500 Token A converted to Token B = 500 * 4 = 2,000 Token B units.
      // If inverted (0.25), product would be 125, which would fail this assertion.
      const notional = 500;
      const rate = 4;
      const expectedProduct = 2000n;

      const result = applyConversionRate(notional, rate);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expectedProduct);
      }
    });

    it("handles zero notional and zero rate correctly", () => {
      // Math: 0 * 123,456,789 = 0
      const zeroNotional = applyConversionRate("0", "123456789");
      expect(zeroNotional).toEqual({ ok: true, value: 0n });

      // Math: 123,456,789 * 0 = 0
      const zeroRate = applyConversionRate("123456789", "0");
      expect(zeroRate).toEqual({ ok: true, value: 0n });
    });

    it("handles negative values in credit/debit adjustments", () => {
      // Math: -1,234,567 * 5,000 = -6,172,835,000
      const negativeNotional = applyConversionRate("-1234567", "5000");
      expect(negativeNotional).toEqual({ ok: true, value: -6172835000n });
    });

    it("verifies maximum safe product boundary (15 digits ok vs 16 digits overflow)", () => {
      // Safe boundary:
      // Notional = 999,999,999 (9 digits)
      // Rate = 1,000,000 (7 digits)
      // Product = 999,999,999,000,000 (15 digits) -> PASS
      const safeNotional = "999999999";
      const safeRate = "1000000";
      const expectedSafeProduct = 999999999000000n;

      const safeResult = applyConversionRate(safeNotional, safeRate);
      expect(safeResult.ok).toBe(true);
      if (safeResult.ok) {
        expect(safeResult.value).toBe(expectedSafeProduct);
      }

      // Overflow boundary:
      // Notional = 1,000,000,000 (10 digits)
      // Rate = 1,000,000 (7 digits)
      // Product = 1,000,000,000,000,000 (16 digits) -> OVERFLOW
      const overflowNotional = "1000000000";
      const overflowRate = "1000000";

      const overflowResult = applyConversionRate(
        overflowNotional,
        overflowRate
      );
      expect(overflowResult).toEqual({
        ok: false,
        error: "converted value exceeds maximum of 15 digits",
        code: ERROR_CODES.PRODUCT_OVERFLOW,
      });
    });

    it("rejects conversion when notional or rate has invalid format or excessive digits", () => {
      // Invalid notional format
      const badNotional = applyConversionRate("12.34", "1000");
      expect(badNotional).toEqual({
        ok: false,
        error: "notional must be an integer numeric value",
        code: ERROR_CODES.INVALID_RATE,
      });

      // Excessive digits in rate
      const badRateDigits = applyConversionRate("1000", "1" + "0".repeat(15));
      expect(badRateDigits).toEqual({
        ok: false,
        error: "rate exceeds maximum of 15 digits",
        code: ERROR_CODES.EXCESSIVE_DIGITS,
      });
    });

    it("supports mixed input types seamlessly (string, number, bigint)", () => {
      // Math: 5,000 * 250 = 1,250,000
      const res1 = applyConversionRate(5000, "250");
      expect(res1).toEqual({ ok: true, value: 1250000n });

      const res2 = applyConversionRate("5000", 250n);
      expect(res2).toEqual({ ok: true, value: 1250000n });
    });
  });
});
