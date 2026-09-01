'use client';
import { useState, useEffect } from 'react';
import {
  Package, Plus, Edit2, Trash2, Key, Loader2, X, Check, Users, MapPin, Phone, User,
} from 'lucide-react';
import { getUtilisateur } from '@/lib/auth';

interface Magasinier {
  id: string; nom: string; prenom: string; identifiant: string; telephone: string | null;
  actif: boolean; date_creation: string; derniere_connexion: string | null;
  chantiers: { chantier_id: string; nom_chantier: string }[];
}

interface ChantierOption { id: string; nom_chantier: string; }

export default function MagasiniersPage() {
  const [magasiniers, setMagasiniers] = useState<Magasinier[]>([]);
  const [chantiers, setChantiers] = useState<ChantierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [form, setForm] = useState({
    nom: '', prenom: '', identifiant: '', motDePasse: '', telephone: '', chantierIds: [] as string[],
  });

  const getAuthHeaders = () => {
    const token = localStorage.getItem('rmasc_token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  };

  const charger = async () => {
    try {
      const [mRes, cRes] = await Promise.all([
        fetch('/api/magasinier/magasiniers', { headers: getAuthHeaders() }),
        fetch('/api/chantiers', { headers: getAuthHeaders() }),
      ]);
      if (mRes.ok) setMagasiniers(await mRes.json());
      if (cRes.ok) {
        const data = await cRes.json();
        setChantiers(Array.isArray(data) ? data.map((c: any) => ({ id: c.id, nom_chantier: c.nom || c.nom_chantier })) : []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { charger(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ nom: '', prenom: '', identifiant: '', motDePasse: '', telephone: '', chantierIds: [] });
    setShowModal(true);
  };

  const openEdit = (m: Magasinier) => {
    setEditingId(m.id);
    setForm({
      nom: m.nom, prenom: m.prenom, identifiant: m.identifiant, motDePasse: '',
      telephone: m.telephone || '', chantierIds: m.chantiers.map(c => c.chantier_id),
    });
    setShowModal(true);
  };

  const toggleChantier = (cId: string) => {
    setForm(prev => ({
      ...prev,
      chantierIds: prev.chantierIds.includes(cId)
        ? prev.chantierIds.filter(id => id !== cId)
        : [...prev.chantierIds, cId],
    }));
  };

  const sauvegarder = async () => {
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/magasinier/magasiniers/${editingId}`, {
          method: 'PUT', headers: getAuthHeaders(),
          body: JSON.stringify({ nom: form.nom, prenom: form.prenom, telephone: form.telephone || null, chantierIds: form.chantierIds }),
        });
        if (res.ok) {
          setMessage({ type: 'success', text: 'Magasinier mis à jour.' });
          setShowModal(false); charger();
        } else {
          const d = await res.json(); setMessage({ type: 'error', text: d.erreur || 'Erreur' });
        }
      } else {
        if (!form.identifiant || !form.motDePasse) {
          setMessage({ type: 'error', text: 'Identifiant et mot de passe requis.' }); setSaving(false); return;
        }
        const res = await fetch('/api/magasinier/magasiniers', {
          method: 'POST', headers: getAuthHeaders(),
          body: JSON.stringify(form),
        });
        if (res.ok) {
          setMessage({ type: 'success', text: 'Magasinier créé.' });
          setShowModal(false); charger();
        } else {
          const d = await res.json(); setMessage({ type: 'error', text: d.erreur || 'Erreur' });
        }
      }
    } catch { setMessage({ type: 'error', text: 'Erreur de connexion.' }); }
    setSaving(false);
  };

  const desactiver = async (id: string) => {
    if (!confirm('Désactiver ce magasinier ?')) return;
    const res = await fetch(`/api/magasinier/magasiniers/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (res.ok) { setMessage({ type: 'success', text: 'Désactivé.' }); charger(); }
  };

  const reactiver = async (id: string) => {
    const res = await fetch(`/api/magasinier/magasiniers/${id}`, {
      method: 'PUT', headers: getAuthHeaders(),
      body: JSON.stringify({ actif: true }),
    });
    if (res.ok) { setMessage({ type: 'success', text: 'Réactivé.' }); charger(); }
  };

  const [newPassword, setNewPassword] = useState('');
  const resetPassword = async () => {
    if (!showPasswordModal || !newPassword || newPassword.length < 4) return;
    const res = await fetch(`/api/magasinier/magasiniers/${showPasswordModal}/password`, {
      method: 'PATCH', headers: getAuthHeaders(),
      body: JSON.stringify({ motDePasse: newPassword }),
    });
    if (res.ok) {
      setMessage({ type: 'success', text: 'Mot de passe réinitialisé.' });
      setShowPasswordModal(null); setNewPassword('');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 size={36} className="animate-spin text-indigo-500" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Gestion Magasiniers</h1>
          <p className="text-sm text-stone-400">Gérez les magasiniers et leurs chantiers assignés</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-all shadow-sm">
          <Plus size={16} /> Nouveau magasinier
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <Check size={14} /> : <X size={14} />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* List */}
      {magasiniers.length === 0 ? (
        <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 p-12 text-center">
          <Package size={40} className="text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-400">Aucun magasinier configuré</p>
          <button onClick={openCreate} className="mt-4 text-sm font-semibold text-indigo-500 hover:text-indigo-600">+ Créer un magasinier</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {magasiniers.map(m => (
            <div key={m.id} className={`bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 p-5 transition-shadow hover:shadow-md ${!m.actif ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold ${m.actif ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-stone-300'}`}>
                    {m.prenom[0]}{m.nom[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-stone-800">{m.prenom} {m.nom}</p>
                    <p className="text-[10px] text-stone-400">@{m.identifiant}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.actif ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>
                  {m.actif ? 'Actif' : 'Inactif'}
                </span>
              </div>

              {m.telephone && (
                <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-2">
                  <Phone size={11} /> {m.telephone}
                </div>
              )}

              {/* Assigned chantiers */}
              <div className="mb-3">
                <p className="text-[10px] text-stone-400 font-semibold uppercase mb-1">Chantiers assignés</p>
                {m.chantiers.length === 0 ? (
                  <p className="text-xs text-stone-300 italic">Aucun chantier</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {m.chantiers.map(c => (
                      <span key={c.chantier_id} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        {c.nom_chantier}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[10px] text-stone-300 mb-3">
                Créé le {m.date_creation} {m.derniere_connexion ? `· Dernière connexion: ${m.derniere_connexion}` : ''}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(m)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-50 text-stone-500 text-[10px] font-semibold hover:bg-stone-100 transition-all">
                  <Edit2 size={11} /> Modifier
                </button>
                <button onClick={() => { setShowPasswordModal(m.id); setNewPassword(''); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-semibold hover:bg-blue-100 transition-all">
                  <Key size={11} /> Mot de passe
                </button>
                {m.actif ? (
                  <button onClick={() => desactiver(m.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-semibold hover:bg-red-100 transition-all">
                    <Trash2 size={11} /> Désactiver
                  </button>
                ) : (
                  <button onClick={() => reactiver(m.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-semibold hover:bg-emerald-100 transition-all">
                    <Check size={11} /> Réactiver
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-stone-800">{editingId ? 'Modifier' : 'Nouveau magasinier'}</h2>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:text-stone-600">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1 block">Prénom *</label>
                    <input value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="Ahmed" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1 block">Nom *</label>
                    <input value={form.nom} onChange={e => setForm({...form, nom: e.target.value})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="Benali" />
                  </div>
                </div>

                {!editingId && (
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1 block">Identifiant *</label>
                    <input value={form.identifiant} onChange={e => setForm({...form, identifiant: e.target.value})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="magasinier1" />
                  </div>
                )}

                {!editingId && (
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1 block">Mot de passe *</label>
                    <input type="password" value={form.motDePasse} onChange={e => setForm({...form, motDePasse: e.target.value})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="••••••••" />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">Téléphone</label>
                  <input value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})}
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="0555 00 00 00" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-2 block">Chantiers assignés</label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {chantiers.map(c => (
                      <label key={c.id} className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all ${form.chantierIds.includes(c.id) ? 'bg-amber-50 border border-amber-200' : 'bg-stone-50 border border-stone-200 hover:bg-stone-100'}`}>
                        <input type="checkbox" checked={form.chantierIds.includes(c.id)} onChange={() => toggleChantier(c.id)}
                          className="rounded border-stone-300 text-amber-500 focus:ring-amber-400" />
                        <span className="text-sm text-stone-700">{c.nom_chantier}</span>
                      </label>
                    ))}
                    {chantiers.length === 0 && <p className="text-xs text-stone-300 italic">Aucun chantier disponible</p>}
                  </div>
                </div>

                <button onClick={sauvegarder} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {editingId ? 'Enregistrer' : 'Créer le magasinier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowPasswordModal(null)}>
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-stone-800 mb-4">Réinitialiser le mot de passe</h2>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400 mb-4"
                placeholder="Nouveau mot de passe (min 4 car.)" autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setShowPasswordModal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-500 text-sm font-semibold hover:bg-stone-200 transition-all">Annuler</button>
                <button onClick={resetPassword} disabled={newPassword.length < 4}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50">
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
