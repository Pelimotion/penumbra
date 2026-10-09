#!/usr/bin/env python3
"""
audit_tokens.py
Audits workspace file footprints and warns about potential context bloat.
Usage:
    python3 audit_tokens.py
"""

import os
from pathlib import Path

MAX_RECOMMENDED_LINES = 600

def audit():
    script_dir = Path(__file__).resolve().parent
    workspace = script_dir.parent.parent

    print(f"============================================================")
    print(f"🔍 TOKEN FOOTPRINT & CONTEXT HYGIENE AUDIT")
    print(f"Workspace: {workspace}")
    print(f"============================================================\n")

    files_checked = 0
    large_files = []

    # Directories to skip
    skip_dirs = {".git", ".venv", "venv", "node_modules", ".tempmediaStorage", "1. In", "1. in", "graphify-out", ".system_generated"}

    for root, dirs, files in os.walk(workspace):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for f in files:
            if f.startswith(".") and f != ".agents":
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext in {".mp4", ".mov", ".png", ".jpg", ".jpeg", ".webp", ".wav", ".mp3", ".aif", ".aiff"}:
                continue

            file_path = Path(root) / f
            files_checked += 1
            try:
                line_count = sum(1 for _ in open(file_path, "r", encoding="utf-8", errors="ignore"))
                size_kb = file_path.stat().st_size / 1024
                if line_count > MAX_RECOMMENDED_LINES:
                    rel_path = file_path.relative_to(workspace)
                    large_files.append((str(rel_path), line_count, size_kb))
            except Exception:
                pass

    print(f"Checked {files_checked} text/source files.\n")

    if large_files:
        print(f"⚠️  FILES EXCEEDING {MAX_RECOMMENDED_LINES} LINES (USE SLICED VIEW / GREP):")
        large_files.sort(key=lambda x: x[1], reverse=True)
        for path, lines, size_kb in large_files:
            print(f"  • {path:<50} | {lines:>5} lines | {size_kb:>6.1f} KB")
        print("\n💡 FinOps Recommendation: Never load these files completely into prompt context.")
        print("   Use grep_search and view_file with StartLine/EndLine slices.\n")
    else:
        print("✓ All scanned source files are within optimal token-efficient thresholds!\n")

    # Check key control files
    print("📋 Key Control Files Status:")
    for key_file in ["AGENTS.md", "GEMINI.md", "STATE.md", "DECISOES.md"]:
        p = workspace / key_file
        if p.exists():
            lines = sum(1 for _ in open(p, "r", encoding="utf-8", errors="ignore"))
            print(f"  [✓] {key_file:<15} : {lines:>4} lines (Healthy)")
        else:
            print(f"  [!] {key_file:<15} : MISSING")

    print(f"============================================================")

if __name__ == "__main__":
    audit()
