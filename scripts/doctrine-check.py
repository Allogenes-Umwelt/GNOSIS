#!/usr/bin/env python3
"""Doctrine drift gate for consumer repos (see docs/estandares/ENFORCEMENT.md).

Checks that the docs/estandares/ copies of the five canon files are
byte-identical to the MD-FILES-SHOP library pin recorded in
docs/estandares/DOCTRINE_MANIFEST.sha256.

Why not `mdshop validate` here: mdshop's freshness check compares each
file's `updated:` date against the last substantive commit of that file in
the repo where it runs. In a consumer repo every canon copy was introduced
by a sync commit that postdates the canon's `updated:` date, so the gate
would fail on every run with a currency warning that means nothing for a
mirror. Canon-side conformance (front matter, freshness, cross-references)
is enforced by mdshop in the MD-FILES-SHOP repo itself; consumer-side
integrity is absence of drift, which is what this gate checks.

Usage:
  python3 scripts/doctrine-check.py            # gate (CI + pre-commit)
  python3 scripts/doctrine-check.py --update   # re-pin after a canon sync
"""

import argparse
import hashlib
import pathlib
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--update",
        action="store_true",
        help="rewrite the manifest from the current files (canon sync only)",
    )
    args = ap.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent
    est = root / "docs" / "estandares"
    manifest = est / "DOCTRINE_MANIFEST.sha256"

    if not manifest.exists():
        print("doctrine-check: no manifest at docs/estandares/DOCTRINE_MANIFEST.sha256", file=sys.stderr)
        return 1

    entries: list[tuple[str, str]] = []
    for raw in manifest.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        digest, sep, name = raw.partition("  ")
        if not sep or not digest or not name:
            print(f"doctrine-check: malformed manifest line: {raw!r}", file=sys.stderr)
            return 1
        if "/" in name or ".." in name or name != pathlib.PurePath(name).name:
            print(f"doctrine-check: unsafe manifest path: {name}", file=sys.stderr)
            return 1
        entries.append((digest, name))

    if not entries:
        print("doctrine-check: manifest is empty", file=sys.stderr)
        return 1

    if args.update:
        lines: list[str] = []
        for _, name in entries:
            p = est / name
            if not p.exists():
                print(f"doctrine-check: --update but {name} is missing", file=sys.stderr)
                return 1
            lines.append(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {name}")
        manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"doctrine-check: manifest re-pinned ({len(lines)} files)")
        return 0

    failed = False
    for digest, name in entries:
        p = est / name
        if not p.exists():
            print(f"FAIL  {name}  (missing)")
            failed = True
            continue
        actual = hashlib.sha256(p.read_bytes()).hexdigest()
        if actual == digest:
            print(f"PASS  {name}")
        else:
            print(f"FAIL  {name}  (drift: expected {digest[:12]}, got {actual[:12]})")
            failed = True

    print()
    print("DOCTRINE " + ("FAIL" if failed else "PASS") + f"  ({len(entries)} canon files pinned)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
