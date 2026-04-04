import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';

import { BUNDLE_MODEL } from './modelAsset.js';

/** Match export script / YOLO training input (square). */
export const INPUT_SIZE = 640;
const CONF_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;

/** @type {import('onnxruntime-common').InferenceSession | null} */
let session = null;
let inputName = 'images';
let outputName = 'output0';

/**
 * @typedef {{ x1: number, y1: number, x2: number, y2: number, score: number, classId: number }} Detection
 */

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function actScore(x) {
  if (x >= 0 && x <= 1) {
    return x;
  }
  return sigmoid(x);
}

/**
 * @param {Detection} a
 * @param {Detection} b
 */
function iou(a, b) {
  const xx1 = Math.max(a.x1, b.x1);
  const yy1 = Math.max(a.y1, b.y1);
  const xx2 = Math.min(a.x2, b.x2);
  const yy2 = Math.min(a.y2, b.y2);
  const w = Math.max(0, xx2 - xx1);
  const h = Math.max(0, yy2 - yy1);
  const inter = w * h;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  return inter / (areaA + areaB - inter + 1e-9);
}

/**
 * @param {Detection[]} boxes
 */
function nms(boxes, iouThresh) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const out = [];
  for (const b of sorted) {
    if (out.some((k) => iou(k, b) > iouThresh)) {
      continue;
    }
    out.push(b);
  }
  return out;
}

/**
 * @param {Float32Array} data
 * @param {number[]} dims
 */
function parseYoloOutput(data, dims) {
  /** @type {Detection[]} */
  const raw = [];

  if (dims.length === 3) {
    const [, a, b] = dims;
    // [1, N, 6] end-to-end (xyxy + score + cls) or [1, 84, 8400]
    if (b === 6) {
      const rows = a;
      const stride = 6;
      for (let i = 0; i < rows; i++) {
        const o = i * stride;
        let x1 = data[o];
        let y1 = data[o + 1];
        let x2 = data[o + 2];
        let y2 = data[o + 3];
        const sc = data[o + 4];
        const cid = data[o + 5];
        const score = actScore(sc);
        if (score < CONF_THRESHOLD) {
          continue;
        }
        if (x2 <= 2 && y2 <= 2) {
          x1 *= INPUT_SIZE;
          y1 *= INPUT_SIZE;
          x2 *= INPUT_SIZE;
          y2 *= INPUT_SIZE;
        }
        raw.push({
          x1,
          y1,
          x2,
          y2,
          score,
          classId: Math.round(cid),
        });
      }
    } else if (a === 6 && b > 100) {
      for (let j = 0; j < b; j++) {
        let x1 = data[0 * b + j];
        let y1 = data[1 * b + j];
        let x2 = data[2 * b + j];
        let y2 = data[3 * b + j];
        const sc = data[4 * b + j];
        const cid = data[5 * b + j];
        const score = actScore(sc);
        if (score < CONF_THRESHOLD) {
          continue;
        }
        if (x2 <= 2 && y2 <= 2) {
          x1 *= INPUT_SIZE;
          y1 *= INPUT_SIZE;
          x2 *= INPUT_SIZE;
          y2 *= INPUT_SIZE;
        }
        raw.push({ x1, y1, x2, y2, score, classId: Math.round(cid) });
      }
    } else if (a >= 4 && b > 100) {
      const numFeat = a;
      const numAnchors = b;
      const numClasses = numFeat - 4;
      for (let j = 0; j < numAnchors; j++) {
        let cx = data[0 * numAnchors + j];
        let cy = data[1 * numAnchors + j];
        let w = data[2 * numAnchors + j];
        let h = data[3 * numAnchors + j];
        let best = 0;
        let cls = 0;
        for (let c = 0; c < numClasses; c++) {
          const s = actScore(data[(4 + c) * numAnchors + j]);
          if (s > best) {
            best = s;
            cls = c;
          }
        }
        if (best < CONF_THRESHOLD) {
          continue;
        }
        if (cx <= 2 && cy <= 2 && w <= 2 && h <= 2) {
          cx *= INPUT_SIZE;
          cy *= INPUT_SIZE;
          w *= INPUT_SIZE;
          h *= INPUT_SIZE;
        }
        raw.push({
          x1: cx - w / 2,
          y1: cy - h / 2,
          x2: cx + w / 2,
          y2: cy + h / 2,
          score: best,
          classId: cls,
        });
      }
    }
  }

  return nms(raw, IOU_THRESHOLD);
}

/**
 * @param {Uint8Array} rgb Row-major RGB, length width*height*3
 */
function rgbToNchwFloat(rgb, width, height) {
  const out = new Float32Array(1 * 3 * height * width);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rgbIdx = (y * width + x) * 3 + c;
        out[c * height * width + y * width + x] = rgb[rgbIdx] / 255.0;
      }
    }
  }
  return out;
}

async function resolveModelUri() {
  if (BUNDLE_MODEL != null) {
    const asset = Asset.fromModule(BUNDLE_MODEL);
    await asset.downloadAsync();
    const u = asset.localUri ?? asset.uri;
    if (u) {
      return u;
    }
  }

  const doc = FileSystem.documentDirectory;
  if (!doc) {
    return null;
  }
  const candidates = [`${doc}pothole.onnx`, `${doc}models/pothole.onnx`];
  for (const p of candidates) {
    try {
      const info = await FileSystem.getInfoAsync(p);
      if (info.exists) {
        return p;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function init() {
  if (session) {
    return true;
  }
  const uri = await resolveModelUri();
  if (!uri) {
    console.warn('[InferenceService] No ONNX at bundle or document paths; overlays disabled.');
    return false;
  }
  try {
    session = await InferenceSession.create(uri);
    inputName = session.inputNames?.[0] ?? 'images';
    outputName = session.outputNames?.[0] ?? 'output0';
    return true;
  } catch (e) {
    console.error('[InferenceService] Failed to load model', e);
    session = null;
    return false;
  }
}

export function isReady() {
  return session != null;
}

/**
 * @param {Uint8Array} rgbUint8 length INPUT_SIZE*INPUT_SIZE*3
 * @returns {Promise<Detection[]>} Pixel coords in [0, INPUT_SIZE]
 */
export async function runInference(rgbUint8) {
  if (!session) {
    return [];
  }
  const buf = rgbToNchwFloat(rgbUint8, INPUT_SIZE, INPUT_SIZE);
  const inputTensor = new Tensor('float32', buf, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const feeds = { [inputName]: inputTensor };
  const out = await session.run(feeds);
  const tensor = out[outputName];
  if (!tensor) {
    const firstKey = Object.keys(out)[0];
    if (!firstKey) {
      return [];
    }
    const t = out[firstKey];
    const d = t.data;
    const dims = t.dims;
    return parseYoloOutput(d, dims);
  }
  return parseYoloOutput(tensor.data, tensor.dims);
}

/**
 * @param {Detection[]} dets
 */
export function toNormalized(dets) {
  return dets.map((d) => ({
    ...d,
    nx1: d.x1 / INPUT_SIZE,
    ny1: d.y1 / INPUT_SIZE,
    nx2: d.x2 / INPUT_SIZE,
    ny2: d.y2 / INPUT_SIZE,
  }));
}
