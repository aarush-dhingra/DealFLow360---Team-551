# DealFlow360: Master Product and Engineering Context

## 1. Purpose and scope

DealFlow360 is an intelligent B2B sales-operations platform for an Odoo hackathon. It is a backend-first, PostgreSQL-backed web application that governs a deal from quotation to payment while preserving a complete history of commercial decisions.

The required stack is **Node.js, Express.js, and local PostgreSQL**. The backend is the current implementation priority, but its API and data model must support every actor and screen in the supplied product flow.

The application is not merely a quote-to-invoice form. It must enforce discount governance, run risk and deal-health analysis, escalate the whole order when required, support customer negotiation, coordinate fulfillment, support mixed one-time and subscription orders, and expose reporting.

## 2. Source requirements

The supplied PDF defines the base hackathon scope. The supplied end-to-end flow image expands it into these views:

1. Login / sign-up.
2. Sales dashboard / home.
3. Quotation list or pipeline board.
4. Quotation detail / builder, including line items, discounts, open/close deal suggestions, drafts, and approval submission.
5. Approval list.
6. Approval detail, with flag reasons, approval timeline, and approve / return-for-revision / reject actions.
7. Fulfillment stock list.
8. Fulfillment detail, including suggested split and manual override.
9. Subscription list.
10. Subscription billing detail / billing schedule.
11. Customer portal negotiation screen.
12. Invoice list.
13. Invoice detail and payment progress.
14. Deal-health and anomaly dashboard.
15. Admin/reporting dashboard.
16. Product catalogue.
17. Product and price-list configuration.
18. Discount tiers and approval-chain configuration.

## 3. Actors and permissions

### Sales Representative

- Creates and owns quotations for assigned customers.
- Adds products, quantities, and discounts; sees live price, margin, risk, and health indicators.
- Sends a quote to the customer and responds to customer negotiation.
- Sees approval/fulfillment progress for own deals.
- Cannot close/confirm a quotation that currently requires an unresolved Manager or Finance approval.
- Cannot alter an approved historical version; a commercial change creates a new revision/version.

### Sales Manager / Approver

- Reviews quotation approvals within the configured Manager risk band.
- Approves, rejects, returns for revision, or escalates when policy permits.
- Monitors and acts on deal-health escalations.
- Configures discount tiers and approval-chain/risk thresholds if granted admin configuration permission.

### Finance / Operations User

- Is the final authority for high-risk quotes.
- May negotiate directly with the customer when a deal reaches Finance.
- May approve, reject, or close/finalize a deal within Finance authority.
- Manages warehouse fulfillment decisions, billing reconciliation, credit notes, refunds, and recurring-billing operations.

### Customer / Portal User

- Has a separate, restricted customer portal, never an internal-dashboard role.
- Can view only quotations explicitly belonging to that customer/portal identity.
- Can ask line-level questions, leave change requests/comments, counter a discount, and confirm final terms.
- A customer request never edits an approved historical quote in place; it generates a negotiation action and, once accepted/revised, a quote version.

### Administrator

- Manages products, categories, price lists, customer tiers, discount configuration, approval chains, warehouses/inventory, subscription plans, and platform-wide reports.
- Owns centrally administered configuration values.

### System

- Reprices, recomputes effective discounts, risk, and deal health after relevant changes.
- Creates approvals and notifications automatically.
- Writes audit events and outbox events atomically with each business transaction.
- Publishes dashboard-relevant events only after the database transaction commits.

## 4. Commercial entities and definitions

- **Quotation / deal:** A commercial proposal to one customer. It has a stable human-facing number and multiple immutable versions.
- **Quote version:** A snapshot of the quote’s commercial content at a point in time. Previous versions are never overwritten.
- **Line base value:** Unit/list price before discount multiplied by quantity, excluding tax unless a later tax policy says otherwise.
- **Pre-discount order value:** Sum of all current-version line base values. This is the denominator of blended risk.
- **Requested discount:** The percentage currently proposed by the internal user or customer for a line/order. It may be safe or exceed policy.
- **Allowed discount:** The maximum permitted percentage for an individual line under the tier/category rules below.
- **Line-level discount:** A percentage discount applied to a specific line (including quantity of the identical item on that line).
- **Order-level discount:** One percentage discount applying to the entire order.
- **Risk:** Pricing-governance risk caused by requested discounts exceeding permitted values.
- **Deal health:** Operational/negotiation risk caused by repeated turns, elapsed duration, and inactivity.

## 5. Discount configuration and policy (confirmed)

There are exactly three customer tiers:

- Gold: admin-configured entitlement `p%`.
- Silver: admin-configured entitlement `q%`.
- Bronze: admin-configured entitlement `r%`.

There are exactly two discount-governed product categories:

- Hardware: admin-configured category ceiling `x%`.
- Software: admin-configured category ceiling `y%`.

There is no product-specific discount limit and no separate sales-representative authority limit. The sales representative follows the same tier/category ceiling logic.

For every line:

```text
allowed_discount_percent = min(customer_tier_entitlement_percent, category_ceiling_percent)
```

Examples:

- Gold customer purchasing Hardware: `min(p, x)%` is allowed.
- Gold customer purchasing Software: `min(p, y)%` is allowed.
- If `p > y`, a Gold customer’s Software discount is capped at `y%`.
- The same rule applies to Silver (`q`) and Bronze (`r`).

Discount values are centrally admin-managed. Canonical runtime configuration should be stored in PostgreSQL so edits are auditable and immediately effective across all dashboards; a seed/config file may populate initial development/demo values. Whether the team also wants an editable runtime file as the canonical store remains a product decision to confirm.

### Discount modes

The supplied PDF says the builder supports **line-level or order-level discounts**. The current interpretation is that they are mutually exclusive for a quote version: a quote uses either individual line discounts or one order-level percentage discount, never both. This must be validated with the product owner before a UI/API hard constraint is implemented.

For an order-level percentage discount, evaluate that requested percentage against every line’s allowed percentage. This prevents a whole-order discount from bypassing the stricter limit on a Software line. If order-level discounts later support currency amounts rather than percentages, an explicit allocation policy must be added before implementation.

## 6. Blended discount risk (confirmed formula)

If a requested discount is greater than a line’s allowed discount, the line is risky and the entire quotation must be sent to the higher authority selected by the quotation’s blended risk. Safe lines have overage/risk contribution zero.

```text
line_overage_percent = max(0, requested_discount_percent - allowed_discount_percent)

line_excess_value = line_base_value * line_overage_percent / 100

blended_risk_percent =
  (sum(line_excess_value) / total_pre_discount_order_value) * 100
```

Rules and safeguards:

- Calculate from the active quote version only.
- Calculate per line, then calculate one blended score for the complete order.
- Never divide by zero: a quote with a zero/negative pre-discount total cannot be submitted and must return a validation error.
- Store the calculation inputs, outputs, configuration version, and resulting route in an immutable risk-assessment record.
- A 0% blended score needs no discount approval. Any positive score is flagged and is eligible for escalation according to configured bands.
- Risk is calculated on pre-tax commercial values unless a later explicit tax policy changes it.
- Use exact `NUMERIC` database values and decimal arithmetic; never JavaScript floating-point arithmetic for money or percentages.
- A line at its allowed percentage is safe; a line above it is risky.

## 7. Approval and closure workflow

The hierarchy is Sales Representative -> Sales Manager -> Finance.

- If blended risk is 0, the Sales Representative may continue without risk approval.
- If blended risk is greater than 0 but within the Manager’s configured maximum, the quote requires Manager approval.
- If blended risk exceeds the Manager’s configured handling maximum, it must reach Finance automatically. Finance is the final authority.
- Finance can negotiate with the customer, approve, reject, and close a deal. Once Finance approves an agreed deal, the deal is final from the internal-approval perspective; customer confirmation is still required when the customer has not yet accepted the final terms.
- A high-risk quote cannot be closed by a Sales Representative.
- Approver actions are approve, reject, return for revision, and (where policy permits) escalate. Each action requires actor, timestamp, reason/comment, version, and before/after status in the audit trail.

**Open routing decision:** The PDF describes a high-risk band as “Sales Manager followed by Finance,” while the later wording could mean direct Finance once the score exceeds the Manager’s capability. The approval-chain configuration must support both `manager_then_finance` and `finance_direct`; the chosen default must be explicitly confirmed before production logic is finalized.

Manager/Finance thresholds and routing mode are admin-configured, versioned policy data. Historical assessments must retain the policy snapshot used at the time.

## 8. Negotiation, revisions, and audit history

Every deal outcome—successful, rejected, cancelled, expired, lost, or superseded—must be retained. Successful-deal dashboards are a filter over complete history, not a separate reduced history.

The audit timeline must log at least:

- Creation, send, draft/save, status transition, approval submission, approval result, rejection, return, escalation, closure, cancellation, expiry, fulfillment, invoice/payment events.
- Initial quotation and all subsequent quote versions.
- All negotiation turns and comments, actor, actor role, timestamp, customer/internal origin, target line (if any), requested discount, and outcome.
- Who closed the deal.
- Original/final quotation totals, individual line/order discounts at every stage, final discount, risk assessments, health assessments, and approval-policy snapshots.

Revision rules:

- Quantity, price/discount, product-line, negotiated-term, or subscription-term changes create a new immutable version of the same quotation, not a new quotation number.
- Commercial changes invalidate earlier approval of that version and recalculate price/risk/health/route for the new version.
- A customer identity change—or resulting customer-tier change—requires a new quotation. The original is retained and marked superseded/cancelled as appropriate.
- The statement “even if subscription ends before striking a deal” needs a business clarification: quote subscription terms and an already-active subscription lifecycle are different concepts. The backend must not assume which one was intended.

## 9. Deal-health policy (proposed implementation decision)

Deal health is distinct from discount risk. It detects a deal becoming stale or excessively negotiated.

Use this transparent, bounded score (0 to 100):

```text
deal_health_score =
  min(50, negotiation_turns * 10)
  + min(30, full_quote_age_days * 2)
  + min(20, full_inactivity_days * 5)
```

- A customer or internal response resets only the inactivity component; it does not erase quote age or the count of historical negotiation turns.
- Default proposed bands: 0–49 normal; 50–74 warning/nudge; 75–89 Manager escalation; 90–100 Finance escalation when the Manager has not resolved/closed the deal.
- Make formula weights and bands database configuration after the MVP; record score input values with every assessment.
- A health escalation never mutates price, risk, or approval history by itself.

## 10. End-to-end state machine

Suggested top-level quote states:

```text
draft
sent_to_customer
under_negotiation
pending_manager_approval
pending_finance_approval
approved
customer_confirmed
confirmed
in_fulfillment
partially_fulfilled
fulfilled
invoiced
partially_paid
paid
rejected
returned_for_revision
cancelled
expired
superseded
```

Not all states are strictly linear. For example, customer counter-offers and internal returns create a new version and return the deal to `under_negotiation`/an appropriate approval state. Do not permit an invalid transition (for example, `paid` back to `draft`) except through an explicit credit/cancellation workflow with audit events.

## 11. Modules from the PDF that remain in scope

### Authentication and access

- Internal sign-up/login with roles.
- Customer portal access through magic link or email/password.
- Role- and ownership-based authorization on every endpoint.

### Product, price list, and configuration

- Product name, category, price, unit, tax, description, variants/attributes and extra pricing.
- Customer-tier and currency-specific price-list rules.
- Discount-tier/category ceilings and versioned approval chains.

### Sales workspace

- Quote list/pipeline, builder, live price/margin/risk information, save draft, submit for approval, and status tracking.
- Optional upsell/cross-sell suggestions based on product pairings, promotion status, historical co-purchase data, and minimum margin.

### Customer negotiation

- Restricted portal, line comments, counter discount proposal, submit request, confirm quote.
- A confirmed customer change that breaches policy must re-enter approval automatically.

### Fulfillment

- Warehouses, stock levels, replenishment rules, auto split that minimizes shipments/cost using configured shipping weighting, manual override, backorders, and consolidation prompt if stock arrives.

### Subscription and billing

- One-time and recurring lines on one order.
- Monthly/quarterly/yearly plans, proration on mid-cycle changes, cancellation/refund policy, billing schedules, invoices, payments, credit notes.

### Dashboard, reporting, and alerts

- Deal health, stalled quotes, discount anomalies versus a rep’s historical average, delivery-promise slippage, alert-driven quote opening, nudge/escalation.
- Reports filtered by period, sales team/rep, approval status, product/category; PDF/XLS export.

## 12. Consistency, reliability, and security constraints

- Every write is one PostgreSQL transaction. Business state, audit event, and outbox event commit together or all roll back.
- Use optimistic concurrency (`lock_version` or equivalent) for quote/version mutations. Reject stale updates with HTTP 409; never silently overwrite concurrent negotiations.
- Use an outbox worker to publish notifications/dashboard events after commit. Consumers must be idempotent.
- Recalculate risk and health in the same transaction as the revision/submission that triggers them.
- Approval decisions must target a specific quote version and assessment; reject a decision against a stale version.
- Authorization must be enforced server-side, never only by dashboard visibility.
- Customer portal tokens must be scoped, expiring, revocable, hashed at rest, and restricted to a customer/quote.
- Store timestamps in UTC; render localized time in a client later.
- Use UUID primary keys, `NUMERIC(19,4)` for money, `NUMERIC(9,4)` for percentages, ISO currency codes, and explicit check constraints.
- Soft-close/retain business records; do not hard-delete audit-relevant quotes, versions, approvals, negotiations, invoices, or payments.
- Every configuration edit must be audit logged and configuration snapshots must be stored with evaluated commercial decisions.

## 13. Engineering practices

- Keep domain logic in services, not Express route handlers.
- Validate all external input at the API boundary; return a stable error format.
- Parameterize every SQL query; never concatenate user input into SQL.
- Keep migrations forward-only and reversible where practical. Never edit a migration that has been applied outside local development.
- Use REST resource routes, versioned under `/api/v1`.
- Use separate request DTO/schema, service, repository, and domain policy layers.
- Prefer explicit state transitions and database constraints over inferred status from UI data.
- Unit-test risk, discount, health, pricing, and state-transition logic; integration-test transaction/concurrency behavior and permissions.
- Add correlation/request IDs and structured logs; never log passwords, raw portal tokens, or sensitive payment data.
- Use environment variables for secrets and connection strings; commit only `.env.example`.

## 14. Open items requiring explicit confirmation

1. High-risk route: direct Finance versus Manager then Finance (both supported in the data model).
2. Is the canonical admin configuration store PostgreSQL (recommended) or a centrally stored runtime file?
3. Are line- and order-level discount modes truly mutually exclusive? Current interpretation: yes.
4. Does “subscription ends before striking a deal” mean a quote’s proposed subscription term expires, or an existing subscription expires/cancels while a renewal/new deal is negotiated?
5. Exact initial values for p/q/r, x/y, Manager maximum risk, Finance route bands, deal-health thresholds, tax/currency behavior, and fulfillment weighting.

## 15. Non-goals unless later requested

- Multi-company and multi-currency are bonus scope in the supplied PDF, not a prerequisite.
- The frontend is not the current implementation target, but backend endpoints must be UI-ready.

## 16. Hackathon technical and delivery requirements from the PDF

- The judged focus is business logic, data modelling, and a genuine end-to-end workflow; logic must be implemented in application/domain logic, not hardcoded or faked for a demo.
- The eventual solution is expected to be a working application with seed/sample data and backend plus frontend, even though the current workstream is backend/database.
- The customer-facing negotiation surface must be a real, separate restricted view, not an internal page merely relabelled as customer-facing.
- Expected presentation deliverables are a five-minute live demo covering at least two end-to-end flows from quotation to fulfillment or billing, one architecture diagram connecting data model and modules, and a short “what we would build next” note.
- The quick acceptance flow is: configure discount tier/warehouse/subscription; create an over-limit quote and see automatic Manager routing; add an upsell and see totals/margin change; approve then verify split warehouse allocation; verify one-time plus recurring billing; customer requests a larger discount and sees re-approval; confirm, record payment, and see invoice status change.

## 17. Screen-level behavior retained from the supplied flow

- The Sales Dashboard shows pending approvals, open quotations, and at-risk deals plus recent activity.
- The quotation pipeline groups deals by stage, and quotation cards show at minimum customer, amount, and status.
- The quotation builder must expose product/variant selection, quantity adjustment, price/margin, discount mode, all line details, risk flag/reason, draft saving, and approval submission.
- The approval list is filterable by pending/approved/rejected and shows quotation/customer, score/risk, required step, assignee, and status. Approval detail shows every flagged line and approval history.
- Fulfillment screens show inventory by warehouse/product, recommended allocation, manual override, order fulfillment state, shipment count/cost, and backorder signals.
- Subscription screens distinguish active/pending subscriptions and list one-time and recurring billing lines separately with next billing dates and proration/credit actions.
- Customer Portal shows the current quote, line comments, counter-discount input, negotiation history, request submission, and one-click confirmation when terms are final.
- Invoice screens show invoice lifecycle, partial/complete payment state, payment history, due date, and credit-note/refund outcomes.
- Deal Health displays stalled deals, discount anomalies, delivery-slippage indicators, score/alert reason, and an action to nudge/escalate or open the quote.
- Product administration supports product catalogue, category, variants/attributes, price, tax, subscription linkage, and price-list maintenance.
- Discount/approval administration exposes Gold/Silver/Bronze entitlements, Hardware/Software ceilings, Manager risk limit, high-risk route, and health thresholds.
