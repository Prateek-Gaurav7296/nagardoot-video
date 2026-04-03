"""Map video frame time (ms since epoch) to latitude/longitude from gps_log.json."""

from __future__ import annotations

from typing import Any


def lat_lon_at_timestamp(ts_ms: float, points: list[dict[str, Any]]) -> tuple[float, float] | None:
    """
    Linear interpolation between GPS samples. Timestamps are epoch milliseconds.
    Returns (latitude, longitude) or None if no points.
    """
    if not points:
        return None

    pts = sorted(points, key=lambda p: float(p["timestamp"]))

    if ts_ms <= float(pts[0]["timestamp"]):
        return float(pts[0]["latitude"]), float(pts[0]["longitude"])
    if ts_ms >= float(pts[-1]["timestamp"]):
        return float(pts[-1]["latitude"]), float(pts[-1]["longitude"])

    for i in range(len(pts) - 1):
        t0 = float(pts[i]["timestamp"])
        t1 = float(pts[i + 1]["timestamp"])
        if t0 <= ts_ms <= t1:
            if t1 == t0:
                a = 0.0
            else:
                a = (ts_ms - t0) / (t1 - t0)
            lat = float(pts[i]["latitude"]) + a * (float(pts[i + 1]["latitude"]) - float(pts[i]["latitude"]))
            lon = float(pts[i]["longitude"]) + a * (float(pts[i + 1]["longitude"]) - float(pts[i]["longitude"]))
            return lat, lon

    return float(pts[-1]["latitude"]), float(pts[-1]["longitude"])


def format_pothole_id(longitude: float, latitude: float) -> str:
    """
    Filename-safe id: potholeid_<long>_<lat> with . → p and - → m
    (longitude first, then latitude).
    """
    def enc(v: float) -> str:
        return f"{v:.6f}".replace("-", "m").replace(".", "p")

    return f"potholeid_{enc(longitude)}_{enc(latitude)}"
