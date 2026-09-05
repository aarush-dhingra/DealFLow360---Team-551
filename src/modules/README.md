# Domain modules

Create one module per bounded context. Each module should expose router/controller, input schemas, service/policy logic, repository, and tests as needed.

- `identity`: users, authentication, roles, portal access.
- `customers`: customers, customer contacts, tier assignment.
- `catalog`: categories, products, variants, price lists.
- `configuration`: tier/category discount configuration and approval/health policies.
- `quotations`: quotes, versions, lines, pricing, revision/state transitions.
- `risk`: effective discount and blended-risk calculations.
- `approvals`: approval workflows, decisions, escalation.
- `negotiations`: portal/internal messages and customer confirmation.
- `deal-health`: score calculation, alerts, escalation.
- `fulfillment`: warehouses, stock, allocation, shipments, backorders.
- `subscriptions`: plans, subscriptions, proration, schedules.
- `billing`: invoices, payments, credit notes/refunds.
- `reporting`: read models, dashboards, exports.
