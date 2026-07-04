import fs from 'node:fs';
import path from 'node:path';

/**
 * Directory the two SQLite files (cart storage, customer memory) live in.
 * Defaults to process.cwd() so local dev is byte-identical to the previous
 * hardcoded './kapruka-*.db' paths. On Render, set DB_DIR to the persistent
 * disk's mount path (e.g. /var/data) so the files survive redeploys instead
 * of living in the ephemeral container filesystem.
 */
const DB_DIR = process.env.DB_DIR ?? process.cwd();

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export const CART_DB_PATH = path.join(DB_DIR, 'kapruka-cart.db');
export const MEMORY_DB_PATH = path.join(DB_DIR, 'kapruka-memory.db');
