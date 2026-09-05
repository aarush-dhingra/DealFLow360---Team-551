# DealFlow360 API

Express.js and PostgreSQL backend scaffold for the DealFlow360 Odoo hackathon project.

Read [MASTER_CONTEXT.md](MASTER_CONTEXT.md) before changing the domain model or business rules. It is the source of truth for confirmed requirements, proposed defaults, and outstanding decisions.

## Start

1. Create a local PostgreSQL database named `dealflow360`.
2. Copy `.env.example` to `.env` and update `DATABASE_URL`.
3. Install dependencies with `npm install`.
4. Run `npm run db:migrate`.
5. Run `npm run dev`.

## Seeded demo access

After `npm run db:seed`, use `admin@dealflow360.local` / `ChangeMe123!` for the administrator account. The seed also creates Sales Rep, Manager, and Finance accounts using the same password. For the customer portal, create an account with `purchasing@acme.example` or `buyer@gamma.example` and choose a password; these are seeded customer-contact emails.

The migration runner and seed runner are deliberately scaffolded; add their implementation only after the remaining policy decisions are confirmed.

## Structure

- `src/modules/`: domain-oriented API modules.
- `src/shared/`: shared HTTP, error, validation, and utility code.
- `src/infrastructure/`: database, event/outbox, logging, and configuration adapters.
- `database/migrations/`: forward-only PostgreSQL schema migrations.
- `database/seeds/`: deterministic demo/configuration data.
- `tests/`: unit and integration tests.
