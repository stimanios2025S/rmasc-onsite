'use client';
import { useEffect, useRef, useState } from 'react';
import { Navigation, Loader2 } from 'lucide-react';

interface Props {
  chantierLat: number;
  chantierLng: number;
  rayon: number;
  nomChantier: string;
}

export default function TechnicianMap({ chantierLat, chantierLng, rayon, nomChantier }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [chantierLat, chantierLng],
        zoom: 15,
        zoomControl: true,
      });
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      // Marqueur chantier
      const chantierIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          width: 24px; height: 24px; border-radius: 50%;
          background: #3B4BB9; border: 4px solid white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([chantierLat, chantierLng], { icon: chantierIcon })
        .addTo(map)
        .bindPopup(`<strong style="font-family:sans-serif;font-size:13px">📍 ${nomChantier}</strong>`)
        .openPopup();

      // Cercle géofencing
      L.circle([chantierLat, chantierLng], {
        radius: rayon,
        color: '#3B4BB9',
        fillColor: '#3B4BB9',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '5,5',
      }).addTo(map);
    };

    initMap();
    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [chantierLat, chantierLng, rayon, nomChantier]);

  // Localiser le technicien
  const localiser = () => {
    if (typeof navigator === 'undefined') return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(p);
        setLocating(false);

        const L = (await import('leaflet')).default;
        const map = mapInstanceRef.current;
        if (!map) return;

        // Supprimer l'ancien marqueur utilisateur
        map.eachLayer((layer: any) => {
          if (layer.options?.userMarker) map.removeLayer(layer);
        });

        const userIcon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            width: 20px; height: 20px; border-radius: 50%;
            background: #FF5252; border: 3px solid white;
            box-shadow: 0 0 0 4px rgba(255,82,82,0.3);
          "></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const userMarker = L.marker([p.lat, p.lng], { icon: userIcon });
        (userMarker as any).options.userMarker = true;
        userMarker.addTo(map)
          .bindPopup('<strong style="font-family:sans-serif;font-size:12px">📍 Votre position</strong>');

        map.setView([p.lat, p.lng], 16);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="relative rounded-3xl overflow-hidden border border-stone-100 shadow-sm" style={{ height: 260 }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
      <button
        onClick={localiser}
        className="absolute bottom-3 right-3 z-[1000] bg-white text-indigo-600 w-10 h-10 rounded-full shadow-md flex items-center justify-center hover:bg-indigo-50 transition-all"
        title="Ma position"
      >
        {locating ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={18} />}
      </button>
      <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl px-3 py-1.5 shadow-sm text-[10px] font-medium text-stone-600">
        📍 {nomChantier}
      </div>
    </div>
  );
}
