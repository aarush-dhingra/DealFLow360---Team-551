/**
 * Transaction-scoped outbox collector.
 *
 * outbox_events holds notifications/events written atomically with their
 * business change. A worker publishes them AFTER commit, so consumers only ever
 * observe committed state. Rows are queued here and flushed inside the same
 * transaction as the triggering write.
 */

const INSERT_OUTBOX = `
  INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload, status, available_at
  ) VALUES ($1, $2, $3, $4, 'pending', now())
`;

export class OutboxCollector {
  constructor(client) {
    this.client = client;
    this.rows = [];
  }

  record(entry) {
    this.rows.push({
      aggregateType: entry.aggregateType,
      aggregateId: entry.aggregateId,
      eventType: entry.eventType,
      payload: JSON.stringify(entry.payload ?? {})
    });
  }

  async flush() {
    for (const row of this.rows) {
      await this.client.query(INSERT_OUTBOX, [
        row.aggregateType,
        row.aggregateId,
        row.eventType,
        row.payload
      ]);
    }
    this.rows = [];
  }
}
