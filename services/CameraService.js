import { Camera } from 'expo-camera';

/**
 * Camera only (no microphone). Video is recorded without audio via `mute` on `CameraView`.
 * @returns {{ granted: boolean, camera: boolean }}
 */
export async function requestPermissions() {
  let cameraOk = false;

  try {
    const camera = await Camera.requestCameraPermissionsAsync();
    cameraOk = camera?.status === 'granted';
  } catch (e) {
    console.error('[CameraService] Camera permission error', e);
  }

  return {
    granted: cameraOk,
    camera: cameraOk,
  };
}

/**
 * @param {import('react').RefObject<import('expo-camera').CameraView | null>} cameraRef
 * @returns {Promise<{ stop: () => void, finished: Promise<string | null> }>}
 */
export async function beginRecording(cameraRef) {
  const ref = cameraRef?.current;
  if (!ref) {
    console.error('[CameraService] No camera ref');
    throw new Error('Camera is not ready');
  }

  const recordingPromise = ref.recordAsync();

  return {
    stop: () => {
      try {
        ref.stopRecording();
      } catch (e) {
        console.error('[CameraService] stopRecording failed', e);
      }
    },
    finished: (async () => {
      try {
        const result = await recordingPromise;
        const uri = result?.uri ?? null;
        if (!uri) {
          console.error('[CameraService] Recording finished without uri');
        }
        return uri;
      } catch (e) {
        console.error('[CameraService] Recording failed', e);
        throw e;
      }
    })(),
  };
}
