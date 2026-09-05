/**
 * Transaction-scoped audit collector.
 *
 * audit_events is the append-only application history. Helpers queue rows and
 * flush them inside the SAME transaction as the business write, so history and
 * state commit together or not at all.
 */

const INSERT_AUDIT = `
  INSERT INTO audit_events (
    aggregate_type, aggregate_id, quotation_id, quotation_version_id,
    event_type, actor_user_id, actor_customer_contact_id, request_id,
    before_state, after_state, metadata
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
`;

export class AuditCollector {
  constructor(client) {
    this.client = client;
    this.rows = [];
  }

  record(entry) {
    this.rows.push({
      aggregateType: entry.aggregateType,
      aggregateId: entry.aggregateId,
      quotationId: entry.quotationId ?? null,
      quotationVersionId: entry.quotationVersionId ?? null,
      eventType: entry.eventType,
      actorUserId: entry.actorUserId ?? null,
      actorCustomerContactId: entry.actorCustomerContactId ?? null,
      requestId: entry.requestId ?? null,
      beforeState: entry.beforeState ? JSON.stringify(entry.beforeState) : null,
      afterState: entry.afterState ? JSON.stringify(entry.afterState) : null,
      metadata: JSON.stringify(entry.metadata ?? {})
    });
  }

  async flush() {
    for (const row of this.rows) {
      await this.client.query(INSERT_AUDIT, [
        row.aggregateType,
        row.aggregateId,
        row.quotationId,
        row.quotationVersionId,
        row.eventType,
        row.actorUserId,
        row.actorCustomerContactId,
        row.requestId,
        row.beforeState,
        row.afterState,
        row.metadata
      ]);
    }
    this.rows = [];
  }
}
