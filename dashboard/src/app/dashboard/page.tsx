'use client';
import { useState, useEffect, useMemo } from 'react';
import { getUtilisateur, apiFetch } from '@/lib/auth';
import {
  approuverDemande, refuserDemande, annulerBlocage,
  type StatsData, type DemandeData, type EquipeData, type ChantierData, type IncidentData,
} from '@/lib/api';
import {
  HardHat, AlertTriangle, Users, MapPin, XCircle,
  Loader2, ChevronDown, ChevronRight, Package, Wrench, Zap, Shield,
  CheckCheck, Timer, CheckCircle, Calendar, Clock, Ban, Sunrise, Sunset,
} from 'lucide-react';
import MapView, { type TeamPosition } from '@/components/MapView';
import SyncNotifications from '@/components/SyncNotifications';

const STATUT_BADGE: Record<string, string> = {
  DISPONIBLE: 'bg-emerald-50 text-emerald-600', EN_MISSION: 'bg-indigo-50 text-indigo-600',
  EN_REPOS: 'bg-amber-50 text-amber-600',
};
const STATUT_LABEL: Record<string, string> = {
  DISPONIBLE: 'Disponible', EN_MISSION: 'En mission', EN_REPOS: 'En repos',
};
const TYPE_ICON: Record<string, any> = { mecanique: Wrench, electrique: Zap, mixte: Shield };
const PRIORITE_COULEUR: Record<string, string> = {
  critique: 'bg-rose-500 text-white', haute: 'bg-orange-500 text-white',
  moyenne: 'bg-amber-400 text-stone-800', basse: 'bg-stone-100 text-stone-500',
};

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  return `Il y a ${Math.floor(min / 60)}h`;
}

export default function DashboardPage() {
  const user = getUtilisateur();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [demandes, setDemandes] = useState<DemandeData[]>([]);
  const [equipes, setEquipes] = useState<EquipeData[]>([]);
  const [chantiers, setChantiers] = useState<ChantierData[]>([]);
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [retards, setRetards] = useState<any[]>([]);
  const [demandesMateriel, setDemandesMateriel] = useState<any[]>([]);
  const [teamPositions, setTeamPositions] = useState<TeamPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showEquipes, setShowEquipes] = useState(true);
  const [filtreTemps, setFiltreTemps] = useState("Aujourd'hui");

  // Sync temps réel : 1 seule requête toutes les 8s
  useEffect(() => {
    loadAll();
    // Safety: force loading to false after 5s even if all APIs fail
    const safetyTimeout = setTimeout(() => setLoading(false), 5000);
    // Polling 8s — 1 seule requête au lieu de 7
    const i = setInterval(() => {
      if (document.visibilityState === 'visible') loadAll();
    }, 8000);
    return () => { clearInterval(i); clearTimeout(safetyTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    try {
      // 1 seule requête au lieu de 7 !
      const data = await apiFetch<any>('/dashboard/all');
      if (data.stats) setStats(data.stats);
      if (data.demandes) setDemandes(data.demandes);
      if (data.equipes) setEquipes(data.equipes);
      if (data.chantiers) setChantiers(data.chantiers);
      if (data.incidents) setIncidents(data.incidents);
      if (data.demandesMateriel) setDemandesMateriel(data.demandesMateriel);
      if (data.teamPositions) setTeamPositions(data.teamPositions);
      setError(null); // Clear any previous error on success
    } catch (e: any) {
      // Only set error if we have NO data at all (first load)
      if (!stats && chantiers.length === 0) {
        setError(e?.message || 'Erreur de connexion au serveur.');
      }
      // Otherwise keep stale data (don't overwrite with error)
    }
    finally { setLoading(false); }
  }

  async function handleApprouver(id: string) {
    setActionLoading(id); try { await approuverDemande(id); await loadAll(); } catch (e: any) { alert(e.message); } setActionLoading(null);
  }
  async function handleRefuser(id: string) {
    if (!confirm('Refuser cette commande ?')) return;
    setActionLoading(id); try { await refuserDemande(id); await loadAll(); } catch (e: any) { alert(e.message); } setActionLoading(null);
  }
  async function handleAnnulerBlocage(blocageIds: string) {
    if (!confirm('Annuler ce(s) blocage(s) et réactiver la mission ?')) return;
    const ids = blocageIds.split(',').filter(Boolean);
    setActionLoading(`blocage-${ids[0]}`);
    try {
      for (const id of ids) {
        await annulerBlocage(id, 'Annulé par El Ghani');
      }
      await loadAll();
    } catch (e: any) { alert(e.message || 'Erreur lors de l\'annulation du blocage.'); }
    setActionLoading(null);
  }

  const equipeTypes = useMemo(() => {
    const g: Record<string, EquipeData[]> = {};
    for (const e of equipes) { const t = e.type; if (!g[t]) g[t] = []; g[t].push(e); }
    return g;
  }, [equipes]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={36} className="animate-spin text-indigo-500" /></div>;

  // Error state (only shown if no data loaded at all)
  if (error && !stats && chantiers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center">
          <AlertTriangle size={32} className="text-rose-500" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-stone-800">Erreur de connexion</h2>
          <p className="text-sm text-stone-400 mt-1 max-w-md">{error}</p>
        </div>
        <button onClick={() => { setError(null); setLoading(true); loadAll(); }}
          className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 shadow-sm">
          Réessayer
        </button>
      </div>
    );
  }

  const totalM = stats?.missionsTotal ?? 0;
  const pct = totalM > 0 ? Math.round(((stats?.chantiersTotal ?? 0) / totalM) * 100) : 0;

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-stone-100 p-1 w-full sm:w-auto overflow-x-auto">
          {["Aujourd'hui", 'Cette semaine', 'Ce mois'].map((t) => (
            <button key={t} onClick={() => setFiltreTemps(t)}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${filtreTemps === t ? 'bg-stone-800 text-white shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-stone-400">
          <SyncNotifications onRefresh={loadAll} />
          <span className="hidden sm:inline">{user?.prenom} {user?.nom}</span>
        </div>
      </div>

      {/* Approval gateway */}
      {demandes.length > 0 && (
        <div className="mb-8 bg-white/90 backdrop-blur-md rounded-3xl border border-rose-100 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-rose-50 to-orange-50 px-6 py-4 flex items-center justify-between border-b border-rose-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center"><Package size={18} className="text-rose-600" /></div>
              <div><h2 className="font-bold text-stone-800">Commandes Factory à Valider</h2><p className="text-xs text-stone-400">{demandes.length} en attente</p></div>
            </div>
            <span className="bg-rose-500 text-white text-xs font-bold px-3 py-1 rounded-full">{demandes.length}</span>
          </div>
          <div className="divide-y divide-stone-100">
            {demandes.map((d) => (
              <div key={d.id} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-rose-50/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{d.ref}</span>
                    <span className="font-semibold text-sm sm:text-base text-stone-800">{d.nom_chantier}</span>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">Client: {d.client_nom} • {timeAgo(d.cree)}</p>
                </div>
                <div className="flex items-center gap-2 sm:ml-4">
                  <button onClick={() => handleApprouver(d.id)} disabled={actionLoading === d.id}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 shadow-sm">
                    {actionLoading === d.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCheck size={15} />}Valider
                  </button>
                  <button onClick={() => handleRefuser(d.id)} disabled={actionLoading === d.id}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-white text-rose-500 px-4 py-2 rounded-xl text-sm font-semibold border border-rose-200 hover:bg-rose-50">
                    <XCircle size={15} /> Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ CARTE DE COMMANDE — Full width ═══ */}
      <div className="mb-8">
        <MapView chantiers={chantiers} teamPositions={teamPositions} />
      </div>

      {/* KPIs + Gauge */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <KpiCard titre="Chantiers Actifs" valeur={stats?.chantiersActifs ?? 0} couleur="emerald" icon={<HardHat size={20} />} />
        <KpiCard titre="Bloqués" valeur={stats?.chantiersBloques ?? 0} couleur="rose" icon={<AlertTriangle size={20} />} badge />
        <KpiCard titre="Équipes Dispo" valeur={stats?.equipesDisponibles ?? 0} couleur="indigo" icon={<Users size={20} />} />
        <KpiCard titre="Blocages" valeur={stats?.blocagesOuverts ?? 0} couleur="amber" icon={<AlertTriangle size={20} />} />
      </div>

      {/* Incidents */}
      <div className="mb-8">
        <IncidentsWidget incidents={incidents} />
      </div>

      {/* ═══ RETARDS SIGNALÉS (sync technicien → admin) ═══ */}
      {retards.length > 0 && (
        <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-amber-200 shadow-sm mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-4 sm:px-6 py-4 border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Timer size={18} className="text-amber-600" />
              </div>
              <div>
                <h2 className="font-bold text-sm sm:text-base text-stone-800">⏰ Retards Signalés <span className="text-stone-400 font-normal">({retards.length})</span></h2>
                <p className="text-[10px] sm:text-xs text-stone-400">Signalés par les équipes en temps réel</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-stone-100">
            {retards.slice(0, 8).map((r, i) => (
              <div key={i} className="px-4 sm:px-6 py-4 hover:bg-amber-50/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-stone-800">{r.nom_chantier}</span>
                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{r.equipe_nom}</span>
                      <span className="text-[10px] font-semibold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">{r.phase}</span>
                    </div>
                    <p className="text-sm text-stone-600 mt-1.5">{r.motif}</p>
                    {r.etape_id && <p className="text-xs text-stone-400 mt-0.5">Étape: {r.etape_id}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-stone-400 whitespace-nowrap">{timeAgo(r.moment)}</span>
                    {r.photo_url && (
                      <a href={`https://onsite.sarl-rmasc.com${r.photo_url}`} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-full hover:bg-amber-100">
                        📷 Preuve
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ROADMAP DES CHANTIERS (état réel + équipe) ═══ */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm mb-8 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <MapPin size={18} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base text-stone-800">Roadmap des Chantiers</h2>
              <p className="text-[10px] sm:text-xs text-stone-400">État réel des phases et équipes assignées</p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-stone-50">
          {chantiers.length === 0 ? (
            <p className="py-12 text-center text-stone-400 text-sm">Aucun chantier actif.</p>
          ) : chantiers.map(c => {
            // Parse checklist etapes
            let etapes: { label: string; done: boolean; subtasks?: { label: string; done: boolean }[] }[] = [];
            if (c.checklist_etapes) {
              try {
                const raw = typeof c.checklist_etapes === 'string' ? JSON.parse(c.checklist_etapes) : c.checklist_etapes;
                if (Array.isArray(raw)) etapes = raw;
              } catch {}
            }
            const totalEtapes = etapes.length;
            const doneEtapes = etapes.filter(e => e.done).length;
            const progression = totalEtapes > 0 ? Math.round((doneEtapes / totalEtapes) * 100) : 0;

            // Find current step (first incomplete)
            let etapeActuelle = '';
            let etapeActuelleIdx = -1;
            for (let i = 0; i < etapes.length; i++) {
              const e = etapes[i];
              const complete = e.done && (!e.subtasks || e.subtasks.every(s => s.done));
              if (!complete) {
                etapeActuelle = e.label;
                etapeActuelleIdx = i;
                break;
              }
            }
            const allDone = totalEtapes > 0 && doneEtapes === totalEtapes;

            // Phase icon/label
            const phaseInfo = c.phase_actuelle === 'mecanique' ? { icon: '🔧', label: 'Mécanique', color: 'blue' }
              : c.phase_actuelle === 'electrique' ? { icon: '⚡', label: 'Électrique', color: 'orange' }
              : c.phase_actuelle === 'verification' ? { icon: '🛡️', label: 'Vérification', color: 'emerald' }
              : null;

            return (
              <div key={c.id} className="px-4 sm:px-6 py-4 hover:bg-stone-50/50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Header: name + ref + badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-stone-800 text-sm">{c.nom}</span>
                      <span className="text-[10px] font-mono text-stone-400">{c.ref}</span>
                      {c.equipe_actuelle && c.equipe_actuelle !== 'Aucune' && (
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                          👥 {c.equipe_actuelle}
                        </span>
                      )}
                      {phaseInfo && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          phaseInfo.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                          phaseInfo.color === 'orange' ? 'bg-orange-50 text-orange-600' :
                          'bg-emerald-50 text-emerald-600'
                        }`}>
                          {phaseInfo.icon} {phaseInfo.label}
                        </span>
                      )}
                    </div>

                    {/* Current step display */}
                    {totalEtapes > 0 && (
                      <div className="mt-2.5">
                        {allDone ? (
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                            <CheckCircle size={13} />
                            <span>Toutes les étapes complétées</span>
                          </div>
                        ) : etapeActuelle ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-stone-500">
                              Étape {etapeActuelleIdx + 1}/{totalEtapes} :
                            </span>
                            <span className="text-[11px] font-semibold text-stone-700">{etapeActuelle}</span>
                          </div>
                        ) : null}

                        {/* Progress bar */}
                        <div className="flex items-center gap-2.5 mt-1.5">
                          <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ease-out ${
                                progression === 100 ? 'bg-emerald-500' :
                                progression >= 60 ? 'bg-blue-500' :
                                progression >= 30 ? 'bg-amber-500' :
                                'bg-stone-300'
                              }`}
                              style={{ width: `${Math.max(progression, 2)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-stone-400 w-8 text-right">{progression}%</span>
                        </div>
                      </div>
                    )}

                    {/* Chantier dates */}
                    <div className="flex items-center gap-3 mt-2 text-[10px]">
                      <span className="flex items-center gap-1 text-stone-400">
                        <Calendar size={10} /> Créé: {c.date_creation}
                      </span>
                      {c.date_echeance && (
                        <span className={`flex items-center gap-1 font-semibold ${
                          new Date(c.date_echeance) < new Date() ? 'text-rose-500' : 'text-amber-600'
                        }`}>
                          <Clock size={10} /> Échéance: {new Date(c.date_echeance).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Blockage reasons */}
                    {c.nb_blocages && c.nb_blocages > 0 && c.motifs_blocage && (
                      <div className="mt-2 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Ban size={12} className="text-rose-500" />
                            <span className="text-[10px] font-bold text-rose-600">Blocage{c.nb_blocages > 1 ? 's' : ''} ({c.nb_blocages})</span>
                          </div>
                          {c.blocage_ids && (
                            <button
                              onClick={() => handleAnnulerBlocage(c.blocage_ids!)}
                              disabled={actionLoading === `blocage-${c.blocage_ids}`}
                              className="text-[10px] font-bold text-white bg-rose-500 hover:bg-rose-600 px-2.5 py-1 rounded-lg transition-all disabled:opacity-50"
                            >
                              {actionLoading === `blocage-${c.blocage_ids}` ? <Loader2 size={10} className="animate-spin" /> : '✕ Annuler'}
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-rose-500 mt-1 leading-relaxed">{c.motifs_blocage}</p>
                      </div>
                    )}

                    {/* Mission counts */}
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-stone-400">
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${(c.en_cours ?? 0) > 0 ? 'bg-emerald-400' : 'bg-stone-200'}`} />
                        {c.en_cours ?? 0} en cours
                      </span>
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${(c.en_attente ?? 0) > 0 ? 'bg-indigo-400' : 'bg-stone-200'}`} />
                        {c.en_attente ?? 0} en attente
                      </span>
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${(c.bloquee ?? 0) > 0 ? 'bg-rose-400' : 'bg-stone-200'}`} />
                        {c.bloquee ?? 0} bloquées
                      </span>
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${(c.terminee ?? 0) > 0 ? 'bg-stone-300' : 'bg-stone-200'}`} />
                        {c.terminee ?? 0} terminées
                      </span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                      c.statut === 'en_cours' ? 'bg-emerald-50 text-emerald-600'
                      : c.statut === 'bloque' ? 'bg-rose-50 text-rose-600'
                      : c.statut === 'termine' || c.statut === 'reception_officielle' ? 'bg-stone-100 text-stone-500'
                      : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {c.statut === 'en_cours' ? 'En cours' : c.statut === 'bloque' ? 'Bloqué' : c.statut === 'termine' ? 'Terminé' : c.statut === 'reception_officielle' ? 'Réceptionné' : 'Planifié'}
                    </span>
                    {c.mission_statut && c.mission_statut !== c.statut && (
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${
                        c.mission_statut === 'en_pause' ? 'bg-amber-50 text-amber-600'
                        : c.mission_statut === 'en_route' ? 'bg-sky-50 text-sky-600'
                        : 'bg-stone-50 text-stone-500'
                      }`}>
                        {c.mission_statut === 'en_pause' ? '⏸ En pause'
                         : c.mission_statut === 'en_route' ? '🚗 En route'
                         : c.mission_statut === 'en_attente' ? '⏳ En attente'
                         : ''}
                      </span>
                    )}
                    <span className="text-[9px] text-stone-300">{c.date_creation}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ DEMANDES MATÉRIEL (from workers) ═══ */}
      {demandesMateriel.length > 0 && (
        <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm mb-8 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-stone-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                <Package size={18} className="text-amber-600" />
              </div>
              <div>
                <h2 className="font-bold text-sm sm:text-base text-stone-800">Demandes Matériel</h2>
                <p className="text-[11px] text-stone-400">{demandesMateriel.length} en attente</p>
              </div>
            </div>
            <a href="/dashboard/demandes" className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700">
              Tout voir →
            </a>
          </div>
          <div className="divide-y divide-stone-50">
            {demandesMateriel.slice(0, 5).map((dm: any) => (
              <div key={dm.id} className="px-4 sm:px-6 py-3.5 hover:bg-amber-50/20 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        dm.type_demande === 'retard' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {dm.type_demande === 'retard' ? '⏰ Retard' : '📦 Matériel'}
                      </span>
                      <span className="text-sm font-semibold text-stone-700">{dm.equipe_nom || 'Équipe'}</span>
                      {dm.chantier_nom && <span className="text-[10px] text-stone-400">• {dm.chantier_nom}</span>}
                    </div>
                    {dm.description && <p className="text-xs text-stone-500 mt-1 truncate">{dm.description}</p>}
                    {dm.items && Array.isArray(dm.items) && dm.items.length > 0 && (
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        {dm.items.map((it: any) => it.nom).join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-stone-400 whitespace-nowrap">{dm.cree}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Matrix */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm mb-8">
        <button onClick={() => setShowEquipes(!showEquipes)}
          className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-stone-50 rounded-t-3xl transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center"><Users size={18} className="text-indigo-600" /></div>
            <h2 className="font-bold text-sm sm:text-base text-stone-800">Matrice des Équipes <span className="text-stone-400 font-normal">({equipes.length})</span></h2>
          </div>
          {showEquipes ? <ChevronDown size={18} className="text-stone-400" /> : <ChevronRight size={18} className="text-stone-400" />}
        </button>
        {showEquipes && (
          <div className="px-6 pb-6 space-y-5">
            {Object.entries(equipeTypes).map(([type, eqs]) => {
              const Icon = TYPE_ICON[type] || Users;
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 mb-3">
                    <Icon size={14} />
                    {type === 'mecanique' ? 'Mécaniques' : type === 'electrique' ? 'Électriques' : 'Vérification'}
                    <span className="text-stone-300">({eqs.length})</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {eqs.map((eq) => (
                      <div key={eq.id} className={`rounded-2xl p-4 border shadow-sm ${eq.statut_equipe === 'EN_REPOS' ? 'border-amber-200 bg-amber-50/30' : eq.statut_equipe === 'EN_MISSION' ? 'border-indigo-200 bg-indigo-50/30' : 'border-emerald-200 bg-emerald-50/30'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-semibold text-stone-700">{eq.nom}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${STATUT_BADGE[eq.statut_equipe]}`}>{STATUT_LABEL[eq.statut_equipe]}</span>
                        </div>
                        {/* Member names */}
                        {eq.membres_noms && (
                          <p className="text-[10px] text-stone-500 font-medium mb-1 truncate" title={eq.membres_noms}>
                            👤 {eq.membres_noms}
                          </p>
                        )}
                        {eq.statut_equipe === 'EN_REPOS' && eq.jours_repos_restants > 0 && <p className="text-[11px] text-amber-600 font-medium">⏳ {eq.jours_repos_restants}j restants</p>}
                        {eq.statut_equipe === 'EN_MISSION' && <p className="text-[11px] text-indigo-600 font-medium">🔧 {eq.missions} mission{eq.missions > 1 ? 's' : ''}</p>}
                        {eq.statut_equipe === 'DISPONIBLE' && <p className="text-[11px] text-emerald-600 font-medium">✅ Prêt</p>}
                        {/* Pointage times */}
                        {(eq.pointage_matinal || eq.pointage_fin_journee) && (
                          <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                            {eq.pointage_matinal && (
                              <span className="flex items-center gap-0.5 text-blue-600" title="Pointage matinal">
                                <Sunrise size={10} /> {eq.pointage_matinal}
                              </span>
                            )}
                            {eq.pointage_fin_journee && (
                              <span className="flex items-center gap-0.5 text-purple-600" title="Pointage fin de journée">
                                <Sunset size={10} /> {eq.pointage_fin_journee}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ titre, valeur, couleur, icon, badge }: { titre: string; valeur: number; couleur: string; icon: React.ReactNode; badge?: boolean }) {
  const cm: Record<string, string> = { emerald: 'bg-emerald-50 text-emerald-500', rose: 'bg-rose-50 text-rose-500', indigo: 'bg-indigo-50 text-indigo-500', amber: 'bg-amber-50 text-amber-500' };
  return (
    <div className="relative bg-white/90 backdrop-blur-md rounded-2xl sm:rounded-3xl border border-stone-100 shadow-sm p-3 sm:p-5 flex items-start gap-3 sm:gap-4 hover:shadow-md transition-all">
      {badge && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" /></span>}
      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${cm[couleur]}`}>{icon}</div>
      <div><p className="text-[9px] sm:text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-0.5">{titre}</p><span className="text-lg sm:text-2xl font-bold text-stone-800">{valeur}</span></div>
    </div>
  );
}

function IncidentsWidget({ incidents }: { incidents: IncidentData[] }) {
  const blocages = incidents.filter(i => i.type === 'blocage');
  const pauses = incidents.filter(i => i.type === 'pause');
  const pointages = incidents.filter(i => i.type === 'pointage');
  return (
    <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm h-full">
      <div className="px-4 sm:px-5 py-4 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-rose-50 flex items-center justify-center"><AlertTriangle size={15} className="text-rose-500" /></div>
          <h3 className="text-sm font-bold text-stone-800">Alertes & Blocages</h3>
        </div>
        <span className="text-[11px] text-stone-400">{blocages.length + pauses.length + pointages.length} récents</span>
      </div>
      <div className="divide-y divide-stone-50 max-h-[520px] overflow-y-auto">
        {blocages.length === 0 && pauses.length === 0 && pointages.length === 0 ? <p className="py-10 text-center text-stone-400 text-sm">Tout est sous contrôle ✓</p> : (
          <>
            {blocages.slice(0, 6).map((inc, i) => (
              <div key={`b-${i}`} className="px-5 py-3.5 hover:bg-rose-50/20 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-700">{inc.message}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${PRIORITE_COULEUR[inc.priorite] || 'bg-stone-100 text-stone-500'}`}>{inc.priorite?.toUpperCase()}</span>
                </div>
                <p className="text-[12px] text-stone-400 mt-1">{inc.nom_chantier} • {timeAgo(inc.moment)}</p>
              </div>
            ))}
            {pauses.slice(0, 4).map((inc, i) => (
              <div key={`ps-${i}`} className="px-5 py-3.5 hover:bg-amber-50/20 transition-colors">
                <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /><p className="text-sm font-medium text-stone-600">⏸️ {inc.message}</p></div>
                <p className="text-[11px] text-stone-400 mt-0.5 ml-[14px]">{inc.equipe_nom || 'Équipe'} • {inc.nom_chantier} • {timeAgo(inc.moment)}</p>
              </div>
            ))}
            {pointages.slice(0, 4).map((inc, i) => (
              <div key={`p-${i}`} className="px-5 py-3.5 hover:bg-stone-50 transition-colors">
                <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-400" /><p className="text-sm text-stone-600">{inc.message}</p></div>
                <p className="text-[11px] text-stone-400 mt-0.5 ml-[14px]">{inc.nom_chantier} • {timeAgo(inc.moment)}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
