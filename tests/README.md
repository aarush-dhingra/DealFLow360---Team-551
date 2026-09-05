# Tests

Required test layers:

- Unit: effective allowed discount, line overage/excess, blended risk, deal-health score, state transitions.
- Integration: revision invalidates approval, stale quote update returns 409, role/portal authorization, outbox transaction atomicity.
- API: quotation lifecycle, customer counter-offer, Manager/Finance routing, fulfillment split, billing lifecycle.
