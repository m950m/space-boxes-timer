#!/usr/bin/env python3
"""Retired pre-React rehearsal; intentionally performs no database operations."""

import sys


def main():
    print(
        "The pre-React staging verifier is retired. It cannot validate this candidate.\n"
        "Use these disposable local gates instead:\n"
        "  v2/.venv/bin/python v2/scripts/verify-local-product.py\n"
        "  v2/.venv/bin/python v2/scripts/verify-container.py\n"
        "Live staging acceptance remains pending isolated resources and an approved inbox.\n"
        "See v2/RELEASE-CANDIDATE.md. No environment credentials were read or used.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
