'use client';
import { useState, useEffect } from 'react';
import { fetchChantiers, type ChantierData } from '@/lib/api';
import { Search, Wrench, Zap, Shield, Loader2, Plus, ArrowUpRight, Clock } from 'lucide-react';

const PHASE_ICON: Record<string, any> = { mecanique: Wrench, electrique: Zap, verification: Shield };
const PHASE_COLOR: Record<string, string> = { mecanique: 'text-blue-600 bg-blue-50', electrique: 'text-orange-600 bg-orange-50', verification: 'text-emerald-600 bg-emerald-50' };
const STATUT_DOT: Record<string, string> = { en_cours: 'bg-emerald-400', bloque: 'bg-rose-400', planifie: 'bg-indigo-400', termine: 'bg-stone-300', en_attente: 'bg-amber-400', reception_officielle: 'bg-emerald-300' };

export default function ChantiersPage() {
  const [chantiers, setChantiers] = useState<ChantierData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('Tous');
  const [recherche, setRecherche] = useState('');

  useEffect(() => { fetchChantiers().then(setChantiers).catch(() => {}).finally(() => setLoading(false)); }, []);

  const filtres = ['Tous', 'En cours', 'Bloqués', 'Planifiés', 'Terminés'];
  const statMap: Record<string, string> = { 'En cours': 'en_cours', 'Bloqués': 'bloque', 'Planifiés': 'planifie', 'Terminés': 'termine' };

  const filtered = chantiers.filter(c => {
    if (filtreStatut !== 'Tous' && c.statut !== statMap[filtreStatut]) return false;
    if (recherche && !c.nom.toLowerCase().includes(recherche.toLowerCase()) && !c.ref.toLowerCase().includes(recherche.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={36} className="animate-spin text-indigo-500" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-stone-800">Chantiers <span className="text-stone-400 font-normal">({chantiers.length})</span></h1>
        <button className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-600 shadow-sm">
          <Plus size={16} /> Nouveau Chantier
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex items-center gap-2 bg-white/80 rounded-2xl px-4 py-2 border border-stone-100 shadow-sm flex-1">
          <Search size={16} className="text-stone-300" />
          <input placeholder="Rechercher un chantier..." value={recherche} onChange={e => setRecherche(e.target.value)}
            className="bg-transparent text-sm text-stone-600 outline-none flex-1 placeholder:text-stone-300" />
        </div>
        <div className="flex bg-white/80 rounded-2xl border border-stone-100 shadow-sm p-1 gap-1 flex-wrap">
          {filtres.map(f => (
            <button key={f} onClick={() => setFiltreStatut(f)}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-all ${filtreStatut === f ? 'bg-stone-800 text-white shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>{f}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <p className="col-span-full text-center text-stone-400 py-16">Aucun chantier trouvé.</p>
        ) : filtered.map(c => {
          const Icon = PHASE_ICON[c.nom.includes('Meca') ? 'mecanique' : c.nom.includes('Elec') ? 'electrique' : 'verification'] || Wrench;
          const phase = c.nom.includes('Meca') ? 'Mécanique' : c.nom.includes('Elec') ? 'Électrique' : 'Vérification';
          return (
            <div key={c.id} className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5 hover:shadow-md transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 mt-0.5 rounded-full shrink-0 ${STATUT_DOT[c.statut] || 'bg-stone-300'}`} />
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{c.nom}</p>
                    <p className="text-[10px] text-stone-400 font-mono">{c.ref}</p>
                  </div>
                </div>
                <ArrowUpRight size={14} className="text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center gap-2 text-xs text-stone-500 mb-3">
                <span>{c.client_nom || 'Client inconnu'}</span>
                <span className="text-stone-300">•</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${PHASE_COLOR[phase.toLowerCase()] || 'bg-stone-100 text-stone-600'}`}>
                  <Icon size={12} /> {phase}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>📍 {c.lat?.toFixed(2)}, {c.lng?.toFixed(2)}</span>
                {c.en_cours > 0 && <span className="text-emerald-600 font-medium">🔄 {c.en_cours} mission{c.en_cours > 1 ? 's' : ''}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
