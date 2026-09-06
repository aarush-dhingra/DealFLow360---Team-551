import { EventEmitter } from 'node:events';

const changes = new EventEmitter();
changes.setMaxListeners(0);

export function publishChange(event) {
  changes.emit('change', event);
}

export function subscribeToChanges(listener) {
  changes.on('change', listener);
  return () => changes.off('change', listener);
}
