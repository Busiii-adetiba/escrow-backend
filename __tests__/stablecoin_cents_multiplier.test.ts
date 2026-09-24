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
});
