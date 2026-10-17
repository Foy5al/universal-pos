import { describe, expect, it } from 'vitest';

import {
  addMinor,
  applyBasisPoints,
  formatMinor,
  fromMinor,
  minor,
  multiplyMinor,
  sumMinor,
  subtractMinor,
  toMinor,
} from './money';
import { addQuantity, parseQuantity, formatQuantity } from './quantity';

describe('money', () => {
  it('rejects non-integer minor units', () => {
    expect(() => minor(1.5)).toThrow(RangeError);
  });

  it('converts major to minor units', () => {
    expect(toMinor(12.34, 2)).toBe(1234);
  });

  it('does exact integer arithmetic without float drift', () => {
    expect(addMinor(minor(10), minor(20))).toBe(30);
    expect(subtractMinor(minor(100), minor(45))).toBe(55);
    expect(sumMinor([minor(1), minor(2), minor(3)])).toBe(6);
    expect(multiplyMinor(minor(250), 4)).toBe(1000);
    expect(fromMinor(minor(1234), 2)).toBe(12.34);
  });

  it('applies basis-point rates with half-up rounding', () => {
    expect(applyBasisPoints(minor(1000), 500)).toBe(50);
    expect(applyBasisPoints(minor(333), 1000)).toBe(33);
    expect(applyBasisPoints(minor(335), 1000)).toBe(34);
  });

  it('formats value for display', () => {
    expect(formatMinor(minor(123456), 'en-BD', 'BDT', 2)).toContain('1,234.56');
  });
});

describe('quantity', () => {
  it('parses decimals into scaled integers', () => {
    expect(parseQuantity('1.25')).toBe(12500);
    expect(parseQuantity(2)).toBe(20000);
    expect(parseQuantity('0.0001')).toBe(1);
  });

  it('adds and formats quantities', () => {
    expect(addQuantity(parseQuantity('1.5'), parseQuantity('0.25'))).toBe(17500);
    expect(formatQuantity(parseQuantity('1.2500'))).toBe('1.25');
  });

  it('rejects malformed input', () => {
    expect(() => parseQuantity('abc')).toThrow(RangeError);
  });
});
