'use client';
import React, { useState, useMemo } from 'react';
import type { ChantierData } from '@/lib/api';

/* ═══════════════════════════════════════════════════════════
   MAPVIEW PROFESSIONNEL — Carte de Commande
   Pin intelligentes, popups riches, légende, filtres
   ═══════════════════════════════════════════════════════════ */

type FiltreType = 'tous' | 'en_cours' | 'en_attente' | 'bloquee' | 'terminee';

interface Props { chantiers: ChantierData[]; }

/* ── Config couleurs par statut ── */
const STATUS_CONFIG: Record<string, { color: string; bg: string; glow: string; label: string; icon: string }> = {
  en_cours:  { color: '#059669', bg: '#d1fae5', glow: 'rgba(5,150,105,0.5)', label: 'En Cours', icon: '🟢' },
  en_attente:{ color: '#d97706', bg: '#fef3c7', glow: 'rgba(217,119,6,0.5)', label: 'En Attente', icon: '🟡' },
  bloquee:   { color: '#dc2626', bg: '#fee2e2', glow: 'rgba(220,38,38,0.5)', label: 'Bloquée', icon: '🔴' },
  terminee:  { color: '#2563eb', bg: '#dbeafe', glow: 'rgba(37,99,235,0.3)', label: 'Terminée', icon: '🔵' },
  planifiee: { color: '#6b7280', bg: '#f3f4f6', glow: 'rgba(107,114,128,0.3)', label: 'Planifiée', icon: '⚪' },
};

function getStatus(statut: string) {
  const key = statut?.toLowerCase().replace(/[^a-z]/g, '') || 'planifiee';
  return STATUS_CONFIG[key] || STATUS_CONFIG.planifiee;
}

function daysSince(dateStr: string) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function calcProgress(c: ChantierData) {
  const total = (c.terminee || 0) + (c.en_cours || 0) + (c.en_attente || 0) + (c.bloquee || 0);
  if (!total) return 0;
  return Math.round(((c.terminee || 0) / total) * 100);
}

/* ── Carte Leaflet dynamique ── */
const LeafletMap = React.memo(function LeafletMap({
  chantiers, filtre
}: { chantiers: ChantierData[]; filtre: FiltreType }) {
  const [mapReady, setMapReady] = React.useState(false);
  const mapRef = React.useRef<HTMLDivElement>(null);
  const instanceRef = React.useRef<any>(null);
  const markersRef = React.useRef<any[]>([]);

  const filtered = useMemo(() => {
    if (filtre === 'tous') return chantiers;
    return chantiers.filter(c => c.statut?.toLowerCase().replace(/[^a-z]/g, '') === filtre);
  }, [chantiers, filtre]);

  React.useEffect(() => {
    if (mapReady) return;
    (async () => {
      const L = (await import('leaflet')).default;
      // Inject Leaflet CSS via link tag (dynamic import doesn't work for CSS in TS)
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [36.75, 3.06],
        zoom: 5.8,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap © CARTO',
      }).addTo(map);

      instanceRef.current = map;
      setMapReady(true);
    })();
  }, [mapReady]);

  // Update markers when filtered chantiers change
  React.useEffect(() => {
    if (!mapReady || !instanceRef.current) return;
    const map = instanceRef.current;
    const L = (window as any).L;
    if (!L) return;

    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    const bounds = L.latLngBounds();

    filtered.forEach(c => {
      if (!c.lat || !c.lng) return;
      const s = getStatus(c.statut);
      const progress = calcProgress(c);
      const days = daysSince(c.date_creation);

      // Custom icon with pulse
      const icon = L.divIcon({
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -14],
        html: `<div class="map-pin map-pin--${c.statut?.toLowerCase().replace(/[^a-z]/g, '') || 'planifiee'}">
          <div class="map-pin__pulse"></div>
          <div class="map-pin__dot" style="background:${s.color}"></div>
        </div>`,
      });

      // Rich popup
      const popup = `
        <div class="map-popup">
          <div class="map-popup__header" style="background:${s.color}">
            <span class="map-popup__icon">${s.icon}</span>
            <div>
              <div class="map-popup__nom">${c.nom}</div>
              <div class="map-popup__ref">${c.ref}</div>
            </div>
          </div>
          <div class="map-popup__body">
            <div class="map-popup__badge" style="background:${s.bg};color:${s.color}">${s.label}</div>
            <div class="map-popup__info">
              <div class="map-popup__row"><span class="map-popup__lbl">Client</span><span class="map-popup__val">${c.client_nom || '—'}</span></div>
              <div class="map-popup__row"><span class="map-popup__lbl">Équipe</span><span class="map-popup__val">${c.equipe_actuelle || 'Non assignée'}</span></div>
              <div class="map-popup__row"><span class="map-popup__lbl">Phase</span><span class="map-popup__val">${c.phase_actuelle || '—'}</span></div>
              <div class="map-popup__row"><span class="map-popup__lbl">Complexité</span><span class="map-popup__val">${c.complexite || '—'}</span></div>
              <div class="map-popup__row"><span class="map-popup__lbl">Jours</span><span class="map-popup__val" style="color:${days > 30 ? '#dc2626' : '#374151'}">${days}j</span></div>
            </div>
            <div class="map-popup__progress-wrap">
              <div class="map-popup__progress-header">
                <span>Progression</span>
                <span class="map-popup__progress-pct">${progress}%</span>
              </div>
              <div class="map-popup__progress-bar">
                <div class="map-popup__progress-fill" style="width:${progress}%;background:${s.color}"></div>
              </div>
              <div class="map-popup__missions">
                <span>✅ ${c.terminee || 0}</span>
                <span>🔄 ${c.en_cours || 0}</span>
                <span>⏳ ${c.en_attente || 0}</span>
                <span>🚫 ${c.bloquee || 0}</span>
              </div>
            </div>
            ${c.bloquee && c.bloquee > 0 ? `<div class="map-popup__alert">⚠️ ${c.bloquee} mission(s) bloquée(s)</div>` : ''}
            <a href="/dashboard/chantier/${c.id}" class="map-popup__cta" style="background:${s.color}">
              Voir les détails →
            </a>
          </div>
        </div>
      `;

      const marker = L.marker([c.lat, c.lng], { icon })
        .addTo(map)
        .bindPopup(popup, { className: 'map-popup-wrap', maxWidth: 320, minWidth: 280 });

      markersRef.current.push(marker);
      bounds.extend([c.lat, c.lng]);
    });

    if (markersRef.current.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else if (markersRef.current.length === 1) {
      const m = markersRef.current[0];
      map.setView(m.getLatLng(), 14);
    }
  }, [filtered, mapReady]);

  // Resize handler
  React.useEffect(() => {
    if (!mapReady || !instanceRef.current) return;
    const timer = setTimeout(() => instanceRef.current?.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [mapReady]);

  return <div ref={mapRef} className="map-view__container" />;
});

/* ── Main Component ── */
export default function MapView({ chantiers }: Props) {
  const [filtre, setFiltre] = useState<FiltreType>('tous');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoResult, setGeoResult] = useState<string | null>(null);

  const stats = useMemo(() => ({
    total: chantiers.length,
    avecGPS: chantiers.filter(c => c.lat && c.lng).length,
    sansGPS: chantiers.filter(c => !c.lat || !c.lng).length,
    en_cours: chantiers.filter(c => c.statut?.toLowerCase().replace(/[^a-z]/g, '') === 'en_cours').length,
    en_attente: chantiers.filter(c => c.statut?.toLowerCase().replace(/[^a-z]/g, '') === 'en_attente').length,
    bloquee: chantiers.filter(c => c.statut?.toLowerCase().replace(/[^a-z]/g, '') === 'bloquee').length,
    terminee: chantiers.filter(c => c.statut?.toLowerCase().replace(/[^a-z]/g, '') === 'terminee').length,
  }), [chantiers]);

  async function handleGeocode() {
    setGeoLoading(true); setGeoResult(null);
    try {
      const token = localStorage.getItem('rmasc_token');
      const res = await fetch('/api/chantiers/geocode', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setGeoResult(data.message || 'Géocodage terminé.');
      if (data.updated > 0) window.location.reload();
    } catch { setGeoResult('Erreur de géocodage.'); }
    setGeoLoading(false);
  }

  const filtres: { key: FiltreType; label: string; count: number; color: string }[] = [
    { key: 'tous', label: 'Tous', count: stats.total, color: '#374151' },
    { key: 'en_cours', label: '🟢 En Cours', count: stats.en_cours, color: '#059669' },
    { key: 'en_attente', label: '🟡 Attente', count: stats.en_attente, color: '#d97706' },
    { key: 'bloquee', label: '🔴 Bloquée', count: stats.bloquee, color: '#dc2626' },
    { key: 'terminee', label: '🔵 Terminée', count: stats.terminee, color: '#2563eb' },
  ];

  return (
    <div className="map-view">
      {/* ── Header + Stats ── */}
      <div className="map-view__header">
        <div className="map-view__title-row">
          <h2 className="map-view__title">🗺️ Carte de Commande</h2>
          <span className="map-view__subtitle">{stats.avecGPS}/{stats.total} sur la carte</span>
        </div>

        {/* Summary Stats */}
        <div className="map-view__stats">
          <div className="map-stat">
            <div className="map-stat__value">{stats.total}</div>
            <div className="map-stat__label">Total</div>
          </div>
          <div className="map-stat map-stat--active">
            <div className="map-stat__value">{stats.en_cours}</div>
            <div className="map-stat__label">En Cours</div>
          </div>
          <div className="map-stat map-stat--warning">
            <div className="map-stat__value">{stats.en_attente}</div>
            <div className="map-stat__label">En Attente</div>
          </div>
          <div className="map-stat map-stat--danger">
            <div className="map-stat__value">{stats.bloquee}</div>
            <div className="map-stat__label">Bloquée</div>
          </div>
          <div className="map-stat map-stat--done">
            <div className="map-stat__value">{stats.terminee}</div>
            <div className="map-stat__label">Terminée</div>
          </div>
        </div>

        {/* GPS Warning + Geocode button */}
        {stats.sansGPS > 0 && (
          <div className="map-gps-warning">
            <span>⚠️ {stats.sansGPS} chantier(s) sans coordonnées GPS</span>
            <button onClick={handleGeocode} disabled={geoLoading} className="map-geocode-btn">
              {geoLoading ? '⏳ Géocodage...' : '📍 Géocoder maintenant'}
            </button>
            {geoResult && <span className="map-geocode-result">{geoResult}</span>}
          </div>
        )}

        {/* Filter Buttons */}
        <div className="map-view__filters">
          {filtres.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltre(f.key)}
              className={`map-filter ${filtre === f.key ? 'map-filter--active' : ''}`}
              style={filtre === f.key ? { background: f.color, color: '#fff', borderColor: f.color } : {}}
            >
              {f.label}
              <span className="map-filter__count">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Map ── */}
      <LeafletMap chantiers={chantiers} filtre={filtre} />

      {/* ── Legend ── */}
      <div className="map-view__legend">
        <span className="map-legend__title">Légende :</span>
        {Object.entries(STATUS_CONFIG).map(([key, s]) => (
          <div key={key} className="map-legend__item">
            <span className="map-legend__dot" style={{ background: s.color, boxShadow: `0 0 6px ${s.glow}` }} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
