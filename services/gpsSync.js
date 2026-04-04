/**
 * Port of server/inference/gps_sync.py for JS.
 * @param {number} tsMs
 * @param {Array<{ timestamp: number, latitude: number, longitude: number }>} points
 * @returns {{ latitude: number, longitude: number } | null}
 */
export function latLonAtTimestamp(tsMs, points) {
  if (!points?.length) {
    return null;
  }

  const pts = [...points].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const t = Number(tsMs);

  if (t <= Number(pts[0].timestamp)) {
    return { latitude: Number(pts[0].latitude), longitude: Number(pts[0].longitude) };
  }
  if (t >= Number(pts[pts.length - 1].timestamp)) {
    const last = pts[pts.length - 1];
    return { latitude: Number(last.latitude), longitude: Number(last.longitude) };
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = Number(pts[i].timestamp);
    const t1 = Number(pts[i + 1].timestamp);
    if (t0 <= t && t <= t1) {
      const denom = t1 - t0;
      const a = denom === 0 ? 0 : (t - t0) / denom;
      const lat =
        Number(pts[i].latitude) + a * (Number(pts[i + 1].latitude) - Number(pts[i].latitude));
      const lon =
        Number(pts[i].longitude) + a * (Number(pts[i + 1].longitude) - Number(pts[i].longitude));
      return { latitude: lat, longitude: lon };
    }
  }

  const last = pts[pts.length - 1];
  return { latitude: Number(last.latitude), longitude: Number(last.longitude) };
}

/**
 * @param {number} longitude
 * @param {number} latitude
 */
export function formatPotholeId(longitude, latitude) {
  const enc = (v) =>
    v.toFixed(6).replace(/-/g, 'm').replace(/\./g, 'p');
  return `potholeid_${enc(longitude)}_${enc(latitude)}`;
}
