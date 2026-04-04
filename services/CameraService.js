import { Camera } from 'react-native-vision-camera';

/**
 * Vision Camera (no microphone). Video is recorded with `audio={false}` on `<Camera />`.
 * @returns {{ granted: boolean, camera: boolean }}
 */
export async function requestPermissions() {
  let cameraOk = false;

  try {
    const result = await Camera.requestCameraPermission();
    cameraOk = result === 'granted';
  } catch (e) {
    console.error('[CameraService] Camera permission error', e);
  }

  return {
    granted: cameraOk,
    camera: cameraOk,
  };
}

/**
 * @param {import('react').RefObject<import('react-native-vision-camera').Camera | null>} cameraRef
 * @returns {Promise<{ stop: () => void, finished: Promise<string | null> }>}
 */
export async function beginRecording(cameraRef) {
  const cam = cameraRef?.current;
  if (!cam) {
    console.error('[CameraService] No camera ref');
    throw new Error('Camera is not ready');
  }

  /** @type {((v: string | null) => void) | null} */
  let resolvePath = null;
  /** @type {((e: Error) => void) | null} */
  let rejectErr = null;

  const finished = new Promise((resolve, reject) => {
    resolvePath = resolve;
    rejectErr = reject;
  });

  try {
    cam.startRecording({
      flash: 'off',
      fileType: 'mp4',
      onRecordingFinished: (video) => {
        const p = video?.path;
        if (!p) {
          resolvePath?.(null);
          return;
        }
        const uri = p.startsWith('file://') ? p : `file://${p}`;
        resolvePath?.(uri);
      },
      onRecordingError: (err) => {
        rejectErr?.(err instanceof Error ? err : new Error(String(err)));
      },
    });
  } catch (e) {
    rejectErr?.(e instanceof Error ? e : new Error(String(e)));
  }

  return {
    stop: () => {
      cam.stopRecording().catch((e) => console.error('[CameraService] stopRecording', e));
    },
    finished,
  };
}
