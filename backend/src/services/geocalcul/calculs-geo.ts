const RAYON_TERRE_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceHaversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return RAYON_TERRE_KM * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 1000;
}

export function validerCoordonnees(lat: number, lng: number): void {
  if (lat < -90 || lat > 90) throw new Error(`Latitude invalide : ${lat}`);
  if (lng < -180 || lng > 180) throw new Error(`Longitude invalide : ${lng}`);
}
