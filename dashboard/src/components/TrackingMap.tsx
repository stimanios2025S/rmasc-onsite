'use client';
import React, { useEffect, useRef, useState } from 'react';
import type { ChantierData } from '@/lib/api';
import type { TeamPosition } from '@/components/MapView';

interface Props {
  chantier: ChantierData;
  positions: TeamPosition[];
}

const TEAM_COLORS: Record<string, string> = {
  mecanique: '#f59e0b',
  electrique: '#3b82f6',
  mixte: '#8b5cf6',
};

export default function TrackingMap({ chantier, positions }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const chantierMarkerRef = useRef<any>(null);
  const teamMarkersRef = useRef<any[]>([]);
  const trailsRef = useRef<any[]>([]);

  // Initialize map
  useEffect(() => {
    if (mapReady || !mapRef.current) return;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
        document.head.appendChild(link);
      }
      if (!mapRef.current) return;

      const center: [number, number] = chantier.lat && chantier.lng
        ? [chantier.lat, chantier.lng]
        : [36.75, 3.06];

      const map = L.map(mapRef.current, {
        center,
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap © CARTO',
      }).addTo(map);

      instanceRef.current = map;
      setMapReady(true);
    })();
  }, []);

  // Update chantier marker
  useEffect(() => {
    if (!mapReady || !instanceRef.current || !chantier.lat || !chantier.lng) return;
    const L = (window as any).L;
    if (!L) return;
    const map = instanceRef.current;

    // Remove old marker
    if (chantierMarkerRef.current) map.removeLayer(chantierMarkerRef.current);

    const icon = L.divIcon({
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -38],
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(99,102,241,0.4);border:3px solid white">
          <span style="font-size:16px">🏗️</span>
        </div>
        <div style="position:absolute;bottom:-4px;width:12px;height:12px;background:#6366f1;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2)"></div>
      </div>`,
    });

    const marker = L.marker([chantier.lat, chantier.lng], { icon })
      .addTo(map)
      .bindPopup(`<div style="padding:8px 12px;font-family:sans-serif"><b>${chantier.nom}</b><br/><span style="color:#666;font-size:12px">${chantier.client_nom || ''}</span></div>`, { maxWidth: 250 });

    chantierMarkerRef.current = marker;
    map.setView([chantier.lat, chantier.lng], 14);
  }, [mapReady, chantier]);

  // Update team position markers + trails
  useEffect(() => {
    if (!mapReady || !instanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = instanceRef.current;

    // Clear old
    teamMarkersRef.current.forEach(m => map.removeLayer(m));
    trailsRef.current.forEach(l => map.removeLayer(l));
    teamMarkersRef.current = [];
    trailsRef.current = [];

    if (!positions || positions.length === 0) return;

    const bounds = L.latLngBounds([]);
    if (chantier.lat && chantier.lng) bounds.extend([chantier.lat, chantier.lng]);

    positions.forEach(tp => {
      if (!tp.latitude || !tp.longitude) return;
      const color = TEAM_COLORS[tp.equipe_type] || '#6b7280';
      const isEnRoute = tp.mission_statut === 'en_route';
      const isPaused = tp.mission_statut === 'en_pause';
      const isBloque = tp.mission_statut === 'bloque';

      const pulseAnim = isEnRoute
        ? 'animation: teamPulse 1.5s infinite;'
        : isPaused
        ? 'animation: teamPulse 3s infinite;'
        : isBloque
        ? 'animation: none;'
        : 'animation: teamPulse 2s infinite;';

      const statusEmoji = isEnRoute ? '🚗' : isPaused ? '☕' : isBloque ? '🚫' : '🏗️';

      const icon = L.divIcon({
        className: '',
        iconSize: [40, 50],
        iconAnchor: [20, 50],
        popupAnchor: [0, -52],
        html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
          <div style="background:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;color:${color};box-shadow:0 2px 8px rgba(0,0,0,0.15);white-space:nowrap;margin-bottom:2px;font-family:sans-serif">
            ${statusEmoji} ${tp.equipe_nom}
          </div>
          <div style="position:relative">
            <div style="width:28px;height:28px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px ${color}66;border:3px solid white;${pulseAnim}">
              <span style="font-size:12px;color:white;font-weight:700">${tp.equipe_type === 'electrique' ? '⚡' : tp.equipe_type === 'mecanique' ? '🔧' : '🛡️'}</span>
            </div>
            <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:8px;height:8px;background:${color};border-radius:50%;opacity:0.5;filter:blur(2px)"></div>
          </div>
        </div>`,
      });

      const timeSince = Math.round((Date.now() - new Date(tp.last_update).getTime()) / 60000);
      const batteryIcon = tp.batterie_pct !== null ? (tp.batterie_pct > 50 ? '🔋' : tp.batterie_pct > 20 ? '🪫' : '🔴') : '';

      const popup = `<div style="font-family:sans-serif;padding:0;min-width:200px">
        <div style="background:${color};color:white;padding:12px 16px;border-radius:12px 12px 0 0">
          <div style="font-size:14px;font-weight:700">${tp.equipe_nom}</div>
          <div style="font-size:11px;opacity:0.8">${tp.equipe_type} · ${statusEmoji} ${isEnRoute ? 'En route' : isPaused ? 'En pause' : isBloque ? 'Bloqué' : 'En travail'}</div>
        </div>
        <div style="padding:12px 16px">
          ${tp.destination ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span style="color:#666">📍 Destination</span><span style="font-weight:600">${tp.destination}</span></div>` : ''}
          ${tp.distance_destination_m ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span style="color:#666">📐 Distance</span><span style="font-weight:600">${tp.distance_destination_m}m</span></div>` : ''}
          ${tp.vitesse_kmh ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span style="color:#666">🚗 Vitesse</span><span style="font-weight:600">${tp.vitesse_kmh} km/h</span></div>` : ''}
          ${tp.batterie_pct !== null ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span style="color:#666">${batteryIcon} Batterie</span><span style="font-weight:600">${tp.batterie_pct}%</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span style="color:#666">🕐 Dernière MAJ</span><span style="font-weight:600">${timeSince < 1 ? "À l'instant" : `Il y a ${timeSince} min`}</span></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            ${chantier.lat && chantier.lng && tp.latitude && tp.longitude ? `
              <a href="https://www.google.com/maps/dir/?api=1&origin=${tp.latitude},${tp.longitude}&destination=${chantier.lat},${chantier.lng}" target="_blank" rel="noopener noreferrer"
                style="flex:1;text-align:center;padding:8px;background:${color};color:white;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">
                🧭 Itinéraire vers le chantier
              </a>
            ` : ''}
          </div>
        </div>
      </div>`;

      const marker = L.marker([tp.latitude, tp.longitude], { icon })
        .addTo(map)
        .bindPopup(popup, { className: 'map-popup-wrap', maxWidth: 300, minWidth: 240 });

      teamMarkersRef.current.push(marker);
      bounds.extend([tp.latitude, tp.longitude]);

      // Draw trail from worker to chantier when en route
      if (isEnRoute && chantier.lat && chantier.lng) {
        const trail = L.polyline(
          [[tp.latitude, tp.longitude], [chantier.lat, chantier.lng]],
          { color, weight: 3, opacity: 0.5, dashArray: '10,6' }
        ).addTo(map);
        trailsRef.current.push(trail);
      }
    });

    if (teamMarkersRef.current.length > 0) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  }, [positions, mapReady, chantier]);

  // Resize handler
  useEffect(() => {
    if (!mapReady || !instanceRef.current) return;
    const timer = setTimeout(() => instanceRef.current?.invalidateSize(), 300);
    return () => clearTimeout(timer);
  }, [mapReady]);

  // Inject pulse animation CSS
  useEffect(() => {
    if (document.getElementById('tracking-map-styles')) return;
    const style = document.createElement('style');
    style.id = 'tracking-map-styles';
    style.textContent = `
      @keyframes teamPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  return <div ref={mapRef} className="w-full h-full" />;
}
