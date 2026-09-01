'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Package, Clock, Truck, CheckCircle, XCircle, RefreshCw, Eye, Camera,
  Filter, Loader2, ArrowRight, AlertTriangle, MapPin,
} from 'lucide-react';

const STATUT_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  EN_ATTENTE: { label: 'En attente', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Clock },
  EN_PREPARATION: { label: 'En préparation', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Package },
  EXPEDIE: { label: 'Expédié', color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', icon: Truck },
  LIVREE: { label: 'Livrée', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle },
  TRAITE: { label: 'Traité', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle },
  REFUSE: { label: 'Refusé', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle },
};

const NEXT_STATUS: Record<string, string> = {
  EN_ATTENTE: 'EN_PREPARATION',
  EN_PREPARATION: 'EXPEDIE',
  EXPEDIE: 'LIVREE',
};

const NEXT_LABEL: Record<string, string> = {
  EN_ATTENTE: '📦 Commencer préparation',
  EN_PREPARATION: '🚚 Expédier',
  EXPEDIE: '✅ Marquer livré',
};

interface Demande {
  id: string; type_demande: string; statut: string; description: string | null;
  items: any[]; photo_url: string | null; date_creation: string;
  equipe_nom: string; equipe_type: string; chantier_nom: string; chantier_id: string; chantier_adresse: string;
}

interface Stats {
  en_attente: number; en_preparation: number; expedie: number; livre: number; refuse: number; total: number;
}

export default function MagasinierDashboardPage() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const token = localStorage.getItem('rmasc_magasinier_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [dRes, sRes] = await Promise.all([
        fetch(`/api/magasinier/demandes${filtreStatut !== 'tous' ? `?statut=${filtreStatut}` : ''}`, { headers }),
        fetch('/api/magasinier/stats', { headers }),
      ]);
      if (dRes.ok) setDemandes(await dRes.json());
      if (sRes.ok) setStats(await sRes.json());
    } catch {}
    setLoading(false);
  }, [filtreStatut]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') charger(); }, 15000);
    return () => clearInterval(iv);
  }, [charger]);

  const changerStatut = async (id: string, statut: string) => {
    setUpdatingId(id);
    try {
      const token = localStorage.getItem('rmasc_magasinier_token');
      const res = await fetch(`/api/magasinier/demandes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ statut }),
      });
      if (res.ok) charger();
    } catch {}
    setUpdatingId(null);
  };

  const detail = demandes.find(d => d.id === detailId);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 size={36} className="animate-spin text-amber-500" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Demandes Équipements</h1>
          <p className="text-sm text-stone-400">Gérez les demandes de matériel de vos chantiers assignés</p>
        </div>
        <button onClick={charger} className="p-2 rounded-xl bg-white border border-stone-100 text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'En attente', value: stats.en_attente, color: 'amber', icon: Clock },
            { label: 'En préparation', value: stats.en_preparation, color: 'blue', icon: Package },
            { label: 'Expédié', value: stats.expedie, color: 'cyan', icon: Truck },
            { label: 'Livrées', value: stats.livre, color: 'emerald', icon: CheckCircle },
          ].map(s => (
            <div key={s.label} className="bg-white/90 backdrop-blur-md rounded-2xl border border-stone-100 p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-${s.color}-50 flex items-center justify-center`}>
                  <s.icon size={18} className={`text-${s.color}-500`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-800">{s.value}</p>
                  <p className="text-[10px] text-stone-400 font-medium uppercase">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter size={14} className="text-stone-400 shrink-0" />
        {['tous', 'EN_ATTENTE', 'EN_PREPARATION', 'EXPEDIE', 'LIVREE', 'REFUSE'].map(s => (
          <button key={s} onClick={() => setFiltreStatut(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${filtreStatut === s ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}>
            {s === 'tous' ? 'Tous' : STATUT_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Demands List */}
      {demandes.length === 0 ? (
        <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 p-12 text-center">
          <Package size={40} className="text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-400">Aucune demande pour le moment</p>
        </div>
      ) : (
        <div className="space-y-2">
          {demandes.map(d => {
            const cfg = STATUT_CONFIG[d.statut] || STATUT_CONFIG.EN_ATTENTE;
            const Icon = cfg.icon;
            const nbItems = Array.isArray(d.items) ? d.items.length : 0;

            return (
              <div key={d.id} className="bg-white/90 backdrop-blur-md rounded-2xl border border-stone-100 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        <Icon size={10} /> {cfg.label}
                      </span>
                      <span className="text-[10px] text-stone-400">{d.date_creation}</span>
                    </div>
                    <p className="text-sm font-semibold text-stone-800">{d.equipe_nom}</p>
                    <div className="flex items-center gap-1 text-xs text-stone-400 mt-0.5">
                      <MapPin size={10} /> {d.chantier_nom}
                    </div>
                    <p className="text-xs text-stone-500 mt-1">{nbItems} article{nbItems !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.photo_url && (
                      <a href={d.photo_url.startsWith('http') ? d.photo_url : `https://onsite.sarl-rmasc.com${d.photo_url}`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 transition-all">
                        <Camera size={14} />
                      </a>
                    )}
                    <button onClick={() => setDetailId(d.id)}
                      className="p-2 rounded-lg bg-stone-50 text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-all">
                      <Eye size={14} />
                    </button>
                    {NEXT_STATUS[d.statut] && (
                      <button onClick={() => changerStatut(d.id, NEXT_STATUS[d.statut])} disabled={updatingId === d.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-[10px] font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50">
                        {updatingId === d.id ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                        {NEXT_LABEL[d.statut]}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetailId(null)}>
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-stone-800">Détails de la demande</h2>
                <button onClick={() => setDetailId(null)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:text-stone-600">
                  <XCircle size={16} />
                </button>
              </div>

              {/* Status */}
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${STATUT_CONFIG[detail.statut]?.bg} ${STATUT_CONFIG[detail.statut]?.color} ${STATUT_CONFIG[detail.statut]?.border} mb-4`}>
                {(() => { const I = STATUT_CONFIG[detail.statut]?.icon; return I ? <I size={12} /> : null; })()}
                {STATUT_CONFIG[detail.statut]?.label || detail.statut}
              </div>

              {/* Info */}
              <div className="space-y-3 mb-4">
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="text-[10px] text-stone-400 font-semibold uppercase mb-1">Équipe</p>
                  <p className="text-sm font-semibold text-stone-700">{detail.equipe_nom}</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <p className="text-[10px] text-stone-400 font-semibold uppercase mb-1">Chantier</p>
                  <p className="text-sm font-semibold text-stone-700">{detail.chantier_nom}</p>
                  {detail.chantier_adresse && <p className="text-xs text-stone-400 mt-0.5">{detail.chantier_adresse}</p>}
                </div>
                {detail.description && (
                  <div className="bg-stone-50 rounded-xl p-3">
                    <p className="text-[10px] text-stone-400 font-semibold uppercase mb-1">Description</p>
                    <p className="text-sm text-stone-600">{detail.description}</p>
                  </div>
                )}
              </div>

              {/* Photo */}
              {detail.photo_url && (
                <div className="mb-4">
                  <p className="text-[10px] text-stone-400 font-semibold uppercase mb-2">Photo</p>
                  <a href={detail.photo_url.startsWith('http') ? detail.photo_url : `https://onsite.sarl-rmasc.com${detail.photo_url}`}
                    target="_blank" rel="noopener noreferrer"
                    className="block rounded-xl overflow-hidden border border-stone-100">
                    <img src={detail.photo_url.startsWith('http') ? detail.photo_url : `https://onsite.sarl-rmasc.com${detail.photo_url}`}
                      alt="Photo demande" className="w-full max-h-60 object-cover" />
                  </a>
                </div>
              )}

              {/* Items */}
              <div className="mb-4">
                <p className="text-[10px] text-stone-400 font-semibold uppercase mb-2">Articles demandés</p>
                <div className="space-y-1.5">
                  {Array.isArray(detail.items) && detail.items.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Package size={12} className="text-stone-400" />
                        <span className="text-sm text-stone-700">{item.nom}</span>
                      </div>
                      <span className="text-xs font-semibold text-stone-500">×{item.quantite || 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              {NEXT_STATUS[detail.statut] && (
                <button onClick={() => { changerStatut(detail.id, NEXT_STATUS[detail.statut]); setDetailId(null); }}
                  disabled={updatingId === detail.id}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50">
                  {updatingId === detail.id ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  {NEXT_LABEL[detail.statut]}
                </button>
              )}
              {detail.statut === 'EN_ATTENTE' && (
                <button onClick={() => { changerStatut(detail.id, 'REFUSE'); setDetailId(null); }}
                  className="w-full flex items-center justify-center gap-2 py-3 mt-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold border border-red-200 hover:bg-red-100 transition-all">
                  <XCircle size={16} /> Refuser
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
