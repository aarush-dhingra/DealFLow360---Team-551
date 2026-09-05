import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './pool.js';

const migrationsDirectory = path.resolve('database/migrations');
const files = (await readdir(migrationsDirectory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
const client = await pool.connect();
try {
  await client.query('SELECT pg_advisory_lock(91420361)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const { rows: applied } = await client.query('SELECT filename, checksum FROM schema_migrations');
  const appliedByFilename = new Map(applied.map((row) => [row.filename, row.checksum]));
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (appliedByFilename.has(file)) {
      if (appliedByFilename.get(file) !== checksum) throw new Error(`Checksum changed for applied migration: ${file}`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [file, checksum]);
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(91420361)').catch(() => {});
  client.release();
  await pool.end();
}
