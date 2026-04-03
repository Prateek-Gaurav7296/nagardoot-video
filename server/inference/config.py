"""
Paths and detection settings.

Model weights (YOLOv10s, pothole-trained):
  Place the file at: server/models/yolov10s.pt
  Or set env POTHOLE_MODEL=/absolute/path/to/weights.pt

Ignored by git: server/models/*.pt — copy your trained file locally.
"""

from __future__ import annotations

import os
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = SERVER_ROOT / "models"
OUTPUT_ROOT = SERVER_ROOT / "output"
RECEIVED_DIR = SERVER_ROOT / "received"

DEFAULT_MODEL_PATH = MODELS_DIR / "yolov10s.pt"


def model_path() -> Path:
    p = os.environ.get("POTHOLE_MODEL", str(DEFAULT_MODEL_PATH))
    return Path(p).expanduser().resolve()


# Confidence threshold for saving a detection
CONF_THRESHOLD = float(os.environ.get("POTHOLE_CONF", "0.25"))

# Class IDs to treat as potholes (single-class pothole model → [0])
POTHOLE_CLASS_IDS = [
    int(x.strip())
    for x in os.environ.get("POTHOLE_CLASS_IDS", "0").split(",")
    if x.strip()
]

# Process every Nth frame (1 = all frames; 5 = faster)
FRAME_STRIDE = max(1, int(os.environ.get("POTHOLE_FRAME_STRIDE", "1")))
