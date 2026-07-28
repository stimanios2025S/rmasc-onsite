'use client';
import { useEffect, useRef } from 'react';
import type { Chantier } from '@/types';

const COULEUR_PIN: Record<string, string> = {
  en_cours: '#20C997',
  bloque: '#FF5252',
  en_attente: '#3B4BB9',
  termine: '#A8AEC5',
  reception_officielle: '#20C997',
};

interface Props {
  chantiers: Chantier[];
  chantierSelectionne: Chantier | null;
  onSelectionner: (c: Chantier) => void;
}

export default function MapView({ chantiers, chantierSelectionne, onSelectionner }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      const L = (await import('leaflet')).default;

      if (!mapRef.current) return;
      mapInstanceRef.current = L.map(mapRef.current, {
        center: [45.75, 4.85],
        zoom: 8,
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
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || typeof window === 'undefined') return;

    const L = (window as any).L || (require('leaflet') as any);
    if (!L) return;

    const map = mapInstanceRef.current;
    const markers: any[] = [];

    // Clear existing markers
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    chantiers.forEach((c) => {
      const couleur = COULEUR_PIN[c.statut] ?? '#A8AEC5';

      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          width: 20px; height: 20px; border-radius: 50%;
          background: ${couleur}; border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          ${c.statut === 'bloque' ? 'animation: pulse-alert 1.5s infinite;' : ''}
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const marker = L.marker([c.coordonnees.lat, c.coordonnees.lng], { icon })
        .addTo(map)
        .on('click', () => onSelectionner(c));

      markers.push(marker);
    });

    if (chantierSelectionne) {
      map.setView([chantierSelectionne.coordonnees.lat, chantierSelectionne.coordonnees.lng], 12, { animate: true });
    } else if (chantiers.length > 0) {
      const bounds = L.latLngBounds(chantiers.map(c => [c.coordonnees.lat, c.coordonnees.lng]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [chantiers, chantierSelectionne, onSelectionner]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#E5E8F0]" style={{ height: 500, minHeight: 400 }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

      {/* Légende */}
      <div className="absolute top-4 left-4 z-[1000] bg-white/95 rounded-xl p-3 shadow-md text-xs space-y-1.5">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#20C997]" /> Travaux en cours</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#FF5252]" /> Bloque / Alerte</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#3B4BB9]" /> Phase en attente</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#A8AEC5]" /> Termine</div>
      </div>
    </div>
  );
}
