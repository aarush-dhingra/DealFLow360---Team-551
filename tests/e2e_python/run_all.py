"""Run each isolated workflow scenario and return a non-zero status on any failure."""

from __future__ import annotations

import pathlib
import subprocess
import sys


ROOT = pathlib.Path(__file__).parent
SCENARIOS = [
    "01_customer_accepts_initial_offer.py",
    "02_manager_accepts_customer_terms.py",
    "03_manager_revises_then_customer_accepts.py",
    "04_finance_revises_then_customer_accepts.py",
    "05_formal_approval_reentry.py",
]


if __name__ == "__main__":
    failures = []
    for script in SCENARIOS:
        print(f"\n{'=' * 72}\n{script}\n{'=' * 72}")
        result = subprocess.run([sys.executable, str(ROOT / script)], check=False)
        if result.returncode:
            failures.append(script)
    if failures:
        print(f"\nFAILED: {', '.join(failures)}")
        raise SystemExit(1)
    print("\nAll workflow scenarios passed.")
