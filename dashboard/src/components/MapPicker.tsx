'use client';
import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2, Search, Navigation, X } from 'lucide-react';

interface Props {
  onPositionChange: (lat: number, lng: number) => void;
  onRayonChange?: (rayon: number) => void;
  initialLat?: number;
  initialLng?: number;
  initialRayon?: number;
}

interface RechercheResult {
  display_name: string;
  lat: string;
  lon: string;
}

export default function MapPicker({ onPositionChange, onRayonChange, initialLat = 36.75, initialLng = 3.05, initialRayon = 50 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const [position, setPosition] = useState({ lat: initialLat, lng: initialLng });
  const [rayon, setRayon] = useState(initialRayon);
  const [locating, setLocating] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<RechercheResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adresseTrouvee, setAdresseTrouvee] = useState('');

  // ═══ INIT CARTE ═══
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [initialLat, initialLng],
        zoom: 13,
        zoomControl: true,
      });
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      // Marqueur
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          width: 26px; height: 26px; border-radius: 50%;
          background: #FF5252; border: 4px solid white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      markerRef.current = L.marker([initialLat, initialLng], { icon, draggable: true }).addTo(map);

      // Cercle métrage
      circleRef.current = L.circle([initialLat, initialLng], {
        radius: initialRayon,
        color: '#3B4BB9',
        fillColor: '#3B4BB9',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '5,5',
      }).addTo(map);

      // Clic → déplacer marqueur + cercle
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        placerPosition(lat, lng);
      });

      markerRef.current.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        placerPosition(lat, lng);
      });

      map.on('locationfound', (e: any) => {
        const { lat, lng } = e.latlng;
        placerPosition(lat, lng);
        map.setView([lat, lng], 16);
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

  // ═══ METTRE À JOUR LE CERCLE QUAND LE RAYON CHANGE ═══
  useEffect(() => {
    if (circleRef.current && mapInstanceRef.current) {
      circleRef.current.setRadius(rayon);
      mapInstanceRef.current.fitBounds(circleRef.current.getBounds(), { padding: [20, 20] });
    }
  }, [rayon]);

  // ═══ PLACER POSITION (marqueur + cercle + callback) ═══
  async function placerPosition(lat: number, lng: number) {
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
    if (circleRef.current) circleRef.current.setLatLng([lat, lng]);
    setPosition({ lat, lng });
    onPositionChange(lat, lng);
    // Reverse geocode pour afficher l'adresse
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr`);
      if (res.ok) {
        const data = await res.json();
        setAdresseTrouvee(data.display_name || '');
      }
    } catch { /* ignore */ }
  }

  // ═══ RECHERCHE D'ADRESSE (Nominatim — géocodage réel) ═══
  async function rechercherAdresse() {
    if (!recherche.trim()) return;
    setSearching(true);
    setResultats([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(recherche)}&limit=5&accept-language=fr`,
        { headers: { 'Accept-Language': 'fr' } }
      );
      if (res.ok) {
        const data = await res.json();
        setResultats(data.map((d: any) => ({ display_name: d.display_name, lat: d.lat, lon: d.lon })));
      }
    } catch { /* ignore */ }
    setSearching(false);
  }

  function choisirResultat(r: RechercheResult) {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    setRecherche(r.display_name);
    setResultats([]);
    placerPosition(lat, lng);
    if (mapInstanceRef.current) mapInstanceRef.current.setView([lat, lng], 16);
  }

  // ═══ LOCALISATION AUTOMATIQUE ═══
  const utiliserMaPosition = () => {
    if (typeof navigator === 'undefined') return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await placerPosition(latitude, longitude);
        if (mapInstanceRef.current) mapInstanceRef.current.setView([latitude, longitude], 16);
        setLocating(false);
      },
      () => { setLocating(false); alert('Activez la géolocalisation pour utiliser votre position.'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-3">
      {/* ═══ BARRE DE RECHERCHE RÉELLE ═══ */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-2xl px-4 py-2.5 shadow-sm focus-within:border-indigo-400 transition-all">
          <Search size={16} className="text-stone-300 flex-shrink-0" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rechercherAdresse(); } }}
            placeholder="Rechercher une adresse, une ville, un lieu..."
            className="bg-transparent text-sm text-stone-700 outline-none flex-1 placeholder:text-stone-300"
          />
          {recherche && (
            <button onClick={() => { setRecherche(''); setResultats([]); }} className="text-stone-300 hover:text-stone-500">
              <X size={15} />
            </button>
          )}
          <button onClick={rechercherAdresse}
            className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-1.5 rounded-xl transition-all flex items-center gap-1.5">
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            <span className="hidden sm:inline">Rechercher</span>
          </button>
        </div>

        {/* Résultats de recherche */}
        {resultats.length > 0 && (
          <div className="absolute z-[2000] top-full mt-1 w-full bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden max-h-56 overflow-y-auto">
            {resultats.map((r, i) => (
              <button key={i} onClick={() => choisirResultat(r)}
                className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors border-b border-stone-50 last:border-0">
                <p className="text-sm text-stone-600 flex items-start gap-2">
                  <MapPin size={14} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                  {r.display_name}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ═══ CARTE ═══ */}
      <div className="relative rounded-2xl overflow-hidden border border-stone-200" style={{ height: 260 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl px-3 py-1.5 shadow-sm text-[10px] font-medium text-stone-600">
          🎯 Cliquez sur la carte pour positionner
        </div>
      </div>

      {/* ═══ COORDONNÉES + MÉTRAGE + LOCALISATION ═══ */}
      <div className="bg-stone-50 rounded-2xl border border-stone-100 p-4 space-y-3">
        {/* Coordonnées */}
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono text-stone-600">
            📍 {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
          </div>
          <button onClick={utiliserMaPosition}
            className="text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5">
            {locating ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
            Ma position
          </button>
        </div>

        {/* Adresse trouvée */}
        {adresseTrouvee && (
          <p className="text-[10px] text-stone-400 italic leading-relaxed">{adresseTrouvee}</p>
        )}

        {/* Métrage (zone de travail) */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-stone-500 mb-1 block">📏 Zone de travail</label>
            <div className="relative">
              <input
                type="range"
                min="10"
                max="500"
                step="5"
                value={rayon}
                onChange={(e) => { const v = parseInt(e.target.value); setRayon(v); onRayonChange?.(v); }}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>
          <div className="w-20 bg-white border border-stone-200 rounded-xl px-2 py-1.5 text-center">
            <span className="text-sm font-bold text-indigo-600">{rayon}</span>
            <span className="text-[9px] text-stone-400 block">mètres</span>
          </div>
        </div>
        <p className="text-[10px] text-stone-400">Rayon autour du point où le technicien peut pointer et travailler. Le cercle sur la carte s'ajuste en direct.</p>
      </div>
    </div>
  );
}
