#!/usr/bin/env python3
"""
preflight_check.py
Validates system readiness, invariant compliance, and runtime health.
Usage:
    python3 preflight_check.py
"""

import urllib.request
import sys
from pathlib import Path

def check_http(url, name):
    try:
        req = urllib.request.urlopen(url, timeout=2)
        if req.status == 200:
            print(f"  [✓] {name:<25} : ONLINE (200 OK)")
            return True
        else:
            print(f"  [!] {name:<25} : STATUS {req.status}")
            return False
    except Exception as e:
        print(f"  [✗] {name:<25} : OFFLINE ({e})")
        return False

def main():
    script_dir = Path(__file__).resolve().parent
    workspace = script_dir.parent.parent

    print(f"============================================================")
    print(f"🛡️  PRE-FLIGHT CRITICAL VALIDATION GATE")
    print(f"============================================================\n")

    # 1. Invariants & Rules Files
    print("1. Invariant & Governance Architecture:")
    req_files = [
        "AGENTS.md",
        "GEMINI.md",
        "STATE.md",
        "DECISOES.md",
        ".agents/invariants/invariants.md",
        ".agents/rules/01_context_engineering.md",
        ".agents/rules/02_token_economy.md",
        ".agents/rules/03_critical_decision.md",
        ".agents/rules/04_vibe_orchestration.md"
    ]
    all_ok = True
    for rf in req_files:
        p = workspace / rf
        if p.exists():
            print(f"  [✓] {rf}")
        else:
            print(f"  [✗] {rf} MISSING!")
            all_ok = False

    # 2. Services Runtime Check
    print("\n2. Runtime Service Health:")
    s1 = check_http("http://localhost:3000", "Penumbra Web Cockpit")

    print("\n============================================================")
    if all_ok:
        print("🎉 PRE-FLIGHT CHECK PASSED: System ready for intelligent vibecoding.")
    else:
        print("⚠️  PRE-FLIGHT CHECK WARNING: Some components require attention.")
    print("============================================================")

if __name__ == "__main__":
    main()
