import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../infrastructure/config/env.js';
import { pool } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/http.js';

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export async function login(request, response, next) {
  try {
    const { email } = request.validated.body;
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, array_agg(ur.role) AS roles
       FROM users u JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.email = $1 AND u.is_active = TRUE GROUP BY u.id`,
      [email]
    );
    const user = rows[0];
    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'No active user exists for this email.');
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
        user: { id: user.id, email: user.email, displayName: user.display_name, roles: user.roles }
      }
    });
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
