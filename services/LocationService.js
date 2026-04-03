import * as Location from 'expo-location';
import { Platform } from 'react-native';

let watchSubscription = null;

/**
 * @returns {{ granted: boolean }}
 */
export async function requestPermissions() {
  try {
    const result = await Location.requestForegroundPermissionsAsync();
    const status = result?.status;
    const granted = status === 'granted';
    if (!granted) {
      console.warn('[LocationService] Foreground location permission denied', status);
    }
    return { granted };
  } catch (e) {
    console.error('[LocationService] Location permission error', e);
    return { granted: false };
  }
}

function pushSample(onSample, pos) {
  if (!pos?.coords) {
    return;
  }
  onSample({
    timestamp: typeof pos.timestamp === 'number' ? pos.timestamp : Date.now(),
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  });
}

/**
 * Await this before starting video so the first GPS rows exist and watch is active.
 * @param {(point: { timestamp: number, latitude: number, longitude: number }) => void} onSample
 */
export async function startTracking(onSample) {
  stopTracking();

  if (Platform.OS === 'android') {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      /* optional */
    }
  }

  try {
    const last = await Location.getLastKnownPositionAsync({
      maxAge: 24 * 60 * 60 * 1000,
    });
    if (last) {
      pushSample(onSample, last);
    }
  } catch (e) {
    console.warn('[LocationService] getLastKnownPositionAsync', e?.message || e);
  }

  for (const accuracy of [Location.Accuracy.Low, Location.Accuracy.Balanced]) {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy,
        mayShowUserSettingsDialog: true,
      });
      pushSample(onSample, pos);
      break;
    } catch (e) {
      console.warn('[LocationService] getCurrentPositionAsync', accuracy, e?.message || e);
    }
  }

  watchSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 1000,
    },
    (loc) => pushSample(onSample, loc),
    (err) => console.error('[LocationService] watchPositionAsync', err)
  );
}

export function stopTracking() {
  if (watchSubscription != null) {
    watchSubscription.remove();
    watchSubscription = null;
  }
}
