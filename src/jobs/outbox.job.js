// Outbox relay job — dispatches unpublished domain events to the message broker.
// Run on a short interval (e.g. every 5 seconds) in production.

import { processOutbox } from '../infrastructure/events/outbox.worker.js';

export async function runOutboxRelay() {
  try {
    const dispatched = await processOutbox();
    if (dispatched > 0) {
      console.log(`[outbox-job] dispatched ${dispatched} event(s)`);
    }
    return dispatched;
  } catch (err) {
    console.error('[outbox-job] error:', err.message);
    return 0;
  }
}
