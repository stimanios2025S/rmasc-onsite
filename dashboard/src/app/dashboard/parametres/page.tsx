'use client';
import { useState, useEffect } from 'react';
import { fetchStats, fetchSystemConfig, updateSystemConfig, changePassword, type StatsData, type SystemConfig } from '@/lib/api';
import { getUtilisateur } from '@/lib/auth';
import { Settings, Save, Loader2, Copy, Check, Shield, Clock, Link, Key, User } from 'lucide-react';
import AdminShell from '@/components/AdminShell';

export default function ParametresPage() {
  const user = getUtilisateur();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [config, setConfig] = useState<SystemConfig>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Durées — loaded from backend config
  const [durees, setDurees] = useState({ mecanique: 4, electrique: 3, verification: 1 });

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([fetchStats(), fetchSystemConfig()]);
        setStats(s);
        setConfig(c);
        // Pre-fill durees from config if available
        if (c.duree_mecanique) setDurees(prev => ({ ...prev, mecanique: parseInt(c.duree_mecanique.valeur) || prev.mecanique }));
        if (c.duree_electrique) setDurees(prev => ({ ...prev, electrique: parseInt(c.duree_electrique.valeur) || prev.electrique }));
        if (c.duree_verification) setDurees(prev => ({ ...prev, verification: parseInt(c.duree_verification.valeur) || prev.verification }));
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const copyWebhook = () => {
    navigator.clipboard.writeText('https://onsite.sarl-rmasc.com/api/webhook/erp');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveDurees = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateSystemConfig({
        duree_mecanique: String(durees.mecanique),
        duree_electrique: String(durees.electrique),
        duree_verification: String(durees.verification),
      });
      setMessage({ type: 'success', text: '✓ Durées enregistrées dans la base de données.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Erreur lors de l\'enregistrement.' });
    }
    setSaving(false);
    setTimeout(() => setMessage(null), 4000);
  };

  if (loading) return (
    <AdminShell title="Paramètres" subtitle="Chargement…">
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={36} className="animate-spin text-stone-400" />
      </div>
    </AdminShell>
  );

  return (
    <AdminShell title="Paramètres" subtitle="Configuration système et profil administrateur">
      <div className="max-w-3xl space-y-6">
        {/* Message */}
        {message && (
          <div className={`px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {message.type === 'success' ? <Check size={18} /> : <Settings size={18} />}
            {message.text}
          </div>
        )}

        {/* Admin Profile */}
        <div className="bg-[#f2f4f9] rounded-[24px] border border-white shadow-sm p-6">
          <h2 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><User size={18} /> Administration</h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-200 to-rose-300 flex items-center justify-center text-white text-xl font-bold shadow-md">
              {user?.prenom?.[0]}{user?.nom?.[0] || 'EG'}
            </div>
            <div>
              <p className="text-lg font-bold text-stone-800">{user?.prenom} {user?.nom} <span className="text-xs font-normal text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full ml-2">Super Admin</span></p>
              <p className="text-sm text-stone-400">{user?.email}</p>
              <p className="text-xs text-stone-300">Identifiant: {user?.identifiant}</p>
            </div>
          </div>
        </div>

        {/* ERP Integration */}
        <div className="bg-[#f2f4f9] rounded-[24px] border border-white shadow-sm p-6">
          <h2 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><Link size={18} /> Intégration ERP</h2>
          <div className="bg-white rounded-2xl p-4 mb-4 border border-stone-100">
            <p className="text-xs text-stone-400 font-semibold uppercase mb-1">Webhook URL</p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-indigo-600 flex-1 break-all">https://onsite.sarl-rmasc.com/api/webhook/erp</code>
              <button onClick={copyWebhook} className="text-stone-300 hover:text-stone-500">
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-white rounded-xl p-4 border border-stone-100">
              <p className="text-xs text-stone-400 font-semibold uppercase mb-1">Statut</p>
              <p className="text-emerald-600 font-semibold flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-400 rounded-full" /> Connecté</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-stone-100">
              <p className="text-xs text-stone-400 font-semibold uppercase mb-1">Demandes en attente</p>
              <p className="text-stone-800 font-semibold">{stats?.demandesEnAttente ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Durées estimées — wired to backend */}
        <div className="bg-[#f2f4f9] rounded-[24px] border border-white shadow-sm p-6">
          <h2 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><Clock size={18} /> Durées estimées par phase</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              { key: 'mecanique', label: 'Mécanique', color: 'text-blue-600' },
              { key: 'electrique', label: 'Électrique', color: 'text-orange-600' },
              { key: 'verification', label: 'Vérification', color: 'text-emerald-600' },
            ].map(p => (
              <div key={p.key} className="bg-white rounded-2xl p-4 border border-stone-100">
                <p className={`text-xs font-semibold mb-2 ${p.color}`}>{p.label}</p>
                <div className="flex items-center gap-2">
                  <input type="number" value={durees[p.key as keyof typeof durees]}
                    onChange={e => setDurees({ ...durees, [p.key]: parseInt(e.target.value) || 1 })}
                    className="w-16 px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-300"
                    min="1" max="30" />
                  <span className="text-xs text-stone-400">jours</span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={saveDurees} disabled={saving}
            className="flex items-center gap-2 text-sm font-semibold text-white bg-stone-900 px-4 py-2 rounded-full hover:bg-stone-700 shadow-sm disabled:opacity-50 transition-all">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enregistrer les durées
          </button>
        </div>

        {/* System config summary (read-only display) */}
        {Object.keys(config).length > 0 && (
          <div className="bg-[#f2f4f9] rounded-[24px] border border-white shadow-sm p-6">
            <h2 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><Settings size={18} /> Configuration Système</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(config).map(([cle, val]) => (
                <div key={cle} className="bg-white rounded-xl p-3 border border-stone-100">
                  <p className="text-[10px] text-stone-400 uppercase font-semibold">{cle.replace(/_/g, ' ')}</p>
                  <p className="text-sm font-bold text-stone-700 mt-0.5">{val.valeur}</p>
                  {val.description && <p className="text-[10px] text-stone-300 mt-0.5">{val.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security — password change (now wired to real backend) */}
        <SecuritySection />
      </div>
      </div>
    </AdminShell>
  );
}

function SecuritySection() {
  const [mdp, setMdp] = useState({ current: '', nouveau: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePasswordChange = async () => {
    if (mdp.nouveau !== mdp.confirm) {
      setMessage({ type: 'error', text: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    if (mdp.nouveau.length < 6) {
      setMessage({ type: 'error', text: 'Le mot de passe doit contenir au moins 6 caractères.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await changePassword(mdp.current, mdp.nouveau);
      setMessage({ type: 'success', text: '✓ Mot de passe mis à jour avec succès.' });
      setMdp({ current: '', nouveau: '', confirm: '' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Erreur lors du changement de mot de passe.' });
    }
    setSaving(false);
    setTimeout(() => setMessage(null), 4000);
  };

  return (
    <div className="bg-[#f2f4f9] rounded-[24px] border border-white shadow-sm p-6">
      <h2 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><Key size={18} /> Sécurité</h2>
      {message && (
        <div className={`mb-4 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {message.type === 'success' ? <Check size={16} /> : <Settings size={16} />}
          {message.text}
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="text-xs text-stone-400 font-semibold mb-1 block">Mot de passe actuel</label>
          <input type="password" value={mdp.current} onChange={e => setMdp({ ...mdp, current: e.target.value })}
            className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-300" placeholder="••••••••" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-stone-400 font-semibold mb-1 block">Nouveau mot de passe</label>
            <input type="password" value={mdp.nouveau} onChange={e => setMdp({ ...mdp, nouveau: e.target.value })}
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-300" placeholder="••••••••" />
          </div>
          <div>
            <label className="text-xs text-stone-400 font-semibold mb-1 block">Confirmer</label>
            <input type="password" value={mdp.confirm} onChange={e => setMdp({ ...mdp, confirm: e.target.value })}
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-300" placeholder="••••••••" />
          </div>
        </div>
        <button onClick={handlePasswordChange} disabled={saving || !mdp.current || !mdp.nouveau || !mdp.confirm}
          className="flex items-center gap-2 text-sm font-semibold text-white bg-rose-500 px-4 py-2 rounded-full hover:bg-rose-600 shadow-sm disabled:opacity-50 transition-all">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Key size={15} />} Mettre à jour le mot de passe
        </button>
      </div>
    </div>
  );
}
