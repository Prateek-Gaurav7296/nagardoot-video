import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';

/**
 * @param {{ videoUri: string, gpsLog: Array<{ timestamp: number, latitude: number, longitude: number }>, startTime: number, endTime: number }} session
 * @returns {Promise<{ sessionDir: string, zipUri: string, sessionId: number }>}
 */
export async function saveSessionAndZip(session) {
  const { videoUri, gpsLog, startTime, endTime } = session;
  const base = FileSystem.documentDirectory;
  if (!base) {
    console.error('[FileService] documentDirectory is null');
    throw new Error('Storage is not available');
  }

  const sessionId = endTime;
  const sessionDir = `${base}session_${sessionId}/`;
  const videoDest = `${sessionDir}video.mp4`;
  const gpsPath = `${sessionDir}gps_log.json`;
  const metaPath = `${sessionDir}metadata.json`;

  await FileSystem.makeDirectoryAsync(sessionDir, { intermediates: true });

  try {
    await FileSystem.copyAsync({ from: videoUri, to: videoDest });
  } catch (e) {
    console.error('[FileService] Failed to copy video', e);
    throw e;
  }

  const metadata = {
    start_time: startTime,
    end_time: endTime,
    duration: endTime - startTime,
  };

  try {
    console.log('[FileService] writing gps_log.json with', gpsLog?.length ?? 0, 'points');
    await FileSystem.writeAsStringAsync(
      gpsPath,
      JSON.stringify(gpsLog, null, 2),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
    await FileSystem.writeAsStringAsync(
      metaPath,
      JSON.stringify(metadata, null, 2),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
  } catch (e) {
    console.error('[FileService] Failed to write JSON', e);
    throw e;
  }

  const zipUri = `${base}session_${sessionId}.zip`;
  try {
    await buildZip(sessionDir, zipUri);
  } catch (e) {
    console.error('[FileService] Zip failed', e);
    throw e;
  }

  return { sessionDir, zipUri, sessionId };
}

/**
 * @param {string} sessionDirUri
 * @param {string} zipUri
 */
async function buildZip(sessionDirUri, zipUri) {
  const zip = new JSZip();

  const videoB64 = await FileSystem.readAsStringAsync(
    `${sessionDirUri}video.mp4`,
    { encoding: FileSystem.EncodingType.Base64 }
  );
  zip.file('video.mp4', videoB64, { base64: true });

  const gpsText = await FileSystem.readAsStringAsync(`${sessionDirUri}gps_log.json`, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  zip.file('gps_log.json', gpsText);

  const metaText = await FileSystem.readAsStringAsync(`${sessionDirUri}metadata.json`, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  zip.file('metadata.json', metaText);

  const zipBase64 = await zip.generateAsync({ type: 'base64' });
  await FileSystem.writeAsStringAsync(zipUri, zipBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}
