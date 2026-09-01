'use client';
import { useState, useEffect } from 'react';
import {
  MapPin, Building2, Users, Loader2, Package, AlertTriangle, CheckCircle,
} from 'lucide-react';

interface ChantierMag {
  id: string; nom_chantier: string; adresse: string; statut: string; client_nom: string;
  complexite: string; date_creation: string; demandes_en_attente: number; missions_actives: number;
  equipe_actuelle: string | null;
}

const STATUT_COLORS: Record<string, string> = {
  en_cours: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  planifie: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  bloque: 'bg-red-50 text-red-700 border-red-200',
  termine: 'bg-stone-100 text-stone-500 border-stone-200',
};

export default function MagasinierChantiersPage() {
  const [chantiers, setChantiers] = useState<ChantierMag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('rmasc_magasinier_token');
    if (!token) return;
    fetch('/api/magasinier/chantiers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setChantiers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 size={36} className="animate-spin text-amber-500" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Mes Chantiers</h1>
        <p className="text-sm text-stone-400">Chantiers qui vous sont assignés</p>
      </div>

      {chantiers.length === 0 ? (
        <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 p-12 text-center">
          <Building2 size={40} className="text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-400">Aucun chantier assigné</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {chantiers.map(c => (
            <div key={c.id} className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-stone-800 truncate">{c.nom_chantier}</h3>
                  {c.client_nom && <p className="text-xs text-stone-400 mt-0.5">{c.client_nom}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUT_COLORS[c.statut] || STATUT_COLORS.planifie}`}>
                  {c.statut}
                </span>
              </div>

              {c.adresse && (
                <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-3">
                  <MapPin size={12} /> {c.adresse}
                </div>
              )}

              <div className="flex gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-stone-500">
                  <Package size={12} className="text-amber-500" />
                  <span className="font-semibold">{c.demandes_en_attente}</span> demande{c.demandes_en_attente !== 1 ? 's' : ''}
                </div>
                <div className="flex items-center gap-1.5 text-stone-500">
                  <CheckCircle size={12} className="text-emerald-500" />
                  <span className="font-semibold">{c.missions_actives}</span> mission{c.missions_actives !== 1 ? 's' : ''}
                </div>
              </div>

              {c.equipe_actuelle && (
                <div className="flex items-center gap-1.5 text-xs text-stone-400 mt-2">
                  <Users size={12} /> Équipe: <span className="font-semibold text-stone-600">{c.equipe_actuelle}</span>
                </div>
              )}

              <div className="mt-3 text-[10px] text-stone-300">
                Complexité: {c.complexite} · Créé le {c.date_creation}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
