import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { getCheckpointDbPath } from '@/lib/db-paths.js';

let _checkpointer: BaseCheckpointSaver | null = null;

/**
 * One checkpointer instance per process — createGraph() is compiled fresh per
 * request, but the checkpoint store must outlive a single request for
 * multi-turn memory (same thread_id) to work across page refreshes and
 * server restarts.
 */
export function getCheckpointer(): BaseCheckpointSaver {
  if (!_checkpointer) {
    _checkpointer = SqliteSaver.fromConnString(getCheckpointDbPath());
  }
  return _checkpointer;
}
