"""Run YOLOv10 on video; save frames with pothole boxes and GPS-based names."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2

from . import config
from .gps_sync import format_pothole_id, lat_lon_at_timestamp
from .session_extract import cleanup_dir, extract_zip_session, load_session_from_dir


def _ensure_model(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(
            f"Model weights not found: {path}\n"
            "Place your trained YOLOv10s weights at server/models/yolov10s.pt\n"
            "or set POTHOLE_MODEL=/path/to/yolov10s.pt"
        )


def run_on_session(
    session_source: Path,
    *,
    out_root: Path | None = None,
    cleanup_extracted: bool = True,
) -> Path:
    """
    session_source: path to session .zip OR directory with video.mp4 + gps_log.json + metadata.json

    Returns path to output directory for this run.
    """
    from ultralytics import YOLO

    model_file = config.model_path()
    _ensure_model(model_file)

    tmp_extracted: Path | None = None
    if session_source.suffix.lower() == ".zip":
        session_dir = extract_zip_session(session_source)
        tmp_extracted = session_dir
    else:
        session_dir = session_source

    try:
        video_path, gps_log, metadata = load_session_from_dir(session_dir)
        start_time = float(metadata.get("start_time", 0))

        out_base = out_root or config.OUTPUT_ROOT
        run_name = session_source.stem if session_source.suffix else session_source.name
        out_dir = out_base / run_name / "pothole_frames"
        out_dir.mkdir(parents=True, exist_ok=True)

        model = YOLO(str(model_file))

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_idx = 0
        saved = 0

        pothole_ids = set(config.POTHOLE_CLASS_IDS)

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % config.FRAME_STRIDE != 0:
                frame_idx += 1
                continue

            t_ms = start_time + (frame_idx / fps) * 1000.0
            ll = lat_lon_at_timestamp(t_ms, gps_log)
            if ll is None:
                lat, lon = 0.0, 0.0
                base_id = "potholeid_unknown"
            else:
                lat, lon = ll
                base_id = format_pothole_id(lon, lat)

            results = model.predict(
                source=frame,
                conf=config.CONF_THRESHOLD,
                verbose=False,
            )
            r = results[0]
            if r.boxes is not None and len(r.boxes) > 0:
                boxes = r.boxes.xyxy.cpu().numpy()
                classes = r.boxes.cls.cpu().numpy().astype(int)
                scores = r.boxes.conf.cpu().numpy()

                det_idx = 0
                for (x1, y1, x2, y2), cls_id, score in zip(boxes, classes, scores):
                    if cls_id not in pothole_ids:
                        continue

                    x1, y1, x2, y2 = map(int, [x1, y1, x2, y2])
                    h, w = frame.shape[:2]
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(w, x2), min(h, y2)

                    vis = frame.copy()
                    color = (0, 165, 255)  # orange BGR
                    cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
                    label1 = f"{base_id}"
                    label2 = f"cls={cls_id} conf={score:.2f}"
                    cv2.putText(
                        vis,
                        label1,
                        (x1, max(36, y1 - 22)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.45,
                        color,
                        1,
                        cv2.LINE_AA,
                    )
                    cv2.putText(
                        vis,
                        label2,
                        (x1, max(20, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.45,
                        color,
                        1,
                        cv2.LINE_AA,
                    )

                    fname = f"{base_id}_f{frame_idx:06d}_d{det_idx}.jpg"
                    out_path = out_dir / fname
                    cv2.imwrite(str(out_path), vis)
                    saved += 1
                    det_idx += 1

            frame_idx += 1

        cap.release()

        meta_out = out_dir.parent / "inference_meta.txt"
        meta_out.write_text(
            f"frames_written={saved}\n"
            f"model={model_file}\n"
            f"conf={config.CONF_THRESHOLD}\n"
            f"class_ids={config.POTHOLE_CLASS_IDS}\n"
            f"stride={config.FRAME_STRIDE}\n",
            encoding="utf-8",
        )

        return out_dir
    finally:
        if cleanup_extracted and tmp_extracted is not None:
            cleanup_dir(tmp_extracted)
