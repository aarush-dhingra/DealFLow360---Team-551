import { createHash } from 'node:crypto';
import { pool } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/http.js';

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export async function requireAuthentication(request, _response, next) {
  try {
    const match = /^Bearer (.+)$/.exec(request.get('authorization') ?? '');
    if (!match) throw new AppError(401, 'UNAUTHENTICATED', 'A bearer token is required.');
    const { rows } = await pool.query(
      `SELECT s.id AS session_id, u.id, u.email, u.display_name, u.is_active, array_agg(ur.role) AS roles
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       JOIN user_roles ur ON ur.user_id = u.id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active = TRUE
       GROUP BY s.id, u.id`,
      [tokenHash(match[1])]
    );
    if (!rows[0]) throw new AppError(401, 'UNAUTHENTICATED', 'Session is invalid or expired.');
    const rawRoles = rows[0].roles;
    const roles = Array.isArray(rawRoles)
      ? rawRoles.filter(Boolean)
      : typeof rawRoles === 'string'
        ? rawRoles.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean)
        : [];
    request.principal = { ...rows[0], roles };
    next();
  } catch (error) { next(error); }
}

export function requireRole(...roles) {
  return (request, _response, next) => {
    if (!request.principal) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    if (!roles.some((role) => request.principal.roles.includes(role))) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission for this action.'));
    }
    return next();
  };
}
