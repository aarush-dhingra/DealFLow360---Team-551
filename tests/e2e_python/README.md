# Workflow E2E tests

These dependency-free Python scripts call the running API and create unique customer accounts and quotations. They do not modify or delete seed data.

Start the API and seed the standard internal accounts first, then run:

```powershell
python tests/e2e_python/run_all.py
```

Set `DF360_API_URL` or `DF360_SEED_PASSWORD` when the API location or seed password differs. The final scenario is intentionally a red test until a negotiated final exception re-enters the formal approval process.
