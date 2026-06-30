import { EventEmitter } from 'node:events';

import type { RenderEvent } from './state.js';

/** Emits ephemeral UI render events for a single chat request. */
export class RenderEventEmitter extends EventEmitter {
  emitRender(event: RenderEvent): void {
    this.emit('render', event);
  }

  onRender(listener: (event: RenderEvent) => void): this {
    return this.on('render', listener);
  }
}
