'use client';
import { useEffect, useState } from 'react';
import {
  Package, AlertTriangle, Eye, ChevronDown, CheckCircle, Clock,
  XCircle, Filter, RefreshCw, ExternalLink,
} from 'lucide-react';
import { fetchDemandesMateriel, modifierStatutDemande, DemandeMateriel } from '@/lib/api';

export default function DemandesPage() {
  const [demandes, setDemandes] = useState<DemandeMateriel[]>([]);
  const [onglet, setOnglet] = useState<'materiel' | 'retard'>('materiel');
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [chargement, setChargement] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  const charger = async () => {
    setChargement(true);
    try {
      const data = await fetchDemandesMateriel(onglet, filtreStatut === 'tous' ? undefined : filtreStatut);
      setDemandes(data);
    } catch { setDemandes([]); }
    setChargement(false);
  };

  useEffect(() => { charger(); }, [onglet, filtreStatut]);

  const changerStatut = async (id: string, statut: string) => {
    try {
      await modifierStatutDemande(id, statut);
      setDemandes(prev => prev.map(d => d.id === id ? { ...d, statut } : d));
    } catch {}
  };

  const detail = demandes.find(d => d.id === detailId);

  const statsParStatut = (type: string) => {
    const items = demandes.filter(d => d.type_demande === type);
    return {
      total: items.length,
      attente: items.filter(d => d.statut === 'EN_ATTENTE').length,
      cours: items.filter(d => d.statut === 'EN_COURS').length,
      traite: items.filter(d => d.statut === 'TRAITE').length,
    };
  };

  const statsM = statsParStatut('materiel');
  const statsR = statsParStatut('retard');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-stone-800">Demandes & Signalements</h1>
          <p className="text-xs text-stone-400 mt-1">Gestion des demandes matériel et retards chantier</p>
        </div>
        <button onClick={charger} className="p-2 rounded-lg hover:bg-stone-100 text-stone-400">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-stone-100/80 rounded-xl">
        <button
          onClick={() => setOnglet('materiel')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            onglet === 'materiel'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-stone-400 hover:text-stone-600'
          }`}
        >
          <Package size={16} />
          <span className="hidden sm:inline">Demandes Matériel</span>
          <span className="sm:hidden">Matériel</span>
          {statsM.attente > 0 && (
            <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
              {statsM.attente}
            </span>
          )}
        </button>
        <button
          onClick={() => setOnglet('retard')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            onglet === 'retard'
              ? 'bg-white text-amber-600 shadow-sm'
              : 'text-stone-400 hover:text-stone-600'
          }`}
        >
          <AlertTriangle size={16} />
          <span className="hidden sm:inline">Signalements Retard</span>
          <span className="sm:hidden">Retards</span>
          {statsR.attente > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {statsR.attente}
            </span>
          )}
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-stone-400" />
        <div className="flex gap-1.5 flex-wrap">
          {['tous', 'EN_ATTENTE', 'EN_PREPARATION', 'EN_COURS', 'EN_ROUTE', 'EXPEDIE', 'LIVREE', 'TRAITE', 'REFUSE'].map(s => (
            <button
              key={s}
              onClick={() => setFiltreStatut(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtreStatut === s
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
              }`}
            >
              {s === 'tous' ? 'Tous' : s === 'EN_ATTENTE' ? 'En attente' : s === 'EN_PREPARATION' ? '📦 En préparation' : s === 'EN_COURS' ? 'En cours' : s === 'EN_ROUTE' ? 'En route' : s === 'EXPEDIE' ? '🚚 Expédié' : s === 'LIVREE' ? 'Livrée' : s === 'TRAITE' ? 'Traité' : 'Refusé'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-white rounded-xl border border-stone-100 p-3 sm:p-4">
          <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">Total</p>
          <p className="text-xl sm:text-2xl font-bold text-stone-800 mt-1">{demandes.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-stone-100 p-3 sm:p-4">
          <p className="text-[10px] text-amber-500 font-medium uppercase tracking-wider">En attente</p>
          <p className="text-xl sm:text-2xl font-bold text-amber-600 mt-1">
            {demandes.filter(d => d.statut === 'EN_ATTENTE').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-stone-100 p-3 sm:p-4">
          <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wider">En cours</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">
            {demandes.filter(d => d.statut === 'EN_COURS').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-stone-100 p-3 sm:p-4">
          <p className="text-[10px] text-emerald-500 font-medium uppercase tracking-wider">Traités</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">
            {demandes.filter(d => d.statut === 'TRAITE').length}
          </p>
        </div>
      </div>

      {/* Liste */}
      {chargement ? (
        <div className="text-center py-12 text-stone-400">
          <div className="w-6 h-6 border-2 border-stone-300 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Chargement...
        </div>
      ) : demandes.length === 0 ? (
        <div className="text-center py-12 text-stone-400">
          <Package size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">Aucune demande {onglet === 'materiel' ? 'de matériel' : 'de retard'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {demandes.map(d => {
            const isRetard = d.type_demande === 'retard';
            const statutColor = d.statut === 'EN_ATTENTE'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : d.statut === 'EN_PREPARATION'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : d.statut === 'EN_COURS'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : d.statut === 'EN_ROUTE'
              ? 'bg-sky-50 text-sky-700 border-sky-200'
              : d.statut === 'EXPEDIE'
              ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
              : d.statut === 'LIVREE'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : d.statut === 'TRAITE'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200';
            const statutIcon = d.statut === 'EN_ATTENTE'
              ? <Clock size={12} />
              : d.statut === 'EN_PREPARATION'
              ? <Package size={12} />
              : d.statut === 'EN_COURS'
              ? <RefreshCw size={12} />
              : d.statut === 'EN_ROUTE'
              ? <Package size={12} />
              : d.statut === 'EXPEDIE'
              ? <Package size={12} />
              : d.statut === 'LIVREE'
              ? <CheckCircle size={12} />
              : d.statut === 'TRAITE'
              ? <CheckCircle size={12} />
              : <XCircle size={12} />;
            const nbItems = Array.isArray(d.items) ? d.items.length : 0;

            return (
              <div key={d.id} className="bg-white rounded-xl border border-stone-100 p-3 sm:p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statutColor}`}>
                        {statutIcon}
                        {d.statut === 'EN_ATTENTE' ? 'En attente' : d.statut === 'EN_PREPARATION' ? 'En préparation' : d.statut === 'EN_COURS' ? 'En cours' : d.statut === 'EN_ROUTE' ? 'En route' : d.statut === 'EXPEDIE' ? 'Expédié' : d.statut === 'LIVREE' ? 'Livrée' : d.statut === 'TRAITE' ? 'Traité' : 'Refusé'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isRetard ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        {isRetard ? '⚠ RETARD' : '📦 MATÉRIEL'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-stone-800 truncate">{d.equipe_nom}</p>
                    <p className="text-xs text-stone-400 truncate">{d.chantier_nom} {d.chantier_ref ? `(${d.chantier_ref})` : ''}</p>
                    {d.description && (
                      <p className="text-xs text-stone-500 mt-1 line-clamp-1">{d.description}</p>
                    )}
                    <p className="text-[10px] text-stone-300 mt-1">{d.date_creation} · {nbItems} article{nbItems > 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {d.statut === 'EN_ATTENTE' && (
                      <select
                        value={d.statut}
                        onChange={e => changerStatut(d.id, e.target.value)}
                        className="text-[10px] border border-stone-200 rounded-lg px-2 py-1.5 bg-white"
                      >
                        <option value="EN_ATTENTE">En attente</option>
                        <option value="EN_PREPARATION">📦 En préparation</option>
                        <option value="EN_COURS">En cours</option>
                        <option value="EN_ROUTE">📦 En route</option>
                        <option value="EXPEDIE">🚚 Expédié</option>
                        <option value="LIVREE">✅ Livrée</option>
                        <option value="TRAITE">Traité</option>
                        <option value="REFUSE">Refusé</option>
                      </select>
                    )}
                    <button
                      onClick={() => setDetailId(d.id)}
                      className="p-2 rounded-lg hover:bg-stone-100 text-stone-400"
                      title="Voir détails"
                    >
                      <Eye size={16} />
                    </button>
                    {d.pdf_url && (
                      <a
                        href={d.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-400"
                        title="Voir le PDF"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal détail */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetailId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className={`p-4 border-b ${detail.type_demande === 'retard' ? 'bg-amber-50' : 'bg-indigo-50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {detail.type_demande === 'retard' ? <AlertTriangle size={18} className="text-amber-600" /> : <Package size={18} className="text-indigo-600" />}
                  <h3 className="font-bold text-stone-800">
                    {detail.type_demande === 'retard' ? 'Signalement de retard' : 'Demande de matériel'}
                  </h3>
                </div>
                <button onClick={() => setDetailId(null)} className="text-stone-400 hover:text-stone-600">✕</button>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-stone-400 uppercase font-medium">Équipe</p>
                  <p className="text-sm font-semibold text-stone-800">{detail.equipe_nom}</p>
                </div>
                <div>
                  <p className="text-[10px] text-stone-400 uppercase font-medium">Chantier</p>
                  <p className="text-sm font-semibold text-stone-800">{detail.chantier_nom}</p>
                </div>
                <div>
                  <p className="text-[10px] text-stone-400 uppercase font-medium">Date</p>
                  <p className="text-sm text-stone-600">{detail.date_creation}</p>
                </div>
                <div>
                  <p className="text-[10px] text-stone-400 uppercase font-medium">Statut</p>
                  <select
                    value={detail.statut}
                    onChange={e => { changerStatut(detail.id, e.target.value); setDetailId(null); }}
                    className="text-sm border border-stone-200 rounded-lg px-2 py-1"
                  >
                    <option value="EN_ATTENTE">En attente</option>
                    <option value="EN_PREPARATION">📦 En préparation</option>
                    <option value="EN_COURS">En cours</option>
                    <option value="EN_ROUTE">📦 En route</option>
                    <option value="EXPEDIE">🚚 Expédié</option>
                    <option value="LIVREE">✅ Livrée</option>
                    <option value="TRAITE">Traité</option>
                    <option value="REFUSE">Refusé</option>
                  </select>
                </div>
              </div>

              {detail.description && (
                <div>
                  <p className="text-[10px] text-stone-400 uppercase font-medium mb-1">Description</p>
                  <p className="text-sm text-stone-600 bg-stone-50 rounded-xl p-3">{detail.description}</p>
                </div>
              )}

              <div>
                <p className="text-[10px] text-stone-400 uppercase font-medium mb-2">
                  {detail.type_demande === 'retard' ? 'Détails' : 'Articles demandés'}
                </p>
                <div className="space-y-1.5">
                  {(Array.isArray(detail.items) ? detail.items : []).map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-stone-50 rounded-lg px-3 py-2">
                      <span className="text-xs text-stone-400 font-mono">#{i + 1}</span>
                      <span className="text-sm font-medium text-stone-700 flex-1">{item.nom || '—'}</span>
                      <span className="text-xs text-stone-400">×{item.quantite || 1}</span>
                      {item.categorie && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-stone-200 text-stone-500 rounded">{item.categorie}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {detail.photo_url && (
                <div>
                  <p className="text-[10px] text-stone-400 uppercase font-medium mb-1">Photo</p>
                  <img src={detail.photo_url.startsWith('http') ? detail.photo_url : `https://onsite.sarl-rmasc.com${detail.photo_url}`} alt="Photo" className="rounded-xl max-h-48 object-cover" />
                </div>
              )}

              {detail.pdf_url && (
                <a
                  href={detail.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-indigo-50 text-indigo-600 rounded-xl px-4 py-3 text-sm font-medium hover:bg-indigo-100 transition-colors"
                >
                  <ExternalLink size={16} />
                  Voir / Imprimer le PDF (Bon de commande)
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
