'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  MessageSquareText, RefreshCw, Save, Loader2, CheckCircle2,
  Clock, Phone, ShieldCheck, TriangleAlert,
} from 'lucide-react';
import { fetchSmsLog, fetchTelephones, sauvegarderTelephones } from '@/lib/api';
import type { SmsLogData, TelephoneData } from '@/lib/api';

const LIBELLES_EVENEMENT: Record<string, string> = {
  mission_assignee: 'Mission assignée',
  mission_terminee: 'Mission terminée',
  chantier_receptionne: 'Chantier réceptionné',
  aucune_equipe: 'Aucune équipe dispo',
};

const BADGES_STATUT: Record<string, { label: string; cls: string }> = {
  EN_ATTENTE: { label: 'En attente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  ENVOYE: { label: 'Envoyé', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ECHEC: { label: 'Échec', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export default function PageSms() {
  const [sms, setSms] = useState<SmsLogData[]>([]);
  const [fournisseur, setFournisseur] = useState<string>('simulation');
  const [telephones, setTelephones] = useState<TelephoneData[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<string>('TOUS');
  const [sauvegarde, setSauvegarde] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [log, tels] = await Promise.all([fetchSmsLog(), fetchTelephones()]);
      setSms(log.sms);
      setFournisseur(log.fournisseur);
      setTelephones(tels);
    } catch (e: any) {
      setMessage(`Erreur de chargement: ${e.message}`);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Rafraîchissement automatique toutes les 15s (sync portals)
  useEffect(() => {
    const timer = setInterval(charger, 15_000);
    return () => clearInterval(timer);
  }, [charger]);

  const changerTel = (utilisateurId: string, valeur: string) => {
    setTelephones(prev => prev.map(t => t.utilisateur_id === utilisateurId ? { ...t, telephone: valeur } : t));
  };

  const sauvegarder = async () => {
    setSauvegarde(true);
    setMessage(null);
    try {
      const lignes = telephones
        .filter(t => t.utilisateur_id)
        .map(t => ({ utilisateur_id: t.utilisateur_id!, telephone: t.telephone?.trim() || null }));
      await sauvegarderTelephones(lignes);
      setMessage('✅ Numéros enregistrés. Les prochains SMS partiront sur ces numéros.');
      await charger();
    } catch (e: any) {
      setMessage(`❌ Erreur: ${e.message}`);
    } finally {
      setSauvegarde(false);
    }
  };

  // Regrouper les téléphones par équipe
  const parEquipe = telephones.reduce<Record<string, TelephoneData[]>>((acc, t) => {
    if (!acc[t.equipe_id]) acc[t.equipe_id] = [];
    acc[t.equipe_id].push(t);
    return acc;
  }, {});

  const smsFiltres = filtre === 'TOUS' ? sms : sms.filter(s => s.type_evenement === filtre);
  const actif = fournisseur === 'twilio';

  return (
    <div className="space-y-6">
      {/* ─── En-tête ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg">
            <MessageSquareText size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-800">SMS Automatiques</h1>
            <p className="text-sm text-stone-400">Relais de mission → propriétaire, équipes et clients</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold shadow-sm ${
            actif ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {actif ? <ShieldCheck size={16} /> : <TriangleAlert size={16} />}
            {actif ? 'Twilio ACTIF — envoi réel' : 'Mode Simulation (Twilio à configurer)'}
          </div>
          <button
            onClick={charger}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/80 backdrop-blur border border-stone-100 text-sm font-semibold text-stone-600 hover:bg-white shadow-sm transition-all"
          >
            <RefreshCw size={15} className={chargement ? 'animate-spin' : ''} /> Rafraîchir
          </button>
        </div>
      </div>

      {message && (
        <div className="px-4 py-3 rounded-2xl bg-white/90 border border-stone-100 text-sm text-stone-700 shadow-sm">{message}</div>
      )}

      {/* ─── Journal SMS ─────────────────────────────────────────── */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-100 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-indigo-500" />
            <h2 className="font-bold text-stone-800">Journal des SMS</h2>
            <span className="text-xs text-stone-400">({sms.length} derniers)</span>
          </div>
          <div className="ml-auto flex gap-1.5 flex-wrap">
            {['TOUS', 'mission_assignee', 'mission_terminee', 'chantier_receptionne', 'aucune_equipe'].map(f => (
              <button
                key={f}
                onClick={() => setFiltre(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filtre === f ? 'bg-stone-800 text-white shadow-sm' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'
                }`}
              >
                {f === 'TOUS' ? 'Tous' : LIBELLES_EVENEMENT[f] ?? f}
              </button>
            ))}
          </div>
        </div>

        {chargement ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-500" /></div>
        ) : smsFiltres.length === 0 ? (
          <div className="py-16 text-center text-sm text-stone-400">
            Aucun SMS pour l'instant. Les SMS seront programmés automatiquement à chaque relais de mission.
          </div>
        ) : (
          <div className="divide-y divide-stone-50 max-h-[420px] overflow-y-auto">
            {smsFiltres.map(s => {
              const badge = BADGES_STATUT[s.statut] ?? { label: s.statut, cls: 'bg-stone-50 text-stone-600 border-stone-200' };
              return (
                <div key={s.id} className="px-4 sm:px-6 py-3.5 flex items-start gap-4 hover:bg-stone-50/50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquareText size={16} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-stone-800 text-sm">
                        {s.destinataire_nom || s.telephone}
                      </span>
                      <span className="text-[11px] font-mono text-stone-400">{s.telephone}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">
                        {LIBELLES_EVENEMENT[s.type_evenement] ?? s.type_evenement}
                      </span>
                      {s.nom_chantier && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">🏗 {s.nom_chantier}</span>
                      )}
                    </div>
                    <p className="text-[13px] text-stone-500 mt-1">{s.contenu}</p>
                    <p className="text-[11px] text-stone-300 mt-1">
                      {s.cree} {s.envoye ? `· envoyé ${s.envoye}` : ''} · tentative {s.tentative}
                      {s.fournisseur ? ` · via ${s.fournisseur}` : ''}
                      {s.erreur ? ` · ⚠ ${s.erreur}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Annuaire téléphones ─────────────────────────────────── */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-indigo-500" />
            <h2 className="font-bold text-stone-800">Numéros des équipes</h2>
            <span className="text-xs text-stone-400">Format: +213 5XX XX XX XX ou 05XX XX XX XX</span>
          </div>
          <button
            onClick={sauvegarder}
            disabled={sauvegarde}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-sm transition-all"
          >
            {sauvegarde ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enregistrer
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4 sm:p-6 max-h-[520px] overflow-y-auto">
          {Object.entries(parEquipe).map(([equipeId, membres]) => {
            const eq = membres[0];
            const couleur = eq.type === 'mecanique' ? 'from-blue-500 to-indigo-500'
              : eq.type === 'electrique' ? 'from-orange-400 to-amber-500'
              : 'from-emerald-500 to-green-500';
            return (
              <div key={equipeId} className="rounded-2xl border border-stone-100 bg-stone-50/50 overflow-hidden">
                <div className={`bg-gradient-to-r ${couleur} px-4 py-2.5 flex items-center justify-between`}>
                  <span className="text-white font-bold text-sm">{eq.equipe_nom}</span>
                  <span className="text-white/80 text-[10px] uppercase tracking-wider">{eq.type}</span>
                </div>
                <div className="p-3 space-y-2">
                  {membres.map(m => (
                    <div key={m.utilisateur_id ?? m.equipe_id} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-white border border-stone-100 flex items-center justify-center text-[11px] font-bold text-stone-500 shrink-0">
                        {m.prenom?.[0]}{m.nom?.[0] || '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-stone-700 truncate">
                          {m.prenom} {m.nom}
                          <span className="text-stone-300 font-normal"> · {m.role}</span>
                        </p>
                        <input
                          value={m.telephone ?? ''}
                          onChange={e => m.utilisateur_id && changerTel(m.utilisateur_id, e.target.value)}
                          placeholder="+213 5XX XX XX XX"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          disabled={!m.utilisateur_id}
                          className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-base text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-40"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>
                  ))}
                  {membres.length === 0 && (
                    <p className="text-xs text-stone-400 italic">Aucun utilisateur rattaché</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex items-start gap-3">
          <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
          <p className="text-xs text-stone-500 leading-relaxed">
            <b>Comment ça marche :</b> quand une équipe termine sa phase, le système envoie automatiquement un SMS au
            propriétaire (El Ghani) et à l'équipe suivante. Quand le chantier est réceptionné, le client reçoit aussi un SMS.
            Renseignez les numéros ici (le 1er numéro de chaque équipe est celui utilisé).
          </p>
        </div>
      </div>
    </div>
  );
}
