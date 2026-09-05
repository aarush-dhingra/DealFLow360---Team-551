import test from 'node:test';
import assert from 'node:assert/strict';

import { add, subtract, multiply, divide, compare, gt, gte, lt, eq } from '../src/shared/money.js';

test('money: exact decimal addition', () => {
  assert.equal(add('0.1', '0.2'), '0.3000');
  assert.equal(add('19.99', '0.01'), '20.0000');
});

test('money: exact decimal subtraction', () => {
  assert.equal(subtract('1.0000', '0.3300'), '0.6700');
});

test('money: exact decimal multiplication', () => {
  assert.equal(multiply('10', '3.33'), '33.3000');
});

test('money: division rounds to 4 places', () => {
  assert.equal(divide('1', '3'), '0.3333');
});

test('money: division by zero throws', () => {
  assert.throws(() => divide('1', '0'), /Division by zero/);
});

test('money: comparisons', () => {
  assert.equal(compare('1.0000', '1.0000'), 0);
  assert.equal(gt('1.0001', '1.0000'), true);
  assert.equal(gte('1.0000', '1.0000'), true);
  assert.equal(lt('0.9999', '1.0000'), true);
  assert.equal(eq('2.5', '2.5000'), true);
});

test('money: rejects non-numeric input', () => {
  assert.throws(() => add('abc', '1'), /Invalid numeric value/);
});
