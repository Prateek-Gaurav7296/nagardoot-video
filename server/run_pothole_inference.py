#!/usr/bin/env python3
"""
Run pothole detection on a session uploaded to server/received/.

Usage:
  cd server
  source .venv/bin/activate
  pip install -r requirements.txt
  python run_pothole_inference.py received/session_123.zip

Weights:
  Copy your trained YOLOv10s file to: server/models/yolov10s.pt
  Or: POTHOLE_MODEL=/path/to/custom.pt python run_pothole_inference.py ...

Outputs:
  server/output/<zip_basename>/pothole_frames/*.jpg
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# server/ on path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from inference.detect import run_on_session


def main() -> int:
    p = argparse.ArgumentParser(description="YOLOv10s pothole inference on session zip or folder")
    p.add_argument(
        "session",
        type=Path,
        nargs="?",
        help="Path to session .zip or extracted folder with video.mp4",
    )
    p.add_argument(
        "--all-received",
        action="store_true",
        help="Run on every .zip under server/received/",
    )
    p.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Keep temp extract dir (debug)",
    )
    args = p.parse_args()

    if args.all_received:
        from inference.config import RECEIVED_DIR

        zips = sorted(RECEIVED_DIR.glob("*.zip"))
        if not zips:
            print(f"No zips in {RECEIVED_DIR}", file=sys.stderr)
            return 1
        for z in zips:
            print(f"--- {z.name} ---")
            out = run_on_session(z, cleanup_extracted=not args.no_cleanup)
            print(f"Done: {out}")
        return 0

    if args.session is None:
        p.error("pass session path or use --all-received")
    src = args.session.expanduser().resolve()
    if not src.exists():
        print(f"Not found: {src}", file=sys.stderr)
        return 1
    out = run_on_session(src, cleanup_extracted=not args.no_cleanup)
    print(f"Done. Annotated frames: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
