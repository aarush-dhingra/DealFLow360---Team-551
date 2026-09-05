# Database Schema Guide

The executable source of the initial PostgreSQL schema is [database/migrations/001_initial_schema.sql](database/migrations/001_initial_schema.sql).

## Core relationship map

```text
users --< user_roles
customer_tiers --< customers --< customer_contacts
customer_tiers --< price_lists --< price_list_items >-- products --< product_variants
product_categories --< products

customers --< quotations --< quotation_versions --< quotation_lines
quotation_versions --1 risk_assessments --< risk_assessment_lines
quotation_versions --< approval_instances --< approval_actions
quotations --< negotiation_messages
quotations --< deal_health_assessments

quotations --< fulfillment_orders --< fulfillment_allocations >-- warehouses
warehouses --< inventory_levels >-- products

subscription_plans --< subscriptions --< billing_schedules
quotation_lines --< subscriptions
quotations --< invoices --< payments
invoices --< credit_notes

all aggregates --< audit_events
all transactions --< outbox_events
```

## Design invariants

- `quotation_versions` and their lines are historical snapshots. Mutate by creating a new version, never by editing an approved/history version.
- `risk_assessments` is one assessment per quote version; line details make each blended score explainable.
- `approval_instances` targets a quote version. An approval cannot silently approve a newer revision.
- `audit_events` is append-only application history; it is not a replacement for the normalized business records.
- `outbox_events` supports reliable post-commit dashboard/notification updates.
- Categories are constrained to `hardware` and `software`; tiers to `gold`, `silver`, and `bronze`, matching current confirmed requirements.

## Schema work still intentionally deferred

The initial migration establishes the bounded contexts and key constraints. Add detailed invoice lines, delivery/shipment tables, promotion/upsell rules, authentication session tables, report materialized views, and database-level updated-at triggers in subsequent focused migrations rather than expanding the first migration indefinitely.
