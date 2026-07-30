'use client';
import { useState, useEffect } from 'react';
import { fetchIncidents, type IncidentData } from '@/lib/api';
import { AlertTriangle, Loader2, CheckCircle, Clock, Filter, Search } from 'lucide-react';

const PRIORITE: Record<string, string> = {
  critique: 'bg-rose-500 text-white', haute: 'bg-orange-500 text-white',
  moyenne: 'bg-amber-400 text-stone-800', basse: 'bg-stone-100 text-stone-500',
};

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  return `Il y a ${Math.floor(min / 60)}h`;
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreType, setFiltreType] = useState('Tous');

  useEffect(() => { fetchIncidents().then(setIncidents).catch(() => {}).finally(() => setLoading(false)); }, []);

  const filtered = filtreType === 'Tous' ? incidents : incidents.filter(i => i.type === filtreType.toLowerCase());
  const blocages = incidents.filter(i => i.type === 'blocage');
  const pointages = incidents.filter(i => i.type === 'pointage');
  const critiques = incidents.filter(i => i.priorite === 'critique');

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={36} className="animate-spin text-indigo-500" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-stone-800">Incidents & Blocages</h1>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-stone-100 shadow-sm p-5">
          <p className="text-[11px] font-semibold text-stone-400 uppercase mb-1">Blocages Actifs</p>
          <p className="text-2xl font-bold text-rose-500">{blocages.length}</p>
        </div>
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-stone-100 shadow-sm p-5">
          <p className="text-[11px] font-semibold text-stone-400 uppercase mb-1">Critiques</p>
          <p className="text-2xl font-bold text-rose-500">{critiques.length}</p>
        </div>
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-stone-100 shadow-sm p-5">
          <p className="text-[11px] font-semibold text-stone-400 uppercase mb-1">Pointages</p>
          <p className="text-2xl font-bold text-indigo-500">{pointages.length}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-6">
        {['Tous', 'Blocages', 'Pointages'].map(f => (
          <button key={f} onClick={() => setFiltreType(f)}
            className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-all ${filtreType === f ? 'bg-stone-800 text-white shadow-sm' : 'bg-white/80 text-stone-400 border border-stone-100 hover:text-stone-600'}`}>
            {f}
          </button>
        ))}
        <span className="text-xs text-stone-300 ml-auto">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
      </div>

      {/* Incident list */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm divide-y divide-stone-100">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-stone-400 text-sm">Aucun incident à signaler.</p>
        ) : filtered.map((inc, i) => (
          <div key={i} className="px-6 py-4 hover:bg-stone-50/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 mt-2 rounded-full shrink-0 ${inc.type === 'blocage' ? 'bg-rose-400' : 'bg-indigo-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-stone-700">{inc.message}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{inc.nom_chantier}</p>
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
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] text-stone-400 bg-stone-50 px-2 py-0.5 rounded-full">
                    {inc.type === 'blocage' ? '⛔ Blocage' : '📍 Pointage'}
                  </span>
                  {inc.type === 'blocage' && (
                    <button className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full hover:bg-emerald-100">
                      Résoudre
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
