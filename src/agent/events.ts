import { EventEmitter } from 'node:events';

import type { RenderEvent } from './state.js';

/** Emits ephemeral UI render events for a single chat request. */
export class RenderEventEmitter extends EventEmitter {
  private _deferred: RenderEvent[] = [];

  emitRender(event: RenderEvent, options?: { defer?: boolean }): void {
    if (options?.defer) {
      this._deferred.push(event);
    } else {
      this.emit('render', event);
    }
  }

  flushDeferred(): void {
    const pending = this._deferred.splice(0);
    for (const event of pending) {
      this.emit('render', event);
    }
  }

  onRender(listener: (event: RenderEvent) => void): this {
    return this.on('render', listener);
  }
}
