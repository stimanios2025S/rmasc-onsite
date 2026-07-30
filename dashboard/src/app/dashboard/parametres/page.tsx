'use client';
import { useState, useEffect } from 'react';
import { fetchStats, type StatsData } from '@/lib/api';
import { getUtilisateur } from '@/lib/auth';
import { Settings, Save, Loader2, Copy, Check, Shield, Clock, Link, Key, User } from 'lucide-react';

export default function ParametresPage() {
  const user = getUtilisateur();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const [durees, setDurees] = useState({ mecanique: 4, electrique: 3, verification: 1 });
  const [mdp, setMdp] = useState({ current: '', nouveau: '', confirm: '' });

  useEffect(() => { fetchStats().then(setStats).catch(() => {}).finally(() => setLoading(false)); }, []);

  const copyWebhook = () => {
    navigator.clipboard.writeText('https://onsite.sarl-rmasc.com/api/webhook/erp');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={36} className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-stone-800 mb-8">Paramètres</h1>

      {/* Admin Profile */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><User size={18} /> Administration</h2>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold shadow-md">
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
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><Link size={18} /> Intégration ERP</h2>
        <div className="bg-stone-50 rounded-2xl p-4 mb-4">
          <p className="text-xs text-stone-400 font-semibold uppercase mb-1">Webhook URL</p>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-indigo-600 flex-1 break-all">https://onsite.sarl-rmasc.com/api/webhook/erp</code>
            <button onClick={copyWebhook} className="text-stone-300 hover:text-stone-500">
              {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-stone-50 rounded-xl p-4">
            <p className="text-xs text-stone-400 font-semibold uppercase mb-1">Statut</p>
            <p className="text-emerald-600 font-semibold flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-400 rounded-full" /> Connecté</p>
          </div>
          <div className="bg-stone-50 rounded-xl p-4">
            <p className="text-xs text-stone-400 font-semibold uppercase mb-1">Demandes en attente</p>
            <p className="text-stone-800 font-semibold">{stats?.demandesEnAttente ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Durées estimées */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><Clock size={18} /> Durées estimées par phase</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { key: 'mecanique', label: 'Mécanique', color: 'text-blue-600 bg-blue-50' },
            { key: 'electrique', label: 'Électrique', color: 'text-orange-600 bg-orange-50' },
            { key: 'verification', label: 'Vérification', color: 'text-emerald-600 bg-emerald-50' },
          ].map(p => (
            <div key={p.key} className="bg-stone-50 rounded-2xl p-4">
              <p className={`text-xs font-semibold mb-2 ${p.color.split(' ')[0]}`}>{p.label}</p>
              <div className="flex items-center gap-2">
                <input type="number" value={durees[p.key as keyof typeof durees]} onChange={e => setDurees({...durees, [p.key]: parseInt(e.target.value) || 1})}
                  className="w-16 px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 outline-none" min="1" max="30" />
                <span className="text-xs text-stone-400">jours</span>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
          className="flex items-center gap-2 text-sm font-semibold text-white bg-indigo-500 px-4 py-2 rounded-xl hover:bg-indigo-600 shadow-sm">
          <Save size={15} /> {saved ? '✓ Enregistré' : 'Enregistrer'}
        </button>
      </div>

      {/* Security */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-6">
        <h2 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><Key size={18} /> Sécurité</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-stone-400 font-semibold mb-1 block">Mot de passe actuel</label>
            <input type="password" value={mdp.current} onChange={e => setMdp({...mdp, current: e.target.value})}
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-300" placeholder="••••••••" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-400 font-semibold mb-1 block">Nouveau mot de passe</label>
              <input type="password" value={mdp.nouveau} onChange={e => setMdp({...mdp, nouveau: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-300" placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs text-stone-400 font-semibold mb-1 block">Confirmer</label>
              <input type="password" value={mdp.confirm} onChange={e => setMdp({...mdp, confirm: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-300" placeholder="••••••••" />
            </div>
          </div>
          <button className="text-sm font-semibold text-white bg-rose-500 px-4 py-2 rounded-xl hover:bg-rose-600 shadow-sm">
            Mettre à jour
          </button>
        </div>
      </div>
    </div>
  );
}
