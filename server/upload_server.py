#!/usr/bin/env python3
"""Minimal upload endpoint for development: POST /upload (multipart field name: file)."""

import os
from pathlib import Path

from flask import Flask, request

UPLOAD_DIR = Path(__file__).resolve().parent / "received"
app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    """Open http://<laptop-ip>:5001/health in the phone browser to verify routing / Wi‑Fi."""
    return {"ok": True, "upload": "POST /upload (multipart field name: file)"}


@app.route("/upload", methods=["POST"])
def upload():
    print(
        "[upload] POST from",
        request.remote_addr,
        "content-type:",
        request.content_type,
        "files:",
        list(request.files.keys()),
    )
    if "file" not in request.files:
        return {"error": "missing file field"}, 400
    f = request.files["file"]
    safe_name = f.filename or "session.zip"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOAD_DIR / safe_name
    f.save(dest)
    size = dest.stat().st_size
    print("[upload] saved", dest, size, "bytes")
    return {"ok": True, "saved": str(dest), "size": size}, 200


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    # macOS often binds port 5000 to AirPlay Receiver; 5001 avoids that clash.
    port = int(os.environ.get("PORT", "5001"))
    print(f"Listening on http://{host}:{port}/upload — saving to {UPLOAD_DIR}")
    print(f"Health check (from phone browser): http://<this-mac-lan-ip>:{port}/health")
    app.run(host=host, port=port, debug=True)
