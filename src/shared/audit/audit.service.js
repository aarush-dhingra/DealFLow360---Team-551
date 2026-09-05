// Centralised audit helpers — thin wrappers so callers don't repeat SQL.

export async function writeAuditEvent(client, payload) {
  await client.query(
    `INSERT INTO audit_events
       (aggregate_type, aggregate_id, quotation_id, quotation_version_id,
        event_type, actor_user_id, before_state, after_state, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      payload.aggregateType,
      payload.aggregateId,
      payload.quotationId ?? null,
      payload.quotationVersionId ?? null,
      payload.eventType,
      payload.actorUserId ?? null,
      payload.beforeState ? JSON.stringify(payload.beforeState) : null,
      payload.afterState ? JSON.stringify(payload.afterState) : null,
      JSON.stringify(payload.metadata ?? {}),
    ]
  );
}

export async function writeOutboxEvent(client, aggregateType, aggregateId, eventType, payload) {
  await client.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1, $2, $3, $4)`,
    [aggregateType, aggregateId, eventType, JSON.stringify(payload)]
  );
}
