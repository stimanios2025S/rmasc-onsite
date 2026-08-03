'use client';
import { useEffect, useRef } from 'react';
import type { ChantierData } from '@/lib/api';

const COULEUR_PIN: Record<string, string> = {
  en_cours: '#20C997',
  bloque: '#FF5252',
  planifie: '#3B4BB9',
  en_attente: '#FF9800',
  termine: '#A8AEC5',
  reception_officielle: '#20C997',
};

export default function MapView({ chantiers }: { chantiers: ChantierData[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapRef.current) return;

      mapInstanceRef.current = L.map(mapRef.current, {
        center: [36.75, 3.05],
        zoom: 6,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);

      L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);
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

  useEffect(() => {
    if (!mapInstanceRef.current || typeof window === 'undefined') return;

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default;
      const map = mapInstanceRef.current;
      if (!map) return;

      map.eachLayer((layer: any) => {
        if (layer instanceof L.Marker) map.removeLayer(layer);
      });

      const markers: any[] = [];
      chantiers.forEach((c) => {
        if (!c.lat || !c.lng) return;
        const couleur = COULEUR_PIN[c.statut] || '#A8AEC5';

        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            width: 18px; height: 18px; border-radius: 50%;
            background: ${couleur}; border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            ${c.statut === 'bloque' ? 'animation: pulse-alert 1.5s infinite;' : ''}
          "></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });

        const marker = L.marker([c.lat, c.lng], { icon })
          .addTo(map)
          .bindPopup(`<div style="font-family:sans-serif;font-size:12px;min-width:150px">
            <strong>${c.nom}</strong><br/>
            <span style="color:#888">${c.ref}</span><br/>
            <span style="color:#3B4BB9">${c.client_nom || '—'}</span><br/>
            ${c.en_cours > 0 ? `<span style="color:#20C997;font-weight:bold">🔄 ${c.en_cours} mission</span>` : ''}
          </div>`);

        markers.push(marker);
      });

      if (markers.length > 0) {
        const bounds = L.latLngBounds(markers.map((m: any) => m.getLatLng()));
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
      }
    };

    updateMarkers();
  }, [chantiers]);

  return (
    <div className="relative rounded-3xl overflow-hidden border border-stone-100 shadow-sm" style={{ height: 420 }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
      <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-md text-xs space-y-1.5">
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#20C997]" /> En cours</div>
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#FF5252]" /> Bloqué</div>
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#3B4BB9]" /> Planifié</div>
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#A8AEC5]" /> Terminé</div>
      </div>
    </div>
  );
}
