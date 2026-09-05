import { createHash } from 'node:crypto';
import { pool } from '../../infrastructure/database/pool.js';

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT s.id AS session_id,u.id,u.email,u.display_name,u.must_change_password,array_agg(ur.role) AS roles
       FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN user_roles ur ON ur.user_id=u.id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.is_active
       GROUP BY s.id,u.id`, [tokenHash(header.slice(7))]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Invalid or expired session' });
    req.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (req.user.must_change_password) return res.status(403).json({ error: 'You must change your temporary password before continuing.' });
    const hasRole = roles.some(r => req.user.roles.includes(r));
    if (!hasRole) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}
