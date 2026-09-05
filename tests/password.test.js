import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/modules/identity/password.js';

test('password hashes verify only their original password', async () => {
  const hash = await hashPassword('CorrectHorseBatteryStaple1!');
  assert.match(hash, /^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
  assert.equal(await verifyPassword('CorrectHorseBatteryStaple1!', hash), true);
  assert.equal(await verifyPassword('WrongPassword1!', hash), false);
});
