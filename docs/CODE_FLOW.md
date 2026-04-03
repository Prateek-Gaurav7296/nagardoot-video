# Nagardoot Video — Code Flow & Architecture

This document describes how the **Expo mobile app**, **Flask upload server**, and **pothole inference** fit together. Diagrams use [Mermaid](https://mermaid.js.org/) (renders on GitHub, GitLab, many Markdown viewers, and VS Code/Cursor with a Mermaid extension).

---

## 1. End-to-end system context

High-level view: phone captures video + GPS, zips, uploads to laptop; laptop stores zip and can run YOLO inference.

```mermaid
flowchart LR
  subgraph Phone["Expo Go / Device"]
    A[RecorderScreen]
    SVC[services/*]
    A --> SVC
  end

  subgraph Laptop["Mac / PC (same LAN)"]
    B[Flask upload_server.py :5001]
    R[received/*.zip]
    INF[run_pothole_inference.py]
    OUT[output/…/pothole_frames]
    W[yolov10s.pt]
  end

  SVC -->|HTTP multipart ZIP| B
  B --> R
  R --> INF
  W --> INF
  INF --> OUT
```

---

## 2. Repository layout (logical blocks)

```mermaid
flowchart TB
  subgraph Mobile["React Native (Expo)"]
    APP[App.js]
    RS[components/RecorderScreen.js]
    CS[services/CameraService.js]
    LS[services/LocationService.js]
    FS[services/FileService.js]
    US[services/UploadService.js]
    APP --> RS
    RS --> CS
    RS --> LS
    RS --> FS
    RS --> US
  end

  subgraph Server["Python server/"]
    UP[upload_server.py]
    INF_PKG[inference/*]
    RUN[run_pothole_inference.py]
    MOD[models/yolov10s.pt]
    REC[received/]
    O[output/]
    UP --> REC
    RUN --> INF_PKG
    INF_PKG --> MOD
    INF_PKG --> REC
    INF_PKG --> O
  end

  US -->|uploadAsync| UP
```

---

## 3. UI state machine (`RecorderScreen`)

Phases control which buttons are enabled.

```mermaid
stateDiagram-v2
  [*] --> idle : app load

  idle --> recording : Start Recording\n(camera+GPS ready)
  recording --> processing : Stop Recording
  processing --> stopped : zip saved OK
  processing --> idle : save failed

  stopped --> uploading : Upload Session\n(IP set)
  stopped --> idle : (no direct edge;\nmust upload to clear)

  uploading --> idle : upload OK
  uploading --> stopped : upload failed

  idle --> idle : permissions refresh
  note right of stopped
    Status text: "Session ready"
    Start disabled until back to idle
  end note
```

---

## 4. Permission & startup flow

```mermaid
flowchart TD
  A[App mounts RecorderScreen] --> B[requestAllPermissions]
  B --> C[CameraService.requestPermissions]
  B --> D[LocationService.requestPermissions]
  C --> E{corePermsOk?}
  D --> E
  E -->|no| F[Placeholder UI\nAsk again / Open Settings]
  E -->|yes| G[CameraView mounts\nonCameraReady]
  G --> H[Start Recording enabled\nwhen phase idle + cameraReady]
```

---

## 5. Start Recording — sequence

```mermaid
sequenceDiagram
  participant UI as RecorderScreen
  participant LS as LocationService
  participant CS as CameraService
  participant Cam as CameraView

  UI->>UI: gpsLogRef = []\nrecordingStartMsRef = now
  UI->>LS: await startTracking(callback)
  Note over LS: last known + getCurrent\n+ watchPositionAsync
  LS-->>UI: callback pushes GPS points
  UI->>CS: beginRecording(cameraRef)
  CS->>Cam: recordAsync()
  UI->>UI: phase = recording
```

---

## 6. Stop Recording — sequence

```mermaid
sequenceDiagram
  participant UI as RecorderScreen
  participant LS as LocationService
  participant CS as CameraService
  participant FS as FileService

  UI->>UI: phase = processing
  UI->>LS: stopTracking()
  UI->>CS: stop() + await finished
  CS-->>UI: videoUri
  UI->>FS: saveSessionAndZip\nvideo, gpsLog, startTime, endTime
  Note over FS: copy video\nwrite JSON\nJSZip → session_*.zip
  FS-->>UI: zipUri
  UI->>UI: pendingZipUri\nphase = stopped
```

---

## 7. Session packaging (`FileService`)

Block diagram of what gets written before upload.

```mermaid
flowchart LR
  subgraph Inputs
    V[video temp URI]
    G[gpsLog in memory]
    T[startTime / endTime]
  end

  subgraph Disk["documentDirectory"]
    D["session_<endTime>/"]
    V2[video.mp4]
    GJ[gps_log.json]
    MJ[metadata.json]
    Z[session_<endTime>.zip]
  end

  V -->|copyAsync| V2
  G --> GJ
  T --> MJ
  D --> V2
  D --> GJ
  D --> MJ
  V2 --> JS[JSZip]
  GJ --> JS
  MJ --> JS
  JS --> Z
```

---

## 8. Upload flow (`UploadService` → Flask)

```mermaid
flowchart TD
  A[Upload Session tap] --> B{IP non-empty?}
  B -->|no| C[detailMessage error]
  B -->|yes| D[phase = uploading]
  D --> E[FileSystem.uploadAsync\nMULTIPART field file]
  E --> F[POST http://IP:5001/upload]
  F --> G{HTTP 2xx?}
  G -->|yes| H[pendingZipUri = null\nphase = idle]
  G -->|no| I[phase = stopped\ndetailMessage]
```

---

## 9. Flask upload server

```mermaid
flowchart TD
  R[Request POST /upload] --> K{file in form?}
  K -->|no| E400[400 missing file]
  K -->|yes| S[Save to received/\nfilename or session.zip]
  S --> OK[200 JSON ok + path + size]

  H[GET /health] --> HOK[JSON probe for phone browser]
```

---

## 10. Pothole inference pipeline

```mermaid
flowchart TD
  CLI[run_pothole_inference.py] --> SRC{Input type?}
  SRC -->|*.zip| X[extract_zip_session\ntemp dir]
  SRC -->|folder| DIR[session dir]
  X --> LOAD
  DIR --> LOAD[load_session_from_dir\nvideo + gps_log + metadata]

  LOAD --> M[Load YOLO\nconfig.model_path]
  M --> V[Open video\nOpenCV VideoCapture]

  V --> LOOP{For each frame\nstride filter}
  LOOP --> T[frame time ms =\nstart_time + frame/fps*1000]
  T --> GPS[lat_lon_at_timestamp\ninterpolate gps_log]
  GPS --> YOLO[model.predict frame]
  YOLO --> BOX{Pothole class\nin POTHOLE_CLASS_IDS?}
  BOX -->|yes| DRAW[Draw box + labels\npotholeid_lon_lat]
  DRAW --> JPG[Write JPG\noutput/.../pothole_frames/]
  BOX -->|no| LOOP
  JPG --> LOOP
  LOOP -->|EOF| META[inference_meta.txt]
```

---

## 11. GPS ↔ frame time alignment

```mermaid
flowchart LR
  subgraph Meta
    ST[start_time ms]
  end

  subgraph Video
    F[frame index i]
    FPS[fps]
  end

  subgraph GPS
    P[gps_log sorted\nby timestamp]
  end

  ST --> T[ t = start_time + i/fps*1000 ]
  F --> T
  FPS --> T
  T --> I[Linear interpolate\nbetween GPS samples]
  P --> I
  I --> ID[format_pothole_id\nlon first, lat second\nfilename-safe encoding]
```

---

## 12. Configuration touchpoints

| Area | Where | Purpose |
|------|--------|--------|
| Upload URL | `UploadService.js` — `DEFAULT_UPLOAD_PORT`, IP in UI | Laptop receives ZIP |
| Cleartext / local network | `app.json` iOS/Android | HTTP to LAN |
| Model path | `server/inference/config.py` or `POTHOLE_MODEL` | YOLO weights |
| Detection | `POTHOLE_CONF`, `POTHOLE_CLASS_IDS`, `POTHOLE_FRAME_STRIDE` env | Tuning inference |
| Flask port | `upload_server.py` / `PORT` env | Default 5001 (avoid macOS 5000) |

---

## 13. Quick command reference

| Step | Command / action |
|------|------------------|
| Run app | `npx expo start` → Expo Go |
| Run upload API | `cd server && python upload_server.py` |
| Run inference | `cd server && python run_pothole_inference.py received/<session>.zip` |
| All zips | `python run_pothole_inference.py --all-received` |

---

## Viewing these diagrams

- **GitHub / GitLab**: Open this file; Mermaid renders automatically in many repos.
- **VS Code / Cursor**: Install a “Mermaid” preview extension, or paste diagrams into [mermaid.live](https://mermaid.live).
- **Export**: From mermaid.live you can export PNG/SVG for slides or PDFs.

If you add new flows (e.g. background upload, cloud storage), extend the matching section above so this file stays the single architecture reference.
