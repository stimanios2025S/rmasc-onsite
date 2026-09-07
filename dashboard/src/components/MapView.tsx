'use client';
import React, { useState, useMemo } from 'react';
import type { ChantierData } from '@/lib/api';

/* ═══════════════════════════════════════════════════════════
   MAPVIEW PROFESSIONNEL — Carte de Commande
   Pin intelligentes, popups riches, légende, filtres
   + Suivi temps réel des équipes (GPS tracking)
   ═══════════════════════════════════════════════════════════ */

type FiltreType = 'tous' | 'en_cours' | 'en_attente' | 'bloquee' | 'terminee';

export interface TeamPosition {
  equipe_id: string;
  equipe_nom: string;
  equipe_type: string;
  latitude: number | null;
  longitude: number | null;
  vitesse_kmh: number | null;
  batterie_pct: number | null;
  last_update: string;
  mission_id: string | null;
  chantier_id?: string | null;
  destination: string | null;
  mission_statut: string | null;
  statut_equipe: string | null;
  distance_destination_m: number | null;
}

interface Props { chantiers: ChantierData[]; teamPositions?: TeamPosition[]; }

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

/* ── Recherche d'adresse type Google Maps (Nominatim, gratuit sans clé) ── */
export interface LieuRecherche { lat: number; lng: number; nom: string; adresse: string; source?: string; }

export interface PoiLieu { lat: number; lng: number; nom: string; categorie: string; }

const LeafletMap = React.memo(function LeafletMap({
  chantiers, filtre, teamPositions, lieuRecherche, showPois
}: { chantiers: ChantierData[]; filtre: FiltreType; teamPositions?: TeamPosition[]; lieuRecherche?: LieuRecherche | null; showPois: boolean }) {
  const [mapReady, setMapReady] = React.useState(false);
  const mapRef = React.useRef<HTMLDivElement>(null);
  const instanceRef = React.useRef<any>(null);
  const markersRef = React.useRef<any[]>([]);
  const teamMarkersRef = React.useRef<any[]>([]);
  const trailsRef = React.useRef<any[]>([]);
  const searchMarkerRef = React.useRef<any>(null);
  const poiMarkersRef = React.useRef<any[]>([]);
  const poiCacheRef = React.useRef<Map<string, PoiLieu[]>>(new Map());

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
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
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

      // OpenStreetMap standard — gratuit, sans clé API (CARTO exige une clé depuis 2024)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
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

  // Team position markers (live GPS tracking)
  React.useEffect(() => {
    if (!mapReady || !instanceRef.current) return;
    const map = instanceRef.current;
    const L = (window as any).L;
    if (!L) return;

    // Clear old team markers and trails
    teamMarkersRef.current.forEach(m => map.removeLayer(m));
    trailsRef.current.forEach(l => map.removeLayer(l));
    teamMarkersRef.current = [];
    trailsRef.current = [];

    if (!teamPositions || teamPositions.length === 0) return;

    const TEAM_COLORS: Record<string, string> = {
      mecanique: '#f59e0b',
      electrique: '#3b82f6',
      mixte: '#8b5cf6',
    };

    teamPositions.forEach(tp => {
      if (!tp.latitude || !tp.longitude) return;

      const color = TEAM_COLORS[tp.equipe_type] || '#6b7280';
      const isEnRoute = tp.mission_statut === 'en_route';
      const isPaused = tp.mission_statut === 'en_pause';

      // Animated team marker (moving dot)
      const pulseClass = isEnRoute ? 'team-pulse--moving' : isPaused ? 'team-pulse--paused' : 'team-pulse--static';
      const icon = L.divIcon({
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -20],
        html: `
          <div class="team-marker ${pulseClass}" style="--team-color: ${color}">
            <div class="team-marker__ring" style="border-color: ${color}"></div>
            <div class="team-marker__dot" style="background: ${color}">
              ${tp.equipe_type === 'electrique' ? '⚡' : tp.equipe_type === 'mecanique' ? '🔧' : '🛡️'}
            </div>
            <div class="team-marker__label" style="background: ${color}">${tp.equipe_nom.split(' ').pop()}</div>
          </div>
        `,
      });

      // Popup info
      const timeSince = Math.round((Date.now() - new Date(tp.last_update).getTime()) / 60000);
      const STATUS_LABELS: Record<string, { label: string; icon: string; bg: string; fg: string }> = {
        en_route: { label: 'En route', icon: '🚗', bg: '#fff7ed', fg: '#ea580c' },
        en_cours: { label: 'En travail', icon: '🏗️', bg: '#ecfdf5', fg: '#059669' },
        en_pause: { label: 'En pause', icon: '☕', bg: '#fefce8', fg: '#ca8a04' },
        en_attente: { label: 'En attente', icon: '⏳', bg: '#f5f5f4', fg: '#78716c' },
        termine: { label: 'Terminé', icon: '✅', bg: '#f0fdf4', fg: '#16a34a' },
      };
      const st = STATUS_LABELS[tp.mission_statut || ''] || { label: tp.mission_statut || tp.statut_equipe || '—', icon: '❓', bg: '#f5f5f4', fg: '#78716c' };
      const batteryIcon = tp.batterie_pct !== null ? (tp.batterie_pct > 50 ? '🔋' : tp.batterie_pct > 20 ? '🪫' : '🔴') : '';
      const popup = `
        <div class="team-popup">
          <div class="team-popup__header" style="background: ${color}">
            <span style="font-size: 18px">${tp.equipe_type === 'electrique' ? '⚡' : tp.equipe_type === 'mecanique' ? '🔧' : '🛡️'}</span>
            <div>
              <div class="team-popup__nom">${tp.equipe_nom}</div>
              <div class="team-popup__type">${tp.equipe_type} · ${st.icon} ${st.label}</div>
            </div>
          </div>
          <div class="team-popup__body">
            <div class="team-popup__badge-row">
              <span class="team-popup__badge" style="background: ${st.bg};color: ${st.fg}">${st.label}</span>
              <span class="team-popup__badge" style="background: ${color}15;color: ${color}">${tp.equipe_type}</span>
            </div>
            ${tp.destination ? `<div class="team-popup__row"><span>📍 Destination</span><span style="font-weight:600">${tp.destination}</span></div>` : '<div class="team-popup__row"><span>📍 Destination</span><span style="color:#94a3b8">Aucune</span></div>'}
            ${tp.vitesse_kmh ? `<div class="team-popup__row"><span>🚗 Vitesse</span><span>${tp.vitesse_kmh} km/h</span></div>` : ''}
            ${tp.distance_destination_m ? `<div class="team-popup__row"><span>📐 Distance</span><span>${tp.distance_destination_m}m</span></div>` : ''}
            ${tp.batterie_pct !== null ? `<div class="team-popup__row"><span>${batteryIcon} Batterie</span><span>${tp.batterie_pct}%</span></div>` : ''}
            <div class="team-popup__row"><span>🕐 Dernière MAJ</span><span>${timeSince < 1 ? "À l'instant" : `Il y a ${timeSince} min`}</span></div>
            ${tp.mission_id ? `<a href="/dashboard/chantier/${tp.mission_id}" class="team-popup__cta" style="background: ${color}">Voir chantier →</a>` : ''}
          </div>
        </div>
      `;

      const marker = L.marker([tp.latitude, tp.longitude], { icon })
        .addTo(map)
        .bindPopup(popup, { className: 'map-popup-wrap', maxWidth: 280, minWidth: 240 });

      teamMarkersRef.current.push(marker);

      // Draw trail (last known route) if destination exists
      if (tp.mission_statut === 'en_route' && tp.destination) {
        // Find matching chantier for trail endpoint
        const dest = chantiers.find(ch => ch.nom === tp.destination);
        if (dest && dest.lat && dest.lng) {
          const trail = L.polyline(
            [[tp.latitude, tp.longitude], [dest.lat, dest.lng]],
            { color, weight: 3, opacity: 0.4, dashArray: '8,8', className: 'team-trail' }
          ).addTo(map);
          trailsRef.current.push(trail);
        }
      }
    });
  }, [teamPositions, mapReady, chantiers]);

  // Lieu recherché (type Google Maps) : pin violet + zoom
  React.useEffect(() => {
    if (!mapReady || !instanceRef.current) return;
    const map = instanceRef.current;
    const L = (window as any).L;
    if (!L) return;
    if (searchMarkerRef.current) { map.removeLayer(searchMarkerRef.current); searchMarkerRef.current = null; }
    if (!lieuRecherche) return;
    const icon = L.divIcon({
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -38],
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);border-radius:50% 50% 50% 4px;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(139,92,246,0.5);border:3px solid white">
          <span style="font-size:16px;transform:rotate(45deg)">🔍</span>
        </div></div>`,
    });
    const marker = L.marker([lieuRecherche.lat, lieuRecherche.lng], { icon, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(`<div style="font-family:inherit;min-width:200px">
          <div style="font-weight:700;font-size:13px;color:#1e293b">🔍 ${lieuRecherche.nom}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">${lieuRecherche.adresse}</div>
        </div>`)
      .openPopup();
    searchMarkerRef.current = marker;
    map.flyTo([lieuRecherche.lat, lieuRecherche.lng], 15, { duration: 1.2 });
  }, [lieuRecherche, mapReady]);

  // ── Calque POI : commerces / usines / hôtels autour de la vue (données OSM réelles) ──
  React.useEffect(() => {
    if (!mapReady || !instanceRef.current) return;
    const map = instanceRef.current;
    const L = (window as any).L;
    if (!L) return;

    function effacerPois() {
      poiMarkersRef.current.forEach((m: any) => map.removeLayer(m));
      poiMarkersRef.current = [];
    }
    if (!showPois) { effacerPois(); return; }

    let annule = false;
    async function chargerPois() {
      try {
        const b = map.getBounds();
        const s = b.getSouth().toFixed(3), w = b.getWest().toFixed(3);
        const n = b.getNorth().toFixed(3), e = b.getEast().toFixed(3);
        // Ne charger qu'à zoom suffisant (sinon trop de résultats)
        if (map.getZoom() < 12) { if (!annule) effacerPois(); return; }
        const cle = `${s},${w},${n},${e}`;
        let pois = poiCacheRef.current.get(cle);
        if (!pois) {
          const req = `[out:json][timeout:15];(node["shop"](${s},${w},${n},${e});node["amenity"~"^(restaurant|cafe|fast_food|hotel|fuel|pharmacy|bank|hospital|school)$"](${s},${w},${n},${e});node["craft"](${s},${w},${n},${e});node["office"="company"](${s},${w},${n},${e});way["shop"](${s},${w},${n},${e});way["amenity"~"^(restaurant|cafe|fast_food|hotel|fuel|pharmacy|bank|hospital)$"](${s},${w},${n},${e});way["man_made"="works"](${s},${w},${n},${e});way["industrial"](${s},${w},${n},${e});relation["man_made"="works"](${s},${w},${n},${e}););out center tags 80;`;
          const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(req),
          });
          const data = await res.json();
          const ICONE: Record<string, string> = {
            shop: '🏪', restaurant: '🍽️', cafe: '☕', fast_food: '🍔', hotel: '🏨',
            fuel: '⛽', pharmacy: '💊', bank: '🏦', hospital: '🏥', school: '🏫',
            company: '🏢', works: '🏭', industrial: '🏭', craft: '🔨',
          };
          pois = ((data && data.elements) || []).slice(0, 80).map((el: any) => {
            const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
            const tags = el.tags || {};
            const nom = tags.name || tags.shop || tags.amenity || tags.craft || 'Sans nom';
            const cat = tags.shop || tags.amenity || tags.craft || (tags.office === 'company' ? 'company' : tags.man_made) || tags.industrial || 'lieu';
            return { lat, lng, nom, categorie: cat, icone: ICONE[tags.shop] || ICONE[tags.amenity] || ICONE[tags.craft] || (tags.man_made === 'works' || tags.industrial ? '🏭' : tags.office === 'company' ? '🏢' : '📍') };
          }).filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
          poiCacheRef.current.set(cle, pois as PoiLieu[]);
          if (poiCacheRef.current.size > 12) {
            const premiere = poiCacheRef.current.keys().next().value;
            if (premiere) poiCacheRef.current.delete(premiere);
          }
        }
        if (annule) return;
        effacerPois();
        (pois || []).forEach((p: any) => {
          const icon = L.divIcon({
            className: '',
            iconSize: [26, 26],
            iconAnchor: [13, 13],
            popupAnchor: [0, -14],
            html: `<div style="width:26px;height:26px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid #e2e8f0">${p.icone || '📍'}</div>`,
          });
          const marker = L.marker([p.lat, p.lng], { icon })
            .addTo(map)
            .bindPopup(`<div style="font-family:inherit;min-width:160px">
                <div style="font-weight:700;font-size:12.5px;color:#1e293b">${p.icone || '📍'} ${p.nom}</div>
                <div style="font-size:11px;color:#64748b;margin-top:2px">${p.categorie}</div>
              </div>`);
          poiMarkersRef.current.push(marker);
        });
      } catch { /* Overpass indispo — silencieux */ }
    }

    chargerPois();
    map.on('moveend', chargerPois);
    return () => { annule = true; map.off('moveend', chargerPois); };
  }, [showPois, mapReady, filtered]);

  // Resize handler
  React.useEffect(() => {
    if (!mapReady || !instanceRef.current) return;
    const timer = setTimeout(() => instanceRef.current?.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [mapReady]);

  return <div ref={mapRef} className="map-view__container" />;
});

/* ── Main Component ── */
export default function MapView({ chantiers, teamPositions = [] }: Props) {
  const [filtre, setFiltre] = useState<FiltreType>('tous');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoResult, setGeoResult] = useState<string | null>(null);
  const [showTeams, setShowTeams] = useState(true);
  const [showPois, setShowPois] = useState(false);
  // ── Recherche d'adresse type Google Maps ──
  const [recherche, setRecherche] = useState('');
  const [suggestions, setSuggestions] = useState<LieuRecherche[]>([]);
  const [rechercheLoading, setRechercheLoading] = useState(false);
  const [lieuRecherche, setLieuRecherche] = useState<LieuRecherche | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [quotaGoogle, setQuotaGoogle] = useState<number | null>(null);
  const [conseilGoogle, setConseilGoogle] = useState<string | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = React.useRef<HTMLDivElement>(null);

  function chercherAdresse(query: string) {
    setRecherche(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) { setSuggestions([]); setSuggestOpen(false); return; }
    // 0. Lien Google Maps collé ou coordonnées brutes → point exact gratuit
    // Formats: .../@36.3701,3.9008,15z | ?q=36.3701,3.9008 | !3d36.3701!4d3.9008 | 36.3701, 3.9008
    const brut = query.trim();
    let latG: number | null = null, lngG: number | null = null;
    let mg = brut.match(/@(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
      || brut.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
      || brut.match(/[?&]query=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/)
      || brut.match(/[?&]q=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/)
      || brut.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
    if (mg) { latG = parseFloat(mg[1]); lngG = parseFloat(mg[2]); }
    if (latG !== null && lngG !== null && Number.isFinite(latG) && Number.isFinite(lngG)
      && latG >= 18 && latG <= 38 && lngG >= -10 && lngG <= 13) {
      setSuggestions([{
        lat: latG, lng: lngG,
        nom: '📍 Point Google Maps (exact)',
        adresse: `${latG.toFixed(6)}, ${lngG.toFixed(6)} — collé depuis Google, gratuit`,
      }]);
      setSuggestOpen(true);
      setRechercheLoading(false);
      return;
    }
    setRechercheLoading(true);
    debounceRef.current = setTimeout(async () => {
      const q = query.trim();
      // Agent côté serveur : mémoire → sources libres → conseil Google (quota 3/jour)
      try {
        const token = localStorage.getItem('rmasc_token');
        const res = await fetch('/api/places/rechercher', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requete: q }),
        });
        const data = await res.json();
        const lieux: LieuRecherche[] = Array.isArray(data.lieux) ? data.lieux : [];
        if (typeof data.quotaGoogleRestant === 'number') setQuotaGoogle(data.quotaGoogleRestant);
        setConseilGoogle(typeof data.conseilGoogle === 'string' ? data.conseilGoogle : null);
        setSuggestions(lieux.slice(0, 8));
        // Mémoriser le 1er résultat auto pour l'apprentissage (silencieux)
        if (lieux.length > 0) {
          try {
            await fetch('/api/places/memoriser', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ nom: q.slice(0, 200), adresse: lieux[0].adresse || '', lat: lieux[0].lat, lng: lieux[0].lng, source: 'agent:' + (lieux[0].source || 'libre') }),
            });
          } catch { /* mémoire non bloquante */ }
        }
      } catch {
        setSuggestions([]);
        setConseilGoogle(null);
      }
      setSuggestOpen(true);
      setRechercheLoading(false);
    }, 450);
  }

  function choisirLieu(l: LieuRecherche) {
    // Confirmer le choix → l'agent le mémorise (trouvé par nom la prochaine fois)
    try {
      const token = localStorage.getItem('rmasc_token');
      fetch('/api/places/memoriser', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: recherche.slice(0, 200) || l.nom, adresse: l.adresse || '', lat: l.lat, lng: l.lng, source: 'choix-admin' }),
      }).catch(() => {});
    } catch { /* non bloquant */ }
    setLieuRecherche(l);
    setRecherche(l.nom);
    setSuggestions([]);
    setSuggestOpen(false);
  }

  // Fermer les suggestions au clic extérieur
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSuggestOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const stats = useMemo(() => ({
    total: chantiers.length,
    avecGPS: chantiers.filter(c => c.lat && c.lng).length,
    sansGPS: chantiers.filter(c => !c.lat || !c.lng).length,
    en_cours: chantiers.filter(c => c.statut?.toLowerCase().replace(/[^a-z]/g, '') === 'en_cours').length,
    en_attente: chantiers.filter(c => c.statut?.toLowerCase().replace(/[^a-z]/g, '') === 'en_attente').length,
    bloquee: chantiers.filter(c => c.statut?.toLowerCase().replace(/[^a-z]/g, '') === 'bloquee').length,
    terminee: chantiers.filter(c => c.statut?.toLowerCase().replace(/[^a-z]/g, '') === 'terminee').length,
  }), [chantiers]);

  const visibleTeams = useMemo(() =>
    showTeams ? teamPositions.filter(tp => tp.latitude && tp.longitude) : [],
    [teamPositions, showTeams]
  );

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
          {teamPositions.length > 0 && (
            <button
              onClick={() => setShowTeams(!showTeams)}
              className={`map-team-toggle ${showTeams ? 'map-team-toggle--active' : ''}`}
            >
              🚗 {teamPositions.length} équipe(s) GPS {showTeams ? 'ON' : 'OFF'}
            </button>
          )}
          <button
            onClick={() => setShowPois(v => !v)}
            className={`map-team-toggle ${showPois ? 'map-team-toggle--active' : ''}`}
            title="Afficher commerces, usines, hôtels… autour de la vue (zoom 12+)"
          >
            🏪 Commerces / Usines {showPois ? 'ON' : 'OFF'}
          </button>
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

        {/* ── Recherche d'adresse type Google Maps (Algérie) ── */}
        <div className="map-search" ref={searchBoxRef}>
          <div className="map-search__box">
            <span className="map-search__icon">🔍</span>
            <input
              value={recherche}
              onChange={e => chercherAdresse(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setSuggestOpen(true); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && suggestions.length > 0) choisirLieu(suggestions[0]);
                if (e.key === 'Escape') { setSuggestOpen(false); }
              }}
              placeholder="Nom en Algérie… ou collez un lien Google Maps pour le point exact"
              className="map-search__input"
            />
            {rechercheLoading && <span className="map-search__spinner">⏳</span>}
            {recherche && !rechercheLoading && (
              <button
                onClick={() => { setRecherche(''); setSuggestions([]); setLieuRecherche(null); setSuggestOpen(false); }}
                className="map-search__clear" title="Effacer">✕</button>
            )}
          </div>
          {suggestOpen && suggestions.length > 0 && (
            <div className="map-search__results">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => choisirLieu(s)} className="map-search__item">
                  <span className="map-search__pin">📍</span>
                  <span className="map-search__texts">
                    <span className="map-search__nom">{s.nom}</span>
                    <span className="map-search__adresse">{s.adresse}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {suggestOpen && !rechercheLoading && recherche.trim().length >= 3 && suggestions.length === 0 && (
            <div className="map-search__results">
              <div className="map-search__empty">{conseilGoogle || "Aucun lieu trouvé — ou collez le lien Google Maps du lieu (clic droit sur Google → copier le lien) pour l'avoir au mètre près, gratuit."}</div>
            </div>
          )}
          {quotaGoogle !== null && (
            <div className="map-search__quota">🤖 Agent lieux actif — slot Google du jour : {quotaGoogle}/3 restant</div>
          )}
        </div>

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
      {showPois && (
        <div className="map-poi-hint">🏪 Zoomez (niveau 12+) puis déplacez la carte — commerces, usines et hôtels autour de la vue s'affichent.</div>
      )}
      <LeafletMap chantiers={chantiers} filtre={filtre} teamPositions={visibleTeams} lieuRecherche={lieuRecherche} showPois={showPois} />

      {/* ── Legend ── */}
      <div className="map-view__legend">
        <span className="map-legend__title">Légende :</span>
        {Object.entries(STATUS_CONFIG).map(([key, s]) => (
          <div key={key} className="map-legend__item">
            <span className="map-legend__dot" style={{ background: s.color, boxShadow: `0 0 6px ${s.glow}` }} />
            <span>{s.label}</span>
          </div>
        ))}
        <div className="map-legend__separator" />
        <div className="map-legend__item">
          <span className="map-legend__dot" style={{ background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.5)' }} />
          <span>🔧 Méca</span>
        </div>
        <div className="map-legend__item">
          <span className="map-legend__dot" style={{ background: '#3b82f6', boxShadow: '0 0 6px rgba(59,130,246,0.5)' }} />
          <span>⚡ Élec</span>
        </div>
        <div className="map-legend__item">
          <span className="map-legend__dot" style={{ background: '#8b5cf6', boxShadow: '0 0 6px rgba(139,92,246,0.5)' }} />
          <span>🛡️ Mixte</span>
        </div>
      </div>
    </div>
  );
}
