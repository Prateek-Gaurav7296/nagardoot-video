# nagardoot-video

This project processes pothole detections from road video: capture synchronized **video + GPS** on a phone, run **on-device YOLO (ONNX)** overlays in real time on iOS/Android dev builds, optionally upload sessions to a laptop, and run **YOLOv10s** server-side inference to export annotated frames (with optional complaint workflows downstream).

## Quick start

### Mobile (Expo + native modules)

**Expo Go cannot run Vision Camera frame processors or ONNX.** Use a **development or production build** (e.g. [EAS Build](https://docs.expo.dev/build/introduction/)):

```bash
npm install
npx expo start --dev-client
```

On-device model: export ONNX (see `scripts/export_mobile_model.py` and `assets/models/README.txt`), then either bundle it via `services/modelAsset.js` + `assets/models/pothole.onnx`, or copy `pothole.onnx` to the app documents directory as `pothole.onnx`.

### Installable iOS build (TestFlight / Ad Hoc)

1. Configure Apple Developer credentials and EAS project (`eas.json` is included).
2. Build: `npm run build:ios` (or `eas build --platform ios`).
3. Install the `.ipa` via TestFlight or internal distribution.

**Optional** upload to a Mac for laptop-side inference: enable “Optional: upload zip to Mac” in the app and set the Mac LAN IP (same Wi‑Fi).

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
