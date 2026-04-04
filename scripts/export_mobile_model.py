#!/usr/bin/env python3
"""
Export YOLOv10 PyTorch weights to ONNX for onnxruntime-react-native (iOS/Android).

Usage (from repo root, with ultralytics in env):
  pip install ultralytics onnx
  python scripts/export_mobile_model.py --weights server/models/yolov10s.pt --out assets/models/pothole.onnx

Defaults: imgsz=640, opset=17, simplify=True
"""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--weights", type=Path, default=Path("server/models/yolov10s.pt"))
    p.add_argument("--out", type=Path, default=Path("assets/models/pothole.onnx"))
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--opset", type=int, default=17)
    args = p.parse_args()

    if not args.weights.is_file():
        raise SystemExit(f"Weights not found: {args.weights}")

    from ultralytics import YOLO

    args.out.parent.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(args.weights))
    model.export(
        format="onnx",
        imgsz=args.imgsz,
        opset=args.opset,
        simplify=True,
    )
    # Ultralytics writes next to .pt by default; move to assets
    default_onnx = args.weights.with_suffix(".onnx")
    if default_onnx.is_file() and default_onnx.resolve() != args.out.resolve():
        import shutil

        shutil.move(str(default_onnx), str(args.out))
    elif not args.out.is_file():
        raise SystemExit("Export failed: expected ONNX next to weights or at --out")

    print(f"Wrote {args.out} (copy into Xcode / EAS bundle as needed)")


if __name__ == "__main__":
    main()
