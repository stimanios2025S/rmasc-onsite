'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUtilisateur, deconnecter } from '@/lib/auth';
import {
  HardHat, MapPin, Clock, Wrench, Zap, Shield, AlertTriangle,
  CheckCircle, LogOut, Navigation, Camera, X, Send, Loader2,
  ChevronRight, Phone, Package, FileText, ClipboardList, Timer,
  Radio, User, Hammer, Coffee, Store, Sunrise, Sunset, ArrowRightLeft,
  Ban,
} from 'lucide-react';
import TechnicianMap from '@/components/TechnicianMap';

/* ─── TYPES ────────────────────────────────────────────────────────── */
interface MissionInfo {
  id: string; chantier_id: string; chantier: string; adresse: string; client_nom: string; client_telephone: string;
  ref_erp: string; phase: string; statut: string; equipe_id: string; equipe_nom: string;
  latitude: number; longitude: number; rayon_geofencing: number; duree_estimee: number;
  date_declenchement: string; date_debut: string | null;
  complexite?: string; dxf_url?: string | null; pdf_url?: string | null;
  fiche_technique?: Record<string, unknown> | null;
}
interface PointageRec { id: string; type: string; horodatage: string; distance: number; conforme: boolean; }
interface EquipeStatus { statut_equipe: string; disponible_a_partir_de: string; nom: string; type: string; }
interface EtapeChecklist { id: string; label: string; done: boolean; subtasks?: { label: string; done: boolean }[]; }
interface ChecklistData { id: string; mission_id: string; phase: string; etapes: EtapeChecklist[]; complete: boolean; }

const PHASE_LABEL: Record<string, string> = { mecanique: 'Installation Mécanique', electrique: 'Câblage Électrique', verification: 'Contrôle & Vérification' };
const PHASE_ICON: Record<string, any> = { mecanique: Wrench, electrique: Zap, verification: Shield };
const PHASE_GRADIENT: Record<string, string> = {
  mecanique: 'from-blue-500 to-blue-600',
  electrique: 'from-orange-500 to-orange-600',
  verification: 'from-emerald-500 to-emerald-600',
};
const TYPE_LABEL: Record<string, string> = { mecanique: 'Mécanique', electrique: 'Électrique', mixte: 'Vérification' };

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
  const missionRef = useRef<MissionInfo | null>(null);
  const [onglet, setOnglet] = useState<'mission' | 'equipements'>('mission');
  const [equipementsEquipe, setEquipementsEquipe] = useState<any[]>([]);
  const [equipementsChantier, setEquipementsChantier] = useState<any[]>([]);
  const [equipementsLoading, setEquipementsLoading] = useState(false);
  const [retardModal, setRetardModal] = useState(false);
  const [retardForm, setRetardForm] = useState({ motif: '', etapeId: '' });
  const [retardPhoto, setRetardPhoto] = useState<File | null>(null);
  const [retardLoading, setRetardLoading] = useState(false);
  const [syncDot, setSyncDot] = useState(false); // indicateur sync temps réel

  // ─── Demande matériel ───
  const [demandeItems, setDemandeItems] = useState<{ nom: string; quantite: number; categorie: string }[]>([]);
  const [demandeItemNom, setDemandeItemNom] = useState('');
  const [demandeItemQte, setDemandeItemQte] = useState(1);
  const [demandeItemCat, setDemandeItemCat] = useState('OUTILLAGE');
  const [demandeDesc, setDemandeDesc] = useState('');
  const [demandePhoto, setDemandePhoto] = useState<File | null>(null);
  const [demandePhotoPreview, setDemandePhotoPreview] = useState<string | null>(null);
  const [demandeLoading, setDemandeLoading] = useState(false);
  const [demandeModal, setDemandeModal] = useState(false);

  // ─── NEW: Tracking & lifecycle states ───
  const [gpsInZone, setGpsInZone] = useState<boolean | null>(null);
  const [gpsDistance, setGpsDistance] = useState<number | null>(null);
  const [arriveeLoading, setArriveeLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [enPause, setEnPause] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [journeeResume, setJourneeResume] = useState<any>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [estEnRoute, setEstEnRoute] = useState(false);
  const [estArriveChantier, setEstArriveChantier] = useState(false);
  const [peutTransférer, setPeutTransférer] = useState(false);

  const equipeId = user?.equipeId;
  const technicienId = user?.id;

  /* ═══ SYNC TEMPS RÉEL (polling 30s) ═══ */
  const loadMission = useCallback(async (chargeDetail: boolean = false) => {
    if (!equipeId) { setLoading(false); return; }
    try {
      const [missionRes, equipeRes] = await Promise.all([
        fetch(`/api/mission/active?equipe_id=${equipeId}`),
        fetch(`/api/equipe/status?equipe_id=${equipeId}`),
      ]);
      if (missionRes.ok) {
        const m = await missionRes.json();
        const missionChangee = m.id !== missionRef.current?.id;
        setMission(m);
        // Charger checklist/pointages/détails seulement si :
        // - au montage (chargeDetail=true) OU mission changée
        if (m.id && (chargeDetail || missionChangee)) {
          const [pRes, cRes, dRes] = await Promise.all([
            fetch(`/api/mission/${m.id}/pointages`),
            fetch(`/api/mission/${m.id}/checklist`),
            fetch(`/api/mission/${m.id}`),
          ]);
          if (pRes.ok) setPointages(await pRes.json());
          if (cRes.ok) setChecklist(await cRes.json());
          if (dRes.ok) setMissionDetail(await dRes.json());
        }
      } else if (missionRef.current) {
        // Garder la mission affichée si API retourne null (transition)
      } else {
        setMission(null);
        setChecklist(null);
        setMissionDetail(null);
      }
      if (equipeRes.ok) setEquipeStatus(await equipeRes.json());
      setSyncDot(true); // clignote pour montrer la sync
      setTimeout(() => setSyncDot(false), 500);
    } catch (_) { /* keep stale — on garde l'état affiché */ }
    setLoading(false);
  }, [equipeId]);

  // Maintenir la référence de mission à jour
  useEffect(() => { missionRef.current = mission; }, [mission]);

  // Chargement initial : mission + checklist + pointages + détails
  useEffect(() => { loadMission(true); }, [loadMission]);

  // ═══ ALWAYS-ON GPS TRACKING — Start immediately when app loads ═══
  useEffect(() => {
    if (!equipeId) return;
    // Start tracking immediately — admin always sees worker position
    startGpsTracking();
    return () => stopGpsTracking();
  }, [equipeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling : 10s, ne recharge que mission + statut équipe (léger)
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') loadMission(false);
    }, 10000);
    return () => clearInterval(iv);
  }, [loadMission]);

  // Countdown repos
  useEffect(() => {
    if (equipeStatus?.statut_equipe !== 'EN_REPOS') return;
    const tick = () => {
      const dispo = new Date(equipeStatus.disponible_a_partir_de).getTime();
      const diff = dispo - Date.now();
      if (diff <= 0) { setCompteur('Disponible maintenant !'); loadMission(); return; }
      setCompteur(`${Math.floor(diff / 86400000)}j ${Math.floor((diff % 86400000) / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`);
    };
    tick();
    const iv = setInterval(tick, 10000);
    return () => clearInterval(iv);
  }, [equipeStatus, loadMission]);

  /* ═══ POINTAGE GPS ═══ */
  const handlePointage = async (type: 'arrivee' | 'depart') => {
    if (!mission || !technicienId) return;
    setGpsLoading(true); setPointageMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/mission/pointage', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ missionId: mission.id, technicienId, type, latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          });
          const data = await res.json();
          if (res.ok) {
            setPointageMsg({ type: 'success', text: type === 'arrivee' ? '✅ Arrivée enregistrée !' : '✅ Départ enregistré !' });
            loadMission();
          } else {
            setPointageMsg({ type: 'error', text: data.detail || data.erreur || 'Erreur' });
          }
        } catch { setPointageMsg({ type: 'error', text: 'Erreur de connexion.' }); }
        setGpsLoading(false);
      },
      () => { setPointageMsg({ type: 'error', text: 'Activez la géolocalisation.' }); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /* ═══ NEW: POINTAGE JOUR (matinal / fin journée) ═══ */
  const handlePointageJour = async (type: 'matinal' | 'fin_journee') => {
    if (!equipeId) return;
    setGpsLoading(true); setPointageMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/tracking/pointage-jour', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ equipeId, missionId: mission?.id || null, type, latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          });
          const data = await res.json();
          if (res.ok) {
            setPointageMsg({ type: 'success', text: type === 'matinal' ? '🌅 Pointage matinal enregistré ! Vous êtes en route.' : '🌙 Fin de journée enregistrée !' });
            if (type === 'matinal') {
              setEstEnRoute(true);
              startGpsTracking(); // Start continuous GPS tracking
            }
            loadMission();
          } else {
            setPointageMsg({ type: 'error', text: data.erreur || 'Erreur' });
          }
        } catch { setPointageMsg({ type: 'error', text: 'Erreur de connexion.' }); }
        setGpsLoading(false);
      },
      () => { setPointageMsg({ type: 'error', text: 'Activez la géolocalisation.' }); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /* ═══ NEW: GPS CONTINUOUS TRACKING (always-on, 15s interval) ═══ */
  const startGpsTracking = useCallback(() => {
    if (trackingIntervalRef.current) return; // Already tracking
    setTrackingActive(true);

    const sendPosition = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await fetch('/api/tracking/gps', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                equipeId, missionId: mission?.id || null,
                latitude: pos.coords.latitude, longitude: pos.coords.longitude,
                vitesse: pos.coords.speed || null,
                precision: pos.coords.accuracy || null,
                batterie: null, timestamp: new Date().toISOString(),
              }),
            });
          } catch (_) { /* silent */ }
        },
        () => { /* GPS denied — skip this cycle */ },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    };

    // Send position immediately
    sendPosition();
    // Then every 15 seconds
    trackingIntervalRef.current = setInterval(sendPosition, 15000);
  }, [equipeId, mission?.id]);

  const stopGpsTracking = useCallback(() => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
    setTrackingActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current); };
  }, []);

  /* ═══ NEW: ARRIVÉE — Confirmer avec vérification GPS ═══ */
  const handleArriveeSite = async () => {
    if (!mission || !equipeId || !technicienId) return;
    setArriveeLoading(true); setPointageMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/tracking/arrivee', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              equipeId, missionId: mission.id, technicienId,
              latitude: pos.coords.latitude, longitude: pos.coords.longitude,
            }),
          });
          const data = await res.json();
          if (data.ok) {
            setPointageMsg({ type: 'success', text: data.message });
            setEstArriveChantier(true);
            setEstEnRoute(false);
            setGpsInZone(true);
            setGpsDistance(data.distance);
            stopGpsTracking(); // Stop road tracking, we're on site
            loadMission();
          } else if (data.distance !== undefined) {
            // Not in zone
            setGpsInZone(false);
            setGpsDistance(data.distance);
            setPointageMsg({ type: 'error', text: data.message });
          } else {
            setPointageMsg({ type: 'error', text: data.erreur || 'Erreur' });
          }
        } catch { setPointageMsg({ type: 'error', text: 'Erreur de connexion.' }); }
        setArriveeLoading(false);
      },
      () => { setPointageMsg({ type: 'error', text: 'Activez la géolocalisation.' }); setArriveeLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /* ═══ NEW: PAUSE / SHOP ═══ */
  const handlePause = async (type: 'pause' | 'retour_shop') => {
    if (!equipeId) { setPointageMsg({ type: 'error', text: 'Équipe non identifiée.' }); return; }
    setPauseLoading(true);
    try {
      const res = await fetch('/api/tracking/pause', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipeId, missionId: mission?.id || null, action: 'debut', type }),
      });
      if (res.ok) {
        setEnPause(true);
        setPointageMsg({ type: 'success', text: type === 'pause' ? '☕ Pause enregistrée' : '🏪 Retour au shop enregistré' });
        loadMission(); // Sync with admin dashboard
      } else {
        const d = await res.json().catch(() => ({}));
        setPointageMsg({ type: 'error', text: d.erreur || 'Erreur lors de la pause.' });
      }
    } catch { setPointageMsg({ type: 'error', text: 'Erreur de connexion.' }); }
    setPauseLoading(false);
  };

  const handleReprise = async () => {
    if (!equipeId) { setPointageMsg({ type: 'error', text: 'Équipe non identifiée.' }); return; }
    setPauseLoading(true);
    try {
      const res = await fetch('/api/tracking/pause', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipeId, missionId: mission?.id || null, action: 'fin' }),
      });
      if (res.ok) {
        setEnPause(false);
        setPointageMsg({ type: 'success', text: '✅ Reprise du travail' });
        loadMission(); // Sync with admin dashboard
      } else {
        const d = await res.json().catch(() => ({}));
        setPointageMsg({ type: 'error', text: d.erreur || 'Erreur lors de la reprise.' });
      }
    } catch { setPointageMsg({ type: 'error', text: 'Erreur de connexion.' }); }
    setPauseLoading(false);
  };

  /* ═══ NEW: TRANSFERT PHASE (Méca→Élec ou Élec→Vérification) ═══ */
  const handleTransferer = async () => {
    if (!mission) return;
    const isM = mission.phase === 'mecanique';
    const confirmMsg = isM
      ? 'Terminer la phase mécanique et transférer à l\'équipe électrique ?'
      : 'Terminer la phase électrique et transférer à l\'équipe de vérification ?';
    if (!confirm(confirmMsg)) return;
    setTransferLoading(true);
    try {
      const res = await fetch('/api/tracking/transferer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: mission.id, equipeId }),
      });
      const data = await res.json();
      if (data.ok) {
        setPointageMsg({ type: 'success', text: data.message });
        setPeutTransférer(false);
        loadMission();
      } else {
        setPointageMsg({ type: 'error', text: data.erreur || 'Erreur' });
      }
    } catch { setPointageMsg({ type: 'error', text: 'Erreur de connexion.' }); }
    setTransferLoading(false);
  };

  /* ═══ TERMINER MISSION (Verification phase) ═══ */
  const handleTerminerMission = async () => {
    if (!mission) return;
    if (!confirm('Terminer la vérification et envoyer le rapport final à El Ghani ?')) return;
    setTransferLoading(true);
    try {
      const res = await fetch(`/api/mission/${mission.id}/terminer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipeId }),
      });
      const data = await res.json();
      if (data.ok || data.message) {
        setPointageMsg({ type: 'success', text: data.message || '✅ Mission terminée ! Rapport envoyé à El Ghani.' });
        loadMission();
      } else {
        setPointageMsg({ type: 'error', text: data.erreur || 'Erreur' });
      }
    } catch { setPointageMsg({ type: 'error', text: 'Erreur de connexion.' }); }
    setTransferLoading(false);
  };

  /* ═══ CHECKLIST (simple, sans blocage frustrant) ═══ */
  // Toutes les étapes sont cochables librement
  // Les sous-tâches suivent l'étape parente
  const toggleEtape = async (index: number) => {
    if (!checklist || !mission) return;
    const etapes = JSON.parse(JSON.stringify(checklist.etapes));

    // Toggle l'étape
    etapes[index].done = !etapes[index].done;

    // Si on coche et que l'étape a des sous-tâches → on les marque comme faites
    if (etapes[index].done && etapes[index].subtasks) {
      etapes[index].subtasks.forEach((s: any) => s.done = true);
    }
    // Si on décoche → on décoche aussi les sous-tâches
    if (!etapes[index].done && etapes[index].subtasks) {
      etapes[index].subtasks.forEach((s: any) => s.done = false);
    }

    const complete = etapes.every((e: any) => e.done && (!e.subtasks || e.subtasks.every((s: any) => s.done)));
    setChecklist({ ...checklist, etapes, complete }); setChecklistLoading(true);
    try {
      await fetch(`/api/mission/${mission.id}/checklist`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapes, complete }),
      });
      loadMission(); // sync avec admin
    } catch (_) { /* keep local */ }
    setChecklistLoading(false);
  };
  const toggleSousTache = async (index: number, subIndex: number) => {
    if (!checklist || !mission) return;
    const etapes = JSON.parse(JSON.stringify(checklist.etapes));

    // Cocher une sous-tâche coche automatiquement l'étape parente
    etapes[index].subtasks[subIndex].done = !etapes[index].subtasks[subIndex].done;
    if (etapes[index].subtasks.every((s: any) => s.done)) {
      etapes[index].done = true;
    } else {
      etapes[index].done = false;
    }

    const complete = etapes.every((e: any) => e.done && (!e.subtasks || e.subtasks.every((s: any) => s.done)));
    setChecklist({ ...checklist, etapes, complete }); setChecklistLoading(true);
    try {
      await fetch(`/api/mission/${mission.id}/checklist`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapes, complete }),
      });
      loadMission();
    } catch (_) { /* keep local */ }
    setChecklistLoading(false);
  };

  /* ═══ BLOCAGE ═══ */
  const handleBlocage = async () => {
    if (!mission) { setPointageMsg({ type: 'error', text: 'Aucune mission active.' }); return; }
    if (!technicienId) { setPointageMsg({ type: 'error', text: 'Session invalide. Reconnectez-vous.' }); return; }
    setBlocageLoading(true);
    try {
      let photoUrl: string | null = null;
      if (blocagePhoto) {
        const fd = new FormData(); fd.append('file', blocagePhoto); fd.append('type', 'photo_blocage');
        const upRes = await fetch('/api/upload/single', { method: 'POST', body: fd });
        if (upRes.ok) photoUrl = (await upRes.json()).url;
      }
      // Auto-fill raison from motifRetard if raison is empty
      const raisonFinale = blocageForm.raison || blocageForm.motifRetard || 'Non spécifié';
      const res = await fetch('/api/mission/blocage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: mission.id, declarePar: technicienId, raison: raisonFinale,
          idPieceERP: blocageForm.pieceERP || null, priorite: blocageForm.priorite,
          stepId: blocageForm.stepId || null, motifRetard: blocageForm.motifRetard || null, photoProofUrl: photoUrl,
        }),
      });
      if (res.ok) {
        setShowBlocage(false);
        setBlocageForm({ raison: '', pieceERP: '', priorite: 'moyenne', stepId: '', motifRetard: '' });
        setBlocagePhoto(null); setBlocagePhotoPreview(null);
        setPointageMsg({ type: 'success', text: '✅ Blocage signalé à El Ghani.' });
        loadMission(); // Sync with admin dashboard
      } else {
        const d = await res.json();
        setPointageMsg({ type: 'error', text: d.erreur || 'Erreur' });
      }
    } catch { setPointageMsg({ type: 'error', text: 'Erreur de connexion.' }); }
    setBlocageLoading(false);
  };

  /* ═══ ÉQUIPEMENTS ═══ */
  const loadEquipements = useCallback(async () => {
    if (!equipeId || !missionDetail?.id) return;
    setEquipementsLoading(true);
    try {
      const eqRes = await fetch(`/api/equipe/${equipeId}/equipements`);
      const ecRes = await fetch(`/api/equipe/${equipeId}/equipements_chantier?chantier_id=${mission?.chantier_id || missionDetail?.id}`);
      setEquipementsEquipe(eqRes.ok ? await eqRes.json() : []);
      setEquipementsChantier(ecRes.ok ? await ecRes.json() : []);
    } catch (_) { /* ignore */ }
    setEquipementsLoading(false);
  }, [equipeId, missionDetail?.id, mission?.chantier_id]);
  const verifierEquipementLocal = async (eqId: string) => {
    if (!equipeId) return;
    try { await fetch(`/api/equipe/${equipeId}/equipements_chantier/${eqId}`, { method: 'PATCH' }); await loadEquipements(); } catch (_) {}
  };

  /* ═══ RETARD ═══ */
  const notifierRetard = async () => {
    if (!mission || !retardForm.motif || !equipeId) return;
    setRetardLoading(true);
    try {
      let photoUrl: string | null = null;
      if (retardPhoto) {
        const fd = new FormData(); fd.append('file', retardPhoto); fd.append('type', 'photo_retard');
        const upRes = await fetch('/api/upload/single', { method: 'POST', body: fd });
        if (upRes.ok) photoUrl = (await upRes.json()).url;
      }
      // Use the new materiel/signaler endpoint so it appears in admin Demandes page
      await fetch('/api/materiel/signaler', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipeId, chantierId: mission.chantier_id || mission.id, missionId: mission.id,
          description: retardForm.motif, photoUrl, motif: retardForm.motif,
        }),
      });
      setRetardModal(false); setRetardForm({ motif: '', etapeId: '' }); setRetardPhoto(null);
      setPointageMsg({ type: 'success', text: '✅ Retard notifié à El Ghani.' });
    } catch { setPointageMsg({ type: 'error', text: 'Erreur.' }); }
    setRetardLoading(false);
  };

  /* ═══ DEMANDE MATÉRIEL ═══ */
  const ajouterItem = () => {
    if (!demandeItemNom.trim()) return;
    setDemandeItems([...demandeItems, { nom: demandeItemNom.trim(), quantite: demandeItemQte, categorie: demandeItemCat }]);
    setDemandeItemNom(''); setDemandeItemQte(1);
  };
  const supprimerItem = (idx: number) => {
    setDemandeItems(demandeItems.filter((_, i) => i !== idx));
  };
  const soumettreDemande = async () => {
    if (!mission || !equipeId || demandeItems.length === 0) return;
    setDemandeLoading(true);
    try {
      let photoUrl: string | null = null;
      if (demandePhoto) {
        const fd = new FormData(); fd.append('file', demandePhoto); fd.append('type', 'photo_demande');
        const upRes = await fetch('/api/upload/single', { method: 'POST', body: fd });
        if (upRes.ok) photoUrl = (await upRes.json()).url;
      }
      const res = await fetch('/api/materiel/demande', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipeId, chantierId: mission.chantier_id || mission.id, missionId: mission.id,
          items: demandeItems, description: demandeDesc || null, photoUrl,
        }),
      });
      if (res.ok) {
        setDemandeModal(false); setDemandeItems([]); setDemandeDesc(''); setDemandePhoto(null); setDemandePhotoPreview(null);
        setPointageMsg({ type: 'success', text: '✅ Demande de matériel envoyée à El Ghani.' });
      } else {
        const d = await res.json();
        setPointageMsg({ type: 'error', text: d.erreur || 'Erreur' });
      }
    } catch { setPointageMsg({ type: 'error', text: 'Erreur de connexion.' }); }
    setDemandeLoading(false);
  };

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { setBlocagePhoto(file); const reader = new FileReader(); reader.onloadend = () => setBlocagePhotoPreview(reader.result as string); reader.readAsDataURL(file); }
  }

  const dispoDate = equipeStatus?.disponible_a_partir_de ? new Date(equipeStatus.disponible_a_partir_de).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  const nomEquipeJWT = user?.nomEquipe || user?.identifiant || '';
  const phaseEquipe = equipeStatus?.type || user?.typeEquipe || '';
  const equipeNom = equipeStatus?.nom || nomEquipeJWT;
  const IconPhase = PHASE_ICON[phaseEquipe] || HardHat;

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-stone-100 flex items-center justify-center">
      <Loader2 size={36} className="animate-spin text-indigo-500" />
    </div>
  );

  // ═══ STATE C: DISPONIBLE ═══
  if (equipeStatus?.statut_equipe === 'DISPONIBLE' && !mission) {
    return (
      <TechnicianShell equipeNom={equipeNom} phaseEquipe={phaseEquipe} onLogout={() => { deconnecter(); }}>
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center mb-6 shadow-inner">
            <CheckCircle size={48} className="text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-stone-800 mb-2">Équipe Disponible</h2>
          <p className="text-sm text-stone-400 text-center leading-relaxed">
            Aucun chantier assigné pour le moment.<br />Vous serez notifié dès qu'El Ghani valide une mission.
          </p>
          <div className="mt-8 flex items-center gap-2 text-xs text-stone-300">
            <Radio size={14} className="animate-pulse text-emerald-400" />
            Synchronisation en direct...
          </div>
        </div>
      </TechnicianShell>
    );
  }

  // ═══ STATE B: EN REPOS ═══
  if (equipeStatus?.statut_equipe === 'EN_REPOS') {
    return (
      <TechnicianShell equipeNom={equipeNom} phaseEquipe={phaseEquipe} onLogout={() => { deconnecter(); }}>
        <div className="flex flex-col items-center justify-center py-14 px-6">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center mb-6 shadow-inner">
            <Clock size={56} className="text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-stone-800 mb-1">Période de Repos</h2>
          <p className="text-4xl font-black text-amber-500 mb-3">{compteur || 'Calcul...'}</p>
          <p className="text-sm text-stone-400 text-center">
            Repos obligatoire de 3 jours après une mission.<br />
            Disponible à partir du <strong className="text-stone-600">{dispoDate}</strong>
          </p>
          <div className="mt-8 w-full max-w-xs bg-amber-50/80 border border-amber-100 rounded-2xl p-4 text-center">
            <p className="text-xs text-amber-600 font-semibold">Règle applicable</p>
            <p className="text-xs text-stone-400 mt-1">3 jours de repos obligatoires après chaque mission terminée.</p>
          </div>
        </div>
      </TechnicianShell>
    );
  }

  // ═══ STATE A: MISSION ACTIVE ═══
  const estArrive = pointages.some(p => p.type === 'arrivee');
  const estDepart = pointages.some(p => p.type === 'depart');
  const aBloque = mission?.statut === 'bloque';
  const progression = checklist ? Math.round((checklist.etapes.filter(e => e.done).length / checklist.etapes.length) * 100) : 0;

  // New lifecycle states
  const missionStatut = mission?.statut || '';
  const isEnRoute = estEnRoute || missionStatut === 'en_route';
  const isArrive = estArriveChantier || estArrive || missionStatut === 'en_cours' || missionStatut === 'en_pause';
  const isEnCours = missionStatut === 'en_cours' || missionStatut === 'en_pause';
  const isTermine = estDepart || missionStatut === 'termine';
  const isMecanique = mission?.phase === 'mecanique';
  const isElectrique = mission?.phase === 'electrique';
  const isPaused = enPause || missionStatut === 'en_pause';

  // Can see work content? Only when arrived and in zone
  const canSeeWork = isEnCours || isArrive;
  // GPS lock: must be in zone to see work
  const isGpsLocked = !isArrive && gpsInZone === false;

  return (
    <TechnicianShell equipeNom={equipeNom} phaseEquipe={phaseEquipe} onLogout={() => { deconnecter(); }} syncDot={syncDot}>
      {/* Message flash */}
      {pointageMsg && (
        <div className={`mx-4 mb-4 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-2 shadow-sm ${
          pointageMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}>
          {pointageMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {pointageMsg.text}
          <button onClick={() => setPointageMsg(null)} className="ml-auto"><X size={16} /></button>
        </div>
      )}

      {/* ═══ ALERTE COMPLEXITÉ DIFFICILE ═══ */}
      {(missionDetail?.complexite === 'DIFFICILE' || mission?.complexite === 'DIFFICILE') && (
        <div className="mx-4 mb-4 bg-gradient-to-r from-rose-500 to-red-500 rounded-3xl p-4 flex items-start gap-3 shadow-lg shadow-rose-200">
          <AlertTriangle size={24} className="text-white flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-white text-sm">⚠ Chantier DIFFICILE</p>
            <p className="text-xs text-rose-100 mt-0.5">Gaine complexe — priorité haute signalée à El Ghani.</p>
          </div>
        </div>
      )}

      {/* ═══ ONGLETS ═══ */}
      <div className="mx-4 mb-4">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-stone-100 shadow-sm p-1.5 flex">
          <button onClick={() => setOnglet('mission')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              onglet === 'mission' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-600'
            }`}>
            <ClipboardList size={16} /> Mission
          </button>
          <button onClick={() => { setOnglet('equipements'); loadEquipements(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              onglet === 'equipements' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-600'
            }`}>
            <Hammer size={16} /> Équipements
          </button>
        </div>
      </div>

      {/* ═══ ONGLET ÉQUIPEMENTS ═══ */}
      {onglet === 'equipements' ? (
        <div className="mx-4 mb-4 space-y-4">
          <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Hammer size={18} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Équipements requis</h3>
                <p className="text-xs text-stone-400">Vérifiez avant de commencer</p>
              </div>
            </div>
            {equipementsLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
            ) : equipementsChantier.length === 0 ? (
              <p className="text-center text-stone-400 py-8 text-sm">Aucun équipement spécifié pour ce chantier.</p>
            ) : (
              <div className="space-y-2">
                {equipementsChantier.map(eq => (
                  <div key={eq.id} className="flex items-center gap-3 border border-stone-100 rounded-2xl p-3.5 hover:bg-stone-50 transition-all">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                      <Hammer size={16} className="text-indigo-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-stone-700">{eq.nom}</p>
                      <p className="text-[10px] text-stone-400">Qté: {eq.quantite} • {eq.fourni_par === 'CLIENT' ? 'Fourni par client' : 'RMASC'}</p>
                    </div>
                    <button onClick={() => verifierEquipementLocal(eq.id)}
                      className={`text-[10px] font-bold px-3 py-2 rounded-full transition-all ${
                        eq.verifie ? 'bg-emerald-500 text-white shadow-sm' : 'bg-stone-100 text-stone-400 hover:bg-emerald-50 hover:text-emerald-600'
                      }`}>
                      {eq.verifie ? '✓ Vérifié' : 'Vérifier'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Hammer size={18} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Équipements de l'équipe</h3>
                <p className="text-xs text-stone-400">Votre matériel assigné</p>
              </div>
            </div>
            {equipementsEquipe.length === 0 ? (
              <p className="text-center text-stone-400 py-8 text-sm">Aucun équipement assigné à votre équipe.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {equipementsEquipe.map(eq => (
                  <div key={eq.id} className="border border-stone-100 rounded-2xl p-3.5 bg-stone-50/50">
                    <p className="text-sm font-semibold text-stone-700">{eq.nom}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-stone-400">Qté: {eq.quantite}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        eq.etat === 'OPERATIONNEL' ? 'bg-emerald-100 text-emerald-600'
                        : eq.etat === 'MAINTENANCE' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
                      }`}>
                        {eq.etat === 'OPERATIONNEL' ? '✓ Opérationnel' : eq.etat === 'MAINTENANCE' ? 'Maintenance' : 'Hors service'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── DEMANDER DU MATÉRIEL ─── */}
          <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Package size={18} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Demander du Matériel</h3>
                <p className="text-xs text-stone-400">Ajoutez les articles dont vous avez besoin</p>
              </div>
            </div>

            {/* Liste des items ajoutés */}
            {demandeItems.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {demandeItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
                    <span className="text-xs text-amber-600 font-mono">#{i + 1}</span>
                    <span className="text-sm font-medium text-stone-700 flex-1">{item.nom}</span>
                    <span className="text-xs text-stone-400">×{item.quantite}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded">{item.categorie}</span>
                    <button onClick={() => supprimerItem(i)} className="text-stone-300 hover:text-rose-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Formulaire d'ajout */}
            <div className="space-y-2.5">
              <input
                type="text"
                value={demandeItemNom}
                onChange={e => setDemandeItemNom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ajouterItem()}
                placeholder="Nom de l'article (ex: Guide-rails, Câble..."
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-amber-400"
                style={{ fontSize: '16px' }}
              />
              <div className="flex gap-2">
                <div className="flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
                  <button onClick={() => setDemandeItemQte(Math.max(1, demandeItemQte - 1))} className="text-stone-400 hover:text-stone-600 w-6 h-6 flex items-center justify-center">−</button>
                  <span className="text-sm font-bold text-stone-700 w-6 text-center">{demandeItemQte}</span>
                  <button onClick={() => setDemandeItemQte(demandeItemQte + 1)} className="text-stone-400 hover:text-stone-600 w-6 h-6 flex items-center justify-center">+</button>
                </div>
                <select value={demandeItemCat} onChange={e => setDemandeItemCat(e.target.value)}
                  className="flex-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-600 outline-none">
                  <option value="OUTILLAGE">🔧 Outillage</option>
                  <option value="MATERIEL">📦 Matériel</option>
                  <option value="PIECE">⚙️ Pièce</option>
                  <option value="CONSOMMABLE">🧰 Consommable</option>
                  <option value="SECURITE">🦺 Sécurité</option>
                </select>
                <button onClick={ajouterItem}
                  className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-all">
                  + Ajouter
                </button>
              </div>
            </div>

            {/* Description */}
            <textarea
              value={demandeDesc}
              onChange={e => setDemandeDesc(e.target.value)}
              placeholder="Description ou remarques (optionnel)..."
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none min-h-[60px] resize-none mt-2"
              style={{ fontSize: '16px' }}
            />

            {/* Photo */}
            <div className="mt-2">
              {demandePhotoPreview ? (
                <div className="relative rounded-xl overflow-hidden border-2 border-amber-200">
                  <img src={demandePhotoPreview} alt="Photo" className="w-full max-h-32 object-cover" />
                  <button onClick={() => { setDemandePhoto(null); setDemandePhotoPreview(null); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <label className="block border-2 border-dashed border-stone-200 bg-stone-50 rounded-xl p-3 text-center cursor-pointer hover:border-amber-300 transition-all">
                  <Camera size={20} className="text-stone-300 mx-auto mb-0.5" />
                  <p className="text-[10px] text-stone-400">Photo (optionnel)</p>
                  <input type="file" accept="image/*" capture="environment" onChange={e => {
                    const f = e.target.files?.[0]; if (f) { setDemandePhoto(f); const r = new FileReader(); r.onloadend = () => setDemandePhotoPreview(r.result as string); r.readAsDataURL(f); }
                  }} className="hidden" />
                </label>
              )}
            </div>

            {/* Submit */}
            <button onClick={soumettreDemande}
              disabled={demandeItems.length === 0 || demandeLoading}
              className="w-full mt-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3.5 rounded-2xl font-bold shadow-md hover:shadow-lg disabled:opacity-40 transition-all flex items-center justify-center gap-2">
              {demandeLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Envoyer la demande ({demandeItems.length} article{demandeItems.length > 1 ? 's' : ''})
            </button>
          </div>
        </div>
      ) : (
      <>
      {/* ═══ CARTE ═══ */}
      {mission && (
        <div className="mx-4 mb-4">
          <TechnicianMap chantierLat={mission.latitude} chantierLng={mission.longitude} rayon={mission.rayon_geofencing} nomChantier={mission.chantier} />
        </div>
      )}

      {/* ═══ PROGRESSION GLOBALE (only after arrival) ═══ */}
      {checklist && (isArrive || isEnCours) && (
        <div className="mx-4 mb-4 bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-stone-400 uppercase">Progression phase</p>
            <span className="text-sm font-black text-indigo-600">{progression}%</span>
          </div>
          <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500" style={{ width: `${progression}%` }} />
          </div>
        </div>
      )}

      {/* ═══ SITE DETAILS ═══ */}
      <div className="mx-4 mb-4 bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h2 className="font-bold text-lg text-stone-800">{mission?.chantier}</h2>
            <p className="text-sm text-stone-400 mt-0.5 flex items-center gap-1"><MapPin size={12} /> {mission?.adresse}</p>
          </div>
          <div className={`px-3 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${PHASE_GRADIENT[mission?.phase || ''] || 'from-stone-500 to-stone-600'} shadow-sm`}>
            <div className="flex items-center gap-1.5">
              {IconPhase && <IconPhase size={14} />}
              {PHASE_LABEL[mission?.phase || ''] || mission?.phase}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-stone-400 mb-3 flex-wrap">
          <span className="font-mono font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md">{mission?.ref_erp}</span>
          <span>{mission?.client_nom}</span>
          {mission?.client_telephone && (
            <a href={`tel:${mission.client_telephone}`} className="text-indigo-500 flex items-center gap-1">
              <Phone size={12} /> {mission.client_telephone}
            </a>
          )}
        </div>

        {mission?.duree_estimee && (
          <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-100">
            <div className="flex items-center justify-between text-xs text-stone-500 mb-1.5">
              <span className="font-medium">Durée estimée</span>
              <span className="font-bold">{mission.duree_estimee} jours</span>
            </div>
            <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full" style={{ width: '35%' }} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ FICHIERS ═══ */}
      {(missionDetail?.dxf_url || missionDetail?.pdf_url) && (
        <div className="mx-4 mb-4 bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-stone-400 uppercase mb-3 flex items-center gap-1.5"><FileText size={13} /> Documents Techniques</p>
          <div className="flex flex-wrap gap-2">
            {missionDetail?.dxf_url && (
              <a href={`https://onsite.sarl-rmasc.com${missionDetail.dxf_url}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-xl transition-all">
                <FileText size={14} /> Plan CAD (.dxf)
              </a>
            )}
            {missionDetail?.pdf_url && (
              <a href={`https://onsite.sarl-rmasc.com${missionDetail.pdf_url}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 px-4 py-2.5 rounded-xl transition-all">
                <FileText size={14} /> Fiche Technique (.pdf)
              </a>
            )}
          </div>
        </div>
      )}

      {/* ═══ CHECKLIST (only after arrival confirmed) ═══ */}
      {checklist && (isArrive || isEnCours) && (
        <div className="mx-4 mb-4 bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-stone-400 uppercase">📋 {PHASE_LABEL[checklist.phase] || checklist.phase}</p>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600">
              {checklist.etapes.filter(e => e.done).length}/{checklist.etapes.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {checklist.etapes.map((etape, i) => (
              <div key={etape.id} className="border border-stone-100 rounded-2xl overflow-hidden">
                <button onClick={() => toggleEtape(i)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                    etape.done ? 'bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-sm' : 'bg-stone-100 text-stone-300 border border-stone-200'
                  }`}>
                    {etape.done && <CheckCircle size={14} />}
                  </div>
                  <span className={`text-sm flex-1 font-medium ${etape.done ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                    {i + 1}. {etape.label}
                  </span>
                </button>
                {etape.subtasks && (
                  <div className="px-4 pb-3 flex gap-2">
                    {etape.subtasks.map((sub, si) => (
                      <button key={si} onClick={() => toggleSousTache(i, si)}
                        className={`flex-1 text-[10px] font-bold px-2 py-2 rounded-xl border transition-all ${
                          sub.done ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'bg-stone-50 text-stone-400 border-stone-200'
                        }`}>
                        {sub.done ? '✓ ' : ''}{sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {checklist.complete && (
            <div className="mt-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <p className="text-sm font-bold text-emerald-600">🎉 Phase terminée ! Pointez votre départ.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ PHASE 1: POINTAGE MATINAL ═══ */}
      {!isEnRoute && !isArrive && !isTermine && !aBloque && (
        <div className="mx-4 mb-4">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-3xl p-6 text-center shadow-lg shadow-blue-200">
            <Sunrise size={40} className="text-white/80 mx-auto mb-3" />
            <p className="text-white font-bold text-lg mb-1">Pointage Matinal</p>
            <p className="text-white/70 text-sm mb-4">Enregistrez votre arrivée et démarrez la journée</p>
            <button onClick={() => handlePointageJour('matinal')} disabled={gpsLoading}
              className="w-full bg-white text-blue-600 py-4 rounded-2xl text-lg font-black shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-3">
              {gpsLoading ? <Loader2 size={22} className="animate-spin" /> : <Sunrise size={22} />}
              🌅 Pointer mon arrivée
            </button>
          </div>
        </div>
      )}

      {/* ═══ GPS TRACKING BAR (en route) ═══ */}
      {isEnRoute && !isArrive && (
        <div className="mx-4 mb-4">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-3xl p-5 shadow-lg shadow-amber-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Navigation size={20} className="text-white animate-pulse" />
                <span className="text-white font-bold text-sm">🚗 En Route</span>
              </div>
              {trackingActive && (
                <span className="flex items-center gap-1.5 text-white/80 text-[10px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  GPS actif
                </span>
              )}
            </div>
            <p className="text-white/70 text-xs mb-3">
              Le GPS suit votre position en temps réel. L'admin voit votre parcours.
            </p>
            {gpsDistance !== null && gpsInZone === false && (
              <p className="text-white/90 text-xs font-semibold mb-2">
                📍 Distance: {gpsDistance}m — Approchez-vous du chantier
              </p>
            )}
            <button onClick={handleArriveeSite} disabled={arriveeLoading}
              className="w-full bg-white text-orange-600 py-4 rounded-2xl text-lg font-black shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-3">
              {arriveeLoading ? <Loader2 size={22} className="animate-spin" /> : <CheckCircle size={22} />}
              🏗️ Je suis arrivé sur site
            </button>
            {gpsInZone === false && gpsDistance !== null && (
              <p className="text-white/60 text-[10px] text-center mt-2">
                ⚠️ Vous devez être dans le rayon du chantier pour confirmer l'arrivée
              </p>
            )}
          </div>
        </div>
      )}

      {/* ═══ GPS LOCK WARNING ═══ */}
      {isGpsLocked && (
        <div className="mx-4 mb-4 bg-rose-50 border border-rose-200 rounded-3xl p-4 text-center">
          <AlertTriangle size={28} className="text-rose-400 mx-auto mb-2" />
          <p className="font-bold text-rose-700 text-sm">📍 Hors zone géographique</p>
          <p className="text-rose-500 text-xs mt-1">
            Vous êtes à {gpsDistance}m du chantier. Rapprochez-vous pour accéder au contenu.
          </p>
        </div>
      )}

      {/* ═══ MISSION BLOQUÉE ═══ */}
      {aBloque && (
        <div className="mx-4 mb-4 bg-gradient-to-r from-rose-50 to-red-50 rounded-3xl p-5 text-center border border-rose-200">
          <AlertTriangle size={32} className="text-rose-400 mx-auto mb-2" />
          <p className="font-bold text-stone-700">Mission Bloquée</p>
          <p className="text-sm text-stone-400">En attente de résolution par El Ghani</p>
        </div>
      )}

      {/* ═══ EN PAUSE ═══ */}
      {isPaused && (
        <div className="mx-4 mb-4">
          <div className="bg-gradient-to-r from-amber-100 to-orange-100 rounded-3xl p-5 text-center border border-amber-200">
            <Coffee size={32} className="text-amber-500 mx-auto mb-2 animate-pulse" />
            <p className="font-bold text-amber-700">⏸️ En pause</p>
            <p className="text-sm text-amber-500 mb-3">Le timer est suspendu</p>
            <button onClick={handleReprise} disabled={pauseLoading}
              className="w-full bg-amber-500 text-white py-3 rounded-2xl font-bold hover:bg-amber-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {pauseLoading ? <Loader2 size={18} className="animate-spin" /> : <Wrench size={18} />}
              Reprendre le travail
            </button>
          </div>
        </div>
      )}

      {/* ═══ ACTIONS EN COURS DE TRAVAIL (both phases, after arrival) ═══ */}
      {(isEnCours || isArrive) && !isTermine && !aBloque && (
        <div className="mx-4 mb-4 space-y-3">
          {/* Pause / Shop buttons — only when NOT paused */}
          {!isPaused && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handlePause('pause')} disabled={pauseLoading}
              className="bg-white border-2 border-amber-200 text-amber-600 py-3.5 rounded-2xl font-bold hover:bg-amber-50 transition-all flex items-center justify-center gap-2 shadow-sm">
              {pauseLoading ? <Loader2 size={16} className="animate-spin" /> : <Coffee size={16} />}
              ☕ Pause
            </button>
            <button onClick={() => handlePause('retour_shop')} disabled={pauseLoading}
              className="bg-white border-2 border-blue-200 text-blue-600 py-3.5 rounded-2xl font-bold hover:bg-blue-50 transition-all flex items-center justify-center gap-2 shadow-sm">
              {pauseLoading ? <Loader2 size={16} className="animate-spin" /> : <Store size={16} />}
              🏪 Retour Shop
            </button>
          </div>
          )}
          {/* Blocage / Retard — ALWAYS visible when mission is active (even during pause) */}
          <button onClick={() => setShowBlocage(true)}
            className="w-full bg-white border-2 border-rose-200 text-rose-500 py-3.5 rounded-2xl font-bold hover:bg-rose-50 transition-all flex items-center justify-center gap-2">
            <AlertTriangle size={16} /> Signaler un Blocage
          </button>
          <button onClick={() => setRetardModal(true)}
            className="w-full bg-white border-2 border-amber-200 text-amber-600 py-3.5 rounded-2xl font-bold hover:bg-amber-50 transition-all flex items-center justify-center gap-2">
            <Timer size={16} /> Signaler un Retard
          </button>
        </div>
      )}

      {/* ═══ MISSION BLOQUÉE — waiting for admin ═══ */}
      {aBloque && (isEnCours || isArrive) && (
        <div className="mx-4 mb-4">
          <div className="bg-gradient-to-r from-rose-500 to-red-500 rounded-3xl p-5 shadow-lg shadow-rose-200">
            <div className="flex items-center gap-3 mb-3">
              <Ban size={24} className="text-white" />
              <div>
                <p className="font-bold text-white text-sm">⛔ Mission Bloquée</p>
                <p className="text-white/70 text-xs">En attente d'El Ghani pour annuler le blocage</p>
              </div>
            </div>
            <p className="text-white/60 text-xs mb-3">Vous ne pouvez pas continuer tant que le blocage n'est pas annulé par l'administrateur.</p>
          </div>
        </div>
      )}

      {/* ═══ TRANSFERT PHASE (Méca→Élec ou Élec→Vérification) ═══ */}
      {(isEnCours || isArrive) && (isMecanique || isElectrique) && checklist?.complete && (
        <div className="mx-4 mb-4">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-5 shadow-lg shadow-indigo-200">
            <div className="flex items-center gap-3 mb-3">
              <ArrowRightLeft size={24} className="text-white" />
              <div>
                <p className="font-bold text-white text-sm">
                  {isMecanique ? 'Phase Mécanique Terminée !' : 'Phase Électrique Terminée !'}
                </p>
                <p className="text-white/70 text-xs">
                  {isMecanique ? 'Transférer à l\'équipe électrique' : 'Transférer à l\'équipe de vérification'}
                </p>
              </div>
            </div>
            <button onClick={handleTransferer} disabled={transferLoading}
              className="w-full bg-white text-indigo-600 py-4 rounded-2xl text-lg font-black shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-3">
              {transferLoading ? <Loader2 size={22} className="animate-spin" /> : <Send size={22} />}
              {isMecanique ? '⚡ Envoyer à l\'Équipe Électrique' : '🛡️ Envoyer à l\'Équipe Vérification'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ TERMINER LA MISSION (Verification phase — fin de chantier) ═══ */}
      {(isEnCours || isArrive) && mission?.phase === 'verification' && checklist?.complete && (
        <div className="mx-4 mb-4">
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-5 shadow-lg shadow-emerald-200">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle size={24} className="text-white" />
              <div>
                <p className="font-bold text-white text-sm">✅ Vérification Terminée !</p>
                <p className="text-white/70 text-xs">Toutes les étapes sont complétées. Envoyer le rapport final à El Ghani.</p>
              </div>
            </div>
            <button onClick={handleTerminerMission} disabled={transferLoading}
              className="w-full bg-white text-emerald-600 py-4 rounded-2xl text-lg font-black shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-3">
              {transferLoading ? <Loader2 size={22} className="animate-spin" /> : <Send size={22} />}
              🏁 Terminer & Envoyer le Rapport
            </button>
          </div>
        </div>
      )}

      {/* ═══ FIN DE JOURNÉE (both phases, after arrival) ═══ */}
      {(isEnCours || isArrive) && !isPaused && !isTermine && !aBloque && (
        <div className="mx-4 mb-4">
          <button onClick={() => handlePointageJour('fin_journee')} disabled={gpsLoading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-700 text-white py-4 rounded-2xl font-bold shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {gpsLoading ? <Loader2 size={18} className="animate-spin" /> : <Sunset size={18} />}
            🌙 Terminer la journée
          </button>
        </div>
      )}

      {/* ═══ MISSION TERMINÉE ═══ */}
      {isTermine && (
        <div className="mx-4 mb-4">
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-3xl p-5 text-center border border-emerald-200">
            <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
            <p className="font-bold text-emerald-700">Mission Terminée ✓</p>
            <p className="text-sm text-emerald-500">Bon retour ! 3 jours de repos vous attendent.</p>
          </div>
        </div>
      )}

      {/* ═══ JOURNAL POINTAGES ═══ */}
      {pointages.length > 0 && (
        <div className="mx-4 mb-4">
          <h3 className="text-xs font-semibold text-stone-400 uppercase mb-2 px-1">Journal des Pointages</h3>
          <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm divide-y divide-stone-50">
            {pointages.map(p => (
              <div key={p.id} className="px-5 py-3.5 flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${p.conforme ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-stone-700">{p.type === 'arrivee' ? 'Arrivée' : 'Départ'} — {p.distance}m du chantier</p>
                  <p className="text-xs text-stone-400">{new Date(p.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${p.conforme ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {p.conforme ? 'Conforme' : 'Hors zone'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}

      {/* ═══ MODAL BLOCAGE ═══ */}
      {showBlocage && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 sm:m-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg text-stone-800">Signaler un Blocage</h3>
              <button onClick={() => { setShowBlocage(false); setBlocagePhoto(null); setBlocagePhotoPreview(null); }} className="text-stone-300"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {checklist && (
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">Étape concernée</label>
                  <select value={blocageForm.stepId} onChange={e => setBlocageForm({...blocageForm, stepId: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm text-stone-700 outline-none focus:border-indigo-400">
                    <option value="">-- Sélectionner --</option>
                    {checklist.etapes.map((et, i) => <option key={et.id} value={et.id}>{i + 1}. {et.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Motif du retard / Problème *</label>
                <textarea value={blocageForm.motifRetard} onChange={e => setBlocageForm({...blocageForm, motifRetard: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm text-stone-700 outline-none min-h-[80px] resize-none" placeholder="Décrivez le problème..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Raison du blocage *</label>
                <textarea value={blocageForm.raison} onChange={e => setBlocageForm({...blocageForm, raison: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm text-stone-700 outline-none min-h-[100px] resize-none" placeholder="Décrivez le problème technique..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Pièce ERP manquante (optionnel)</label>
                <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-2xl px-4 py-3">
                  <Package size={16} className="text-stone-300" />
                  <input value={blocageForm.pieceERP} onChange={e => setBlocageForm({...blocageForm, pieceERP: e.target.value})} placeholder="Réf. pièce (ex: A-902)" className="bg-transparent text-sm text-stone-700 outline-none flex-1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Photo preuve (optionnel)</label>
                {blocagePhotoPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-200 mb-2">
                    <img src={blocagePhotoPreview} alt="Preuve" className="w-full max-h-48 object-cover" />
                    <button onClick={() => { setBlocagePhoto(null); setBlocagePhotoPreview(null); }} className="absolute top-2 right-2 w-7 h-7 bg-rose-500 text-white rounded-full flex items-center justify-center"><X size={14} /></button>
                  </div>
                ) : (
                  <label className="block border-2 border-dashed border-stone-200 bg-stone-50 rounded-2xl p-5 text-center cursor-pointer hover:border-indigo-300 transition-all">
                    <Camera size={24} className="text-stone-300 mx-auto mb-1" />
                    <p className="text-xs text-stone-400">Ajouter une photo du problème</p>
                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} className="hidden" />
                  </label>
                )}
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
                      }`}>{p.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleBlocage} disabled={(!blocageForm.raison && !blocageForm.motifRetard) || blocageLoading}
                className="w-full bg-rose-500 text-white py-4 rounded-2xl font-bold hover:bg-rose-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {blocageLoading ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
                Envoyer le Signalement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL RETARD ═══ */}
      {retardModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 sm:m-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg text-stone-800">⏰ Signaler un Retard</h3>
              <button onClick={() => setRetardModal(false)} className="text-stone-300"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {checklist && (
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">Étape en retard</label>
                  <select value={retardForm.etapeId} onChange={e => setRetardForm({...retardForm, etapeId: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm text-stone-700 outline-none focus:border-amber-400">
                    <option value="">-- Sélectionner --</option>
                    {checklist.etapes.map((et, i) => <option key={et.id} value={et.id}>{i + 1}. {et.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Motif du retard *</label>
                <textarea value={retardForm.motif} onChange={e => setRetardForm({...retardForm, motif: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm text-stone-700 outline-none min-h-[90px] resize-none" placeholder="Expliquez la cause du retard..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Photo preuve (optionnel)</label>
                <label className="block border-2 border-dashed border-stone-200 bg-stone-50 rounded-2xl p-5 text-center cursor-pointer hover:border-amber-300 transition-all">
                  <Camera size={24} className="text-stone-300 mx-auto mb-1" />
                  <p className="text-xs text-stone-400">{retardPhoto ? retardPhoto.name : 'Ajouter une photo'}</p>
                  <input type="file" accept="image/*" capture="environment" onChange={e => setRetardPhoto(e.target.files?.[0] || null)} className="hidden" />
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

      <div className="h-8 pb-safe" />
    </TechnicianShell>
  );
}

/* ─── TECHNICIAN SHELL (header pro) ─────────────────────────────────── */
function TechnicianShell({ children, equipeNom, phaseEquipe, onLogout, syncDot }: {
  children: React.ReactNode; equipeNom: string; phaseEquipe: string; onLogout: () => void; syncDot?: boolean;
}) {
  const phaseColor = phaseEquipe === 'mecanique' ? 'from-blue-500 to-blue-600'
    : phaseEquipe === 'electrique' ? 'from-orange-500 to-orange-600' : 'from-emerald-500 to-emerald-600';
  const phaseLabel = TYPE_LABEL[phaseEquipe] || '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 max-w-md mx-auto w-full">
      {/* Header avec safe-area iPhone */}
      <header className={`bg-gradient-to-r ${phaseColor} px-5 pt-safe py-4 sticky top-0 z-20 shadow-lg`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
              <HardHat size={22} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">{equipeNom}</p>
              <p className="text-white/70 text-[10px] flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full inline-block bg-white`} />
                {phaseLabel} • En ligne
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {syncDot && (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse" title="Synchronisé" />
            )}
            <button onClick={onLogout} className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-all">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
