'use client';
import { useState, useEffect, useCallback } from 'react';
import { fetchIncidents, annulerBlocage, type IncidentData } from '@/lib/api';
import {
  AlertTriangle, Loader2, Clock, Filter, Search, Ban, ExternalLink,
  PauseCircle, MapPin, Camera, User, ChevronDown, CheckCircle, PlayCircle,
  Package,
} from 'lucide-react';

/* ─── CONSTANTS ────────────────────────────────────────────────────── */
const PRIORITE: Record<string, string> = {
  critique: 'bg-rose-500 text-white',
  haute: 'bg-orange-500 text-white',
  moyenne: 'bg-amber-400 text-stone-800',
  basse: 'bg-stone-100 text-stone-500',
};

const TYPE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  blocage:  { label: 'Blocage',       icon: Ban,           color: 'text-rose-600',    bg: 'bg-rose-50' },
  retard:   { label: 'Retard',        icon: Clock,         color: 'text-orange-600',  bg: 'bg-orange-50' },
  pause:    { label: 'Pause',         icon: PauseCircle,   color: 'text-amber-600',   bg: 'bg-amber-50' },
  reprise:  { label: 'Reprise',       icon: PlayCircle,    color: 'text-emerald-600',  bg: 'bg-emerald-50' },
  pointage: { label: 'Pointage',      icon: MapPin,        color: 'text-indigo-600',  bg: 'bg-indigo-50' },
  materiel: { label: 'Matériel',      icon: Package,       color: 'text-sky-600',     bg: 'bg-sky-50' },
};

const FILTRES = ['Tous', 'Blocages', 'Retards', 'Pauses', 'Reprises', 'Matériel', 'Pointages'];
const FILTRE_MAP: Record<string, string | null> = {
  Tous: null, Blocages: 'blocage', Retards: 'retard', Pauses: 'pause', Reprises: 'reprise', 'Matériel': 'materiel', Pointages: 'pointage',
};

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h}h${min % 60 > 0 ? ` ${min % 60}m` : ''}`;
  return `Il y a ${Math.floor(h / 24)}j`;
}

/* ─── MAIN PAGE ────────────────────────────────────────────────────── */
export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreType, setFiltreType] = useState('Tous');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchIncidents();
      setIncidents(data);
    } catch {
      setToast({ type: 'error', text: 'Erreur chargement incidents' });
      setTimeout(() => setToast(null), 4000);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAnnulerBlocage = async (blocageId: string) => {
    setCancelling(blocageId);
    try {
      await annulerBlocage(blocageId, 'Annulé depuis incidents');
      setToast({ type: 'success', text: 'Blocage annulé.' });
      await load();
    } catch (e: any) {
      setToast({ type: 'error', text: e.message || 'Erreur annulation' });
    }
    setCancelling(null);
    setTimeout(() => setToast(null), 3000);
  };

  // Filtering
  const filtreFonc = FILTRE_MAP[filtreType];
  let filtered = filtreFonc ? incidents.filter(i => i.type === filtreFonc) : incidents;
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(i =>
      (i.message || '').toLowerCase().includes(q) ||
      (i.nom_chantier || '').toLowerCase().includes(q) ||
      (i.equipe_nom || '').toLowerCase().includes(q)
    );
  }

  // Metrics
  const blocages = incidents.filter(i => i.type === 'blocage');
  const retards  = incidents.filter(i => i.type === 'retard');
  const pauses   = incidents.filter(i => i.type === 'pause');
  const reprises = incidents.filter(i => i.type === 'reprise');
  const materiels = incidents.filter(i => i.type === 'materiel');
  const pointages = incidents.filter(i => i.type === 'pointage');
  const critiques = incidents.filter(i => i.priorite === 'critique');

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 size={36} className="animate-spin text-indigo-500" />
    </div>
  );

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          {toast.text}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Incidents & Événements</h1>
          <p className="text-xs text-stone-400 mt-0.5">{incidents.length} événement{incidents.length !== 1 ? 's' : ''} au total</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 sm:gap-3 mb-6">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-stone-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-stone-400 uppercase mb-1">Total</p>
          <p className="text-2xl font-bold text-stone-700">{incidents.length}</p>
        </div>
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-rose-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-rose-400 uppercase mb-1">Blocages</p>
          <p className="text-2xl font-bold text-rose-500">{blocages.length}</p>
        </div>
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-orange-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-orange-400 uppercase mb-1">Retards</p>
          <p className="text-2xl font-bold text-orange-500">{retards.length}</p>
        </div>
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-amber-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-amber-400 uppercase mb-1">Pauses</p>
          <p className="text-2xl font-bold text-amber-500">{pauses.length}</p>
        </div>
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-emerald-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-emerald-400 uppercase mb-1">Reprises</p>
          <p className="text-2xl font-bold text-emerald-500">{reprises.length}</p>
        </div>
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-sky-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-sky-400 uppercase mb-1">Matériel</p>
          <p className="text-2xl font-bold text-sky-500">{materiels.length}</p>
        </div>
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-indigo-100 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-indigo-400 uppercase mb-1">Pointages</p>
          <p className="text-2xl font-bold text-indigo-500">{pointages.length}</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {FILTRES.map(f => (
          <button key={f} onClick={() => setFiltreType(f)}
            className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-all ${
              filtreType === f ? 'bg-stone-800 text-white shadow-sm' : 'bg-white/80 text-stone-400 border border-stone-100 hover:text-stone-600'
            }`}>
            {f}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            className="pl-8 pr-3 py-1.5 bg-white/80 border border-stone-100 rounded-xl text-xs outline-none focus:border-stone-300 w-44"
          />
        </div>
        <span className="text-xs text-stone-300">{filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Incident list */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm divide-y divide-stone-100">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-stone-400 text-sm">Aucun incident à afficher.</p>
        ) : filtered.map((inc, i) => {
          const meta = TYPE_META[inc.type] || TYPE_META.blocage;
          const Icon = meta.icon;
          return (
            <div key={i} className="px-4 sm:px-6 py-4 hover:bg-stone-50/50 transition-colors">
              <div className="flex items-start gap-3">
                {/* Type icon */}
                <div className={`w-9 h-9 rounded-xl ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon size={16} className={meta.color} />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-700 truncate">{inc.message || '—'}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-stone-400">{inc.nom_chantier}</span>
                        {inc.equipe_nom && (
                          <span className="text-[10px] font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                            👷 {inc.equipe_nom}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {inc.priorite && (
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${PRIORITE[inc.priorite] || 'bg-stone-100 text-stone-500'}`}>
                          {inc.priorite.toUpperCase()}
                        </span>
                      )}
                      <span className="text-[10px] text-stone-300 whitespace-nowrap">{timeAgo(inc.moment)}</span>
                    </div>
                  </div>

                  {/* Tags & Actions */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-stone-300">•</span>
                    <span className="text-[10px] text-stone-400">{inc.moment}</span>

                    {/* Photo link */}
                    {inc.photo_url && (
                      <a href={inc.photo_url.startsWith('http') ? inc.photo_url : `https://onsite.sarl-rmasc.com${inc.photo_url}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors">
                        <Camera size={10} /> Photo <ExternalLink size={9} />
                      </a>
                    )}

                    {/* Cancel blocage button */}
                    {inc.type === 'blocage' && inc.blocage_id && (
                      <button
                        onClick={() => handleAnnulerBlocage(inc.blocage_id!)}
                        disabled={cancelling === inc.blocage_id}
                        className="flex items-center gap-1 text-[10px] font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full hover:bg-rose-100 transition-colors disabled:opacity-50"
                      >
                        {cancelling === inc.blocage_id ? <Loader2 size={10} className="animate-spin" /> : <Ban size={10} />}
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
