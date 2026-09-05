# Transactional outbox

Every transaction that changes business state also inserts an `outbox_events` row. A worker later publishes it to websocket/SSE, queue, or notification adapters. Consumers must deduplicate by event ID.
