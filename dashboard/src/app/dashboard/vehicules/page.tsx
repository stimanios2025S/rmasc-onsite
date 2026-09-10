'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Car, Loader2, Plus, X, CheckCircle, AlertTriangle, RefreshCw,
  Trash2, Navigation, Gauge, Clock, Users, MapPin, Wrench,
} from 'lucide-react';
import {
  fetchVehicules, createVehicule, updateVehicule, deleteVehicule,
  syncVehicules, libererVehicule, fetchVehiculesHistorique,
  type VehiculeData,
} from '@/lib/api';
import AdminShell from '@/components/AdminShell';

const VehiculesMap = dynamic(() => import('./VehiculesMap'), { ssr: false });

const STATUT_META: Record<string, { label: string; classes: string }> = {
  DISPONIBLE: { label: 'Disponible', classes: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  EN_MISSION: { label: 'En mission', classes: 'bg-indigo-50 text-indigo-600 ring-indigo-200' },
  EN_PANNE: { label: 'En panne', classes: 'bg-rose-50 text-rose-500 ring-rose-200' },
};

export default function VehiculesPage() {
  const [vehicules, setVehicules] = useState<VehiculeData[]>([]);
  const [historique, setHistorique] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VehiculeData | null>(null);
  const [editTarget, setEditTarget] = useState<VehiculeData | null>(null);
  const [form, setForm] = useState({ nom: '', immatriculation: '', imei: '', geoflotte_id: '' });

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [v, h] = await Promise.all([fetchVehicules(), fetchVehiculesHistorique().catch(() => [])]);
      setVehicules(v);
      setHistorique(h);
    } catch (e: any) {
      showToast('error', e.message || 'Erreur chargement.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') loadAll(); }, 30000);
    return () => clearInterval(iv);
  }, [loadAll]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncVehicules();
      showToast('success', res.message || '✅ Positions mises à jour.');
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Sync impossible (mode manuel).');
    }
    setSyncing(false);
  };

  const openCreate = () => {
    setForm({ nom: '', immatriculation: '', imei: '', geoflotte_id: '' });
    setShowCreate(true);
  };
  const handleCreate = async () => {
    if (!form.nom.trim()) { showToast('error', 'Nom du véhicule requis.'); return; }
    setSaving(true);
    try {
      await createVehicule({
        nom: form.nom.trim(),
        immatriculation: form.immatriculation.trim() || undefined,
        imei: form.imei.trim() || undefined,
        geoflotte_id: form.geoflotte_id.trim() || undefined,
      });
      showToast('success', `✅ « ${form.nom.trim()} » ajouté.`);
      setShowCreate(false);
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Erreur création.');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await deleteVehicule(deleteTarget.id);
      showToast('success', res.message || '✅ Véhicule supprimé.');
      setDeleteTarget(null);
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Erreur suppression.');
    }
    setSaving(false);
  };

  const handleLiberer = async (v: VehiculeData) => {
    if (!confirm(`Libérer « ${v.nom} » ? Il sera de nouveau disponible.`)) return;
    setSaving(true);
    try {
      const res = await libererVehicule(v.id);
      showToast('success', res.message || '✅ Libéré.');
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Erreur.');
    }
    setSaving(false);
  };

  const handlePanne = async (v: VehiculeData, enPanne: boolean) => {
    setSaving(true);
    try {
      await updateVehicule(v.id, { statut: enPanne ? 'EN_PANNE' : 'DISPONIBLE' });
      showToast('success', enPanne ? `🔧 « ${v.nom} » marqué en panne.` : `✅ « ${v.nom} » de nouveau disponible.`);
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Erreur.');
    }
    setSaving(false);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await updateVehicule(editTarget.id, {
        nom: editTarget.nom,
        immatriculation: editTarget.immatriculation,
        imei: editTarget.imei,
        geoflotte_id: editTarget.geoflotte_id,
      });
      showToast('success', '✅ Véhicule mis à jour.');
      setEditTarget(null);
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Erreur.');
    }
    setSaving(false);
  };

  const avecPosition = vehicules.filter(v => v.latitude != null && v.longitude != null);
  const dispos = vehicules.filter(v => v.statut === 'DISPONIBLE').length;
  const enMission = vehicules.filter(v => v.statut === 'EN_MISSION').length;

  if (loading) return (
    <AdminShell title="Véhicules" subtitle="Chargement…">
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={36} className="animate-spin text-stone-400" />
      </div>
    </AdminShell>
  );

  return (
    <AdminShell title="Véhicules" subtitle={`${vehicules.length} véhicule${vehicules.length > 1 ? 's' : ''} • ${dispos} dispo • ${enMission} en mission`}
      onRefresh={loadAll}
      actions={<div className="flex gap-2 w-full sm:w-auto">
        <button onClick={handleSync} disabled={syncing}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-white border border-stone-200 text-stone-600 text-sm font-bold hover:shadow transition-all disabled:opacity-50 min-h-[44px]">
          {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} GPS
        </button>
        <button onClick={openCreate}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-bold hover:bg-stone-700 transition-all shadow-md min-h-[44px]">
          <Plus size={16} /> Véhicule
        </button>
      </div>}>
      {toast && (
        <div className={`fixed top-[max(env(safe-area-inset-top),12px)] left-3 right-3 sm:left-auto sm:right-4 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg flex items-center gap-2 break-words ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {toast.text}
        </div>
      )}

      {/* ═══ CARTE GPS ═══ */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm overflow-hidden mb-4">
        <div className="px-5 py-3 flex items-center gap-2 border-b border-stone-100">
          <Navigation size={15} className="text-indigo-500" />
          <h2 className="font-bold text-sm text-stone-800">Positions GPS en direct</h2>
          <span className="text-[10px] text-stone-400 ml-auto">{avecPosition.length} localisé{avecPosition.length > 1 ? 's' : ''}</span>
        </div>
        <VehiculesMap vehicules={vehicules} />
      </div>

      {/* ═══ LISTE VÉHICULES ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {vehicules.map(v => {
          const meta = STATUT_META[v.statut] || STATUT_META.DISPONIBLE;
          return (
            <div key={v.id} className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-md shrink-0 ${
                      v.statut === 'EN_MISSION' ? 'bg-indigo-500' : v.statut === 'EN_PANNE' ? 'bg-rose-500' : 'bg-emerald-500'}`}>
                      <Car size={20} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-stone-800 truncate">{v.nom}</p>
                      <p className="text-[10px] text-stone-400 truncate">
                        {v.immatriculation || 'Sans plaque'}{v.en_mouvement != null && <> • {v.en_mouvement ? '🟢 En route' : '⚪ À l\'arrêt'}</>}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full ring-1 shrink-0 ${meta.classes}`}>{meta.label}</span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-400 mb-3">
                  {v.vitesse_kmh != null && <span className="flex items-center gap-1"><Gauge size={12} /> {v.vitesse_kmh} km/h</span>}
                  {v.date_position && <span className="flex items-center gap-1"><Clock size={12} /> {v.date_position}</span>}
                  {v.equipe_nom && <span className="flex items-center gap-1 text-indigo-500 font-semibold"><Users size={12} /> {v.equipe_nom}</span>}
                  {v.chantier_nom && <span className="flex items-center gap-1"><MapPin size={12} /> {v.chantier_nom}</span>}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setEditTarget({ ...v })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-[11px] font-semibold text-stone-500 hover:bg-stone-100 transition-all min-h-[36px]">
                    ✏️ Modifier
                  </button>
                  {v.statut === 'EN_MISSION' ? (
                    <button onClick={() => handleLiberer(v)} disabled={saving}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-500 text-white rounded-xl text-[11px] font-bold hover:bg-emerald-600 disabled:opacity-50 transition-all min-h-[36px]">
                      <CheckCircle size={12} /> Libérer
                    </button>
                  ) : v.statut === 'EN_PANNE' ? (
                    <button onClick={() => handlePanne(v, false)} disabled={saving}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-500 text-white rounded-xl text-[11px] font-bold hover:bg-emerald-600 disabled:opacity-50 transition-all min-h-[36px]">
                      <CheckCircle size={12} /> Réparer
                    </button>
                  ) : (
                    <button onClick={() => handlePanne(v, true)} disabled={saving}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-[11px] font-semibold text-stone-500 hover:bg-stone-100 transition-all min-h-[36px]">
                      <Wrench size={12} /> Panne
                    </button>
                  )}
                  <button onClick={() => setDeleteTarget(v)} title={`Supprimer ${v.nom}`}
                    disabled={v.statut === 'EN_MISSION'}
                    className={`flex items-center justify-center px-3 py-2 border rounded-xl transition-all min-h-[36px] ${
                      v.statut === 'EN_MISSION' ? 'bg-stone-50 border-stone-100 text-stone-300 cursor-not-allowed'
                      : 'bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100'}`}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {vehicules.length === 0 && (
          <p className="col-span-full text-center text-stone-400 py-10 text-sm">
            Aucun véhicule. Cliquez « + Véhicule » pour ajouter votre flotte (nom, plaque, IMEI GeoFlotte).
          </p>
        )}
      </div>

      {/* ═══ HISTORIQUE : QUI A PRIS QUOI ═══ */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
            <Clock size={18} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-stone-800">Qui a pris quel véhicule</h2>
            <p className="text-xs text-stone-400">{historique.length} affectation{historique.length > 1 ? 's' : ''}</p>
          </div>
        </div>
        {historique.length === 0 ? (
          <p className="text-center text-stone-400 py-6 text-sm">Aucune affectation pour le moment.</p>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {historique.map((h: any) => (
              <div key={h.id} className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2.5 border border-stone-100 text-xs">
                <Car size={14} className="text-indigo-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-stone-700 truncate">{h.vehicule_nom} <span className="font-normal text-stone-400">→ {h.equipe_nom || '—'}</span></p>
                  <p className="text-[10px] text-stone-400 truncate">{h.nom_chantier || ''} • {h.debut}{h.fin ? ` → ${h.fin}` : ' • en cours'}</p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${h.statut === 'en_cours' ? 'bg-indigo-50 text-indigo-600' : 'bg-stone-100 text-stone-400'}`}>
                  {h.statut === 'en_cours' ? 'En cours' : 'Terminée'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ MODAL CRÉER ═══ */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={() => !saving && setShowCreate(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 sm:m-4 shadow-2xl pb-safe" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-stone-800">🚗 Nouveau véhicule</h3>
              <button onClick={() => setShowCreate(false)} className="text-stone-300 hover:text-stone-500"><X size={22} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Nom *</label>
                <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
                  placeholder="Ex: Hilux Blanc, Partner 2..." style={{ fontSize: '16px' }}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Plaque d'immatriculation</label>
                <input value={form.immatriculation} onChange={e => setForm({ ...form, immatriculation: e.target.value })}
                  placeholder="Ex: 01234-116-16" style={{ fontSize: '16px' }}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">IMEI boîtier GPS</label>
                  <input value={form.imei} onChange={e => setForm({ ...form, imei: e.target.value })}
                    placeholder="Ex: 864698..." style={{ fontSize: '16px' }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">ID GeoFlotte</label>
                  <input value={form.geoflotte_id} onChange={e => setForm({ ...form, geoflotte_id: e.target.value })}
                    placeholder="Nom exact sur GeoFlotte" style={{ fontSize: '16px' }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
                </div>
              </div>
              <p className="text-[10px] text-stone-400 bg-stone-50 rounded-xl px-3 py-2">
                💡 IMEI ou ID GeoFlotte = lien avec le GPS réel pour la position live. Sans ça, le véhicule marche en mode manuel (assignation).
              </p>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} disabled={saving}
                className="flex-1 py-3 bg-stone-100 rounded-2xl text-sm font-semibold text-stone-500 hover:bg-stone-200 transition-all min-h-[44px]">Annuler</button>
              <button onClick={handleCreate} disabled={saving || !form.nom.trim()}
                className="flex-[2] py-3 bg-stone-900 text-white rounded-2xl text-sm font-bold hover:bg-stone-700 disabled:opacity-40 transition-all flex items-center justify-center gap-2 min-h-[44px]">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL MODIFIER ═══ */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={() => !saving && setEditTarget(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 sm:m-4 shadow-2xl pb-safe" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-stone-800">✏️ {editTarget.nom}</h3>
              <button onClick={() => setEditTarget(null)} className="text-stone-300 hover:text-stone-500"><X size={22} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Nom (personnalisable anytime)</label>
                <input value={editTarget.nom} onChange={e => setEditTarget({ ...editTarget, nom: e.target.value })}
                  style={{ fontSize: '16px' }}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Plaque</label>
                <input value={editTarget.immatriculation || ''} onChange={e => setEditTarget({ ...editTarget, immatriculation: e.target.value })}
                  style={{ fontSize: '16px' }}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">IMEI</label>
                  <input value={editTarget.imei || ''} onChange={e => setEditTarget({ ...editTarget, imei: e.target.value })}
                    style={{ fontSize: '16px' }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">ID GeoFlotte</label>
                  <input value={editTarget.geoflotte_id || ''} onChange={e => setEditTarget({ ...editTarget, geoflotte_id: e.target.value })}
                    style={{ fontSize: '16px' }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditTarget(null)} disabled={saving}
                className="flex-1 py-3 bg-stone-100 rounded-2xl text-sm font-semibold text-stone-500 hover:bg-stone-200 transition-all min-h-[44px]">Annuler</button>
              <button onClick={handleSaveEdit} disabled={saving}
                className="flex-[2] py-3 bg-indigo-500 text-white rounded-2xl text-sm font-bold hover:bg-indigo-600 disabled:opacity-40 transition-all flex items-center justify-center gap-2 min-h-[44px]">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL SUPPRIMER ═══ */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={() => !saving && setDeleteTarget(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-5 sm:m-4 shadow-2xl pb-safe" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center mb-3">
                <Trash2 size={24} className="text-rose-500" />
              </div>
              <h3 className="font-bold text-lg text-stone-800">Supprimer ce véhicule ?</h3>
              <p className="text-sm text-stone-500 mt-1">« <span className="font-bold text-stone-700">{deleteTarget.nom}</span> » sera retiré de la flotte.</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDeleteTarget(null)} disabled={saving}
                className="flex-1 py-3 bg-stone-100 rounded-2xl text-sm font-semibold text-stone-500 hover:bg-stone-200 transition-all min-h-[44px]">Annuler</button>
              <button onClick={handleDelete} disabled={saving}
                className="flex-1 py-3 bg-rose-500 text-white rounded-2xl text-sm font-bold hover:bg-rose-600 disabled:opacity-40 transition-all flex items-center justify-center gap-2 min-h-[44px]">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
