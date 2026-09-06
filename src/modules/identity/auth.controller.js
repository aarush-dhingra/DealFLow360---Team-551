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
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password. Please try again.');
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
    const passwordHash = await hashPassword(password);

    const client = await pool.connect();
    let user;
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, display_name, must_change_password)
         VALUES ($1, $2, $3, FALSE)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, display_name`,
        [email, passwordHash, displayName]
      );
      user = rows[0];
      if (!user) throw new AppError(409, 'ACCOUNT_EXISTS', 'An account already exists for this email. Please sign in.');

      await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [user.id, 'customer_portal']);

      // Customers start with no tier. Qualification runs from completed-order
      // milestones, unless an administrator explicitly assigns a tier.
      const { rows: custRows } = await client.query(
        `INSERT INTO customers (legal_name, tier_id, tier_assignment_source) VALUES ($1, NULL, 'automatic') RETURNING id`,
        [displayName]
      );
      await client.query(
        `INSERT INTO customer_contacts (customer_id, email, display_name) VALUES ($1, $2, $3)`,
        [custRows[0].id, email, displayName]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
    await pool.query('INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [user.id, tokenHash(token), expiresAt]);
    response.status(201).json({ data: { accessToken: token, expiresAt, user: { id: user.id, email: user.email, displayName: user.display_name, roles: ['customer_portal'], mustChangePassword: false } } });
  } catch (error) { next(error); }
}

export async function forgotPassword(request, response, next) {
  try {
    const { email } = request.validated.body;
    const { rows } = await pool.query(
      `SELECT id FROM users WHERE email = $1 AND is_active = TRUE LIMIT 1`,
      [email]
    );
    if (!rows[0]) {
      // Don't reveal whether the email exists
      return response.json({ data: { message: 'If that email is registered, a reset token has been generated.' } });
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const hash = createHash('sha256').update(otp).digest('hex');
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + INTERVAL '10 minutes')
       ON CONFLICT DO NOTHING`,
      [rows[0].id, hash]
    );
    console.log(`\n🔑  Password reset OTP for ${email}: ${otp}  (valid 10 min)\n`);
    response.json({ data: { message: 'OTP sent.' } });
  } catch (error) { next(error); }
}

export async function resetPassword(request, response, next) {
  try {
    const { token: otp, newPassword } = request.validated.body;
    const hash = createHash('sha256').update(otp).digest('hex');
    const { rows } = await pool.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       LIMIT 1`,
      [hash]
    );
    if (!rows[0]) throw new AppError(400, 'INVALID_TOKEN', 'Reset token is invalid or has expired.');
    const { hashPassword } = await import('./password.js');
    const passwordHash = await hashPassword(newPassword);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [rows[0].id]);
      await client.query(
        `UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2`,
        [passwordHash, rows[0].user_id]
      );
      await client.query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [rows[0].user_id]);
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
    response.json({ data: { message: 'Password reset successfully. You can now log in.' } });
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
