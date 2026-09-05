import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../infrastructure/config/env.js';
import { pool } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/http.js';
import { hashPassword, verifyPassword } from './password.js';

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export async function login(request, response, next) {
  try {
    const { email, password } = request.validated.body;
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.password_hash, u.must_change_password, array_agg(ur.role) AS roles
       FROM users u JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.email = $1 AND u.is_active = TRUE GROUP BY u.id`,
      [email]
    );
    const user = rows[0];
    if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash(token), expiresAt]
    );
    response.status(200).json({
      data: {
        accessToken: token,
        expiresAt,
        user: { id: user.id, email: user.email, displayName: user.display_name, roles: Array.isArray(user.roles) ? user.roles.filter(Boolean) : (typeof user.roles === 'string' ? user.roles.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean) : []), mustChangePassword: user.must_change_password }
      }
    });
  } catch (error) { next(error); }
}

export async function changePassword(request, response, next) {
  try {
    const passwordHash = await hashPassword(request.validated.body.newPassword);
    await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = now()
       WHERE id = $2`,
      [passwordHash, request.principal.id]
    );
    await pool.query(
      'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL',
      [request.principal.id, request.principal.session_id]
    );
    response.json({ data: { message: 'Password updated.', user: { ...request.principal, mustChangePassword: false } } });
  } catch (error) { next(error); }
}

export async function customerSignup(request, response, next) {
  try {
    const { email, password, displayName } = request.validated.body;
    const { rows: contacts } = await pool.query(
      'SELECT id FROM customer_contacts WHERE email = $1 LIMIT 1', [email]
    );
    if (!contacts[0]) {
      throw new AppError(403, 'CUSTOMER_NOT_INVITED', 'Ask your DealFlow360 administrator to add this email as a customer contact first.');
    }
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, must_change_password)
       VALUES ($1, $2, $3, FALSE)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, display_name`,
      [email, passwordHash, displayName]
    );
    const user = rows[0];
    if (!user) throw new AppError(409, 'ACCOUNT_EXISTS', 'An account already exists for this email. Please sign in.');
    await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [user.id, 'customer_portal']);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
    await pool.query('INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [user.id, tokenHash(token), expiresAt]);
    response.status(201).json({ data: { accessToken: token, expiresAt, user: { id: user.id, email: user.email, displayName: user.display_name, roles: ['customer_portal'], mustChangePassword: false } } });
  } catch (error) { next(error); }
}

export function currentUser(request, response) {
  response.json({ data: request.principal });
}

export async function logout(request, response, next) {
  try {
    await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [request.principal.session_id]);
    response.status(204).send();
  } catch (error) { next(error); }
}
