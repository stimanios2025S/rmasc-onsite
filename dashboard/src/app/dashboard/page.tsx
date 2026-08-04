'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { estConnecte, getUtilisateur } from '@/lib/auth';
import { apiFetch } from '@/lib/auth';
import {
  fetchStats, fetchDemandes, fetchEquipes, fetchChantiers, fetchIncidents,
  approuverDemande, refuserDemande,
  type StatsData, type DemandeData, type EquipeData, type ChantierData, type IncidentData,
} from '@/lib/api';
import {
  HardHat, AlertTriangle, Users, MapPin, Bell, CheckCircle, XCircle,
  Clock, Loader2, ChevronDown, ChevronRight, Package, Wrench, Zap, Shield,
  ArrowUpRight, CheckCheck, Search, Timer,
} from 'lucide-react';
import MapView from '@/components/MapView';

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
  const router = useRouter();
  const user = getUtilisateur();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [demandes, setDemandes] = useState<DemandeData[]>([]);
  const [equipes, setEquipes] = useState<EquipeData[]>([]);
  const [chantiers, setChantiers] = useState<ChantierData[]>([]);
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [retards, setRetards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showEquipes, setShowEquipes] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [filtreTemps, setFiltreTemps] = useState("Aujourd'hui");

  // Sync temps réel : polling 5s (technicien ↔ admin)
  useEffect(() => { loadAll(); const i = setInterval(loadAll, 5000); return () => clearInterval(i); }, []);

  async function loadAll() {
    try {
      const [s, d, e, c, i, r] = await Promise.all([
        fetchStats(), fetchDemandes(), fetchEquipes(),
        fetchChantiers(), fetchIncidents(),
        apiFetch('/admin/retards').catch(() => []),
      ]);
      setStats(s); setDemandes(d); setEquipes(e); setChantiers(c); setIncidents(i);
      setRetards(r as any[]);
    } catch (_) { /* keep stale */ }
    setLoading(false);
  }

  async function handleApprouver(id: string) {
    setActionLoading(id); try { await approuverDemande(id); await loadAll(); } catch (e: any) { alert(e.message); } setActionLoading(null);
  }
  async function handleRefuser(id: string) {
    if (!confirm('Refuser cette commande ?')) return;
    setActionLoading(id); try { await refuserDemande(id); await loadAll(); } catch (e: any) { alert(e.message); } setActionLoading(null);
  }

  const equipeTypes = useMemo(() => {
    const g: Record<string, EquipeData[]> = {};
    for (const e of equipes) { const t = e.type; if (!g[t]) g[t] = []; g[t].push(e); }
    return g;
  }, [equipes]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={36} className="animate-spin text-indigo-500" /></div>;

  const totalM = stats?.missionsTotal ?? 0;
  const pct = totalM > 0 ? Math.round(((stats?.chantiersTotal ?? 0) / totalM) * 100) : 0;

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-stone-100 p-1 flex">
            {["Aujourd'hui", 'Cette semaine', 'Ce mois'].map((t) => (
              <button key={t} onClick={() => setFiltreTemps(t)}
                className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-all ${filtreTemps === t ? 'bg-stone-800 text-white shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-stone-400">
          <Bell size={16} />
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
              <div key={d.id} className="px-6 py-4 flex items-center justify-between hover:bg-rose-50/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{d.ref}</span>
                    <span className="font-semibold text-stone-800">{d.nom_chantier}</span>
                  </div>
                  <p className="text-[13px] text-stone-400 mt-1">Client: {d.client_nom} • {timeAgo(d.cree)}</p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button onClick={() => handleApprouver(d.id)} disabled={actionLoading === d.id}
                    className="flex items-center gap-1.5 bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 shadow-sm">
                    {actionLoading === d.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCheck size={15} />}Valider
                  </button>
                  <button onClick={() => handleRefuser(d.id)} disabled={actionLoading === d.id}
                    className="flex items-center gap-1.5 bg-white text-rose-500 px-4 py-2 rounded-xl text-sm font-semibold border border-rose-200 hover:bg-rose-50">
                    <XCircle size={15} /> Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs + Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard titre="Chantiers Actifs" valeur={stats?.chantiersActifs ?? 0} couleur="emerald" icon={<HardHat size={20} />} />
          <KpiCard titre="Bloqués" valeur={stats?.chantiersBloques ?? 0} couleur="rose" icon={<AlertTriangle size={20} />} badge />
          <KpiCard titre="Équipes Dispo" valeur={stats?.equipesDisponibles ?? 0} couleur="indigo" icon={<Users size={20} />} />
          <KpiCard titre="Blocages" valeur={stats?.blocagesOuverts ?? 0} couleur="amber" icon={<AlertTriangle size={20} />} />
        </div>
        <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5 flex flex-col items-center justify-center">
          <div className="relative w-24 h-12 overflow-hidden mb-2">
            <div className="absolute inset-0 rounded-t-full border-8 border-stone-100" />
            <div className="absolute inset-0 rounded-t-full border-8 border-transparent border-t-emerald-400 border-r-emerald-400" style={{ rotate: `${pct * 1.8 - 180}deg` }} />
          </div>
          <p className="text-2xl font-bold text-stone-800">{pct}%</p>
          <p className="text-[10px] text-stone-400 uppercase tracking-wider">Objectif Mensuel</p>
        </div>
      </div>

      {/* Map + Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center"><MapPin size={18} className="text-indigo-600" /></div>
              <h2 className="font-bold text-stone-800">Carte des Chantiers</h2>
              <span className="text-xs text-stone-400">({chantiers.length} sites)</span>
            </div>
            <MapView chantiers={chantiers} />
          </div>
          <MapWidget chantiers={chantiers} />
        </div>
        <div><IncidentsWidget incidents={incidents} /></div>
      </div>

      {/* ═══ RETARDS SIGNALÉS (sync technicien → admin) ═══ */}
      {retards.length > 0 && (
        <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-amber-200 shadow-sm mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Timer size={18} className="text-amber-600" />
              </div>
              <div>
                <h2 className="font-bold text-stone-800">⏰ Retards Signalés <span className="text-stone-400 font-normal">({retards.length})</span></h2>
                <p className="text-xs text-stone-400">Signalés par les équipes en temps réel</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-stone-100">
            {retards.slice(0, 8).map((r, i) => (
              <div key={i} className="px-6 py-4 hover:bg-amber-50/30 transition-colors">
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

      {/* Team Matrix */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm mb-8">
        <button onClick={() => setShowEquipes(!showEquipes)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-stone-50 rounded-t-3xl transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center"><Users size={18} className="text-indigo-600" /></div>
            <h2 className="font-bold text-stone-800">Matrice des Équipes <span className="text-stone-400 font-normal">({equipes.length})</span></h2>
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
                        {eq.statut_equipe === 'EN_REPOS' && eq.jours_repos_restants > 0 && <p className="text-[11px] text-amber-600 font-medium">⏳ {eq.jours_repos_restants}j restants</p>}
                        {eq.statut_equipe === 'EN_MISSION' && <p className="text-[11px] text-indigo-600 font-medium">🔧 {eq.missions} mission{eq.missions > 1 ? 's' : ''}</p>}
                        {eq.statut_equipe === 'DISPONIBLE' && <p className="text-[11px] text-emerald-600 font-medium">✅ Prêt</p>}
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
    <div className="relative bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5 flex items-start gap-4 hover:shadow-md transition-all">
      {badge && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" /></span>}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cm[couleur]}`}>{icon}</div>
      <div><p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-0.5">{titre}</p><span className="text-2xl font-bold text-stone-800">{valeur}</span></div>
    </div>
  );
}

function MapWidget({ chantiers }: { chantiers: ChantierData[] }) {
  const dot = (s: string) => s === 'en_cours' ? 'bg-emerald-400' : s === 'bloque' ? 'bg-rose-400' : s === 'termine' || s === 'reception_officielle' ? 'bg-stone-300' : 'bg-indigo-400';
  return (
    <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center"><MapPin size={18} className="text-indigo-600" /></div>
        <h2 className="font-bold text-stone-800">Carte des Chantiers</h2><span className="text-xs text-stone-400">({chantiers.length})</span>
      </div>
      <div className="p-6">
        {chantiers.length === 0 ? <p className="text-center text-stone-400 py-12 text-sm">Aucun chantier.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto">
            {chantiers.map((c) => (
              <div key={c.id} className="flex items-start gap-3 p-3.5 rounded-2xl border border-stone-100 hover:bg-stone-50 transition-colors cursor-pointer">
                <div className={`w-3 h-3 mt-1.5 rounded-full shrink-0 ${dot(c.statut)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-700">{c.nom}</p>
                  <p className="text-[11px] text-stone-400 font-mono">{c.ref}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-stone-400">{c.client_nom || '—'}</span>
                    {c.en_cours > 0 && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{c.en_cours} actif</span>}
                  </div>
                </div>
                <ArrowUpRight size={14} className="text-stone-300 mt-1 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IncidentsWidget({ incidents }: { incidents: IncidentData[] }) {
  const blocages = incidents.filter(i => i.type === 'blocage');
  const pointages = incidents.filter(i => i.type === 'pointage');
  return (
    <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm h-full">
      <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-rose-50 flex items-center justify-center"><AlertTriangle size={15} className="text-rose-500" /></div>
          <h3 className="text-sm font-bold text-stone-800">Blocages</h3>
        </div>
        <span className="text-[11px] text-stone-400">{blocages.length + pointages.length} récents</span>
      </div>
      <div className="divide-y divide-stone-50 max-h-[520px] overflow-y-auto">
        {blocages.length === 0 && pointages.length === 0 ? <p className="py-10 text-center text-stone-400 text-sm">Tout est sous contrôle ✓</p> : (
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
