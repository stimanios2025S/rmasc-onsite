'use client';
import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface Props {
  onPositionChange: (lat: number, lng: number) => void;
  initialLat?: number;
  initialLng?: number;
}

export default function MapPicker({ onPositionChange, initialLat = 36.75, initialLng = 3.05 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [position, setPosition] = useState({ lat: initialLat, lng: initialLng });
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [initialLat, initialLng],
        zoom: 12,
        zoomControl: true,
      });
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      // Marqueur initial
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          width: 24px; height: 24px; border-radius: 50%;
          background: #FF5252; border: 4px solid white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      markerRef.current = L.marker([initialLat, initialLng], { icon, draggable: true }).addTo(map);

      // Clic sur la carte → déplacer le marqueur
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        markerRef.current.setLatLng([lat, lng]);
        setPosition({ lat, lng });
        onPositionChange(lat, lng);
      });

      // Drag du marqueur
      markerRef.current.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        setPosition({ lat, lng });
        onPositionChange(lat, lng);
      });

      // Utiliser ma position
      map.on('locationfound', (e: any) => {
        const { lat, lng } = e.latlng;
        markerRef.current.setLatLng([lat, lng]);
        setPosition({ lat, lng });
        onPositionChange(lat, lng);
        map.setView([lat, lng], 15);
      });
    };

    initMap();
    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const utiliserMaPosition = () => {
    if (typeof navigator === 'undefined') return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setPosition({ lat: latitude, lng: longitude });
        onPositionChange(latitude, longitude);
        const L = (await import('leaflet')).default;
        const map = mapInstanceRef.current;
        if (map && markerRef.current) {
          markerRef.current.setLatLng([latitude, longitude]);
          map.setView([latitude, longitude], 15);
        }
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-2xl overflow-hidden border border-stone-200" style={{ height: 250 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm text-[10px] font-medium text-stone-600">
          <MapPin size={12} className="inline mr-1 text-rose-500" />
          Cliquez sur la carte pour positionner le chantier
        </div>
      </div>
      <div className="flex items-center justify-between bg-stone-50 rounded-xl px-4 py-3 border border-stone-100">
        <div className="text-xs font-mono text-stone-600">
          📍 {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
        </div>
        <button onClick={utiliserMaPosition} className="text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all">
          {locating ? <Loader2 size={14} className="animate-spin inline" /> : '📍 Ma position'}
        </button>
      </div>
    </div>
  );
}
