1) Export ONNX from your .pt weights (640x640 default, good balance for mobile FPS):
   pip install ultralytics onnx
   python scripts/export_mobile_model.py --weights server/models/yolov10s.pt --out assets/models/pothole.onnx

2) Bundle in the app (recommended for TestFlight):
   - Uncomment in services/modelAsset.js:
     export const BUNDLE_MODEL = require('../assets/models/pothole.onnx');
   - Or copy the file into the app sandbox as Documents/pothole.onnx (InferenceService checks that path).

3) Large models: keep *.onnx gitignored; use EAS secrets or a first-run download URL if needed.

4) Throttling: preview inference runs at ~3 FPS via Vision Camera (see components/PotholeCamera.js).
