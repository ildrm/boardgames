import { readdir, readFile } from 'node:fs/promises';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for migrations');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(await readFile(new URL(name, directory), 'utf8'));
  }
  console.log('Tablemate database migration applied');
} finally {
  await pool.end();
}
