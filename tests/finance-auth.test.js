import test from 'node:test';
import assert from 'node:assert/strict';

import { requirePrincipal, requireAnyRole, errorHandler } from '../src/interfaces/http/finance/middleware.js';

function run(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (err) => resolve(err));
  });
}

function resStub() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test('auth: requires an authenticated principal', async () => {
  const err = await run(requirePrincipal, {});
  assert.equal(err?.code, 'UNAUTHORIZED');
  assert.equal(err?.status, 401);
});

test('auth: finance role is required for finance mutations', async () => {
  const salesRep = { principal: { userId: 'u1', roles: ['sales_rep'] } };
  const err = await run(requireAnyRole('finance_operations'), salesRep);
  assert.equal(err?.code, 'FORBIDDEN');
  assert.equal(err?.status, 403);
});

test('auth: finance_operations principal is allowed', async () => {
  const finance = { principal: { userId: 'u2', roles: ['finance_operations'] } };
  const err = await run(requireAnyRole('finance_operations'), finance);
  assert.equal(err, undefined);
});

test('auth: manager may view but finance guard still blocks manager', async () => {
  const manager = { principal: { userId: 'u3', roles: ['sales_manager'] } };
  const err = await run(requireAnyRole('finance_operations'), manager);
  assert.equal(err?.status, 403);
  // Manager is allowed through the view guard.
  const viewErr = await run(requireAnyRole('finance_operations', 'sales_manager'), manager);
  assert.equal(viewErr, undefined);
});

test('auth: error handler produces stable envelope', () => {
  const res = resStub();
  const boom = new Error('boom');
  boom.status = 409;
  boom.code = 'STALE_VERSION';
  errorHandler(boom, {}, res, () => {});
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: { code: 'STALE_VERSION', message: 'boom' } });
});
