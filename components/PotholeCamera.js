import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { runAtTargetFps } from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useRunOnJS } from 'react-native-worklets-core';

import * as InferenceService from '../services/InferenceService';
import { INPUT_SIZE } from '../services/InferenceService';
import { formatPotholeId, latLonAtTimestamp } from '../services/gpsSync.js';

/**
 * @param {{
 *   cameraRef: import('react').RefObject<import('react-native-vision-camera').Camera | null>,
 *   isActive: boolean,
 *   onReady: () => void,
 *   onMountError: (e: unknown) => void,
 *   inferenceEnabled: boolean,
 *   modelEnabled: boolean,
 *   gpsLogRef: import('react').MutableRefObject<Array<{ timestamp: number, latitude: number, longitude: number }>>,
 *   onDetectionsChange?: (d: Array<{ nx1: number, ny1: number, nx2: number, ny2: number, score: number, classId: number, label: string }>) => void,
 * }} props
 */
export default function PotholeCamera({
  cameraRef,
  isActive,
  onReady,
  onMountError,
  inferenceEnabled,
  modelEnabled,
  gpsLogRef,
  onDetectionsChange,
}) {
  const device = useCameraDevice('back');
  const { resize } = useResizePlugin();
  const [modelOk, setModelOk] = useState(false);
  const [detections, setDetections] = useState(
    /** @type {Array<{ nx1: number, ny1: number, nx2: number, ny2: number, score: number, classId: number, label: string }>} */ (
      []
    )
  );
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    InferenceService.init().then((ok) => {
      if (!cancelled) {
        setModelOk(ok);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyDetections = useCallback(
    (list) => {
      const pts = gpsLogRef.current ?? [];
      const ts = Date.now();
      const ll = latLonAtTimestamp(ts, pts);
      const label = ll ? formatPotholeId(ll.longitude, ll.latitude) : '—';
      const withLabels = list.map((d) => ({
        ...d,
        label,
      }));
      setDetections(withLabels);
      onDetectionsChange?.(withLabels);
    },
    [gpsLogRef, onDetectionsChange]
  );

  const onFrameResult = useRunOnJS(
    async (/** @type {Uint8Array} */ copy) => {
      if (busyRef.current || !InferenceService.isReady()) {
        return;
      }
      busyRef.current = true;
      try {
        const raw = await InferenceService.runInference(copy);
        const norm = InferenceService.toNormalized(raw);
        applyDetections(norm);
      } catch (e) {
        console.warn('[PotholeCamera] inference', e);
      } finally {
        busyRef.current = false;
      }
    },
    [applyDetections]
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      runAtTargetFps(3, () => {
        'worklet';
        const resized = resize(frame, {
          scale: { width: INPUT_SIZE, height: INPUT_SIZE },
          pixelFormat: 'rgb',
          dataType: 'uint8',
        });
        const copy = new Uint8Array(resized.length);
        copy.set(resized);
        onFrameResult(copy);
      });
    },
    [resize, onFrameResult]
  );

  const useFp = inferenceEnabled && modelEnabled && modelOk;

  if (device == null) {
    return (
      <View style={styles.placeholderWrap}>
        <Text style={styles.placeholder}>No back camera found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        audio={false}
        video
        photo={false}
        frameProcessor={useFp ? frameProcessor : undefined}
        pixelFormat="yuv"
        onInitialized={onReady}
        onError={onMountError}
      />
      <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${INPUT_SIZE} ${INPUT_SIZE}`} preserveAspectRatio="xMidYMid slice">
        {detections.map((d, i) => (
          <Rect
            key={`${d.nx1}-${d.ny1}-${i}`}
            x={d.nx1 * INPUT_SIZE}
            y={d.ny1 * INPUT_SIZE}
            width={(d.nx2 - d.nx1) * INPUT_SIZE}
            height={(d.ny2 - d.ny1) * INPUT_SIZE}
            stroke="#0f0"
            strokeWidth={2}
            fill="transparent"
          />
        ))}
      </Svg>
      {!modelOk ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>On-device model not loaded (add pothole.onnx)</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#222' },
  placeholderWrap: { flex: 1, justifyContent: 'center', padding: 12 },
  placeholder: { color: '#fff', textAlign: 'center' },
  badge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 4,
    borderRadius: 4,
  },
  badgeText: { color: '#ffcc00', fontSize: 11, textAlign: 'center' },
});
