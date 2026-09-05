// Outbox relay worker — polls unpublished events and dispatches them.
// In production this would publish to Kafka / SQS / webhooks.
// For the hackathon demo, it logs to stdout.

import { fetchUnpublished, markPublished, markFailed } from './outbox.repository.js';

export async function processOutbox() {
  const events = await fetchUnpublished(50);
  if (!events.length) return 0;

  const published = [];
  for (const ev of events) {
    try {
      console.log(`[outbox] dispatching ${ev.event_type} for ${ev.aggregate_type}:${ev.aggregate_id}`);
      // TODO: replace with real message broker call
      published.push(ev.id);
    } catch (err) {
      await markFailed(ev.id, err.message);
    }
  }

  await markPublished(published);
  return published.length;
}
