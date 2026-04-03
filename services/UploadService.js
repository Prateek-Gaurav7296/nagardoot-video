import * as FileSystem from 'expo-file-system/legacy';

/**
 * Set your laptop's LAN IP (same Wi‑Fi as the phone).
 * Default port 5001 — macOS often uses 5000 for AirPlay Receiver.
 * Upload endpoint: http://<LAPTOP_IP>:<PORT>/upload
 */
export const DEFAULT_UPLOAD_HOST = '192.168.1.100';
export const DEFAULT_UPLOAD_PORT = 5001;

export function getUploadUrl(host = DEFAULT_UPLOAD_HOST, port = DEFAULT_UPLOAD_PORT) {
  const p = typeof port === 'number' ? port : parseInt(String(port), 10) || DEFAULT_UPLOAD_PORT;
  return `http://${host.trim()}:${p}/upload`;
}

/**
 * Uses native multipart upload (reliable for file:// on iOS/Android).
 * fetch()+FormData often drops the file body for local URIs in RN.
 *
 * @param {string} zipUri file:// URI from expo-file-system
 * @param {string} [host]
 * @param {number} [port]
 * @returns {Promise<FileSystem.FileSystemUploadResult>}
 */
export async function uploadSessionZip(
  zipUri,
  host = DEFAULT_UPLOAD_HOST,
  port = DEFAULT_UPLOAD_PORT
) {
  const url = getUploadUrl(host, port);

  const info = await FileSystem.getInfoAsync(zipUri);
  if (!info.exists) {
    throw new Error('Zip file not found on device');
  }

  console.log('[UploadService] uploadAsync', url, 'bytes', info.size);

  let result;
  try {
    result = await FileSystem.uploadAsync(url, zipUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'application/zip',
    });
  } catch (e) {
    console.error('[UploadService] uploadAsync error', e);
    throw new Error(
      e?.message ||
        'Upload failed — check Mac IP, port 5001, same Wi‑Fi, firewall allows Python'
    );
  }

  console.log('[UploadService] response', result.status, result.body?.slice(0, 200));

  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `Upload failed: HTTP ${result.status} ${(result.body || '').slice(0, 160)}`
    );
  }

  return result;
}
