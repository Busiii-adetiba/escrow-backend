import {
  MAX_SAFE_DIGITS,
  MAX_TOKEN_DECIMALS,
  ERROR_CODES,
  validateDecimals,
  validateRawAmount,
  toRawUnits,
  toHumanUnits,
} from "../src/utils/token_decimals_converter.js";

describe("token_decimals_converter overflow validation", () => {
  describe("validateDecimals", () => {
    it("accepts valid decimals values", () => {
      expect(validateDecimals(0).ok).toBe(true);
      expect(validateDecimals(7).ok).toBe(true);
      expect(validateDecimals(MAX_TOKEN_DECIMALS).ok).toBe(true);
    });

    it("rejects negative decimals with DECIMALS_INVALID_DECIMALS", () => {
      const result = validateDecimals(-1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.INVALID_DECIMALS);
      }
    });

    it("rejects decimals above MAX_TOKEN_DECIMALS", () => {
      const result = validateDecimals(MAX_TOKEN_DECIMALS + 1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.INVALID_DECIMALS);
      }
    });

    it("rejects non-integer decimals", () => {
      const result = validateDecimals(2.5);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.INVALID_DECIMALS);
      }
    });

    it("rejects NaN decimals", () => {
      const result = validateDecimals(NaN);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.INVALID_DECIMALS);
      }
    });
  });

  describe("validateRawAmount", () => {
    it("accepts values within the digit limit", () => {
      const result = validateRawAmount("123456789012345");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(123456789012345n);
      }
    });

    it("accepts bigint and number inputs within limits", () => {
      expect(validateRawAmount(999n).ok).toBe(true);
      expect(validateRawAmount(42).ok).toBe(true);
    });

    it("rejects excessive digits with DECIMALS_EXCESSIVE_DIGITS", () => {
      const tooBig = "1" + "0".repeat(MAX_SAFE_DIGITS);
      const result = validateRawAmount(tooBig);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.EXCESSIVE_DIGITS);
      }
    });

    it("rejects non-integer strings with DECIMALS_INVALID_AMOUNT", () => {
      const result = validateRawAmount("12.5");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.INVALID_AMOUNT);
      }
    });

    it("rejects non-finite numbers", () => {
      const result = validateRawAmount(Number.POSITIVE_INFINITY);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.INVALID_AMOUNT);
      }
    });
  });

  describe("toRawUnits", () => {
    it("converts a simple human amount correctly for decimals=7", () => {
      const result = toRawUnits("1.5", 7);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(15000000n);
      }
    });

    it("converts a simple human amount correctly for decimals=2", () => {
      const result = toRawUnits("100.25", 2);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(10025n);
      }
    });

    it("converts a whole-number human amount with no fractional part", () => {
      const result = toRawUnits("42", 6);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42000000n);
      }
    });

    it("rejects a fractional part with more digits than decimals allows", () => {
      const result = toRawUnits("1.23456", 3);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.INVALID_AMOUNT);
      }
    });

    it("propagates DECIMALS_INVALID_DECIMALS for an invalid decimals value", () => {
      const result = toRawUnits("1.5", 19);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.INVALID_DECIMALS);
      }
    });

    it("blocks a conversion that would overflow the safe digit limit after scaling", () => {
      const manyDigits = "1".repeat(10); // 10 digit whole part
      const result = toRawUnits(manyDigits, 18);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.CONVERSION_OVERFLOW);
      }
    });
  });

  describe("toHumanUnits", () => {
    it("converts a raw amount back to the correct human string for decimals=7", () => {
      const result = toHumanUnits(15000000n, 7);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("1.5");
      }
    });

    it("converts a raw amount back to the correct human string for decimals=0", () => {
      const result = toHumanUnits(42n, 0);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("42");
      }
    });

    it("pads leading zeros when the raw amount has fewer digits than decimals", () => {
      const result = toHumanUnits(5n, 7);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("0.0000005");
      }
    });

    it("round-trips correctly with toRawUnits", () => {
      const raw = toRawUnits("100.250", 4);
      expect(raw.ok).toBe(true);
      if (raw.ok) {
        const human = toHumanUnits(raw.value, 4);
        expect(human.ok).toBe(true);
        if (human.ok) {
          expect(human.value).toBe("100.25");
        }
      }
    });

    it("propagates DECIMALS_INVALID_DECIMALS for an invalid decimals value", () => {
      const result = toHumanUnits(5n, MAX_TOKEN_DECIMALS + 1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.INVALID_DECIMALS);
      }
    });

    it("propagates DECIMALS_EXCESSIVE_DIGITS for an excessive-digit raw amount", () => {
      const tooBig = "1" + "0".repeat(MAX_SAFE_DIGITS);
      const result = toHumanUnits(tooBig, 7);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(ERROR_CODES.EXCESSIVE_DIGITS);
      }
    });
  });
});

describe("token_decimals_converter mathematical verification with detailed numeric test data", () => {
  interface NumericTestCase {
    raw: bigint;
    decimals: number;
    expectedHuman: string;
    description: string;
  }

  // Verified calculations for Stellar (SEP-41 / XLM) 7-decimal conversions
  describe("Stellar native (decimals = 7 / stroop) conversion math", () => {
    const stroopPowersOf10: NumericTestCase[] = [
      { raw: 1n, decimals: 7, expectedHuman: "0.0000001", description: "1 stroop (minimum unit: 10^-7 XLM)" },
      { raw: 10n, decimals: 7, expectedHuman: "0.000001", description: "10 stroops (10^-6 XLM)" },
      { raw: 100n, decimals: 7, expectedHuman: "0.00001", description: "100 stroops (10^-5 XLM)" },
      { raw: 1000n, decimals: 7, expectedHuman: "0.0001", description: "1,000 stroops (10^-4 XLM)" },
      { raw: 10000n, decimals: 7, expectedHuman: "0.001", description: "10,000 stroops (10^-3 XLM)" },
      { raw: 100000n, decimals: 7, expectedHuman: "0.01", description: "100,000 stroops (10^-2 XLM)" },
      { raw: 1000000n, decimals: 7, expectedHuman: "0.1", description: "1,000,000 stroops (0.1 XLM)" },
      { raw: 10000000n, decimals: 7, expectedHuman: "1", description: "10,000,000 stroops (1 whole XLM)" },
      { raw: 100000000n, decimals: 7, expectedHuman: "10", description: "100,000,000 stroops (10 XLM)" },
      { raw: 1000000000n, decimals: 7, expectedHuman: "100", description: "1,000,000,000 stroops (100 XLM)" },
      { raw: 10000000000n, decimals: 7, expectedHuman: "1000", description: "10,000,000,000 stroops (1,000 XLM)" },
      { raw: 100000000000n, decimals: 7, expectedHuman: "10000", description: "100,000,000,000 stroops (10,000 XLM)" },
      { raw: 1000000000000n, decimals: 7, expectedHuman: "100000", description: "1,000,000,000,000 stroops (100,000 XLM)" },
      { raw: 10000000000000n, decimals: 7, expectedHuman: "1000000", description: "10,000,000,000,000 stroops (1,000,000 XLM)" },
      { raw: 100000000000000n, decimals: 7, expectedHuman: "10000000", description: "100,000,000,000,000 stroops (10,000,000 XLM, 15 digits)" },
    ];

    stroopPowersOf10.forEach(({ raw, decimals, expectedHuman, description }) => {
      it(`converts ${description}: raw ${raw} -> human "${expectedHuman}"`, () => {
        const humanResult = toHumanUnits(raw, decimals);
        expect(humanResult.ok).toBe(true);
        if (humanResult.ok) {
          expect(humanResult.value).toBe(expectedHuman);
        }

        const rawResult = toRawUnits(expectedHuman, decimals);
        expect(rawResult.ok).toBe(true);
        if (rawResult.ok) {
          expect(rawResult.value).toBe(raw);
        }
      });
    });

    const fractionalStroopCases: NumericTestCase[] = [
      { raw: 15000000n, decimals: 7, expectedHuman: "1.5", description: "1.5 XLM" },
      { raw: 25750000n, decimals: 7, expectedHuman: "2.575", description: "2.575 XLM" },
      { raw: 10500000n, decimals: 7, expectedHuman: "1.05", description: "1.05 XLM (single trailing zero)" },
      { raw: 10050000n, decimals: 7, expectedHuman: "1.005", description: "1.005 XLM (two trailing zeros)" },
      { raw: 10005000n, decimals: 7, expectedHuman: "1.0005", description: "1.0005 XLM (three trailing zeros)" },
      { raw: 10000500n, decimals: 7, expectedHuman: "1.00005", description: "1.00005 XLM (four trailing zeros)" },
      { raw: 10000050n, decimals: 7, expectedHuman: "1.000005", description: "1.000005 XLM (five trailing zeros)" },
      { raw: 10000005n, decimals: 7, expectedHuman: "1.0000005", description: "1.0000005 XLM (no trailing zeros)" },
      { raw: 1234567n, decimals: 7, expectedHuman: "0.1234567", description: "Full 7-decimal fractional precision without integer part" },
      { raw: 1234567890123n, decimals: 7, expectedHuman: "123456.7890123", description: "Multi-digit whole and 7-decimal fractional" },
      { raw: 987654321098765n, decimals: 7, expectedHuman: "98765432.1098765", description: "Max 15-digit safe value with 7 decimals" },
    ];

    fractionalStroopCases.forEach(({ raw, decimals, expectedHuman, description }) => {
      it(`verifies fractional conversion for ${description}: ${raw} <-> "${expectedHuman}"`, () => {
        const humanResult = toHumanUnits(raw, decimals);
        expect(humanResult.ok).toBe(true);
        if (humanResult.ok) {
          expect(humanResult.value).toBe(expectedHuman);
        }

        const rawResult = toRawUnits(expectedHuman, decimals);
        expect(rawResult.ok).toBe(true);
        if (rawResult.ok) {
          expect(rawResult.value).toBe(raw);
        }
      });
    });
  });

  // Verified calculations across common token decimal scales
  describe("Multi-asset decimals conversion matrix", () => {
    describe("Decimals = 0 (Indivisible tokens, NFTs)", () => {
      const cases: NumericTestCase[] = [
        { raw: 0n, decimals: 0, expectedHuman: "0", description: "zero tokens" },
        { raw: 1n, decimals: 0, expectedHuman: "1", description: "single indivisible unit" },
        { raw: 42n, decimals: 0, expectedHuman: "42", description: "two-digit integer" },
        { raw: 1000000n, decimals: 0, expectedHuman: "1000000", description: "one million units" },
        { raw: 999999999999999n, decimals: 0, expectedHuman: "999999999999999", description: "15 nines (max safe)" },
      ];

      cases.forEach(({ raw, decimals, expectedHuman, description }) => {
        it(`accurately converts decimals=0 ${description}`, () => {
          const human = toHumanUnits(raw, decimals);
          expect(human.ok).toBe(true);
          if (human.ok) {
            expect(human.value).toBe(expectedHuman);
          }

          const backToRaw = toRawUnits(expectedHuman, decimals);
          expect(backToRaw.ok).toBe(true);
          if (backToRaw.ok) {
            expect(backToRaw.value).toBe(raw);
          }
        });
      });
    });

    describe("Decimals = 2 (Fiat currency / cents)", () => {
      const cases: NumericTestCase[] = [
        { raw: 1n, decimals: 2, expectedHuman: "0.01", description: "1 cent" },
        { raw: 10n, decimals: 2, expectedHuman: "0.1", description: "10 cents (0.1)" },
        { raw: 50n, decimals: 2, expectedHuman: "0.5", description: "50 cents (0.5)" },
        { raw: 99n, decimals: 2, expectedHuman: "0.99", description: "99 cents" },
        { raw: 100n, decimals: 2, expectedHuman: "1", description: "1 dollar / unit" },
        { raw: 105n, decimals: 2, expectedHuman: "1.05", description: "1 dollar and 5 cents" },
        { raw: 1250n, decimals: 2, expectedHuman: "12.5", description: "12.50 dollars" },
        { raw: 1299n, decimals: 2, expectedHuman: "12.99", description: "12.99 dollars" },
        { raw: 50000n, decimals: 2, expectedHuman: "500", description: "500 dollars exact" },
        { raw: 999999999999999n, decimals: 2, expectedHuman: "9999999999999.99", description: "15 digits cent amount" },
      ];

      cases.forEach(({ raw, decimals, expectedHuman, description }) => {
        it(`accurately converts decimals=2 ${description}`, () => {
          const human = toHumanUnits(raw, decimals);
          expect(human.ok).toBe(true);
          if (human.ok) {
            expect(human.value).toBe(expectedHuman);
          }

          const backToRaw = toRawUnits(expectedHuman, decimals);
          expect(backToRaw.ok).toBe(true);
          if (backToRaw.ok) {
            expect(backToRaw.value).toBe(raw);
          }
        });
      });
    });

    describe("Decimals = 6 (USDC, USDT, EURC micro-units)", () => {
      const cases: NumericTestCase[] = [
        { raw: 1n, decimals: 6, expectedHuman: "0.000001", description: "1 micro-unit (0.000001)" },
        { raw: 10n, decimals: 6, expectedHuman: "0.00001", description: "10 micro-units" },
        { raw: 100n, decimals: 6, expectedHuman: "0.0001", description: "100 micro-units" },
        { raw: 1000n, decimals: 6, expectedHuman: "0.001", description: "1,000 micro-units" },
        { raw: 10000n, decimals: 6, expectedHuman: "0.01", description: "1 cent of USDC" },
        { raw: 100000n, decimals: 6, expectedHuman: "0.1", description: "10 cents of USDC" },
        { raw: 500000n, decimals: 6, expectedHuman: "0.5", description: "50 cents of USDC" },
        { raw: 1000000n, decimals: 6, expectedHuman: "1", description: "1 USDC" },
        { raw: 1234567n, decimals: 6, expectedHuman: "1.234567", description: "1.234567 USDC" },
        { raw: 1000000000n, decimals: 6, expectedHuman: "1000", description: "1,000 USDC" },
        { raw: 999999999999999n, decimals: 6, expectedHuman: "999999999.999999", description: "15 digits USDC" },
      ];

      cases.forEach(({ raw, decimals, expectedHuman, description }) => {
        it(`accurately converts decimals=6 ${description}`, () => {
          const human = toHumanUnits(raw, decimals);
          expect(human.ok).toBe(true);
          if (human.ok) {
            expect(human.value).toBe(expectedHuman);
          }

          const backToRaw = toRawUnits(expectedHuman, decimals);
          expect(backToRaw.ok).toBe(true);
          if (backToRaw.ok) {
            expect(backToRaw.value).toBe(raw);
          }
        });
      });
    });

    describe("Decimals = 8 (Bitcoin satoshis equivalent)", () => {
      const cases: NumericTestCase[] = [
        { raw: 1n, decimals: 8, expectedHuman: "0.00000001", description: "1 satoshi" },
        { raw: 50000000n, decimals: 8, expectedHuman: "0.5", description: "0.5 BTC" },
        { raw: 100000000n, decimals: 8, expectedHuman: "1", description: "1 BTC" },
        { raw: 12345678n, decimals: 8, expectedHuman: "0.12345678", description: "0.12345678 BTC" },
        { raw: 12345678912345n, decimals: 8, expectedHuman: "123456.78912345", description: "14 digits BTC" },
        { raw: 999999999999999n, decimals: 8, expectedHuman: "9999999.99999999", description: "15 digits BTC" },
      ];

      cases.forEach(({ raw, decimals, expectedHuman, description }) => {
        it(`accurately converts decimals=8 ${description}`, () => {
          const human = toHumanUnits(raw, decimals);
          expect(human.ok).toBe(true);
          if (human.ok) {
            expect(human.value).toBe(expectedHuman);
          }

          const backToRaw = toRawUnits(expectedHuman, decimals);
          expect(backToRaw.ok).toBe(true);
          if (backToRaw.ok) {
            expect(backToRaw.value).toBe(raw);
          }
        });
      });
    });

    describe("Decimals = 9 (Gwei / nano-units)", () => {
      const cases: NumericTestCase[] = [
        { raw: 1n, decimals: 9, expectedHuman: "0.000000001", description: "1 nano-unit" },
        { raw: 1000000000n, decimals: 9, expectedHuman: "1", description: "1 whole unit" },
        { raw: 123456789n, decimals: 9, expectedHuman: "0.123456789", description: "fractional nano-unit" },
        { raw: 123456789000n, decimals: 9, expectedHuman: "123.456789", description: "trimmed trailing zeros" },
        { raw: 987654321098765n, decimals: 9, expectedHuman: "987654.321098765", description: "15 digits nano-unit" },
      ];

      cases.forEach(({ raw, decimals, expectedHuman, description }) => {
        it(`accurately converts decimals=9 ${description}`, () => {
          const human = toHumanUnits(raw, decimals);
          expect(human.ok).toBe(true);
          if (human.ok) {
            expect(human.value).toBe(expectedHuman);
          }

          const backToRaw = toRawUnits(expectedHuman, decimals);
          expect(backToRaw.ok).toBe(true);
          if (backToRaw.ok) {
            expect(backToRaw.value).toBe(raw);
          }
        });
      });
    });

    describe("Decimals = 12 (pico-units)", () => {
      const cases: NumericTestCase[] = [
        { raw: 1n, decimals: 12, expectedHuman: "0.000000000001", description: "1 pico-unit" },
        { raw: 1000000000000n, decimals: 12, expectedHuman: "1", description: "1 whole unit" },
        { raw: 1500000000000n, decimals: 12, expectedHuman: "1.5", description: "1.5 units" },
        { raw: 1234567890123n, decimals: 12, expectedHuman: "1.234567890123", description: "full 12 fractional digits" },
        { raw: 999999999999999n, decimals: 12, expectedHuman: "999.999999999999", description: "15 digits pico-units" },
      ];

      cases.forEach(({ raw, decimals, expectedHuman, description }) => {
        it(`accurately converts decimals=12 ${description}`, () => {
          const human = toHumanUnits(raw, decimals);
          expect(human.ok).toBe(true);
          if (human.ok) {
            expect(human.value).toBe(expectedHuman);
          }

          const backToRaw = toRawUnits(expectedHuman, decimals);
          expect(backToRaw.ok).toBe(true);
          if (backToRaw.ok) {
            expect(backToRaw.value).toBe(raw);
          }
        });
      });
    });

    describe("Decimals = 18 (EVM wei scale)", () => {
      const cases: NumericTestCase[] = [
        { raw: 1n, decimals: 18, expectedHuman: "0.000000000000000001", description: "1 wei (10^-18)" },
        { raw: 1000n, decimals: 18, expectedHuman: "0.000000000000001", description: "1,000 wei" },
        { raw: 100000000000000n, decimals: 18, expectedHuman: "0.0001", description: "10^14 wei (0.0001 unit, 15 digits)" },
        { raw: 999999999999999n, decimals: 18, expectedHuman: "0.000999999999999999", description: "15 digits max safe in 18 decimals" },
      ];

      cases.forEach(({ raw, decimals, expectedHuman, description }) => {
        it(`accurately converts decimals=18 ${description}`, () => {
          const human = toHumanUnits(raw, decimals);
          expect(human.ok).toBe(true);
          if (human.ok) {
            expect(human.value).toBe(expectedHuman);
          }

          const backToRaw = toRawUnits(expectedHuman, decimals);
          expect(backToRaw.ok).toBe(true);
          if (backToRaw.ok) {
            expect(backToRaw.value).toBe(raw);
          }
        });
      });
    });
  });

  // Zero and signed values arithmetic verification
  describe("Zero and signed value numeric calculations", () => {
    const decimalScales = [0, 1, 2, 6, 7, 8, 9, 12, 18];

    describe("zero value conversions across all decimal scales", () => {
      decimalScales.forEach((dec) => {
        it(`converts zero to "0" for decimals=${dec}`, () => {
          expect(toHumanUnits(0n, dec)).toEqual({ ok: true, value: "0" });
          expect(toHumanUnits(0, dec)).toEqual({ ok: true, value: "0" });
          expect(toHumanUnits("0", dec)).toEqual({ ok: true, value: "0" });
          expect(toHumanUnits("-0", dec)).toEqual({ ok: true, value: "0" });

          expect(toRawUnits("0", dec)).toEqual({ ok: true, value: 0n });
          expect(toRawUnits("-0", dec)).toEqual({ ok: true, value: 0n });

          if (dec > 0) {
            expect(toRawUnits("0.0", dec)).toEqual({ ok: true, value: 0n });
            expect(toRawUnits("-0.0", dec)).toEqual({ ok: true, value: 0n });
          } else {
            // For decimals=0, any fractional point constitutes invalid fractional precision
            const result = toRawUnits("0.0", 0);
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.code).toBe(ERROR_CODES.INVALID_AMOUNT);
            }
          }
        });
      });
    });

    describe("negative amount numeric calculations", () => {
      const negativeCases: NumericTestCase[] = [
        { raw: -1n, decimals: 7, expectedHuman: "-0.0000001", description: "-1 stroop" },
        { raw: -10000000n, decimals: 7, expectedHuman: "-1", description: "-1 XLM" },
        { raw: -15000000n, decimals: 7, expectedHuman: "-1.5", description: "-1.5 XLM" },
        { raw: -105n, decimals: 2, expectedHuman: "-1.05", description: "-1.05 fiat" },
        { raw: -42n, decimals: 0, expectedHuman: "-42", description: "-42 integer" },
        { raw: -999999999999999n, decimals: 7, expectedHuman: "-99999999.9999999", description: "negative 15-digit boundary" },
      ];

      negativeCases.forEach(({ raw, decimals, expectedHuman, description }) => {
        it(`correctly converts negative amount for ${description}: ${raw} <-> "${expectedHuman}"`, () => {
          const human = toHumanUnits(raw, decimals);
          expect(human.ok).toBe(true);
          if (human.ok) {
            expect(human.value).toBe(expectedHuman);
          }

          const rawResult = toRawUnits(expectedHuman, decimals);
          expect(rawResult.ok).toBe(true);
          if (rawResult.ok) {
            expect(rawResult.value).toBe(raw);
          }
        });
      });
    });
  });

  // Maximum safe digit limit (MAX_SAFE_DIGITS = 15) boundary numeric tests
  describe("MAX_SAFE_DIGITS (15) boundary numeric verification", () => {
    const boundaryCases = [
      { raw: 999999999999999n, decimals: 0, expected: "999999999999999" },
      { raw: 999999999999999n, decimals: 1, expected: "99999999999999.9" },
      { raw: 999999999999999n, decimals: 7, expected: "99999999.9999999" },
      { raw: 999999999999999n, decimals: 14, expected: "9.99999999999999" },
      { raw: 999999999999999n, decimals: 15, expected: "0.999999999999999" },
      { raw: 999999999999999n, decimals: 18, expected: "0.000999999999999999" },
      { raw: 100000000000000n, decimals: 0, expected: "100000000000000" },
      { raw: 100000000000000n, decimals: 2, expected: "1000000000000" },
      { raw: 100000000000000n, decimals: 7, expected: "10000000" },
      { raw: 100000000000000n, decimals: 14, expected: "1" },
      { raw: 100000000000000n, decimals: 15, expected: "0.1" },
      { raw: 100000000000000n, decimals: 18, expected: "0.0001" },
    ];

    boundaryCases.forEach(({ raw, decimals, expected }) => {
      it(`preserves exact boundary numeric precision for raw ${raw} at decimals=${decimals}`, () => {
        const human = toHumanUnits(raw, decimals);
        expect(human.ok).toBe(true);
        if (human.ok) {
          expect(human.value).toBe(expected);
        }

        const backToRaw = toRawUnits(expected, decimals);
        expect(backToRaw.ok).toBe(true);
        if (backToRaw.ok) {
          expect(backToRaw.value).toBe(raw);
        }
      });
    });
  });

  // Direct mathematical unit division property comparison: quotient and remainder
  describe("Direct BigInt unit division quotient and remainder comparison", () => {
    const testAmounts: [bigint, number][] = [
      [15000000n, 7],
      [10000000n, 7],
      [1234567n, 7],
      [1n, 7],
      [999999999999999n, 7],
      [123456n, 2],
      [100n, 2],
      [99n, 2],
      [1n, 2],
      [5000000n, 6],
      [1234567n, 6],
      [1000000000n, 9],
      [987654321n, 9],
      [1234567890123n, 12],
      [100000000000000n, 18],
      [1n, 18],
    ];

    testAmounts.forEach(([raw, decimals]) => {
      it(`verifies toHumanUnits(${raw}, ${decimals}) matches arithmetic quotient and remainder`, () => {
        const result = toHumanUnits(raw, decimals);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const scale = 10n ** BigInt(decimals);
        const expectedQuotient = raw / scale;
        const expectedRemainder = raw % scale;

        if (expectedRemainder === 0n) {
          expect(result.value).toBe(expectedQuotient.toString());
        } else {
          const [wholeStr, fracStr] = result.value.split(".");
          expect(wholeStr).toBe(expectedQuotient.toString());
          const fullPaddedRemainder = expectedRemainder.toString().padStart(decimals, "0");
          const expectedFrac = fullPaddedRemainder.replace(/0+$/, "");
          expect(fracStr).toBe(expectedFrac);
        }
      });
    });
  });

  // Mixed input polymorphism and normalization tests
  describe("Input type polymorphism and formatting normalization", () => {
    it("produces identical human strings for bigint, number, and string inputs in toHumanUnits", () => {
      const fromBigInt = toHumanUnits(15000000n, 7);
      const fromNumber = toHumanUnits(15000000, 7);
      const fromString = toHumanUnits("15000000", 7);
      const fromLeadingZeros = toHumanUnits("00015000000", 7);

      expect(fromBigInt).toEqual({ ok: true, value: "1.5" });
      expect(fromNumber).toEqual({ ok: true, value: "1.5" });
      expect(fromString).toEqual({ ok: true, value: "1.5" });
      expect(fromLeadingZeros).toEqual({ ok: true, value: "1.5" });
    });

    it("handles negative strings with leading zeros in toHumanUnits", () => {
      const result = toHumanUnits("-00015000000", 7);
      expect(result).toEqual({ ok: true, value: "-1.5" });
    });

    it("produces identical raw units for number, string, and strings with trailing zeros in toRawUnits", () => {
      const fromString = toRawUnits("1.5", 7);
      const fromNumber = toRawUnits(1.5, 7);
      const fromPadded = toRawUnits("1.50000", 7);
      const fromLeadingZero = toRawUnits("01.50", 7);

      expect(fromString).toEqual({ ok: true, value: 15000000n });
      expect(fromNumber).toEqual({ ok: true, value: 15000000n });
      expect(fromPadded).toEqual({ ok: true, value: 15000000n });
      expect(fromLeadingZero).toEqual({ ok: true, value: 15000000n });
    });

    it("correctly handles human amounts with redundant fractional zeroes for integers", () => {
      expect(toRawUnits("100.00", 2)).toEqual({ ok: true, value: 10000n });
      expect(toRawUnits("100.0000000", 7)).toEqual({ ok: true, value: 1000000000n });
    });
  });
});

