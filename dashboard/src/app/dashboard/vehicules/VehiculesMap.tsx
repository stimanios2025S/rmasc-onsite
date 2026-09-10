'use client';
import { useEffect, useRef } from 'react';
import type { VehiculeData } from '@/lib/api';

// Carte OSM gratuite : tous les véhicules localisés (voiture = bleu, en mission = indigo)
export default function VehiculesMap({ vehicules }: { vehicules: VehiculeData[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !ref.current) return;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      const map = L.map(ref.current, { scrollWheelZoom: true }).setView([36.75, 3.06], 6);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      const pts = vehicules.filter(v => v.latitude != null && v.longitude != null);
      for (const v of pts) {
        const couleur = v.statut === 'EN_MISSION' ? '#6366f1' : v.statut === 'EN_PANNE' ? '#f43f5e' : '#10b981';
        const icone = L.divIcon({
          className: '',
          html: `<div style="background:${couleur};color:#fff;border:2px solid #fff;border-radius:9999px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.3)">🚗</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15],
        });
        L.marker([v.latitude as number, v.longitude as number], { icon: icone }).addTo(map)
          .bindPopup(`<b>${v.nom}</b><br/>${v.immatriculation || ''}<br/>${v.equipe_nom ? '👷 ' + v.equipe_nom + '<br/>' : ''}${v.vitesse_kmh != null ? v.vitesse_kmh + ' km/h<br/>' : ''}${v.date_position || ''}`);
      }
      if (pts.length > 0) {
        const b = L.latLngBounds(pts.map(v => [v.latitude as number, v.longitude as number] as [number, number]));
        map.fitBounds(b.pad(0.3));
      }
      mapRef.current = map;
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [vehicules]);

  return <div ref={ref} className="w-full" style={{ height: '320px', zIndex: 0 }} />;
}
