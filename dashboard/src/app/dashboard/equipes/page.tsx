'use client';
import { useState, useEffect } from 'react';
import { fetchEquipes, type EquipeData } from '@/lib/api';
import { Users, Loader2, Wrench, Zap, Shield, Clock, CheckCircle, AlertCircle, Copy, Check } from 'lucide-react';

const STATUT_BADGE: Record<string, string> = {
  DISPONIBLE: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200',
  EN_MISSION: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200',
  EN_REPOS: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
};
const TYPE_ICON: Record<string, any> = { mecanique: Wrench, electrique: Zap, mixte: Shield };

export default function EquipesPage() {
  const [equipes, setEquipes] = useState<EquipeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('Toutes');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { fetchEquipes().then(setEquipes).catch(() => {}).finally(() => setLoading(false)); }, []);

  const filtres = ['Toutes', 'Disponibles', 'En Mission', 'En Repos'];
  const fMap: Record<string, string> = { Disponibles: 'DISPONIBLE', 'En Mission': 'EN_MISSION', 'En Repos': 'EN_REPOS' };
  const filtered = filtre === 'Toutes' ? equipes : equipes.filter(e => e.statut_equipe === fMap[filtre]);

  const copyId = (id: string, label: string) => {
    navigator.clipboard.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={36} className="animate-spin text-indigo-500" /></div>;

  const compteurs = {
    toutes: equipes.length,
    dispo: equipes.filter(e => e.statut_equipe === 'DISPONIBLE').length,
    mission: equipes.filter(e => e.statut_equipe === 'EN_MISSION').length,
    repos: equipes.filter(e => e.statut_equipe === 'EN_REPOS').length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-stone-800">Équipes <span className="text-stone-400 font-normal">({equipes.length})</span></h1>
      </div>

      {/* Filters + counts */}
      <div className="flex flex-wrap gap-3 mb-6">
        {filtres.map(f => {
          const count = f === 'Toutes' ? compteurs.toutes : f === 'Disponibles' ? compteurs.dispo : f === 'En Mission' ? compteurs.mission : compteurs.repos;
          return (
            <button key={f} onClick={() => setFiltre(f)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${filtre === f ? 'bg-stone-800 text-white shadow-sm' : 'bg-white/80 text-stone-400 border border-stone-100 hover:text-stone-600'}`}>
              {f} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Team cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {filtered.length === 0 ? (
          <p className="col-span-full text-center text-stone-400 py-16">Aucune équipe trouvée.</p>
        ) : filtered.map(eq => {
          const Icon = TYPE_ICON[eq.type] || Users;
          const identifiant = eq.type === 'mecanique' ? 'meca' : eq.type === 'electrique' ? 'elec' : 'verif';
          const idx = parseInt(eq.id.slice(-1)) || 1;
          return (
            <div key={eq.id} className={`bg-white/90 backdrop-blur-md rounded-3xl border shadow-sm p-5 transition-all ${
              eq.statut_equipe === 'EN_REPOS' ? 'border-amber-200' : eq.statut_equipe === 'EN_MISSION' ? 'border-indigo-200' : 'border-emerald-200'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                    eq.type === 'mecanique' ? 'bg-blue-500' : eq.type === 'electrique' ? 'bg-orange-500' : 'bg-emerald-500'
                  }`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-stone-800">{eq.nom}</p>
                    <p className="text-[10px] text-stone-400">{eq.type === 'mecanique' ? 'Mécanique' : eq.type === 'electrique' ? 'Électrique' : 'Vérification'}</p>
                  </div>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${STATUT_BADGE[eq.statut_equipe]}`}>
                  {eq.statut_equipe === 'DISPONIBLE' ? 'Disponible' : eq.statut_equipe === 'EN_MISSION' ? 'En mission' : 'En repos'}
                </span>
              </div>

              {/* Stats */}
              <div className="space-y-1.5 text-xs text-stone-500 mb-4">
                {eq.statut_equipe === 'EN_MISSION' && <p className="flex items-center gap-1.5"><Clock size={12} /> {eq.missions} mission{eq.missions > 1 ? 's' : ''} active{eq.missions > 1 ? 's' : ''}</p>}
                {eq.statut_equipe === 'EN_REPOS' && eq.jours_repos_restants > 0 && (
                  <p className="flex items-center gap-1.5 text-amber-600 font-medium">
                    <AlertCircle size={12} /> Disponible dans {eq.jours_repos_restants}j
                  </p>
                )}
                {eq.statut_equipe === 'DISPONIBLE' && <p className="flex items-center gap-1.5 text-emerald-600"><CheckCircle size={12} /> Prêt à intervenir</p>}
              </div>

              {/* Credentials */}
              <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                <p className="text-[9px] text-stone-400 uppercase font-semibold mb-1">Identifiants</p>
                <div className="flex items-center justify-between">
                  <code className="text-xs font-mono text-stone-600">{identifiant}{idx}</code>
                  <button onClick={() => copyId(`${identifiant}${idx}`, eq.id)}
                    className="text-stone-300 hover:text-stone-500 transition-colors">
                    {copied === eq.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-[9px] text-stone-300 font-mono mt-0.5">••••••••</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
