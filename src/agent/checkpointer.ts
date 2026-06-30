import { MemorySaver, type BaseCheckpointSaver } from '@langchain/langgraph';

let _checkpointer: BaseCheckpointSaver | null = null;

/**
 * One checkpointer instance per process — createGraph() is compiled fresh per
 * request, but the checkpoint store must outlive a single request for
 * multi-turn memory (same thread_id) to work.
 */
export function getCheckpointer(): BaseCheckpointSaver {
  if (!_checkpointer) {
    _checkpointer = new MemorySaver();
  }
  return _checkpointer;
}
