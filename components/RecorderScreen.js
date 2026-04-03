import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Button, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView } from 'expo-camera';

import * as CameraService from '../services/CameraService';
import * as LocationService from '../services/LocationService';
import * as FileService from '../services/FileService';
import * as UploadService from '../services/UploadService';

/** @typedef {'idle' | 'recording' | 'processing' | 'stopped' | 'uploading'} Phase */

function statusForPhase(phase) {
  switch (phase) {
    case 'recording':
      return 'Recording';
    case 'processing':
      return 'Processing';
    case 'uploading':
      return 'Uploading';
    case 'stopped':
      return 'Session ready';
    case 'idle':
    default:
      return 'Idle';
  }
}

export default function RecorderScreen() {
  const cameraRef = useRef(null);
  const recordingRef = useRef(null);
  const gpsLogRef = useRef([]);
  const recordingStartMsRef = useRef(0);

  /** @type {[Phase, function]} */
  const [phase, setPhase] = useState('idle');
  const [cameraReady, setCameraReady] = useState(false);
  /** Camera + location required. Video has no audio (no microphone permission). */
  const [corePermsOk, setCorePermsOk] = useState(false);
  const [permHint, setPermHint] = useState('');
  const [pendingZipUri, setPendingZipUri] = useState(null);
  const [detailMessage, setDetailMessage] = useState('');
  const [uploadHost, setUploadHost] = useState('');
  const [uploadPort, setUploadPort] = useState(String(UploadService.DEFAULT_UPLOAD_PORT));
  const permRequestInFlight = useRef(false);

  const requestAllPermissions = useCallback(async () => {
    if (permRequestInFlight.current) {
      return;
    }
    permRequestInFlight.current = true;
    setDetailMessage('');

    try {
      const cam = await CameraService.requestPermissions();
      const loc = await LocationService.requestPermissions();
      const coreOk = cam.camera && loc.granted;
      setCorePermsOk(coreOk);

      const blocking = [];
      if (!cam.camera) blocking.push('camera');
      if (!loc.granted) blocking.push('location');
      if (blocking.length) {
        const hint = `Allow ${blocking.join(' and ')}. Expo Go → Settings → Expo Go.`;
        setPermHint(hint);
        console.warn('[RecorderScreen]', hint);
      } else {
        setPermHint('');
      }
    } catch (e) {
      console.error('[RecorderScreen] Permission request failed', e);
      const msg = e?.message ? String(e.message) : String(e);
      setPermHint(`Permission error: ${msg}. Try Open Settings.`);
      setCorePermsOk(false);
    } finally {
      permRequestInFlight.current = false;
    }
  }, []);

  const openAppSettings = useCallback(() => {
    Linking.openSettings().catch((e) => console.error('[RecorderScreen] openSettings', e));
  }, []);

  useEffect(() => {
    requestAllPermissions();
  }, [requestAllPermissions]);

  useEffect(() => {
    if (!corePermsOk) {
      setCameraReady(false);
    }
  }, [corePermsOk]);

  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (next === 'active' && prev !== 'active') {
        requestAllPermissions();
      }
    });
    return () => sub.remove();
  }, [requestAllPermissions]);

  const startRecording = useCallback(async () => {
    if (phase !== 'idle') {
      return;
    }
    if (!corePermsOk || !cameraReady) {
      console.warn('[RecorderScreen] Cannot start: permissions or camera not ready');
      return;
    }

    setDetailMessage('');
    gpsLogRef.current = [];
    recordingStartMsRef.current = Date.now();

    try {
      await LocationService.startTracking((point) => {
        gpsLogRef.current.push(point);
      });
      console.log('[RecorderScreen] GPS ready, points so far:', gpsLogRef.current.length);
    } catch (e) {
      console.warn('[RecorderScreen] GPS start failed, video will still record', e);
    }

    try {
      const handle = await CameraService.beginRecording(cameraRef);
      recordingRef.current = handle;
      setPhase('recording');
    } catch (e) {
      LocationService.stopTracking();
      console.error('[RecorderScreen] Start recording failed', e);
      setDetailMessage('Camera failed to start recording');
    }
  }, [phase, corePermsOk, cameraReady]);

  const stopRecording = useCallback(async () => {
    if (phase !== 'recording' || !recordingRef.current) {
      return;
    }

    setPhase('processing');
    LocationService.stopTracking();

    const endTime = Date.now();
    const startTime = recordingStartMsRef.current;

    const handle = recordingRef.current;
    recordingRef.current = null;
    handle.stop();

    let videoUri;
    try {
      videoUri = await handle.finished;
    } catch (e) {
      console.error('[RecorderScreen] Recording finish error', e);
      setPhase('idle');
      setDetailMessage('Camera recording failed');
      return;
    }

    if (!videoUri) {
      setPhase('idle');
      setDetailMessage('No video file produced');
      return;
    }

    try {
      const { zipUri } = await FileService.saveSessionAndZip({
        videoUri,
        gpsLog: gpsLogRef.current,
        startTime,
        endTime,
      });
      setPendingZipUri(zipUri);
      setPhase('stopped');
    } catch (e) {
      console.error('[RecorderScreen] Save session failed', e);
      setPhase('idle');
      setDetailMessage('Failed to save session');
    }
  }, [phase]);

  const uploadSession = useCallback(async () => {
    if (!pendingZipUri || phase === 'uploading' || phase === 'recording') {
      return;
    }

    const host = uploadHost.trim();
    if (!host) {
      setDetailMessage('Enter your Mac’s Wi‑Fi IP (see hint below). 192.168.1.100 is usually wrong.');
      return;
    }

    setPhase('uploading');
    setDetailMessage('');
    try {
      const port = parseInt(uploadPort, 10) || UploadService.DEFAULT_UPLOAD_PORT;
      await UploadService.uploadSessionZip(pendingZipUri, host, port);
      setPendingZipUri(null);
      setPhase('idle');
      setDetailMessage('');
    } catch (e) {
      console.error('[RecorderScreen] Upload failed', e);
      setPhase('stopped');
      setDetailMessage(e?.message ? String(e.message) : 'Upload failed');
    }
  }, [pendingZipUri, phase, uploadHost, uploadPort]);

  const onCameraMountError = useCallback((e) => {
    console.error('[RecorderScreen] Camera mount error', e);
    setDetailMessage('Camera error');
  }, []);

  const statusLine = statusForPhase(phase);
  const startEnabled = phase === 'idle' && corePermsOk && cameraReady;
  const stopEnabled = phase === 'recording';
  const uploadEnabled = phase === 'stopped' && !!pendingZipUri && phase !== 'uploading';

  return (
    <View style={styles.root}>
      <View style={styles.preview}>
        {corePermsOk ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="video"
            mute
            onCameraReady={() => setCameraReady(true)}
            onMountError={onCameraMountError}
          />
        ) : (
          <View style={styles.placeholderWrap}>
            <Text style={styles.placeholder}>
              Camera and location need permission to work.
            </Text>
            <Text style={styles.placeholderSub}>
              Use “Ask again” first, or “Open Settings” and enable Camera and Location for Expo Go.
              Video is recorded without audio.
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.status}>Status: {statusLine}</Text>
      {!corePermsOk ? (
        <View style={styles.permActions}>
          <Button title="Ask again" onPress={requestAllPermissions} />
          <View style={styles.rowTight} />
          <Button title="Open Settings" onPress={openAppSettings} />
        </View>
      ) : null}
      {permHint ? <Text style={styles.hint}>{permHint}</Text> : null}
      {detailMessage ? <Text style={styles.hint}>{detailMessage}</Text> : null}

      {corePermsOk ? (
        <View style={styles.uploadConfig}>
          <Text style={styles.label}>Upload: Mac IP + port (same Wi‑Fi as phone)</Text>
          <Text style={styles.uploadHint}>
            On your Mac, Terminal: ipconfig getifaddr en0 — type that IP here (192.168.1.100 is only an
            example). In Safari on the phone, open http://YOUR_IP:5001/health to verify the network.
          </Text>
          <TextInput
            style={styles.input}
            value={uploadHost}
            onChangeText={setUploadHost}
            placeholder="Mac Wi‑Fi IP from ipconfig getifaddr en0"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
          <TextInput
            style={styles.inputPort}
            value={uploadPort}
            onChangeText={setUploadPort}
            placeholder="5001"
            autoCapitalize="none"
            keyboardType="number-pad"
          />
        </View>
      ) : null}

      <View style={styles.row}>
        <Button title="Start Recording" onPress={startRecording} disabled={!startEnabled} />
      </View>
      <View style={styles.row}>
        <Button title="Stop Recording" onPress={stopRecording} disabled={!stopEnabled} />
      </View>
      <View style={styles.row}>
        <Button title="Upload Session" onPress={uploadSession} disabled={!uploadEnabled} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 48, paddingHorizontal: 12 },
  preview: {
    height: 220,
    backgroundColor: '#222',
    marginBottom: 12,
    overflow: 'hidden',
  },
  placeholderWrap: { paddingHorizontal: 12, paddingTop: 24, gap: 8 },
  placeholder: { color: '#fff', textAlign: 'center', fontSize: 15 },
  placeholderSub: { color: '#ccc', textAlign: 'center', fontSize: 12, lineHeight: 18 },
  permActions: { marginBottom: 10 },
  rowTight: { height: 6 },
  status: { marginBottom: 8 },
  hint: { color: '#333', marginBottom: 8, fontSize: 13 },
  uploadConfig: { marginBottom: 10 },
  label: { fontSize: 12, marginBottom: 4, color: '#444' },
  uploadHint: { fontSize: 11, color: '#666', marginBottom: 8, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 6,
    borderRadius: 4,
  },
  inputPort: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 4,
    borderRadius: 4,
    maxWidth: 120,
  },
  row: { marginBottom: 8 },
});
