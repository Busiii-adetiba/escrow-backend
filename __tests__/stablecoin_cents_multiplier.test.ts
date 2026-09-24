import { stablecoin_cents_multiplier } from '../src/stablecoin_cents_multiplier';

describe('stablecoin_cents_multiplier', () => {
  describe('typical values', () => {
    it('converts 1 USD to 100 cents', () => {
      expect(stablecoin_cents_multiplier(1)).toBe(100);
    });

    it('converts 10 USD to 1000 cents', () => {
      expect(stablecoin_cents_multiplier(10)).toBe(1000);
    });

    it('converts 100 USD to 10000 cents', () => {
      expect(stablecoin_cents_multiplier(100)).toBe(10000);
    });

    it('converts 1234 USD to 123400 cents', () => {
      expect(stablecoin_cents_multiplier(1234)).toBe(123400);
    });
  });

  describe('fractional dollar amounts', () => {
    it('converts 0.01 USD to 1 cent', () => {
      expect(stablecoin_cents_multiplier(0.01)).toBe(1);
    });

    it('converts 0.5 USD to 50 cents', () => {
      expect(stablecoin_cents_multiplier(0.5)).toBe(50);
    });

    it('converts 1.23 USD to 123 cents', () => {
      expect(stablecoin_cents_multiplier(1.23)).toBe(123);
    });

    it('converts 99.99 USD to 9999 cents', () => {
      expect(stablecoin_cents_multiplier(99.99)).toBe(9999);
    });

    it('converts 0.1 + 0.2 USD to 30 cents (floating point safety)', () => {
      expect(stablecoin_cents_multiplier(0.1 + 0.2)).toBe(30);
    });
  });

  describe('boundary and edge values', () => {
    it('converts 0 USD to 0 cents', () => {
      expect(stablecoin_cents_multiplier(0)).toBe(0);
    });

    it('converts the smallest positive cent (0.01) to 1', () => {
      expect(stablecoin_cents_multiplier(0.01)).toBe(1);
    });

    it('handles large values without precision loss', () => {
      expect(stablecoin_cents_multiplier(1000000)).toBe(100000000);
    });

    it('handles a large fractional value', () => {
      expect(stablecoin_cents_multiplier(123456.78)).toBe(12345678);
    });
  });

  describe('precision-sensitive inputs', () => {
    it('rounds 1.005 USD to 101 cents (half-up)', () => {
      expect(stablecoin_cents_multiplier(1.005)).toBe(101);
    });

    it('rounds 1.004 USD to 100 cents', () => {
      expect(stablecoin_cents_multiplier(1.004)).toBe(100);
    });

    it('rounds 2.345 USD to 235 cents (half-up)', () => {
      expect(stablecoin_cents_multiplier(2.345)).toBe(235);
    });

    it('rounds 0.005 USD to 1 cent (half-up)', () => {
      expect(stablecoin_cents_multiplier(0.005)).toBe(1);
    });

    it('rounds 0.004 USD to 0 cents', () => {
      expect(stablecoin_cents_multiplier(0.004)).toBe(0);
    });
  });

  describe('mismatched parameter error structures', () => {
    it('reports a warning code for non-numeric string parameters', () => {
      const result = stablecoin_cents_multiplier('10' as unknown as number);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_INVALID_PARAMETER_TYPE',
        parameter: 'amount',
        expected: 'number',
        received: 'string',
      });
    });

    it('reports a warning code for null parameters', () => {
      const result = stablecoin_cents_multiplier(null as unknown as number);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_INVALID_PARAMETER_TYPE',
        parameter: 'amount',
        expected: 'number',
        received: 'object',
      });
    });

    it('reports a warning code for undefined parameters', () => {
      const result = stablecoin_cents_multiplier(undefined as unknown as number);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_INVALID_PARAMETER_TYPE',
        parameter: 'amount',
        expected: 'number',
        received: 'undefined',
      });
    });

    it('reports a warning code for NaN parameters', () => {
      const result = stablecoin_cents_multiplier(NaN);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_NON_FINITE_PARAMETER',
        parameter: 'amount',
        expected: 'finite number',
        received: 'NaN',
      });
    });

    it('reports a warning code for Infinity parameters', () => {
      const result = stablecoin_cents_multiplier(Infinity);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_NON_FINITE_PARAMETER',
        parameter: 'amount',
        expected: 'finite number',
        received: 'Infinity',
      });
    });

    it('reports a warning code for negative parameters', () => {
      const result = stablecoin_cents_multiplier(-5);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_NEGATIVE_PARAMETER',
        parameter: 'amount',
        expected: 'non-negative number',
        received: -5,
      });
    });

    it('reports a warning code for object parameters', () => {
      const result = stablecoin_cents_multiplier({} as unknown as number);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_INVALID_PARAMETER_TYPE',
        parameter: 'amount',
        expected: 'number',
        received: 'object',
      });
    });

    it('reports a warning code for array parameters', () => {
      const result = stablecoin_cents_multiplier([10] as unknown as number);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_INVALID_PARAMETER_TYPE',
        parameter: 'amount',
        expected: 'number',
        received: 'object',
      });
    });

    it('reports a warning code for boolean parameters', () => {
      const result = stablecoin_cents_multiplier(true as unknown as number);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_INVALID_PARAMETER_TYPE',
        parameter: 'amount',
        expected: 'number',
        received: 'boolean',
      });
    });

    it('reports a warning code for bigint parameters', () => {
      const result = stablecoin_cents_multiplier(10n as unknown as number);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_INVALID_PARAMETER_TYPE',
        parameter: 'amount',
        expected: 'number',
        received: 'bigint',
      });
    });

    it('reports a warning code for symbol parameters', () => {
      const result = stablecoin_cents_multiplier(Symbol('10') as unknown as number);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_INVALID_PARAMETER_TYPE',
        parameter: 'amount',
        expected: 'number',
        received: 'symbol',
      });
    });

    it('reports a warning code for function parameters', () => {
      const result = stablecoin_cents_multiplier((() => 10) as unknown as number);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_INVALID_PARAMETER_TYPE',
        parameter: 'amount',
        expected: 'number',
        received: 'function',
      });
    });

    it('reports a warning code for missing parameters', () => {
      const result = stablecoin_cents_multiplier();
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_MISSING_PARAMETER',
        parameter: 'amount',
        expected: 'number',
        received: 'undefined',
      });
    });

    it('reports a warning code for extra parameters', () => {
      const result = stablecoin_cents_multiplier(10, 20 as unknown as never);
      expect(result).toEqual({
        ok: false,
        code: 'STABLECOIN_CENTS_MULTIPLIER_UNEXPECTED_PARAMETER',
        parameter: 'amount',
        expected: '1 argument',
        received: '2 arguments',
      });
    });

    it('keeps warning codes stable across mismatched structures', () => {
      const codes = [
        stablecoin_cents_multiplier('10' as unknown as number),
        stablecoin_cents_multiplier(NaN),
        stablecoin_cents_multiplier(-1),
        stablecoin_cents_multiplier(),
      ].map((result) => (result as { code: string }).code);

      expect(codes).toEqual([
        'STABLECOIN_CENTS_MULTIPLIER_INVALID_PARAMETER_TYPE',
        'STABLECOIN_CENTS_MULTIPLIER_NON_FINITE_PARAMETER',
        'STABLECOIN_CENTS_MULTIPLIER_NEGATIVE_PARAMETER',
        'STABLECOIN_CENTS_MULTIPLIER_MISSING_PARAMETER',
      ]);
    });
  });
});
