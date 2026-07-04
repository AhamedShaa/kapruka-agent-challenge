import fs from 'node:fs';
import path from 'node:path';

/**
 * Directory the two SQLite files (cart storage, customer memory) live in.
 * Defaults to process.cwd() so local dev is byte-identical to the previous
 * hardcoded './kapruka-*.db' paths. On Render, set DB_DIR to the persistent
 * disk's mount path (e.g. /var/data) so the files survive redeploys instead
 * of living in the ephemeral container filesystem.
 *
 * Resolution and directory creation are deferred to first actual use (not
 * run at module import time): Next's build-time page-data-collection step
 * evaluates route modules in a bundled context where process.cwd() can
 * resolve to an empty string, and an eager top-level mkdirSync('') crashes
 * the build even though no request is ever actually served.
 */
function ensureDir(dir: string): void {
  if (!dir) return;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let cartDbPath: string | null = null;
let memoryDbPath: string | null = null;
let checkpointDbPath: string | null = null;

export function getCartDbPath(): string {
  if (cartDbPath === null) {
    const dbDir = process.env.DB_DIR ?? process.cwd();
    ensureDir(dbDir);
    cartDbPath = path.join(dbDir, 'kapruka-cart.db');
  }
  return cartDbPath;
}

export function getMemoryDbPath(): string {
  if (memoryDbPath === null) {
    const dbDir = process.env.DB_DIR ?? process.cwd();
    ensureDir(dbDir);
    memoryDbPath = path.join(dbDir, 'kapruka-memory.db');
  }
  return memoryDbPath;
}

export function getCheckpointDbPath(): string {
  if (checkpointDbPath === null) {
    const dbDir = process.env.DB_DIR ?? process.cwd();
    ensureDir(dbDir);
    checkpointDbPath = path.join(dbDir, 'kapruka-checkpoints.db');
  }
  return checkpointDbPath;
}
