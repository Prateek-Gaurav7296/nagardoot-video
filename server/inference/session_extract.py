"""Extract session zip (video.mp4, gps_log.json, metadata.json)."""

from __future__ import annotations

import json
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any


def load_session_from_dir(session_dir: Path) -> tuple[Path, list[dict], dict[str, Any]]:
    video = session_dir / "video.mp4"
    gps_path = session_dir / "gps_log.json"
    meta_path = session_dir / "metadata.json"
    if not video.is_file():
        raise FileNotFoundError(f"Missing video.mp4 in {session_dir}")
    gps: list[dict] = []
    if gps_path.is_file():
        gps = json.loads(gps_path.read_text(encoding="utf-8"))
    meta: dict[str, Any] = {}
    if meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    return video, gps, meta


def extract_zip_session(zip_path: Path) -> Path:
    """Unzip into a temp directory; return path containing video.mp4."""
    z = zipfile.ZipFile(zip_path, "r")
    tmp = Path(tempfile.mkdtemp(prefix="pothole_session_"))
    try:
        z.extractall(tmp)
    finally:
        z.close()

    # Flat layout: tmp/video.mp4
    if (tmp / "video.mp4").is_file():
        return tmp

    # Nested: tmp/session_xxx/video.mp4
    for p in tmp.rglob("video.mp4"):
        return p.parent

    shutil.rmtree(tmp, ignore_errors=True)
    raise FileNotFoundError(f"No video.mp4 found inside {zip_path}")


def cleanup_dir(path: Path) -> None:
    if path.is_dir() and "pothole_session_" in path.name:
        shutil.rmtree(path, ignore_errors=True)
