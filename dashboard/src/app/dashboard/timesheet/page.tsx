'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, RefreshCw, ChevronLeft, ChevronRight, Clock, Calendar,
  Wrench, Zap, Shield, MapPin, Search, X, AlertTriangle, CheckCircle,
  AlertOctagon, Users, FileText, ChevronDown, ChevronUp, Phone,
} from 'lucide-react';
import { fetchTimesheet, type TimesheetData, type TimesheetEquipe, type TimesheetEvent,
         searchChantiers, type ChantierSearchResult } from '@/lib/api';
import { useSyncEvents } from '@/lib/use-sync-events';

/* ─── CONSTANTS ────────────────────────────────────────────────────── */
const TYPE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  mecanique: { label: 'Mécanique', icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-500' },
  electrique: { label: 'Électrique', icon: Zap, color: 'text-orange-600', bg: 'bg-orange-500' },
  mixte: { label: 'Vérification', icon: Shield, color: 'text-emerald-600', bg: 'bg-emerald-500' },
};

const EVENT_STYLE: Record<string, { bg: string; border: string; dot: string }> = {
  pointage_matin: { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400' },
  pointage_fin: { bg: 'bg-indigo-50', border: 'border-indigo-200', dot: 'bg-indigo-400' },
  arrivee: { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-400' },
  depart: { bg: 'bg-stone-50', border: 'border-stone-200', dot: 'bg-stone-400' },
  pause: { bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-400' },
  retour_shop: { bg: 'bg-sky-50', border: 'border-sky-200', dot: 'bg-sky-400' },
};

const STATUT_COLORS: Record<string, string> = {
  planifie: 'bg-stone-100 text-stone-600', en_attente: 'bg-amber-100 text-amber-700',
  en_route: 'bg-blue-100 text-blue-700', en_cours: 'bg-emerald-100 text-emerald-700',
  termine: 'bg-indigo-100 text-indigo-700', bloque: 'bg-rose-100 text-rose-700',
  en_pause: 'bg-orange-100 text-orange-700',
};

const PHASE_LABEL: Record<string, string> = { mecanique: 'Mécanique', electrique: 'Électrique', verification: 'Vérification' };
const PHASE_COLORS: Record<string, string> = {
  mecanique: 'bg-blue-50 text-blue-600 border-blue-200',
  electrique: 'bg-orange-50 text-orange-600 border-orange-200',
  verification: 'bg-emerald-50 text-emerald-600 border-emerald-200',
};

/* ─── MAIN PAGE ────────────────────────────────────────────────────── */
export default function TimesheetPage() {
  const [data, setData] = useState<TimesheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  // ─── Search state ───
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChantierSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedChantier, setSelectedChantier] = useState<ChantierSearchResult | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTimesheet(selectedDate);
      setData(result);
    } catch (e: any) {
      console.error('Timesheet load error:', e);
    }
    setLoading(false);
  }, [selectedDate]);

  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  useSyncEvents({
    onDataChanged: () => { if (isToday) loadData(); },
    onEquipeArrivee: () => { if (isToday) loadData(); },
    onEquipeEnRoute: () => { if (isToday) loadData(); },
  });

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Close search dropdown on outside click ───
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  // ─── Search handler with debounce ───
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setSelectedChantier(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 1) {
      setSearchResults([]);
      setSearchOpen(false);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchChantiers(value.trim());
        setSearchResults(res.results);
        setSearchOpen(true);
      } catch { setSearchResults([]); }
      setSearchLoading(false);
    }, 250);
  }, []);

  const selectChantier = (c: ChantierSearchResult) => {
    setSelectedChantier(c);
    setSearchOpen(false);
    setSearchQuery(c.nom_chantier);
  };

  if (loading && !data) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 size={36} className="animate-spin text-indigo-500" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header + Search */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
              <Clock size={22} className="text-indigo-500" /> Feuille de Temps
            </h1>
            <p className="text-sm text-stone-400 mt-0.5">Pointages, arrivées, pauses et fin de journée</p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-2 py-1.5">
            <button onClick={() => shiftDate(-1)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-all">
              <ChevronLeft size={16} className="text-stone-500" />
            </button>
            <div className="flex items-center gap-2 px-2">
              <Calendar size={14} className="text-stone-400" />
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                className="text-sm font-semibold text-stone-700 outline-none bg-transparent cursor-pointer"
                style={{ fontSize: '16px' }}
              />
            </div>
            <button onClick={() => shiftDate(1)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-all">
              <ChevronRight size={16} className="text-stone-500" />
            </button>
            {!isToday && (
              <button onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-all">
                Aujourd&apos;hui
              </button>
            )}
            <button onClick={loadData} className="p-1.5 hover:bg-stone-100 rounded-lg transition-all">
              <RefreshCw size={14} className={`text-stone-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ═══ INTELLIGENT SEARCH BAR ═══ */}
        <div ref={searchRef} className="relative w-full sm:max-w-xl">
          <div className={`flex items-center gap-3 bg-white border rounded-2xl px-4 py-3 transition-all shadow-sm ${
            searchOpen ? 'border-indigo-300 ring-2 ring-indigo-100 shadow-md' : 'border-stone-200 hover:border-stone-300'
          }`}>
            <Search size={18} className={`flex-shrink-0 transition-colors ${searchOpen ? 'text-indigo-500' : 'text-stone-300'}`} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
              placeholder="Rechercher un chantier, client, référence..."
              className="flex-1 text-sm text-stone-700 placeholder-stone-300 outline-none bg-transparent"
            />
            {searchLoading && <Loader2 size={16} className="animate-spin text-indigo-400 flex-shrink-0" />}
            {searchQuery && !searchLoading && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchOpen(false); setSelectedChantier(null); }}
                className="p-1 hover:bg-stone-100 rounded-lg transition-all">
                <X size={14} className="text-stone-400" />
              </button>
            )}
          </div>

          {/* ─── Search Results Dropdown ─── */}
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-stone-200 rounded-2xl shadow-xl z-50 max-h-[360px] overflow-y-auto">
              {searchResults.map(c => (
                <button key={c.id} onClick={() => selectChantier(c)}
                  className="w-full text-left px-4 py-3 hover:bg-indigo-50/50 transition-colors border-b border-stone-50 last:border-0 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-stone-800 group-hover:text-indigo-700 truncate">{c.nom_chantier}</p>
                        {c.reference_commande_erp && (
                          <span className="text-[10px] font-mono font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md flex-shrink-0">
                            {c.reference_commande_erp}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 truncate mt-0.5">{c.adresse || '—'} {c.client_nom ? `• ${c.client_nom}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                      {c.stats.blocagesOuverts > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">
                          <AlertOctagon size={10} /> {c.stats.blocagesOuverts}
                        </span>
                      )}
                      {c.stats.retardsNonLus > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle size={10} /> {c.stats.retardsNonLus}
                        </span>
                      )}
                      {c.stats.missionsEnCours > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          <CheckCircle size={10} /> {c.stats.missionsEnCours}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {searchOpen && searchResults.length === 0 && !searchLoading && searchQuery.length >= 1 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-stone-200 rounded-2xl shadow-xl z-50 p-6 text-center">
              <Search size={24} className="text-stone-300 mx-auto mb-2" />
              <p className="text-sm text-stone-400">Aucun chantier trouvé pour &ldquo;{searchQuery}&rdquo;</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ CHANTIER DETAIL PANEL ═══ */}
      {selectedChantier && (
        <ChantierDetailPanel chantier={selectedChantier} onClose={() => { setSelectedChantier(null); setSearchQuery(''); }} />
      )}

      {/* Date Title */}
      {!selectedChantier && (
        <>
          <div className="text-center">
            <p className="text-sm font-bold text-stone-500 capitalize">{formatDate(selectedDate)}</p>
          </div>

          {/* Empty State */}
          {data && data.equipes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Clock size={40} className="text-stone-300" />
              <p className="text-sm text-stone-400">Aucun pointage enregistré pour cette date</p>
            </div>
          )}

          {/* Team Timelines */}
          <div className="space-y-6">
            {data?.equipes.map(team => (
              <TeamTimeline key={team.equipe_id} team={team} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── CHANTIER DETAIL PANEL ──────────────────────────────────────── */
function ChantierDetailPanel({ chantier, onClose }: { chantier: ChantierSearchResult; onClose: () => void }) {
  const c = chantier;
  const s = c.stats;
  const [showAllMissions, setShowAllMissions] = useState(false);
  const [showAllPointages, setShowAllPointages] = useState(false);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const formatDateTime = (d: string) => `${formatDate(d)} ${formatTime(d)}`;

  const visibleMissions = showAllMissions ? c.missions : c.missions.slice(0, 5);
  const visiblePointages = showAllPointages ? c.pointages : c.pointages.slice(0, 10);

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold">{c.nom_chantier}</h2>
              {c.reference_commande_erp && (
                <span className="text-[10px] font-mono font-bold bg-white/20 px-2 py-0.5 rounded-md">{c.reference_commande_erp}</span>
              )}
            </div>
            <div className="flex items-center gap-4 text-white/70 text-xs">
              {c.adresse && <span className="flex items-center gap-1"><MapPin size={11} /> {c.adresse}</span>}
              {c.client_nom && <span>{c.client_nom}</span>}
              {c.client_telephone && (
                <a href={`tel:${c.client_telephone}`} className="flex items-center gap-1 hover:text-white transition-colors">
                  <Phone size={11} /> {c.client_telephone}
                </a>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <StatBadge icon={<Users size={12} />} label={`${s.totalMissions} missions`} detail={`${s.missionsTerminees} terminées, ${s.missionsEnCours} en cours`} />
          {s.blocagesTotal > 0 && (
            <StatBadge icon={<AlertOctagon size={12} />} label={`${s.blocagesOuverts} blocages ouverts`} detail={`${s.blocagesTotal} total`} danger={s.blocagesOuverts > 0} />
          )}
          {s.retardsTotal > 0 && (
            <StatBadge icon={<AlertTriangle size={12} />} label={`${s.retardsTotal} retards`} detail={`${s.retardsNonLus} non lus`} warning={s.retardsNonLus > 0} />
          )}
          <StatBadge icon={<CheckCircle size={12} />} label={`${s.totalPointages} pointages`} detail={`${s.pointagesConformes} conformes`} />
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* ═══ MISSIONS ═══ */}
        {c.missions.length > 0 && (
          <Section title="Missions" count={c.missions.length} icon={<FileText size={16} className="text-indigo-500" />}>
            <div className="space-y-2">
              {visibleMissions.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
                  <div className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${PHASE_COLORS[m.phase] || 'bg-stone-50 text-stone-600 border-stone-200'}`}>
                    {PHASE_LABEL[m.phase] || m.phase}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUT_COLORS[m.statut] || 'bg-stone-100 text-stone-600'}`}>
                        {m.statut}
                      </span>
                      {m.equipe_nom && <span className="text-xs text-stone-500">{m.equipe_nom}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-stone-400">
                      <span>Créée: {formatDate(m.date_creation)}</span>
                      {m.date_debut_effectif && <span>Début: {formatDateTime(m.date_debut_effectif)}</span>}
                      {m.date_fin_effectif && <span>Fin: {formatDateTime(m.date_fin_effectif)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {c.missions.length > 5 && (
              <button onClick={() => setShowAllMissions(!showAllMissions)}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 mt-2 transition-colors">
                {showAllMissions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showAllMissions ? 'Voir moins' : `Voir les ${c.missions.length} missions`}
              </button>
            )}
          </Section>
        )}

        {/* ═══ BLOCAGES ═══ */}
        {c.blocages.length > 0 && (
          <Section title="Blocages & Réquisitions" count={c.blocages.length} icon={<AlertOctagon size={16} className="text-rose-500" />}>
            <div className="space-y-2">
              {c.blocages.map(b => (
                <div key={b.id} className={`p-3 rounded-xl border ${
                  b.statut === 'ouvert' || b.statut === 'en_cours'
                    ? 'bg-rose-50 border-rose-200' : 'bg-stone-50 border-stone-100'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          b.priorite === 'critique' ? 'bg-rose-600 text-white' :
                          b.priorite === 'haute' ? 'bg-orange-500 text-white' :
                          'bg-stone-200 text-stone-600'
                        }`}>
                          {b.priorite}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          b.statut === 'ouvert' ? 'bg-rose-100 text-rose-700' :
                          b.statut === 'en_cours' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {b.statut}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-stone-700 mt-1.5">{b.raison_blocage}</p>
                      {b.motif_retard && <p className="text-[10px] text-stone-400 mt-1 italic">Motif retard: {b.motif_retard}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-stone-400">{formatDateTime(b.date_creation)}</p>
                      {b.date_resolution && (
                        <p className="text-[10px] text-emerald-500 mt-0.5">Résolu: {formatDate(b.date_resolution)}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ═══ RETARDS ═══ */}
        {c.retards.length > 0 && (
          <Section title="Notifications de Retard" count={c.retards.length} icon={<AlertTriangle size={16} className="text-amber-500" />}>
            <div className="space-y-2">
              {c.retards.map(r => (
                <div key={r.id} className={`p-3 rounded-xl border ${
                  !r.lue ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-100'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {!r.lue && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                        {r.equipe_nom && <span className="text-xs font-semibold text-stone-600">{r.equipe_nom}</span>}
                      </div>
                      <p className="text-xs text-stone-600 mt-1">{r.motif}</p>
                    </div>
                    <p className="text-[10px] text-stone-400 flex-shrink-0">{formatDateTime(r.date_creation)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ═══ POINTAGES RÉCENTS ═══ */}
        {c.pointages.length > 0 && (
          <Section title="Pointages (30 jours)" count={c.pointages.length} icon={<MapPin size={16} className="text-emerald-500" />}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-stone-400 border-b border-stone-100">
                    <th className="text-left py-2 font-semibold">Date</th>
                    <th className="text-left py-2 font-semibold">Équipe</th>
                    <th className="text-left py-2 font-semibold">Type</th>
                    <th className="text-center py-2 font-semibold">Géofence</th>
                    <th className="text-right py-2 font-semibold">Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePointages.map((p, i) => (
                    <tr key={i} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                      <td className="py-2 text-stone-600">{formatDateTime(p.horodatage)}</td>
                      <td className="py-2 font-medium text-stone-700">{p.equipe_nom}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${
                          p.type_pointage === 'matinal' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'
                        }`}>
                          {p.type_pointage === 'matinal' ? '🌅 Matinal' : '🌙 Fin'}
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        {p.dans_rayon ? (
                          <span className="text-emerald-500">✅</span>
                        ) : (
                          <span className="text-rose-500">❌</span>
                        )}
                      </td>
                      <td className={`py-2 text-right font-mono ${p.dans_rayon ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {p.distance_chantier_m != null ? `${Math.round(p.distance_chantier_m)}m` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {c.pointages.length > 10 && (
              <button onClick={() => setShowAllPointages(!showAllPointages)}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 mt-2 transition-colors">
                {showAllPointages ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showAllPointages ? 'Voir moins' : `Voir les ${c.pointages.length} pointages`}
              </button>
            )}
          </Section>
        )}

        {/* Empty state for all sections */}
        {c.missions.length === 0 && c.blocages.length === 0 && c.retards.length === 0 && c.pointages.length === 0 && (
          <div className="text-center py-8">
            <FileText size={32} className="text-stone-300 mx-auto mb-2" />
            <p className="text-sm text-stone-400">Aucune donnée disponible pour ce chantier</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── HELPER COMPONENTS ──────────────────────────────────────────── */
function StatBadge({ icon, label, detail, danger, warning }: {
  icon: React.ReactNode; label: string; detail: string; danger?: boolean; warning?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] ${
      danger ? 'bg-white/20 text-white' : warning ? 'bg-white/20 text-white' : 'bg-white/15 text-white/80'
    }`}>
      {icon}
      <span className="font-bold">{label}</span>
      {detail && <span className="text-white/50">({detail})</span>}
    </div>
  );
}

function Section({ title, count, icon, children }: {
  title: string; count: number; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-bold text-stone-700">{title}</h3>
        <span className="text-[10px] font-bold bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">{count}</span>
      </div>
      {children}
    </div>
  );
}

/* ─── TEAM TIMELINE COMPONENT ─────────────────────────────────────── */
function TeamTimeline({ team }: { team: TimesheetEquipe }) {
  const meta = TYPE_META[team.equipe_type] || TYPE_META.mixte;
  const Icon = meta.icon;
  const s = team.stats;

  const totalWorkedMin = (() => {
    if (!s.matinal) return null;
    const start = team.events.find(e => e.type === 'pointage_matin');
    const end = team.events.find(e => e.type === 'pointage_fin');
    if (!start) return null;
    const startMs = new Date(start.horodatage).getTime();
    const endMs = end ? new Date(end.horodatage).getTime() : Date.now();
    return Math.round((endMs - startMs) / 60000) - s.totalPausedMinutes;
  })();

  const formatMinutes = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`;
  };

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-stone-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center shadow-md`}>
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-stone-800">{team.equipe_nom}</p>
              <p className="text-[10px] text-stone-400">{meta.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {s.matinal && (
              <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full font-semibold">
                🌅 {s.matinal}
              </span>
            )}
            {s.arrivee && (
              <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-semibold">
                📍 {s.arrivee}
              </span>
            )}
            {s.isPaused && (
              <span className="flex items-center gap-1 text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full font-semibold animate-pulse">
                ⏸ En pause
              </span>
            )}
            {s.fin_journee && (
              <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full font-semibold">
                🌙 {s.fin_journee}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-stone-400">
          {totalWorkedMin !== null && totalWorkedMin > 0 && (
            <span className="flex items-center gap-1">
              <Clock size={12} /> Temps total: <span className="font-bold text-stone-600">{formatMinutes(totalWorkedMin)}</span>
            </span>
          )}
          {s.totalPausedMinutes > 0 && (
            <span className="flex items-center gap-1 text-orange-500">
              ⏸ Pauses: {formatMinutes(s.totalPausedMinutes)}
            </span>
          )}
          <span>{team.events.length} événement{team.events.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="px-5 py-4">
        {team.events.length === 0 ? (
          <p className="text-xs text-stone-300 italic text-center py-4">Aucun événement</p>
        ) : (
          <div className="relative">
            <div className="absolute left-[19px] top-2 bottom-2 w-[2px] bg-stone-100" />
            <div className="space-y-1">
              {team.events.map((evt, i) => (
                <EventRow key={i} event={evt} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── EVENT ROW COMPONENT ──────────────────────────────────────────── */
function EventRow({ event }: { event: TimesheetEvent }) {
  const style = EVENT_STYLE[event.type] || { bg: 'bg-stone-50', border: 'border-stone-200', dot: 'bg-stone-400' };

  return (
    <div className="flex items-start gap-3 relative">
      <div className={`w-[10px] h-[10px] rounded-full ${style.dot} mt-[7px] z-10 shrink-0 ring-2 ring-white`} />
      <span className="text-xs font-mono font-bold text-stone-400 w-12 shrink-0 mt-1">{event.heure}</span>
      <div className={`flex-1 ${style.bg} border ${style.border} rounded-xl px-3 py-2 mb-1`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">{event.icon}</span>
            <span className="text-xs font-semibold text-stone-700">{event.label}</span>
          </div>
          {event.en_cours && (
            <span className="text-[9px] font-bold text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full animate-pulse">
              EN COURS
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-stone-400">
          {event.chantier && (
            <span className="flex items-center gap-1">
              <MapPin size={9} /> {event.chantier}
            </span>
          )}
          {event.distance !== undefined && event.distance !== null && (
            <span className={event.conforme ? 'text-emerald-500' : 'text-rose-500'}>
              {event.conforme ? '✅' : '❌'} {Math.round(event.distance)}m
            </span>
          )}
          {event.duree_minutes !== undefined && event.duree_minutes !== null && (
            <span className="text-orange-500 font-medium">
              {event.duree_minutes}min
            </span>
          )}
          {event.heure_fin && (
            <span>→ {event.heure_fin}</span>
          )}
          {event.motif && (
            <span className="italic">{event.motif}</span>
          )}
        </div>
      </div>
    </div>
  );
}
