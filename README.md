# nagardoot-video

This project processes pothole detections from road video: capture synchronized **video + GPS** on a phone, upload sessions to a laptop, and run **YOLOv10s** inference to export annotated frames (with optional complaint workflows downstream).

## Quick start

### Mobile (Expo)

```bash
npm install
npx expo start
```

Open in **Expo Go** on a device. Set the Mac’s LAN IP for upload (see on-screen hint).

### Laptop: upload API

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python upload_server.py
```

Default port **5001** (avoids macOS AirPlay on 5000).

### Inference

Place weights at `server/models/yolov10s.pt`, then:

```bash
cd server && source .venv/bin/activate
python run_pothole_inference.py received/<session>.zip
```

Outputs go to `server/output/<session>/pothole_frames/`.

## Documentation

- **[docs/CODE_FLOW.md](docs/CODE_FLOW.md)** — architecture and Mermaid diagrams (app, server, inference).

## Repository

https://github.com/Prateek-Gaurav7296/nagardoot-video
