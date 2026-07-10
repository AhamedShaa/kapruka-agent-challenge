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

/**
 * Treat kapruka-checkpoints.db (and its -shm/-wal companions) as ephemeral
 * and rebuildable, not data worth protecting — it only holds LangGraph
 * conversation-replay state, not orders or cart contents. Confirmed via a
 * live audit (docs/LIVE_SYSTEM_AUDIT.md, Section 4d) that a corrupted copy
 * of this file broke every chat turn with a "database disk image is
 * malformed" SSE error, and that deleting all three files and letting them
 * regenerate fixed it immediately with no code change. If persistent-disk
 * backups are configured for DB_DIR on Render, exclude this file (or accept
 * that a stale/corrupted backup of it may need to be deleted on restore) —
 * unlike the cart/memory DBs in this same directory, losing it costs
 * nothing but conversation history.
 */
export function getCheckpointDbPath(): string {
  if (checkpointDbPath === null) {
    const dbDir = process.env.DB_DIR ?? process.cwd();
    ensureDir(dbDir);
    checkpointDbPath = path.join(dbDir, 'kapruka-checkpoints.db');
  }
  return checkpointDbPath;
}
