import fs from "fs";
import os from "os";
import path from "path";
import {
  MAX_SAFE_DIGITS,
  MAX_TOKEN_DECIMALS,
  ERROR_CODES,
  validateDecimals,
  validateRawAmount,
  toRawUnits,
  toHumanUnits,
  escapeCsvField,
  formatRowToCsv,
  validateConversionRecord,
  buildCsvBlock,
  exportToCsv,
  formatToCsv,
  serializeToCsv,
  formatConversionTable,
  exportRawToHumanCsv,
  exportHumanToRawCsv,
  exportToCsvFile,
  serializeToCsvFile,
  serializeConversionRecordsToFile,
  writeCsvToFile,
  parseCsvLine,
  parseCsvBlock,
  readCsvFromFile,
  parseCsvFromFile,
  TokenConversionRecord,
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

  describe("CSV escaping and row formatting", () => {
    describe("escapeCsvField", () => {
      it("returns empty string for null and undefined", () => {
        expect(escapeCsvField(null)).toBe("");
        expect(escapeCsvField(undefined)).toBe("");
      });

      it("returns string representation of numbers and bigints", () => {
        expect(escapeCsvField(42)).toBe("42");
        expect(escapeCsvField(10000000n)).toBe("10000000");
      });

      it("leaves plain strings unquoted", () => {
        expect(escapeCsvField("USDC")).toBe("USDC");
        expect(escapeCsvField("100.25")).toBe("100.25");
      });

      it("wraps strings containing delimiters in quotes", () => {
        expect(escapeCsvField("hello,world", ",")).toBe('"hello,world"');
        expect(escapeCsvField("hello;world", ";")).toBe('"hello;world"');
      });

      it("doubles internal double quotes and wraps in quotes", () => {
        expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
      });

      it("wraps strings containing newlines in quotes", () => {
        expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
        expect(escapeCsvField("line1\r\nline2")).toBe('"line1\r\nline2"');
      });
    });

    describe("formatRowToCsv", () => {
      it("formats an array of values into a delimiter-separated line", () => {
        const row = formatRowToCsv(["USDC", 10000000n, 7, "1.0"]);
        expect(row).toBe("USDC,10000000,7,1.0");
      });

      it("respects custom delimiter in row formatting", () => {
        const row = formatRowToCsv(["XLM", 5000000n, 7, "0.5"], ";");
        expect(row).toBe("XLM;5000000;7;0.5");
      });
    });
  });

  describe("validateConversionRecord", () => {
    it("rejects non-object records", () => {
      const res = validateConversionRecord(null as any, 0);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.INVALID_ROW);
      }
    });

    it("rejects invalid decimals", () => {
      const res = validateConversionRecord({ rawAmount: 100n, decimals: -1 }, 0);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.INVALID_DECIMALS);
      }
    });

    it("rejects records missing both rawAmount and humanAmount", () => {
      const res = validateConversionRecord({ decimals: 7 }, 0);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.INVALID_ROW);
      }
    });

    it("derives humanAmount when only rawAmount is provided", () => {
      const res = validateConversionRecord({ rawAmount: 15000000n, decimals: 7 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.rawAmount).toBe(15000000n);
        expect(res.value.humanAmount).toBe("1.5");
        expect(res.value.decimals).toBe(7);
      }
    });

    it("derives rawAmount when only humanAmount is provided", () => {
      const res = validateConversionRecord({ humanAmount: "2.75", decimals: 2 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.rawAmount).toBe(275n);
        expect(res.value.humanAmount).toBe("2.75");
        expect(res.value.decimals).toBe(2);
      }
    });

    it("accepts consistent rawAmount and humanAmount", () => {
      const res = validateConversionRecord({
        symbol: "USDC",
        rawAmount: 10000000n,
        humanAmount: "1.0",
        decimals: 7,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.symbol).toBe("USDC");
        expect(res.value.rawAmount).toBe(10000000n);
        expect(res.value.humanAmount).toBe("1");
      }
    });

    it("rejects conflicting rawAmount and humanAmount", () => {
      const res = validateConversionRecord({
        rawAmount: 10000000n,
        humanAmount: "2.0",
        decimals: 7,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.INVALID_AMOUNT);
      }
    });

    it("supports snake_case fields raw_amount and human_amount", () => {
      const res = validateConversionRecord({
        raw_amount: 5000000n,
        decimals: 7,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.humanAmount).toBe("0.5");
      }
    });

    it("preserves symbol, token, label, and custom properties", () => {
      const res = validateConversionRecord({
        symbol: "TEST",
        token: "CADB123",
        label: "escrow deposit",
        rawAmount: 100n,
        decimals: 2,
        customTag: "audit-01",
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.symbol).toBe("TEST");
        expect(res.value.token).toBe("CADB123");
        expect(res.value.label).toBe("escrow deposit");
        expect(res.value.customTag).toBe("audit-01");
      }
    });

    it("rejects excessive digits in rawAmount", () => {
      const tooBig = "1" + "0".repeat(MAX_SAFE_DIGITS);
      const res = validateConversionRecord({ rawAmount: tooBig, decimals: 7 });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.EXCESSIVE_DIGITS);
      }
    });

    it("rejects excessive fractional digits in humanAmount", () => {
      const res = validateConversionRecord({ humanAmount: "1.12345", decimals: 2 });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.INVALID_AMOUNT);
      }
    });
  });

  describe("CSV block builders and format exporters", () => {
    it("rejects non-array records", () => {
      const res = buildCsvBlock(null as any);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.INVALID_INPUT);
      }
    });

    it("builds a header-only CSV for empty records by default", () => {
      const res = buildCsvBlock([]);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toBe("rawAmount,decimals,humanAmount\n");
        expect(res.rowCount).toBe(0);
      }
    });

    it("rejects empty records if allowEmpty is false", () => {
      const res = buildCsvBlock([], { allowEmpty: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.EMPTY_DATA);
      }
    });

    it("builds correct CSV formatting block for simple records without symbols", () => {
      const records: TokenConversionRecord[] = [
        { rawAmount: 15000000n, decimals: 7 },
        { rawAmount: 10025n, decimals: 2 },
      ];
      const res = buildCsvBlock(records);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.rowCount).toBe(2);
        expect(res.columns).toEqual(["rawAmount", "decimals", "humanAmount"]);
        const expected = [
          "rawAmount,decimals,humanAmount",
          "15000000,7,1.5",
          "10025,2,100.25\n",
        ].join("\n");
        expect(res.value).toBe(expected);
      }
    });

    it("includes symbol column when symbol is provided in records", () => {
      const records: TokenConversionRecord[] = [
        { symbol: "USDC", rawAmount: 10000000n, decimals: 7 },
        { symbol: "XLM", humanAmount: "50.0", decimals: 7 },
      ];
      const res = exportToCsv(records);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.columns).toEqual(["symbol", "rawAmount", "decimals", "humanAmount"]);
        const lines = res.value.trim().split("\n");
        expect(lines[0]).toBe("symbol,rawAmount,decimals,humanAmount");
        expect(lines[1]).toBe("USDC,10000000,7,1");
        expect(lines[2]).toBe("XLM,500000000,7,50");
      }
    });

    it("includes token column when token is present without symbol", () => {
      const records: TokenConversionRecord[] = [
        { token: "CADB123", rawAmount: 100n, decimals: 2 },
      ];
      const res = formatToCsv(records);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.columns).toEqual(["token", "rawAmount", "decimals", "humanAmount"]);
        expect(res.value).toContain("CADB123,100,2,1");
      }
    });

    it("supports custom columns and custom headers", () => {
      const records: TokenConversionRecord[] = [
        { symbol: "USDC", rawAmount: 20000000n, decimals: 7, humanAmount: "2.0" },
      ];
      const res = serializeToCsv(records, {
        columns: ["symbol", "humanAmount", "rawAmount"],
        headers: ["Token Symbol", "Formatted Value", "Raw On-Chain Amount"],
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        const lines = res.value.trim().split("\n");
        expect(lines[0]).toBe("Token Symbol,Formatted Value,Raw On-Chain Amount");
        expect(lines[1]).toBe("USDC,2,20000000");
      }
    });

    it("supports custom delimiter and line ending", () => {
      const records: TokenConversionRecord[] = [
        { rawAmount: 1000n, decimals: 3 },
      ];
      const res = formatConversionTable(records, {
        delimiter: ";",
        lineEnding: "\r\n",
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toBe("rawAmount;decimals;humanAmount\r\n1000;3;1\r\n");
      }
    });

    it("omits header row when includeHeader is false", () => {
      const records: TokenConversionRecord[] = [
        { rawAmount: 500n, decimals: 2 },
      ];
      const res = buildCsvBlock(records, { includeHeader: false });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toBe("500,2,5\n");
      }
    });

    it("fails fast if any record in the batch violates validation rules", () => {
      const records: TokenConversionRecord[] = [
        { rawAmount: 100n, decimals: 2 },
        { rawAmount: 200n, decimals: 99 }, // Invalid decimals
      ];
      const res = buildCsvBlock(records);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.INVALID_DECIMALS);
      }
    });

    it("properly escapes fields with commas and quotes in CSV output", () => {
      const records: TokenConversionRecord[] = [
        {
          symbol: 'USD, Coin "Gold"',
          rawAmount: 10000000n,
          decimals: 7,
        },
      ];
      const res = buildCsvBlock(records);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toContain('"USD, Coin ""Gold"""');
      }
    });

    describe("specialized exporters", () => {
      it("exportRawToHumanCsv exports raw amounts to CSV block", () => {
        const res = exportRawToHumanCsv([
          { rawAmount: 30000000n, decimals: 7, symbol: "XLM" },
        ]);
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.value).toContain("XLM,30000000,7,3");
        }
      });

      it("exportHumanToRawCsv exports human amounts to CSV block", () => {
        const res = exportHumanToRawCsv([
          { humanAmount: "4.5", decimals: 6, symbol: "USDC" },
        ]);
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.value).toContain("USDC,4500000,6,4.5");
        }
      });
    });
  });

  describe("file serialization helper functions", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "escrow-decimals-csv-test-"));
    });

    afterEach(() => {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // ignore cleanup errors in test
      }
    });

    it("rejects empty or invalid filePath", () => {
      const res = exportToCsvFile("", []);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.INVALID_INPUT);
      }
    });

    it("rejects non-array non-string data", () => {
      const filePath = path.join(tempDir, "invalid.csv");
      const res = exportToCsvFile(filePath, 123 as any);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.INVALID_INPUT);
      }
    });

    it("serializes conversion records to a newly created file and verifies table output", () => {
      const filePath = path.join(tempDir, "nested", "conversions.csv");
      const records: TokenConversionRecord[] = [
        { symbol: "USDC", rawAmount: 15000000n, decimals: 7 },
        { symbol: "XLM", rawAmount: 25000000n, decimals: 7 },
      ];

      const res = exportToCsvFile(filePath, records);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.filePath).toBe(filePath);
        expect(res.rowCount).toBe(2);
        expect(res.bytesWritten).toBeGreaterThan(0);
      }

      // Validation check: Assert created files contain correct table outputs
      expect(fs.existsSync(filePath)).toBe(true);
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const expectedLines = [
        "symbol,rawAmount,decimals,humanAmount",
        "USDC,15000000,7,1.5",
        "XLM,25000000,7,2.5",
      ];
      expect(fileContent.trim().split(/\r?\n/)).toEqual(expectedLines);
    });

    it("serializes pre-built CSV string directly to file", () => {
      const filePath = path.join(tempDir, "direct.csv");
      const csvString = "rawAmount,decimals,humanAmount\n100,2,1\n200,2,2\n";

      const res = writeCsvToFile(filePath, csvString);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.rowCount).toBe(2);
      }

      expect(fs.existsSync(filePath)).toBe(true);
      const readContent = fs.readFileSync(filePath, "utf-8");
      expect(readContent).toBe(csvString);
    });

    it("serializeToCsvFile and serializeConversionRecordsToFile alias work identically", () => {
      const filePath1 = path.join(tempDir, "alias1.csv");
      const filePath2 = path.join(tempDir, "alias2.csv");
      const records = [{ rawAmount: 999n, decimals: 0 }];

      const res1 = serializeToCsvFile(filePath1, records);
      const res2 = serializeConversionRecordsToFile(filePath2, records);

      expect(res1.ok).toBe(true);
      expect(res2.ok).toBe(true);
      expect(fs.readFileSync(filePath1, "utf-8")).toBe(fs.readFileSync(filePath2, "utf-8"));
    });

    it("propagates conversion validation errors and does not write file", () => {
      const filePath = path.join(tempDir, "failed.csv");
      const invalidRecords = [{ rawAmount: 100n, decimals: -5 }];

      const res = exportToCsvFile(filePath, invalidRecords);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.INVALID_DECIMALS);
      }
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("handles filesystem write failures gracefully with FILE_WRITE_ERROR", () => {
      // Use an invalid filename with null character
      const invalidPath = path.join(tempDir, "bad\0file.csv");
      const res = exportToCsvFile(invalidPath, "content");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe(ERROR_CODES.FILE_WRITE_ERROR);
      }
    });

    describe("CSV reading and deserialization round-trip", () => {
      it("parses CSV line with quotes and escaped characters", () => {
        const line = 'USDC,"15,000,000",7,"say ""hello"""';
        const fields = parseCsvLine(line);
        expect(fields).toEqual(["USDC", "15,000,000", "7", 'say "hello"']);
      });

      it("parses CSV block back into conversion records", () => {
        const csv = [
          "symbol,rawAmount,decimals,humanAmount",
          "USDC,10000000,7,1",
          "XLM,20000000,7,2",
        ].join("\n");

        const parsed = parseCsvBlock(csv);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(parsed.rowCount).toBe(2);
          expect(parsed.records[0].symbol).toBe("USDC");
          expect(parsed.records[0].rawAmount).toBe(10000000n);
          expect(parsed.records[0].humanAmount).toBe("1");
          expect(parsed.records[0].decimals).toBe(7);
        }
      });

      it("reads CSV file from disk and parses correctly", () => {
        const filePath = path.join(tempDir, "read_test.csv");
        const originalRecords: TokenConversionRecord[] = [
          { symbol: "USDC", rawAmount: 50000000n, decimals: 7 },
          { symbol: "BTC", rawAmount: 100000000n, decimals: 8 },
        ];

        const exportRes = exportToCsvFile(filePath, originalRecords);
        expect(exportRes.ok).toBe(true);

        const readRes = readCsvFromFile(filePath);
        expect(readRes.ok).toBe(true);
        if (readRes.ok) {
          expect(readRes.rowCount).toBe(2);
          expect(readRes.records[0].symbol).toBe("USDC");
          expect(readRes.records[0].rawAmount).toBe(50000000n);
          expect(readRes.records[0].humanAmount).toBe("5");
          expect(readRes.records[1].symbol).toBe("BTC");
          expect(readRes.records[1].rawAmount).toBe(100000000n);
          expect(readRes.records[1].humanAmount).toBe("1");
        }
      });

      it("parseCsvFromFile alias functions identically", () => {
        const filePath = path.join(tempDir, "read_alias.csv");
        exportToCsvFile(filePath, [{ rawAmount: 100n, decimals: 2 }]);
        const res = parseCsvFromFile(filePath);
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.rowCount).toBe(1);
        }
      });

      it("returns FILE_READ_ERROR when file does not exist", () => {
        const res = readCsvFromFile(path.join(tempDir, "non_existent.csv"));
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.code).toBe(ERROR_CODES.FILE_READ_ERROR);
        }
      });
    });
  });
});

