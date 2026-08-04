'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUtilisateur, deconnecter } from '@/lib/auth';
import {
  HardHat, MapPin, Clock, Wrench, Zap, Shield, AlertTriangle,
  CheckCircle, LogOut, Navigation, Camera, X, Send, Loader2,
  ChevronRight, Phone, Package, FileText, Wrench as Outil, ClipboardList, Timer,
} from 'lucide-react';
import TechnicianMap from '@/components/TechnicianMap';

/* ─── TYPES ────────────────────────────────────────────────────────── */
interface MissionInfo {
  id: string;
  chantier: string;
  adresse: string;
  client_nom: string;
  client_telephone: string;
  ref_erp: string;
  phase: string;
  statut: string;
  equipe_id: string;
  equipe_nom: string;
  latitude: number;
  longitude: number;
  rayon_geofencing: number;
  duree_estimee: number;
  date_declenchement: string;
  date_debut: string | null;
  complexite?: string;
  dxf_url?: string | null;
  pdf_url?: string | null;
  fiche_technique?: Record<string, unknown> | null;
}

interface EtapeChecklist {
  id: string;
  label: string;
  done: boolean;
  subtasks?: { label: string; done: boolean }[];
}

interface ChecklistData {
  id: string;
  mission_id: string;
  phase: string;
  etapes: EtapeChecklist[];
  complete: boolean;
}

interface PointageRec {
  id: string;
  type: string;
  horodatage: string;
  distance: number;
  conforme: boolean;
}

interface EquipeStatus {
  statut_equipe: string;
  disponible_a_partir_de: string;
  nom: string;
  type: string;
}

const PHASE_LABEL: Record<string, string> = {
  mecanique: 'Installation Mécanique',
  electrique: 'Câblage Électrique',
  verification: 'Contrôle & Vérification',
};
const PHASE_ICON: Record<string, any> = {
  mecanique: Wrench, electrique: Zap, verification: Shield,
};
const PHASE_COLOR: Record<string, string> = {
  mecanique: 'text-blue-600 bg-blue-50 border-blue-200',
  electrique: 'text-orange-600 bg-orange-50 border-orange-200',
  verification: 'text-emerald-600 bg-emerald-50 border-emerald-200',
};
const TYPE_LABEL: Record<string, string> = {
  mecanique: 'Mécanique', electrique: 'Électrique', mixte: 'Vérification',
};

/* ─── MAIN TECHNICIAN PORTAL ──────────────────────────────────────── */
export default function MissionActivePage() {
  const router = useRouter();
  const user = getUtilisateur();
  const [loading, setLoading] = useState(true);
  const [mission, setMission] = useState<MissionInfo | null>(null);
  const [equipeStatus, setEquipeStatus] = useState<EquipeStatus | null>(null);
  const [pointages, setPointages] = useState<PointageRec[]>([]);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [pointageMsg, setPointageMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showBlocage, setShowBlocage] = useState(false);
  const [blocageForm, setBlocageForm] = useState({ raison: '', pieceERP: '', priorite: 'moyenne', stepId: '', motifRetard: '' });
  const [blocageLoading, setBlocageLoading] = useState(false);
  const [blocagePhoto, setBlocagePhoto] = useState<File | null>(null);
  const [blocagePhotoPreview, setBlocagePhotoPreview] = useState<string | null>(null);
  const [compteur, setCompteur] = useState('');
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [missionDetail, setMissionDetail] = useState<MissionInfo | null>(null);
  const [onglet, setOnglet] = useState<'mission' | 'equipements'>('mission');
  const [equipementsEquipe, setEquipementsEquipe] = useState<any[]>([]);
  const [equipementsChantier, setEquipementsChantier] = useState<any[]>([]);
  const [equipementsLoading, setEquipementsLoading] = useState(false);
  const [retardModal, setRetardModal] = useState(false);
  const [retardForm, setRetardForm] = useState({ motif: '', etapeId: '' });
  const [retardPhoto, setRetardPhoto] = useState<File | null>(null);
  const [retardLoading, setRetardLoading] = useState(false);

  const equipeId = user?.equipeId;
  const technicienId = user?.id;

  // Charger les équipements
  const loadEquipements = useCallback(async () => {
    if (!equipeId || !missionDetail?.id) return;
    setEquipementsLoading(true);
    try {
      const [eq, ec] = await Promise.all([
        fetch(`/api/equipe/${equipeId}/equipements`),
        fetch(`/api/equipe/${equipeId}/equipements_chantier?chantier_id=${missionDetail.id}`).then(r => r.ok ? r.json() : []),
      ]);
      setEquipementsEquipe(eq.ok ? await eq.json() : []);
      setEquipementsChantier(ec);
    } catch (_) { /* ignore */ }
    setEquipementsLoading(false);
  }, [equipeId, missionDetail?.id]);

  // Vérifier un équipement chantier
  const verifierEquipementLocal = async (eqId: string) => {
    if (!equipeId) return;
    try {
      await fetch(`/api/equipe/${equipeId}/equipements_chantier/${eqId}`, { method: 'PATCH' });
      await loadEquipements();
    } catch (_) { /* ignore */ }
  };

  // Notifier l'admin du retard
  const notifierRetard = async () => {
    if (!mission || !retardForm.motif) return;
    setRetardLoading(true);
    try {
      let photoUrl: string | null = null;
      if (retardPhoto) {
        const fd = new FormData();
        fd.append('file', retardPhoto);
        fd.append('type', 'photo_retard');
        const upRes = await fetch('/api/upload/single', { method: 'POST', body: fd });
        if (upRes.ok) photoUrl = (await upRes.json()).url;
      }
      await fetch('/api/mission/retard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: mission.id, motif: retardForm.motif, etapeId: retardForm.etapeId || null, photoUrl }),
      });
      setRetardModal(false);
      setRetardForm({ motif: '', etapeId: '' });
      setRetardPhoto(null);
      setPointageMsg({ type: 'success', text: '✅ Retard notifié à El Ghani.' });
    } catch {
      setPointageMsg({ type: 'error', text: 'Erreur de notification.' });
    }
    setRetardLoading(false);
  };

  // Load mission data
  const loadMission = useCallback(async () => {
    if (!equipeId) { setLoading(false); return; }
    try {
      const [missionRes, equipeRes] = await Promise.all([
        fetch(`/api/mission/active?equipe_id=${equipeId}`),
        fetch(`/api/equipe/status?equipe_id=${equipeId}`),
      ]);
      if (missionRes.ok) {
        const m = await missionRes.json();
        setMission(m);
        // Load pointages + checklist + détails (fichiers, complexité)
        if (m.id) {
          const [pRes, cRes, dRes] = await Promise.all([
            fetch(`/api/mission/${m.id}/pointages`),
            fetch(`/api/mission/${m.id}/checklist`),
            fetch(`/api/mission/${m.id}`),
          ]);
          if (pRes.ok) setPointages(await pRes.json());
          if (cRes.ok) setChecklist(await cRes.json());
          if (dRes.ok) setMissionDetail(await dRes.json());
        }
      }
      if (equipeRes.ok) setEquipeStatus(await equipeRes.json());
    } catch (_) { /* ignore */ }
    setLoading(false);
  }, [equipeId]);

  useEffect(() => { loadMission(); }, [loadMission]);

  // Countdown timer for repos
  useEffect(() => {
    if (equipeStatus?.statut_equipe !== 'EN_REPOS') return;
    const tick = () => {
      const dispo = new Date(equipeStatus.disponible_a_partir_de).getTime();
      const now = Date.now();
      const diff = dispo - now;
      if (diff <= 0) { setCompteur('Disponible maintenant !'); loadMission(); return; }
      const j = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCompteur(`${j}j ${h}h ${m}m`);
    };
    tick();
    const iv = setInterval(tick, 10000);
    return () => clearInterval(iv);
  }, [equipeStatus, loadMission]);

  // GPS Pointage
  const handlePointage = async (type: 'arrivee' | 'depart') => {
    if (!mission || !technicienId) return;
    setGpsLoading(true);
    setPointageMsg(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/mission/pointage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              missionId: mission.id,
              technicienId,
              type,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            setPointageMsg({ type: 'success', text: type === 'arrivee' ? '✅ Arrivée enregistrée !' : '✅ Départ enregistré !' });
            loadMission();
          } else {
            setPointageMsg({ type: 'error', text: data.detail || data.erreur || 'Erreur' });
          }
        } catch {
          setPointageMsg({ type: 'error', text: 'Erreur de connexion.' });
        }
        setGpsLoading(false);
      },
      () => {
        setPointageMsg({ type: 'error', text: 'Activez la géolocalisation.' });
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ─── Checklist interactive ────────────────────────────────────────
  const toggleEtape = async (index: number) => {
    if (!checklist || !mission) return;
    const etapes = JSON.parse(JSON.stringify(checklist.etapes));
    etapes[index].done = !etapes[index].done;
    const complete = etapes.every((e: any) => e.done && (!e.subtasks || e.subtasks.every((s: any) => s.done)));
    setChecklist({ ...checklist, etapes, complete });
    setChecklistLoading(true);
    try {
      await fetch(`/api/mission/${mission.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etapes, complete }),
      });
    } catch (_) { /* keep local state */ }
    setChecklistLoading(false);
  };

  const toggleSousTache = async (index: number, subIndex: number) => {
    if (!checklist || !mission) return;
    const etapes = JSON.parse(JSON.stringify(checklist.etapes));
    etapes[index].subtasks[subIndex].done = !etapes[index].subtasks[subIndex].done;
    const complete = etapes.every((e: any) => e.done && (!e.subtasks || e.subtasks.every((s: any) => s.done)));
    setChecklist({ ...checklist, etapes, complete });
    setChecklistLoading(true);
    try {
      await fetch(`/api/mission/${mission.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etapes, complete }),
      });
    } catch (_) { /* keep local state */ }
    setChecklistLoading(false);
  };

  // Signaler blocage (avec photo + étape sélectionnée)
  const handleBlocage = async () => {
    if (!mission || !technicienId) return;
    setBlocageLoading(true);
    try {
      // 1. Upload photo si fournie
      let photoUrl: string | null = null;
      if (blocagePhoto) {
        const fd = new FormData();
        fd.append('file', blocagePhoto);
        fd.append('type', 'photo_blocage');
        const upRes = await fetch('/api/upload/single', { method: 'POST', body: fd });
        if (upRes.ok) {
          const upData = await upRes.json();
          photoUrl = upData.url;
        }
      }

      // 2. Créer le signalement
      const res = await fetch('/api/mission/blocage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: mission.id,
          declarePar: technicienId,
          raison: blocageForm.raison,
          idPieceERP: blocageForm.pieceERP || null,
          priorite: blocageForm.priorite,
          stepId: blocageForm.stepId || null,
          motifRetard: blocageForm.motifRetard || null,
          photoProofUrl: photoUrl,
        }),
      });
      if (res.ok) {
        setShowBlocage(false);
        setBlocageForm({ raison: '', pieceERP: '', priorite: 'moyenne', stepId: '', motifRetard: '' });
        setBlocagePhoto(null);
        setBlocagePhotoPreview(null);
        setPointageMsg({ type: 'success', text: '✅ Blocage signalé à El Ghani.' });
      } else {
        const d = await res.json();
        setPointageMsg({ type: 'error', text: d.erreur || 'Erreur' });
      }
    } catch {
      setPointageMsg({ type: 'error', text: 'Erreur de connexion.' });
    }
    setBlocageLoading(false);
  };

  // Preview photo
  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setBlocagePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => setBlocagePhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  // Rest countdown
  const dispoDate = equipeStatus?.disponible_a_partir_de
    ? new Date(equipeStatus.disponible_a_partir_de).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
      })
    : '';

  // Nom d'équipe : priorité au JWT (instantané), fallback API
  const nomEquipeJWT = user?.nomEquipe || user?.identifiant || '';
  const phaseEquipe = equipeStatus?.type || user?.typeEquipe || '';
  const equipeNom = equipeStatus?.nom || nomEquipeJWT;
  const IconPhase = PHASE_ICON[phaseEquipe] || HardHat;

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  // ═══════════════ STATE C: DISPONIBLE ═══════════════════════════════
  if (equipeStatus?.statut_equipe === 'DISPONIBLE' && !mission) {
    return (
      <TechnicianShell equipeNom={equipeNom} phaseEquipe={phaseEquipe} onLogout={() => { deconnecter(); }}>
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <div className="w-20 h-20 rounded-full bg-stone-100 flex items-center justify-center mb-6">
            <CheckCircle size={40} className="text-stone-300" />
          </div>
          <h2 className="text-lg font-bold text-stone-700 mb-2">Aucun chantier assigné</h2>
          <p className="text-sm text-stone-400 text-center">Votre équipe est disponible.<br />En attente d&apos;une validation par El Ghani.</p>
        </div>
      </TechnicianShell>
    );
  }

  // ═══════════════ STATE B: EN REPOS ═════════════════════════════════
  if (equipeStatus?.statut_equipe === 'EN_REPOS') {
    return (
      <TechnicianShell equipeNom={equipeNom} phaseEquipe={phaseEquipe} onLogout={() => { deconnecter(); }}>
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <div className="w-24 h-24 rounded-full bg-amber-50 flex items-center justify-center mb-6">
            <Clock size={48} className="text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-stone-700 mb-1">Période de Repos</h2>
          <p className="text-3xl font-bold text-amber-600 mb-2">{compteur || 'Calcul...'}</p>
          <p className="text-sm text-stone-400 text-center">
            Repos obligatoire de 3 jours après une mission.<br />
            Disponible à partir du <strong>{dispoDate}</strong>
          </p>
          <div className="mt-8 w-full max-w-xs bg-amber-50 rounded-2xl p-4 text-center">
            <p className="text-xs text-amber-600 font-medium">Règle applicable</p>
            <p className="text-xs text-stone-400 mt-1">Conformément à la politique RMASC, chaque équipe bénéficie de 3 jours de repos après chaque mission terminée.</p>
          </div>
        </div>
      </TechnicianShell>
    );
  }

  // ═══════════════ STATE A: MISSION ACTIVE ═══════════════════════════
  const dernierPointage = pointages[0];
  const estArrive = pointages.some(p => p.type === 'arrivee');
  const estDepart = pointages.some(p => p.type === 'depart');
  const peutArriver = !estArrive && mission?.statut === 'en_attente';
  const peutPartir = estArrive && !estDepart;
  const aBloque = mission?.statut === 'bloque';

  return (
    <TechnicianShell equipeNom={equipeNom} phaseEquipe={phaseEquipe} onLogout={() => { deconnecter(); }}>
      {/* Message flash */}
      {pointageMsg && (
        <div className={`mx-4 mb-4 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-2 ${
          pointageMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}>
          {pointageMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {pointageMsg.text}
          <button onClick={() => setPointageMsg(null)} className="ml-auto"><X size={16} /></button>
        </div>
      )}

      {/* ═══ ONGLETS: Mission / Équipements ═══ */}
      <div className="mx-4 mb-4">
        <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-stone-100 shadow-sm p-1 flex">
          <button onClick={() => setOnglet('mission')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              onglet === 'mission' ? 'bg-indigo-500 text-white shadow-sm' : 'text-stone-400 hover:text-stone-600'
            }`}>
            <ClipboardList size={16} /> Mission
          </button>
          <button onClick={() => { setOnglet('equipements'); loadEquipements(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              onglet === 'equipements' ? 'bg-indigo-500 text-white shadow-sm' : 'text-stone-400 hover:text-stone-600'
            }`}>
            <Outil size={16} /> Équipements
          </button>
        </div>
      </div>

      {/* ═══ ONGLET: ÉQUIPEMENTS ═══ */}
      {onglet === 'equipements' ? (
        <div className="mx-4 mb-4 space-y-4">
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5">
            <h3 className="font-bold text-stone-800 mb-1">🛠️ Équipements requis pour ce chantier</h3>
            <p className="text-xs text-stone-400 mb-3">Vérifiez chaque équipement avant de commencer</p>
            {equipementsLoading ? (
              <div className="flex justify-center py-6"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
            ) : equipementsChantier.length === 0 ? (
              <p className="text-center text-stone-400 py-6 text-sm">Aucun équipement spécifié pour ce chantier.</p>
            ) : (
              <div className="space-y-2">
                {equipementsChantier.map(eq => (
                  <div key={eq.id} className="flex items-center gap-3 border border-stone-100 rounded-xl p-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Outil size={16} className="text-indigo-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-stone-700">{eq.nom}</p>
                      <p className="text-[10px] text-stone-400">Qté: {eq.quantite} • Fourni par: {eq.fourni_par}</p>
                    </div>
                    <button
                      onClick={() => verifierEquipementLocal(eq.id)}
                      className={`text-[10px] font-bold px-3 py-1.5 rounded-full transition-all ${
                        eq.verifie ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-400 hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                    >
                      {eq.verifie ? '✓ Vérifié' : 'Vérifier'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-5">
            <h3 className="font-bold text-stone-800 mb-1">🧰 Équipements de votre équipe</h3>
            <p className="text-xs text-stone-400 mb-3">Matériel assigné à votre équipe</p>
            {equipementsEquipe.length === 0 ? (
              <p className="text-center text-stone-400 py-6 text-sm">Aucun équipement assigné.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {equipementsEquipe.map(eq => (
                  <div key={eq.id} className="border border-stone-100 rounded-xl p-3">
                    <p className="text-sm font-medium text-stone-700">{eq.nom}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-stone-400">Qté: {eq.quantite}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        eq.etat === 'OPERATIONNEL' ? 'bg-emerald-50 text-emerald-600'
                        : eq.etat === 'MAINTENANCE' ? 'bg-amber-50 text-amber-600'
                        : 'bg-rose-50 text-rose-600'
                      }`}>
                        {eq.etat === 'OPERATIONNEL' ? 'OK' : eq.etat === 'MAINTENANCE' ? 'Maintenance' : 'HS'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
      <>
      {/* ═══ CARTE CHANTIER ═══ */}
      {mission && (
        <div className="mx-4 mb-4">
          <TechnicianMap
            chantierLat={mission.latitude}
            chantierLng={mission.longitude}
            rayon={mission.rayon_geofencing}
            nomChantier={mission.chantier}
          />
        </div>
      )}

      {/* Site Details */}
      <div className="mx-4 mb-4 bg-white rounded-3xl shadow-sm border border-stone-100 p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h2 className="font-bold text-lg text-stone-800">{mission?.chantier}</h2>
            <p className="text-sm text-stone-400 mt-0.5">{mission?.adresse}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${PHASE_COLOR[mission?.phase || ''] || 'bg-stone-100 text-stone-600 border-stone-200'}`}>
            <div className="flex items-center gap-1">
              {IconPhase && <IconPhase size={14} />}
              {PHASE_LABEL[mission?.phase || ''] || mission?.phase}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-stone-400 mb-3">
          <span className="font-mono font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md">{mission?.ref_erp}</span>
          <span>{mission?.client_nom}</span>
          {mission?.client_telephone && (
            <a href={`tel:${mission.client_telephone}`} className="text-indigo-500 flex items-center gap-1">
              <Phone size={12} /> {mission.client_telephone}
            </a>
          )}
        </div>

        {/* Durée estimée */}
        {mission?.duree_estimee && (
          <div className="bg-stone-50 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
              <span>Durée estimée</span>
              <span>{mission.duree_estimee} jours</span>
            </div>
            <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full" style={{ width: '30%' }} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ ALERTE COMPLEXITÉ DIFFICILE ═══ */}
      {(missionDetail?.complexite === 'DIFFICILE' || mission?.complexite === 'DIFFICILE') && (
        <div className="mx-4 mb-4 bg-rose-50 border-2 border-rose-300 rounded-3xl p-4 flex items-start gap-3">
          <AlertTriangle size={24} className="text-rose-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-700 text-sm">⚠ Chantier DIFFICILE</p>
            <p className="text-xs text-rose-500 mt-0.5">Gaine complexe — soyez vigilant. Priorité haute signalée à El Ghani.</p>
          </div>
        </div>
      )}

      {/* ═══ FICHIERS TECHNIQUES (CAD / PDF / Fiche) ═══ */}
      {(missionDetail?.dxf_url || missionDetail?.pdf_url) && (
        <div className="mx-4 mb-4 bg-white rounded-3xl shadow-sm border border-stone-100 p-4">
          <p className="text-xs font-semibold text-stone-400 uppercase mb-3">📄 Documents Techniques</p>
          <div className="flex flex-wrap gap-2">
            {missionDetail?.dxf_url && (
              <a href={`https://onsite.sarl-rmasc.com${missionDetail.dxf_url}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition-all">
                <FileText size={14} /> Plan CAD (.dxf)
              </a>
            )}
            {missionDetail?.pdf_url && (
              <a href={`https://onsite.sarl-rmasc.com${missionDetail.pdf_url}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-xl transition-all">
                <FileText size={14} /> Fiche Technique (.pdf)
              </a>
            )}
          </div>
        </div>
      )}

      {/* ═══ CHECKLIST INTERACTIVE ═══ */}
      {checklist && (
        <div className="mx-4 mb-4 bg-white rounded-3xl shadow-sm border border-stone-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-stone-400 uppercase">📋 Checklist {PHASE_LABEL[checklist.phase] || checklist.phase}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
              {checklist.etapes.filter(e => e.done).length}/{checklist.etapes.length}
            </span>
          </div>
          {/* Barre de progression */}
          <div className="w-full h-1.5 bg-stone-100 rounded-full mb-4 overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all duration-300"
              style={{ width: `${(checklist.etapes.filter(e => e.done).length / checklist.etapes.length) * 100}%` }} />
          </div>
          <div className="space-y-1">
            {checklist.etapes.map((etape, i) => (
              <div key={etape.id} className="border border-stone-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleEtape(i)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 transition-colors text-left"
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${
                    etape.done ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-300 border border-stone-200'
                  }`}>
                    {etape.done && <CheckCircle size={13} />}
                  </div>
                  <span className={`text-sm flex-1 ${etape.done ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                    {i + 1}. {etape.label}
                  </span>
                </button>
                {/* Sous-tâches (Départ / 50% / 100%) */}
                {etape.subtasks && (
                  <div className="px-3 pb-2.5 flex gap-2">
                    {etape.subtasks.map((sub, si) => (
                      <button
                        key={si}
                        onClick={() => toggleSousTache(i, si)}
                        className={`flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg border transition-all ${
                          sub.done
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-300'
                            : 'bg-stone-50 text-stone-400 border-stone-200'
                        }`}
                      >
                        {sub.done ? '✓ ' : ''}{sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {checklist.complete && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <p className="text-sm font-bold text-emerald-600">🎉 Phase terminée !</p>
            </div>
          )}
        </div>
      )}

      {/* GPS Pointage Button */}
      <div className="mx-4 mb-4">
        {aBloque ? (
          <div className="bg-rose-50 rounded-3xl p-5 text-center border border-rose-200">
            <AlertTriangle size={32} className="text-rose-400 mx-auto mb-2" />
            <p className="font-bold text-stone-700">Mission Bloquée</p>
            <p className="text-sm text-stone-400">En attente de résolution par El Ghani</p>
          </div>
        ) : peutArriver ? (
          <button
            onClick={() => handlePointage('arrivee')}
            disabled={gpsLoading}
            className="w-full bg-emerald-500 text-white py-5 rounded-3xl text-lg font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-600 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
          >
            {gpsLoading ? <Loader2 size={22} className="animate-spin" /> : <Navigation size={22} />}
            Pointer Arrivée (GPS)
          </button>
        ) : peutPartir ? (
          <button
            onClick={() => handlePointage('depart')}
            disabled={gpsLoading}
            className="w-full bg-rose-500 text-white py-5 rounded-3xl text-lg font-bold shadow-lg shadow-rose-200 hover:bg-rose-600 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
          >
            {gpsLoading ? <Loader2 size={22} className="animate-spin" /> : <LogOut size={22} />}
            Pointer Départ (GPS)
          </button>
        ) : estDepart ? (
          <div className="bg-emerald-50 rounded-3xl p-5 text-center border border-emerald-200">
            <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
            <p className="font-bold text-emerald-700">Mission Terminée ✓</p>
            <p className="text-sm text-emerald-500">Bon retour !</p>
          </div>
        ) : (
          <div className="bg-indigo-50 rounded-3xl p-5 text-center border border-indigo-200">
            <Clock size={32} className="text-indigo-400 mx-auto mb-2" />
            <p className="font-bold text-indigo-700">Mission en cours</p>
            <p className="text-sm text-indigo-500">Vous êtes pointé</p>
          </div>
        )}
      </div>

      {/* Blocage button */}
      {!aBloque && !estDepart && (
        <div className="mx-4 mb-4">
          <button
            onClick={() => setShowBlocage(true)}
            className="w-full bg-white border-2 border-rose-200 text-rose-500 py-4 rounded-3xl font-semibold hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
          >
            <AlertTriangle size={18} />
            Signaler un Blocage / Pièce Manquante
          </button>
        </div>
      )}

      {/* Pointages history */}
      {pointages.length > 0 && (
        <div className="mx-4 mb-4">
          <h3 className="text-xs font-semibold text-stone-400 uppercase mb-2 px-1">Journal des Pointages</h3>
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 divide-y divide-stone-50">
            {pointages.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${p.conforme ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-stone-700">
                    {p.type === 'arrivee' ? 'Arrivée' : 'Départ'} — {p.distance}m du chantier
                  </p>
                  <p className="text-xs text-stone-400">
                    {new Date(p.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {p.conforme ? (
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Conforme</span>
                ) : (
                  <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">Hors zone</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blocage Modal */}
      {showBlocage && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 sm:m-4 animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg text-stone-800">Signaler un Blocage</h3>
              <button onClick={() => setShowBlocage(false)} className="text-stone-300"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Raison du blocage *</label>
                <textarea value={blocageForm.raison} onChange={e => setBlocageForm({...blocageForm, raison: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm text-stone-700 outline-none min-h-[100px] resize-none"
                  placeholder="Décrivez le problème..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Pièce ERP manquante (optionnel)</label>
                <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-2xl px-4 py-3">
                  <Package size={16} className="text-stone-300" />
                  <input value={blocageForm.pieceERP} onChange={e => setBlocageForm({...blocageForm, pieceERP: e.target.value})}
                    placeholder="Réf. pièce (ex: A-902)"
                    className="bg-transparent text-sm text-stone-700 outline-none flex-1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Priorité</label>
                <div className="flex gap-2">
                  {['basse', 'moyenne', 'haute', 'critique'].map(p => (
                    <button key={p} onClick={() => setBlocageForm({...blocageForm, priorite: p})}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        blocageForm.priorite === p
                          ? p === 'critique' ? 'bg-rose-500 text-white border-rose-500'
                            : p === 'haute' ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-stone-800 text-white border-stone-800'
                          : 'bg-stone-50 text-stone-400 border-stone-200'
                      }`}>
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleBlocage} disabled={!blocageForm.raison || blocageLoading}
                className="w-full bg-rose-500 text-white py-4 rounded-2xl font-bold hover:bg-rose-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {blocageLoading ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
                Envoyer le Signalement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bouton "Notifier admin du retard" */}
      <div className="mx-4 mb-4">
        <button
          onClick={() => setRetardModal(true)}
          className="w-full bg-white border-2 border-amber-300 text-amber-600 py-4 rounded-3xl font-semibold hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
        >
          <Timer size={18} />
          Signaler un Retard à El Ghani
        </button>
      </div>
      </>
      )}

      {/* ═══ MODAL RETARD ═══ */}
      {retardModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 sm:m-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg text-stone-800">⏰ Signaler un Retard</h3>
              <button onClick={() => setRetardModal(false)} className="text-stone-300"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {checklist && (
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">Étape en retard</label>
                  <select value={retardForm.etapeId} onChange={e => setRetardForm({...retardForm, etapeId: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm text-stone-700 outline-none focus:border-indigo-400">
                    <option value="">-- Sélectionner --</option>
                    {checklist.etapes.map((et, i) => (
                      <option key={et.id} value={et.id}>{i + 1}. {et.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Motif du retard *</label>
                <textarea value={retardForm.motif} onChange={e => setRetardForm({...retardForm, motif: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm text-stone-700 outline-none min-h-[90px] resize-none"
                  placeholder="Expliquez la cause du retard..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Photo preuve (optionnel)</label>
                <label className="block border-2 border-dashed border-stone-200 bg-stone-50 rounded-2xl p-5 text-center cursor-pointer hover:border-amber-300 transition-all">
                  <Camera size={24} className="text-stone-300 mx-auto mb-1" />
                  <p className="text-xs text-stone-400">{retardPhoto ? retardPhoto.name : 'Ajouter une photo'}</p>
                  <input type="file" accept="image/*" capture="environment"
                    onChange={e => setRetardPhoto(e.target.files?.[0] || null)} className="hidden" />
                </label>
              </div>
              <button onClick={notifierRetard} disabled={!retardForm.motif || retardLoading}
                className="w-full bg-amber-500 text-white py-4 rounded-2xl font-bold hover:bg-amber-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {retardLoading ? <Loader2 size={18} className="animate-spin" /> : <Timer size={18} />}
                Notifier El Ghani
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom padding */}
      <div className="h-8" />
    </TechnicianShell>
  );
}

/* ─── TECHNICIAN SHELL ─────────────────────────────────────────────── */
function TechnicianShell({ children, equipeNom, phaseEquipe, onLogout }: {
  children: React.ReactNode; equipeNom: string; phaseEquipe: string; onLogout: () => void;
}) {
  const phaseColor = phaseEquipe === 'mecanique' ? 'bg-blue-500'
    : phaseEquipe === 'electrique' ? 'bg-orange-500' : 'bg-emerald-500';
  const phaseLabel = TYPE_LABEL[phaseEquipe] || '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 max-w-md mx-auto pb-safe">
      {/* Header */}
      <header className="bg-white border-b border-stone-100 px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${phaseColor} flex items-center justify-center shadow-sm`}>
              <HardHat size={20} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-stone-800">{equipeNom}</p>
              <p className="text-[10px] text-stone-400 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${phaseColor}`} />
                {phaseLabel}
              </p>
            </div>
          </div>
          <button onClick={onLogout} className="w-9 h-9 rounded-xl bg-stone-50 flex items-center justify-center text-stone-400 hover:bg-rose-50 hover:text-rose-500">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {children}
    </div>
  );
}
