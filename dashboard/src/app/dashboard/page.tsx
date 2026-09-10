'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getUtilisateur, apiFetch } from '@/lib/auth';
import {
  approuverDemande, refuserDemande, annulerBlocage,
  type StatsData, type DemandeData, type EquipeData, type ChantierData, type IncidentData,
} from '@/lib/api';
import {
  HardHat, AlertTriangle, Users, MapPin, XCircle,
  Loader2, CheckCheck, Timer, CheckCircle, Calendar, Clock, Ban,
  Search, Mail, Bell, Plus, Share, Star, Check,
} from 'lucide-react';
import MapView, { type TeamPosition } from '@/components/MapView';
import SyncNotifications from '@/components/SyncNotifications';

const AVATAR_BG = [
  'bg-gradient-to-br from-amber-200 to-orange-300 text-stone-700',
  'bg-gradient-to-br from-sky-200 to-blue-300 text-stone-700',
  'bg-gradient-to-br from-emerald-200 to-teal-300 text-stone-700',
  'bg-gradient-to-br from-rose-200 to-pink-300 text-stone-700',
  'bg-gradient-to-br from-violet-200 to-purple-300 text-stone-700',
  'bg-gradient-to-br from-lime-200 to-green-300 text-stone-700',
];

function initials(nom: string): string {
  const p = (nom || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  return `Il y a ${Math.floor(min / 60)}h`;
}

function parseEtapes(c: ChantierData) {
  let etapes: { label: string; done: boolean; subtasks?: { label: string; done: boolean }[] }[] = [];
  if (c.checklist_etapes) {
    try {
      const raw = typeof c.checklist_etapes === 'string' ? JSON.parse(c.checklist_etapes) : c.checklist_etapes;
      if (Array.isArray(raw)) etapes = raw;
    } catch {}
  }
  const total = etapes.length;
  const done = etapes.filter(e => e.done).length;
  let current = '', currentIdx = -1;
  for (let i = 0; i < etapes.length; i++) {
    const e = etapes[i];
    const complete = e.done && (!e.subtasks || e.subtasks.every(s => s.done));
    if (!complete) { current = e.label; currentIdx = i; break; }
  }
  return { etapes, total, done, current, currentIdx, pct: total > 0 ? Math.round((done / total) * 100) : 0, allDone: total > 0 && done === total };
}

const NAV_PILLS = [
  { label: "Vue d'ensemble", href: '/dashboard' },
  { label: 'Chantiers', href: '/dashboard/chantiers' },
  { label: 'Équipes', href: '/dashboard/team-management' },
  { label: 'Incidents', href: '/dashboard/incidents' },
  { label: 'Demandes', href: '/dashboard/demandes' },
  { label: 'Magasin', href: '/dashboard/magasiniers' },
];

export default function DashboardPage() {
  const router = useRouter();
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

  useEffect(() => {
    loadAll();
    const safetyTimeout = setTimeout(() => setLoading(false), 5000);
    const i = setInterval(() => {
      if (document.visibilityState === 'visible') loadAll();
    }, 8000);
    return () => { clearInterval(i); clearTimeout(safetyTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    try {
      const data = await apiFetch<any>('/dashboard/all');
      if (data.stats) setStats(data.stats);
      if (data.demandes) setDemandes(data.demandes);
      if (data.equipes) setEquipes(data.equipes);
      if (data.chantiers) setChantiers(data.chantiers);
      if (data.incidents) setIncidents(data.incidents);
      if (data.demandesMateriel) setDemandesMateriel(data.demandesMateriel);
      if (data.teamPositions) setTeamPositions(data.teamPositions);
      setError(null);
    } catch (e: any) {
      if (!stats && chantiers.length === 0) {
        setError(e?.message || 'Erreur de connexion au serveur.');
      }
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
    } catch (e: any) { alert(e.message || "Erreur lors de l'annulation du blocage."); }
    setActionLoading(null);
  }

  const groupes = useMemo(() => {
    const termines = chantiers.filter(c => c.statut === 'termine' || c.statut === 'reception_officielle');
    const bloques = chantiers.filter(c => c.statut === 'bloque' || ((c.nb_blocages ?? 0) > 0));
    const enCours = chantiers.filter(c => c.statut === 'en_cours');
    const planifies = chantiers.filter(c => c.statut === 'planifie');
    return { termines, bloques, enCours, planifies };
  }, [chantiers]);

  const totalCh = chantiers.length || 1;
  const pctExecuted = Math.round((groupes.termines.length / totalCh) * 100);
  const pctActive = Math.round((groupes.enCours.length / totalCh) * 100);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={36} className="animate-spin text-stone-500" /></div>;

  if (error && !stats && chantiers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-sm">
          <AlertTriangle size={32} className="text-rose-500" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-stone-800">Erreur de connexion</h2>
          <p className="text-sm text-stone-400 mt-1 max-w-md">{error}</p>
        </div>
        <button onClick={() => { setError(null); setLoading(true); loadAll(); }}
          className="px-6 py-2.5 bg-stone-900 text-white rounded-full text-sm font-semibold hover:bg-stone-700 shadow-sm">
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e4e6ec] text-stone-900 overflow-x-clip">
      <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pt-safe pb-safe">
      {/* ═══ TOP BAR : logo + pills + icon actions ═══ */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-stone-900 flex items-center justify-center shadow shrink-0">
            <HardHat size={18} className="text-white" />
          </div>
          <span className="text-base sm:text-lg font-bold tracking-tight text-stone-900 truncate">rmasc<span className="font-normal"> onsite</span></span>
        </div>
        <nav className="flex items-center gap-1 bg-white/60 rounded-full p-1 border border-white overflow-x-auto max-w-full scrollbar-none order-3 md:order-none w-full md:w-auto justify-start md:justify-center">
          {NAV_PILLS.map((p) => {
            const active = p.label === "Vue d'ensemble";
            return (
              <button key={p.label} onClick={() => { if (!active) router.push(p.href); }}
                className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all whitespace-nowrap ${active ? 'bg-stone-900 text-white shadow' : 'text-stone-500 hover:text-stone-800'}`}>
                {p.label}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:shadow transition-all shrink-0" title="Recherche">
            <Search size={16} />
          </button>
          <button onClick={() => router.push('/dashboard/demandes')}
            className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:shadow transition-all shrink-0" title="Commandes">
            <Mail size={16} />
            {demandes.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-rose-400 border-2 border-white" />}
          </button>
          <button onClick={() => router.push('/dashboard/incidents')}
            className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:shadow transition-all shrink-0" title="Alertes">
            <Bell size={16} />
            {(groupes.bloques.length > 0) && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-rose-400 border-2 border-white" />}
          </button>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-amber-200 to-rose-300 border-2 border-white shadow flex items-center justify-center text-[12px] sm:text-[13px] font-bold text-stone-700 shrink-0" title={`${user?.prenom || ''} ${user?.nom || ''}`}>
            {(user?.prenom?.[0] || 'E')}{(user?.nom?.[0] || 'G')}
          </div>
        </div>
      </div>

      {/* ═══ TITLE ═══ */}
      <h1 className="text-[22px] sm:text-[30px] font-bold tracking-tight text-stone-900 mb-4 break-words">Suivi des Chantiers</h1>

      {/* ═══ MAIN JOURNEY BOARD ═══ */}
      <div className="bg-[#f2f4f9]/80 rounded-[20px] sm:rounded-[28px] border border-white shadow-sm p-3 sm:p-6 mb-5 overflow-hidden">
        {/* board header */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <h2 className="text-[14px] sm:text-[15px] font-bold text-stone-800">Gestion des Chantiers</h2>
          {/* avatar stack équipes */}
          <div className="flex items-center overflow-x-auto max-w-full scrollbar-none">
            {equipes.slice(0, 7).map((eq, i) => (
              <div key={eq.id} className={`flex flex-col items-center ${i > 0 ? '-ml-2' : ''}`}>
                <div className={`w-10 h-10 rounded-full border-[3px] border-[#f2f4f9] flex items-center justify-center text-[11px] font-bold shadow-sm ${AVATAR_BG[i % AVATAR_BG.length]}`} title={eq.nom}>
                  {initials(eq.nom)}
                </div>
                <span className={`mt-1 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center text-white shadow ${eq.statut_equipe === 'EN_MISSION' ? 'bg-rose-400' : eq.statut_equipe === 'EN_REPOS' ? 'bg-amber-400' : 'bg-blue-400'}`}>
                  {eq.missions > 0 ? eq.missions : '+'}
                </span>
              </div>
            ))}
            {equipes.length === 0 && <span className="text-xs text-stone-400">Aucune équipe</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/dashboard/chantiers')}
              className="w-11 h-11 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:shadow transition-all" title="Nouveau chantier">
              <Plus size={17} />
            </button>
            <button onClick={() => router.push('/dashboard/chantiers')}
              className="w-11 h-11 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:shadow transition-all" title="Partager">
              <Share size={16} />
            </button>
            <div className="w-11 h-11 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:shadow transition-all overflow-hidden">
              <SyncNotifications onRefresh={loadAll} />
            </div>
          </div>
        </div>

        {/* 4 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* COL 1 — Allocation */}
          <JourneyColumn title="Allocation Équipe">
            {groupes.planifies.length === 0 && (
              <EmptyMini label="Aucun chantier à allouer" />
            )}
            {groupes.planifies.slice(0, 3).map((c) => (
              <div key={c.id} className="bg-[#f7f9fc] border border-stone-100 rounded-2xl p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-200 to-blue-300 flex items-center justify-center text-[11px] font-bold text-stone-700 shrink-0">
                    {initials(c.nom)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check size={15} className="text-stone-700" strokeWidth={2.5} />
                    <span className="w-9 h-9 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500">
                      <Calendar size={14} />
                    </span>
                  </div>
                </div>
                <p className="text-[12px] text-stone-500 mt-2.5">Allouer le chantier à une équipe</p>
                <p className="text-[13px] font-bold text-stone-800 mt-0.5 truncate">{c.nom}</p>
                <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 mt-1 truncate">
                  <MapPin size={11} className="shrink-0" />{c.adresse || 'Lieu non renseigné'}
                </p>
              </div>
            ))}
          </JourneyColumn>

          {/* COL 2 — Phase en cours */}
          <JourneyColumn title="Phase en Cours">
            {groupes.enCours.length === 0 && <EmptyMini label="Aucune phase active" />}
            {groupes.enCours.slice(0, 3).map((c) => {
              const p = parseEtapes(c);
              return (
                <div key={c.id} className="bg-[#f7f9fc] border border-stone-100 rounded-2xl p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-200 to-teal-300 flex items-center justify-center text-[10px] font-bold text-stone-700 shrink-0">
                        {initials(c.equipe_actuelle && c.equipe_actuelle !== 'Aucune' ? c.equipe_actuelle : c.nom)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-stone-800 truncate">{c.nom}</p>
                        <p className="text-[10px] text-stone-400 truncate">{c.phase_actuelle === 'mecanique' ? '🔧 Mécanique' : c.phase_actuelle === 'electrique' ? '⚡ Électrique' : c.phase_actuelle === 'verification' ? '🛡️ Vérification' : 'Phase'}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-stone-500 shrink-0">{p.pct}%</span>
                  </div>
                  {p.current ? (
                    <p className="text-[11px] text-stone-500 mt-2 truncate">Étape {p.currentIdx + 1}/{p.total} : <span className="font-semibold text-stone-700">{p.current}</span></p>
                  ) : (
                    <p className="text-[11px] text-stone-400 mt-2">Démarrage de la phase…</p>
                  )}
                  <div className="h-1.5 bg-stone-200/70 rounded-full overflow-hidden mt-2">
                    <div className={`h-full rounded-full ${p.pct === 100 ? 'bg-emerald-500' : p.pct >= 60 ? 'bg-blue-400' : 'bg-amber-400'}`} style={{ width: `${Math.max(p.pct, 4)}%` }} />
                  </div>
                  <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 mt-2 truncate">
                    <MapPin size={11} className="shrink-0" />{c.adresse || 'Lieu non renseigné'}
                  </p>
                </div>
              );
            })}
          </JourneyColumn>

          {/* COL 3 — Résolution / blocages */}
          <JourneyColumn title="Résolution Technique">
            {groupes.bloques.length === 0 && <EmptyMini label="Aucun blocage — tout roule ✓" />}
            {groupes.bloques.slice(0, 3).map((c) => (
              <div key={c.id} className="bg-[#f7f9fc] border border-stone-100 rounded-2xl p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-stone-800 truncate">{c.nom}</p>
                    <p className="text-[11px] text-rose-500 mt-1 leading-snug line-clamp-2">{c.motifs_blocage || 'Mission bloquée'}</p>
                  </div>
                  <span className="text-stone-300 text-sm shrink-0">•••</span>
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 truncate">
                    <MapPin size={11} className="shrink-0" />{c.adresse || 'Lieu non renseigné'}
                  </p>
                  {c.blocage_ids && (
                    <button onClick={() => handleAnnulerBlocage(c.blocage_ids!)}
                      disabled={actionLoading === `blocage-${c.blocage_ids}`}
                      className="text-[10px] font-bold text-white bg-stone-900 hover:bg-stone-700 px-2.5 py-1.5 rounded-full transition-all disabled:opacity-50 shrink-0">
                      {actionLoading === `blocage-${c.blocage_ids}` ? '...' : 'Débloquer'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </JourneyColumn>

          {/* COL 4 — Terminés */}
          <JourneyColumn title="Nouvelles Tâches">
            <div className="bg-stone-900 rounded-2xl p-3.5 text-white">
              <p className="text-[13px] font-bold leading-snug">Réception<br />& Clôture</p>
              <p className="text-[11px] text-white/60 mt-1">{groupes.termines.length} chantier{groupes.termines.length > 1 ? 's' : ''} terminé{groupes.termines.length > 1 ? 's' : ''}</p>
            </div>
            {groupes.termines.slice(0, 2).map((c) => (
              <div key={c.id} className="bg-[#f7f9fc] border border-stone-100 rounded-2xl p-3.5">
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle size={14} />
                  <p className="text-[12px] font-bold text-stone-800 truncate">{c.nom}</p>
                </div>
                <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 mt-1.5 truncate">
                  <MapPin size={11} className="shrink-0" />{c.adresse || 'Lieu non renseigné'}
                </p>
              </div>
            ))}
            {groupes.termines.length === 0 && <EmptyMini label="Aucune réception pour le moment" />}
          </JourneyColumn>
        </div>
      </div>

      {/* ═══ APPROVAL STRIP (fonctionnel, style board) ═══ */}
      {demandes.length > 0 && (
        <div className="bg-white rounded-[24px] border border-stone-100 shadow-sm mb-5 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-stone-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center"><Mail size={17} className="text-rose-500" /></div>
              <div><h2 className="font-bold text-[15px] text-stone-800">Commandes Factory à Valider</h2><p className="text-xs text-stone-400">{demandes.length} en attente</p></div>
            </div>
            <span className="bg-stone-900 text-white text-xs font-bold px-3 py-1 rounded-full">{demandes.length}</span>
          </div>
          <div className="divide-y divide-stone-100">
            {demandes.map((d) => (
              <div key={d.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">{d.ref}</span>
                    <span className="font-semibold text-sm text-stone-800">{d.nom_chantier}</span>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">Client: {d.client_nom} • {timeAgo(d.cree)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleApprouver(d.id)} disabled={actionLoading === d.id}
                    className="flex items-center gap-1.5 bg-stone-900 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-stone-700 disabled:opacity-50">
                    {actionLoading === d.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCheck size={15} />}Valider
                  </button>
                  <button onClick={() => handleRefuser(d.id)} disabled={actionLoading === d.id}
                    className="flex items-center gap-1.5 bg-white text-rose-500 px-4 py-2 rounded-full text-sm font-semibold border border-stone-200 hover:bg-rose-50">
                    <XCircle size={15} /> Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ MAP (même style) ═══ */}
      <div className="mb-5 rounded-[28px] overflow-hidden">
        <MapView chantiers={chantiers} teamPositions={teamPositions} />
      </div>

      {/* ═══ BOTTOM SPLIT : table + arcs ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 mb-5">
        {/* Table chantiers */}
        <div className="xl:col-span-3 bg-[#eef1f7] rounded-[28px] border border-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-stone-800">Chantiers Suivis</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => router.push('/dashboard/chantiers')} className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:shadow" title="Ajouter"><Plus size={16} /></button>
              <button onClick={() => router.push('/dashboard/chantiers')} className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:shadow" title="Voir tout"><Share size={15} /></button>
              <button onClick={() => router.push('/dashboard/chantiers')} className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:shadow" title="Calendrier"><Calendar size={15} /></button>
            </div>
          </div>
          <div className="hidden sm:grid grid-cols-[24px_1.4fr_0.8fr_1fr_1fr] gap-2 px-3 pb-2 text-[11px] font-medium text-stone-400">
            <span></span><span>Chantier</span><span>Statut</span><span>Échéance</span><span>Équipe assignée</span>
          </div>
          <div className="space-y-1">
            {chantiers.slice(0, 6).map((c) => (
              <div key={c.id} className="grid grid-cols-1 sm:grid-cols-[24px_1.4fr_0.8fr_1fr_1fr] gap-1 sm:gap-2 items-center px-3 py-2.5 rounded-2xl hover:bg-white transition-colors">
                <Star size={14} className="text-stone-300 hidden sm:block" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-stone-700 truncate">{c.nom}</p>
                  <p className="flex items-center gap-1 text-[10px] font-semibold text-rose-500 truncate"><MapPin size={10} className="shrink-0" />{c.adresse || 'Lieu non renseigné'}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full w-fit ${c.statut === 'termine' || c.statut === 'reception_officielle' ? 'bg-blue-100 text-blue-600' : c.statut === 'en_cours' ? 'bg-rose-100 text-rose-500' : c.statut === 'bloque' ? 'bg-stone-900 text-white' : 'bg-stone-200/70 text-stone-500'}`}>
                  {c.statut === 'termine' || c.statut === 'reception_officielle' ? 'Exécuté' : c.statut === 'en_cours' ? 'Actif' : c.statut === 'bloque' ? 'Bloqué' : 'Planifié'}
                </span>
                <span className="text-[11px] text-stone-500">{c.date_echeance ? new Date(c.date_echeance).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                <span className="text-[11px] text-stone-500 truncate">{c.equipe_actuelle && c.equipe_actuelle !== 'Aucune' ? c.equipe_actuelle : '—'}</span>
              </div>
            ))}
            {chantiers.length === 0 && <p className="py-10 text-center text-stone-400 text-sm">Aucun chantier.</p>}
          </div>
        </div>

        {/* Arcs stats */}
        <div className="xl:col-span-2 bg-[#eef1f7] rounded-[28px] border border-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[15px] font-bold text-stone-800">État des Missions</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => router.push('/dashboard/chantiers')} className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:shadow"><Plus size={16} /></button>
              <button onClick={loadAll} className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:shadow"><Timer size={15} /></button>
              <button onClick={() => router.push('/dashboard/chantiers')} className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:shadow"><Calendar size={15} /></button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ArcGauge label="Exécuté" value={groupes.termines.length} pct={pctExecuted} color="#7aa5e8" track="#d7e3f7" />
            <ArcGauge label="Actif" value={groupes.enCours.length} pct={pctActive} color="#e88383" track="#f6d9d9" />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-white rounded-2xl p-3.5 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center"><HardHat size={17} className="text-emerald-500" /></div>
              <div><p className="text-[10px] font-semibold text-stone-400 uppercase">Actifs</p><p className="text-lg font-bold text-stone-800">{stats?.chantiersActifs ?? 0}</p></div>
            </div>
            <div className="bg-white rounded-2xl p-3.5 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center"><Users size={17} className="text-indigo-500" /></div>
              <div><p className="text-[10px] font-semibold text-stone-400 uppercase">Équipes dispo</p><p className="text-lg font-bold text-stone-800">{stats?.equipesDisponibles ?? 0}</p></div>
            </div>
          </div>
          {(stats?.chantiersBloques ?? 0) > 0 && (
            <div className="mt-3 bg-white rounded-2xl p-3.5 flex items-center gap-2.5 border border-rose-100">
              <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center"><Ban size={17} className="text-rose-500" /></div>
              <div><p className="text-[10px] font-semibold text-stone-400 uppercase">Bloqués</p><p className="text-lg font-bold text-stone-800">{stats?.chantiersBloques}</p></div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ ALERTES & ÉQUIPES (même langage visuel) ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-[24px] border border-stone-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center"><AlertTriangle size={16} className="text-rose-500" /></div>
              <h3 className="text-sm font-bold text-stone-800">Alertes & Blocages</h3>
            </div>
            <button onClick={() => router.push('/dashboard/incidents')} className="text-[11px] font-semibold text-stone-400 hover:text-stone-700">Tout voir →</button>
          </div>
          <div className="divide-y divide-stone-50 max-h-[320px] overflow-y-auto">
            {incidents.length === 0 ? <p className="py-10 text-center text-stone-400 text-sm">Tout est sous contrôle ✓</p> :
              incidents.slice(0, 6).map((inc, i) => (
                <div key={i} className="px-5 py-3">
                  <p className="text-[13px] font-semibold text-stone-700">{inc.message}</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">{inc.nom_chantier} • {timeAgo(inc.moment)}</p>
                  {inc.blocage_id && (
                    <button onClick={() => handleAnnulerBlocage(inc.blocage_id!)}
                      disabled={actionLoading === `blocage-${inc.blocage_id}`}
                      className="mt-1.5 text-[10px] font-bold text-white bg-stone-900 hover:bg-stone-700 px-2.5 py-1 rounded-full disabled:opacity-50">
                      {actionLoading === `blocage-${inc.blocage_id}` ? '...' : '✕ Annuler le blocage'}
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
        <div className="bg-white rounded-[24px] border border-stone-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center"><Users size={16} className="text-indigo-500" /></div>
              <h3 className="text-sm font-bold text-stone-800">Équipes <span className="text-stone-400 font-normal">({equipes.length})</span></h3>
            </div>
            <button onClick={() => router.push('/dashboard/team-management')} className="text-[11px] font-semibold text-stone-400 hover:text-stone-700">Gérer →</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {equipes.slice(0, 6).map((eq, i) => (
              <div key={eq.id} className="rounded-2xl p-3.5 border bg-[#f7f9fc] border-stone-100">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${AVATAR_BG[i % AVATAR_BG.length]}`}>{initials(eq.nom)}</div>
                  <span className="text-[12px] font-semibold text-stone-700 truncate">{eq.nom}</span>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${eq.statut_equipe === 'EN_MISSION' ? 'bg-indigo-50 text-indigo-600' : eq.statut_equipe === 'EN_REPOS' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {eq.statut_equipe === 'EN_MISSION' ? 'En mission' : eq.statut_equipe === 'EN_REPOS' ? 'En repos' : 'Disponible'}
                </span>
                {eq.membres_noms && <p className="text-[10px] text-stone-400 mt-1.5 truncate">👤 {eq.membres_noms}</p>}
                {eq.statut_equipe === 'EN_REPOS' && (eq.jours_repos_restants ?? 0) > 0 && (
                  <p className="text-[10px] font-bold text-amber-600 mt-1 truncate">🌙 Repos: {eq.jours_repos_restants}j restant{(eq.jours_repos_restants ?? 0) > 1 ? 's' : ''}</p>
                )}
              </div>
            ))}
            {equipes.length === 0 && <p className="col-span-3 py-8 text-center text-stone-400 text-sm">Aucune équipe.</p>}
          </div>
        </div>
      </div>

      {/* ═══ RETARDS + DEMANDES MATÉRIEL ═══ */}
      {retards.length > 0 && (
        <div className="bg-white rounded-[24px] border border-amber-200 shadow-sm mb-5 overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center"><Timer size={17} className="text-amber-600" /></div>
            <h2 className="font-bold text-sm text-stone-800">⏰ Retards Signalés <span className="text-stone-400 font-normal">({retards.length})</span></h2>
          </div>
          <div className="divide-y divide-stone-100">
            {retards.slice(0, 5).map((r, i) => (
              <div key={i} className="px-5 py-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-stone-800">{r.nom_chantier}</span>
                  <span className="text-[10px] font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">{r.equipe_nom}</span>
                </div>
                <p className="text-sm text-stone-600 mt-1">{r.motif}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {demandesMateriel.length > 0 && (
        <div className="bg-white rounded-[24px] border border-stone-100 shadow-sm mb-5 overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h2 className="font-bold text-sm text-stone-800">Demandes Matériel <span className="text-stone-400 font-normal">({demandesMateriel.length})</span></h2>
            <button onClick={() => router.push('/dashboard/demandes')} className="text-[11px] font-semibold text-stone-400 hover:text-stone-700">Tout voir →</button>
          </div>
          <div className="divide-y divide-stone-50">
            {demandesMateriel.slice(0, 5).map((dm: any) => (
              <div key={dm.id} className="px-5 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-stone-700 truncate">{dm.equipe_nom || 'Équipe'}{dm.chantier_nom ? ` • ${dm.chantier_nom}` : ''}</p>
                  {dm.description && <p className="text-xs text-stone-400 truncate">{dm.description}</p>}
                </div>
                <span className="text-[10px] text-stone-400 shrink-0">{dm.cree}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-stone-400 pb-4 flex items-center justify-center gap-1.5">
        <Clock size={11} /> Synchronisé en temps réel • {user?.prenom} {user?.nom}
      </p>
      </div>
    </div>
  );
}

function JourneyColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="bg-white rounded-[24px] p-3 shadow-sm border border-stone-100 space-y-3 min-h-[180px]">
        {children}
      </div>
      <p className="text-center text-[12px] font-medium text-stone-500 mt-2.5">{title}</p>
    </div>
  );
}

function EmptyMini({ label }: { label: string }) {
  return (
    <div className="bg-[#f7f9fc] border border-dashed border-stone-200 rounded-2xl p-4 text-center">
      <p className="text-[11px] text-stone-400">{label}</p>
    </div>
  );
}

function ArcGauge({ label, value, pct, color, track }: { label: string; value: number; pct: number; color: string; track: string }) {
  const R = 64;
  const CIRC = Math.PI * R;
  const fill = Math.max(0, Math.min(100, pct)) / 100 * CIRC;
  return (
    <div className="bg-white rounded-2xl p-3 sm:p-4 flex flex-col items-center min-w-0 overflow-hidden">
      <div className="relative w-full max-w-[150px]">
        <span className="absolute -top-1 left-1/2 -translate-x-1/2 bg-white border border-stone-100 shadow-sm text-[11px] font-bold text-stone-600 rounded-full px-2 py-0.5 z-10">{value}</span>
        <svg viewBox="0 0 150 92" className="w-full h-auto">
          <path d={`M 11 84 A ${R} ${R} 0 0 1 139 84`} fill="none" stroke={track} strokeWidth="26" strokeLinecap="round" />
          <path d={`M 11 84 A ${R} ${R} 0 0 1 139 84`} fill="none" stroke={color} strokeWidth="26" strokeLinecap="round"
            strokeDasharray={`${fill} ${CIRC}`} />
          <text x="75" y="72" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">{label}</text>
        </svg>
      </div>
    </div>
  );
}
