'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getUtilisateur, deconnecter } from '@/lib/auth';
import {
  HardHat, MapPin, Clock, Wrench, Zap, Shield, AlertTriangle,
  CheckCircle, LogOut, Navigation, Camera, X, Send, Loader2,
  ChevronRight, Phone, Package,
} from 'lucide-react';

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
  const [blocageForm, setBlocageForm] = useState({ raison: '', pieceERP: '', priorite: 'moyenne' });
  const [blocageLoading, setBlocageLoading] = useState(false);
  const [compteur, setCompteur] = useState('');

  const equipeId = user?.equipeId;
  const technicienId = user?.id;

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
        // Load pointages
        if (m.id) {
          const pRes = await fetch(`/api/mission/${m.id}/pointages`);
          if (pRes.ok) setPointages(await pRes.json());
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

  // Signaler blocage
  const handleBlocage = async () => {
    if (!mission || !technicienId) return;
    setBlocageLoading(true);
    try {
      const res = await fetch('/api/mission/blocage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: mission.id,
          declarePar: technicienId,
          raison: blocageForm.raison,
          idPieceERP: blocageForm.pieceERP || null,
          priorite: blocageForm.priorite,
        }),
      });
      if (res.ok) {
        setShowBlocage(false);
        setBlocageForm({ raison: '', pieceERP: '', priorite: 'moyenne' });
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

  // Rest countdown
  const dispoDate = equipeStatus?.disponible_a_partir_de
    ? new Date(equipeStatus.disponible_a_partir_de).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
      })
    : '';

  const phaseEquipe = equipeStatus?.type || '';
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
      <TechnicianShell equipeNom={equipeStatus?.nom || ''} phaseEquipe={phaseEquipe} onLogout={() => { deconnecter(); }}>
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
      <TechnicianShell equipeNom={equipeStatus?.nom || ''} phaseEquipe={phaseEquipe} onLogout={() => { deconnecter(); }}>
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
    <TechnicianShell equipeNom={equipeStatus?.nom || ''} phaseEquipe={phaseEquipe} onLogout={() => { deconnecter(); }}>
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
