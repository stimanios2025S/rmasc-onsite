'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Users, Loader2, Save, X, CheckCircle, AlertTriangle, Settings,
  Wrench, Zap, Shield, Clock, RefreshCw, ArrowRightLeft, Phone,
  Edit3, ChevronDown, ChevronUp, Calendar, User, MapPin,
} from 'lucide-react';
import {
  fetchTeamsManagement, updateTeam, updateTeamMembers,
  fetchSystemConfig, updateSystemConfig,
  fetchMissionsReassign, reassignMission,
  type TeamData, type TeamMember, type MissionReassign, type SystemConfig,
} from '@/lib/api';

/* ─── CONSTANTS ────────────────────────────────────────────────────── */
const TYPE_META: Record<string, { label: string; icon: any; color: string; bg: string; ring: string }> = {
  mecanique: { label: 'Mécanique', icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-500', ring: 'ring-blue-200' },
  electrique: { label: 'Électrique', icon: Zap, color: 'text-orange-600', bg: 'bg-orange-500', ring: 'ring-orange-200' },
  mixte: { label: 'Vérification', icon: Shield, color: 'text-emerald-600', bg: 'bg-emerald-500', ring: 'ring-emerald-200' },
};
const STATUT_META: Record<string, { label: string; color: string; bg: string }> = {
  DISPONIBLE: { label: 'Disponible', color: 'text-emerald-600', bg: 'bg-emerald-50 ring-emerald-200' },
  EN_MISSION: { label: 'En mission', color: 'text-indigo-600', bg: 'bg-indigo-50 ring-indigo-200' },
  EN_REPOS: { label: 'En repos', color: 'text-amber-600', bg: 'bg-amber-50 ring-amber-200' },
};
const PHASE_LABEL: Record<string, string> = { mecanique: 'Mécanique', electrique: 'Électrique', verification: 'Vérification' };
const STATUT_MISSION: Record<string, string> = {
  en_attente: 'bg-amber-50 text-amber-600 ring-amber-200',
  en_cours: 'bg-indigo-50 text-indigo-600 ring-indigo-200',
  bloque: 'bg-rose-50 text-rose-600 ring-rose-200',
};
const COLORS_PRESET = ['#2196F3', '#1976D2', '#FF9800', '#E65100', '#4CAF50', '#009688', '#9C27B0', '#F44336', '#607D8B'];

/* ─── MAIN PAGE ────────────────────────────────────────────────────── */
export default function TeamManagementPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [missions, setMissions] = useState<MissionReassign[]>([]);
  const [config, setConfig] = useState<SystemConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit states
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [editingMembers, setEditingMembers] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState(false);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  // Form states
  const [teamForm, setTeamForm] = useState({ nom: '', type: '', couleur_hex: '' });
  const [memberForms, setMemberForms] = useState<Record<string, { prenom: string; nom: string; telephone: string }>>({});
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [reassignForm, setReassignForm] = useState<Record<string, string>>({});

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t, m, c] = await Promise.all([
        fetchTeamsManagement(),
        fetchMissionsReassign(),
        fetchSystemConfig(),
      ]);
      setTeams(t);
      setMissions(m);
      setConfig(c);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── TEAM NAME/TYPE/COLOR EDIT ────────────────────────────────────
  const startEditTeam = (team: TeamData) => {
    setEditingTeam(team.id);
    setTeamForm({ nom: team.nom, type: team.type, couleur_hex: team.couleur_hex || '#2196F3' });
  };
  const saveTeam = async (id: string) => {
    setSaving(true);
    try {
      await updateTeam(id, teamForm);
      showToast('success', '✅ Équipe mise à jour.');
      setEditingTeam(null);
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Erreur');
    }
    setSaving(false);
  };

  // ─── MEMBER EDIT ──────────────────────────────────────────────────
  const startEditMembers = (team: TeamData) => {
    setEditingMembers(team.id);
    const forms: Record<string, { prenom: string; nom: string; telephone: string }> = {};
    team.membres.forEach(m => {
      forms[m.id] = { prenom: m.prenom, nom: m.nom, telephone: m.telephone || '' };
    });
    setMemberForms(forms);
  };
  const saveMembers = async (id: string) => {
    setSaving(true);
    try {
      const membres = Object.entries(memberForms).map(([mid, f]) => ({
        id: mid, prenom: f.prenom, nom: f.nom, telephone: f.telephone || null,
      }));
      await updateTeamMembers(id, membres);
      showToast('success', '✅ Membres mis à jour.');
      setEditingMembers(null);
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Erreur');
    }
    setSaving(false);
  };

  // ─── CONFIG EDIT ──────────────────────────────────────────────────
  const startEditConfig = () => {
    setEditingConfig(true);
    const forms: Record<string, string> = {};
    Object.entries(config).forEach(([k, v]) => { forms[k] = v.valeur; });
    setConfigForm(forms);
  };
  const saveConfig = async () => {
    setSaving(true);
    try {
      await updateSystemConfig(configForm);
      showToast('success', '✅ Configuration mise à jour.');
      setEditingConfig(false);
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Erreur');
    }
    setSaving(false);
  };

  // ─── REASSIGN ─────────────────────────────────────────────────────
  const handleReassign = async (missionId: string) => {
    const newEquipeId = reassignForm[missionId];
    if (!newEquipeId) return;
    setSaving(true);
    try {
      const result = await reassignMission(missionId, newEquipeId);
      showToast('success', result.message || '✅ Mission réassignée.');
      setReassigning(null);
      setReassignForm(prev => { const n = { ...prev }; delete n[missionId]; return n; });
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Erreur');
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 size={36} className="animate-spin text-indigo-500" />
    </div>
  );

  const reposJours = config.jours_repos?.valeur || '3';

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Team Management</h1>
          <p className="text-sm text-stone-400 mt-0.5">Gérez les équipes, membres et configuration</p>
        </div>
        <button onClick={loadAll}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-medium text-stone-500 hover:text-stone-700 hover:border-stone-300 transition-all">
          <RefreshCw size={15} /> Actualiser
        </button>
      </div>

      {/* ═══ SECTION 1: REST DAYS CONFIG ═══ */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Settings size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-stone-800">Configuration Système</h2>
              <p className="text-xs text-stone-400">Paramètres globaux de l'application</p>
            </div>
          </div>
          {!editingConfig ? (
            <button onClick={startEditConfig}
              className="flex items-center gap-2 px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-500 hover:bg-stone-100 transition-all">
              <Edit3 size={14} /> Modifier
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditingConfig(false)}
                className="flex items-center gap-1 px-3 py-2 bg-stone-100 rounded-xl text-xs font-semibold text-stone-500 hover:bg-stone-200 transition-all">
                <X size={14} /> Annuler
              </button>
              <button onClick={saveConfig} disabled={saving}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 disabled:opacity-50 transition-all">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Sauvegarder
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(config).map(([cle, val]) => (
            <div key={cle} className="bg-stone-50 rounded-2xl p-4 border border-stone-100">
              <p className="text-xs font-semibold text-stone-400 uppercase mb-1">{val.description || cle}</p>
              {editingConfig ? (
                <div className="flex items-center gap-2">
                  {cle === 'jours_repos' ? (
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={30} value={configForm[cle] || ''}
                        onChange={e => setConfigForm({ ...configForm, [cle]: e.target.value })}
                        className="w-20 px-3 py-2 bg-white border border-stone-200 rounded-xl text-lg font-bold text-stone-800 outline-none focus:border-indigo-400 text-center"
                        style={{ fontSize: '16px' }}
                      />
                      <span className="text-sm text-stone-500">jours</span>
                    </div>
                  ) : (
                    <input value={configForm[cle] || ''}
                      onChange={e => setConfigForm({ ...configForm, [cle]: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm font-bold text-stone-800 outline-none focus:border-indigo-400"
                      style={{ fontSize: '16px' }}
                    />
                  )}
                </div>
              ) : (
                <p className="text-2xl font-black text-stone-800">
                  {val.valeur}{cle === 'jours_repos' ? ' jours' : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ SECTION 2: TEAM CARDS ═══ */}
      <div>
        <h2 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-3 px-1">
          Équipes ({teams.length})
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {teams.map(team => {
            const meta = TYPE_META[team.type] || TYPE_META.mixte;
            const statut = STATUT_META[team.statut_equipe] || STATUT_META.DISPONIBLE;
            const Icon = meta.icon;
            const isEditing = editingTeam === team.id;
            const isEditingMembers = editingMembers === team.id;
            const isExpanded = expandedTeam === team.id;

            return (
              <div key={team.id} className={`bg-white/90 backdrop-blur-md rounded-3xl border shadow-sm overflow-hidden transition-all ${
                team.statut_equipe === 'EN_REPOS' ? 'border-amber-200' : team.statut_equipe === 'EN_MISSION' ? 'border-indigo-200' : 'border-stone-100'
              }`}>
                {/* Team Header */}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl ${meta.bg} flex items-center justify-center shadow-md`}>
                        <Icon size={20} className="text-white" />
                      </div>
                      <div>
                        {isEditing ? (
                          <input value={teamForm.nom} onChange={e => setTeamForm({ ...teamForm, nom: e.target.value })}
                            className="text-sm font-bold text-stone-800 bg-white border border-stone-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-400"
                            style={{ fontSize: '16px' }}
                          />
                        ) : (
                          <p className="text-sm font-bold text-stone-800">{team.nom}</p>
                        )}
                        <p className="text-[10px] text-stone-400">{meta.label}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full ring-1 ${statut.bg}`}>
                      {statut.label}
                    </span>
                  </div>

                  {/* Edit Team Name/Type */}
                  {isEditing && (
                    <div className="bg-stone-50 rounded-2xl p-3 mb-3 space-y-2">
                      <div>
                        <label className="text-[10px] font-semibold text-stone-400 mb-1 block">Nom de l'équipe</label>
                        <input value={teamForm.nom} onChange={e => setTeamForm({ ...teamForm, nom: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-indigo-400"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-stone-400 mb-1 block">Type</label>
                        <div className="flex gap-2">
                          {Object.entries(TYPE_META).map(([k, v]) => (
                            <button key={k} onClick={() => setTeamForm({ ...teamForm, type: k })}
                              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                teamForm.type === k ? `${v.bg} text-white border-transparent` : 'bg-white text-stone-400 border-stone-200'
                              }`}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-stone-400 mb-1 block">Couleur</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {COLORS_PRESET.map(c => (
                            <button key={c} onClick={() => setTeamForm({ ...teamForm, couleur_hex: c })}
                              className={`w-7 h-7 rounded-full border-2 transition-all ${
                                teamForm.couleur_hex === c ? 'border-stone-800 scale-110' : 'border-transparent hover:scale-105'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setEditingTeam(null)}
                          className="flex-1 py-2 bg-stone-100 rounded-xl text-xs font-semibold text-stone-500 hover:bg-stone-200 transition-all">
                          Annuler
                        </button>
                        <button onClick={() => saveTeam(team.id)} disabled={saving}
                          className="flex-1 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 disabled:opacity-50 transition-all flex items-center justify-center gap-1">
                          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-stone-400 mb-3">
                    {team.missions_actives > 0 && (
                      <span className="flex items-center gap-1"><Clock size={12} /> {team.missions_actives} mission{team.missions_actives > 1 ? 's' : ''}</span>
                    )}
                    {team.statut_equipe === 'EN_REPOS' && team.jours_repos_restants > 0 && (
                      <span className="flex items-center gap-1 text-amber-500 font-medium">
                        <Calendar size={12} /> Repos: {team.jours_repos_restants}j
                      </span>
                    )}
                    {team.statut_equipe === 'DISPONIBLE' && (
                      <span className="flex items-center gap-1 text-emerald-500"><CheckCircle size={12} /> Prêt</span>
                    )}
                    <span className="text-stone-300">•</span>
                    <span>{team.membres.length} membre{team.membres.length > 1 ? 's' : ''}</span>
                  </div>

                  {/* Members */}
                  <div className="space-y-2">
                    {team.membres.map(m => (
                      <div key={m.id} className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2.5 border border-stone-100">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-stone-200 to-stone-300 flex items-center justify-center">
                          <User size={14} className="text-stone-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {isEditingMembers && memberForms[m.id] ? (
                            <div className="flex gap-1.5">
                              <input value={memberForms[m.id].prenom}
                                onChange={e => setMemberForms({ ...memberForms, [m.id]: { ...memberForms[m.id], prenom: e.target.value } })}
                                placeholder="Prénom"
                                className="w-1/3 px-2 py-1 bg-white border border-stone-200 rounded-lg text-xs outline-none focus:border-indigo-400"
                                style={{ fontSize: '16px' }}
                              />
                              <input value={memberForms[m.id].nom}
                                onChange={e => setMemberForms({ ...memberForms, [m.id]: { ...memberForms[m.id], nom: e.target.value } })}
                                placeholder="Nom"
                                className="w-1/3 px-2 py-1 bg-white border border-stone-200 rounded-lg text-xs outline-none focus:border-indigo-400"
                                style={{ fontSize: '16px' }}
                              />
                              <input value={memberForms[m.id].telephone}
                                onChange={e => setMemberForms({ ...memberForms, [m.id]: { ...memberForms[m.id], telephone: e.target.value } })}
                                placeholder="Tél"
                                className="w-1/3 px-2 py-1 bg-white border border-stone-200 rounded-lg text-xs outline-none focus:border-indigo-400"
                                style={{ fontSize: '16px' }}
                              />
                            </div>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-stone-700 truncate">{m.prenom} {m.nom}</p>
                              <p className="text-[10px] text-stone-400">
                                {m.role === 'technicien' ? '🔧 Technicien' : m.role === 'ingenieur' ? '📐 Ingénieur' : m.role}
                                {m.telephone && <span className="ml-1">• {m.telephone}</span>}
                              </p>
                            </>
                          )}
                        </div>
                        {m.telephone && !isEditingMembers && (
                          <a href={`tel:${m.telephone}`} className="text-stone-300 hover:text-emerald-500 transition-colors">
                            <Phone size={14} />
                          </a>
                        )}
                      </div>
                    ))}
                    {team.membres.length === 0 && (
                      <p className="text-xs text-stone-300 italic text-center py-2">Aucun membre assigné</p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-3">
                    {!isEditing && !isEditingMembers && (
                      <>
                        <button onClick={() => startEditTeam(team)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-[11px] font-semibold text-stone-500 hover:bg-stone-100 transition-all">
                          <Edit3 size={12} /> Renommer
                        </button>
                        <button onClick={() => startEditMembers(team)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-[11px] font-semibold text-stone-500 hover:bg-stone-100 transition-all">
                          <Users size={12} /> Membres
                        </button>
                      </>
                    )}
                    {isEditingMembers && (
                      <div className="flex gap-2 w-full">
                        <button onClick={() => setEditingMembers(null)}
                          className="flex-1 py-2 bg-stone-100 rounded-xl text-xs font-semibold text-stone-500 hover:bg-stone-200 transition-all">
                          Annuler
                        </button>
                        <button onClick={() => saveMembers(team.id)} disabled={saving}
                          className="flex-1 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 disabled:opacity-50 transition-all flex items-center justify-center gap-1">
                          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          Sauvegarder
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ SECTION 3: MISSION REASSIGNMENT ═══ */}
      <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <ArrowRightLeft size={18} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-stone-800">Réassignation de Missions</h2>
            <p className="text-xs text-stone-400">{missions.length} mission{missions.length !== 1 ? 's' : ''} active{missions.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {missions.length === 0 ? (
          <p className="text-center text-stone-400 py-8 text-sm">Aucune mission active à réassigner.</p>
        ) : (
          <div className="space-y-2">
            {missions.map(m => {
              const isReassigning = reassigning === m.id;
              return (
                <div key={m.id} className={`border rounded-2xl p-4 transition-all ${
                  STATUT_MISSION[m.statut] ? '' : 'border-stone-200'
                } ${isReassigning ? 'border-indigo-300 bg-indigo-50/30' : 'border-stone-100 hover:bg-stone-50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">{m.ref_erp}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ring-1 ${STATUT_MISSION[m.statut] || 'bg-stone-50 text-stone-500 ring-stone-200'}`}>
                          {m.statut === 'en_attente' ? 'En attente' : m.statut === 'en_cours' ? 'En cours' : m.statut === 'bloque' ? 'Bloquée' : m.statut}
                        </span>
                        <span className="text-[9px] font-semibold text-stone-400 px-2 py-0.5 bg-stone-50 rounded-full">
                          {PHASE_LABEL[m.phase] || m.phase}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-stone-700 truncate">{m.nom_chantier}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        Équipe: <span className="font-medium text-stone-500">{m.equipe_nom || 'Non assignée'}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {isReassigning ? (
                        <div className="flex items-center gap-2">
                          <select value={reassignForm[m.id] || ''}
                            onChange={e => setReassignForm({ ...reassignForm, [m.id]: e.target.value })}
                            className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-400">
                            <option value="">Choisir une équipe...</option>
                            {teams.filter(t => t.actif).map(t => (
                              <option key={t.id} value={t.id}>
                                {t.nom} ({TYPE_META[t.type]?.label || t.type})
                              </option>
                            ))}
                          </select>
                          <button onClick={() => handleReassign(m.id)} disabled={!reassignForm[m.id] || saving}
                            className="px-3 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 disabled:opacity-50 transition-all flex items-center gap-1">
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                            OK
                          </button>
                          <button onClick={() => { setReassigning(null); setReassignForm(prev => { const n = { ...prev }; delete n[m.id]; return n; }); }}
                            className="px-3 py-2 bg-stone-100 rounded-xl text-xs font-semibold text-stone-500 hover:bg-stone-200 transition-all">
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setReassigning(m.id)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-[11px] font-semibold text-stone-500 hover:bg-stone-100 transition-all">
                          <ArrowRightLeft size={12} /> Réassigner
                        </button>
                      )}
                    </div>
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
