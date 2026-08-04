'use client';
import { useEffect, useState } from 'react';
import { X, MapPin, Users, Clock, Wrench, Zap, Shield, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { Chantier } from '@/types';

interface PointageReal {
  id: string;
  type: string;
  horodatage: string;
  distance: number;
  conforme: boolean;
  technicien_nom?: string;
}

const ICONE_PHASE: Record<string, { icon: any; couleur: string; fond: string; libelle: string }> = {
  mecanique: { icon: Wrench, couleur: '#2196F3', fond: '#E8F4FD', libelle: 'Mecanique' },
  electrique: { icon: Zap, couleur: '#FF9800', fond: '#FFF3E0', libelle: 'Electrique' },
  verification: { icon: Shield, couleur: '#4CAF50', fond: '#E8F5E9', libelle: 'Verification' },
};

export default function SlideOverPanel({ chantier, ouvert, onFermer }: {
  chantier: Chantier | null;
  ouvert: boolean;
  onFermer: () => void;
}) {
  const [pointages, setPointages] = useState<PointageReal[]>([]);
  const [loadingPointages, setLoadingPointages] = useState(false);

  useEffect(() => {
    if (!chantier || !ouvert) return;
    setLoadingPointages(true);
    // Trouver la mission active du chantier et charger ses pointages réels
    fetch(`/api/chantiers/${chantier.id}/pointages`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setPointages(data))
      .catch(() => setPointages([]))
      .finally(() => setLoadingPointages(false));
  }, [chantier, ouvert]);

  if (!chantier) return null;
  const phase = ICONE_PHASE[chantier.phase];
  const IconPhase = phase.icon;

  return (
    <div className={`fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-[2000] transform transition-transform duration-300 ${ouvert ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#E5E8F0]">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5" style={{ backgroundColor: phase.fond }}>
              <IconPhase size={20} style={{ color: phase.couleur }} />
            </div>
            <div>
              <h2 className="font-bold text-[#1E2235]">{chantier.nom}</h2>
              <p className="text-xs text-[#6B7294]">{chantier.referenceERP}</p>
            </div>
          </div>
          <button onClick={onFermer} className="p-2 hover:bg-[#F4F6FB] rounded-lg">
            <X size={20} className="text-[#6B7294]" />
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Info chantier */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#F4F6FB] rounded-xl p-4">
              <div className="flex items-center gap-2 text-[#6B7294] text-xs mb-2">
                <MapPin size={14} /> Adresse
              </div>
              <p className="text-sm font-medium text-[#1E2235]">{chantier.adresse}</p>
            </div>
            <div className="bg-[#F4F6FB] rounded-xl p-4">
              <div className="flex items-center gap-2 text-[#6B7294] text-xs mb-2">
                <Users size={14} /> Equipe
              </div>
              <p className="text-sm font-medium text-[#1E2235]">{chantier.equipeNom}</p>
              <p className="text-xs text-[#6B7294]">{chantier.techniciens.join(', ')}</p>
            </div>
          </div>

          {/* Phase et statut */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-[#F4F6FB] rounded-xl p-4">
              <p className="text-xs text-[#6B7294] mb-1">Phase en cours</p>
              <div className="flex items-center gap-2">
                <IconPhase size={16} style={{ color: phase.couleur }} />
                <span className="font-semibold text-[#1E2235]">{phase.libelle}</span>
              </div>
            </div>
            <div className="flex-1 bg-[#F4F6FB] rounded-xl p-4">
              <p className="text-xs text-[#6B7294] mb-1">Statut</p>
              <div className="flex items-center gap-2">
                {chantier.statut === 'bloque' ? (
                  <AlertTriangle size={16} className="text-[#FF5252]" />
                ) : chantier.statut === 'termine' || chantier.statut === 'reception_officielle' ? (
                  <CheckCircle size={16} className="text-[#20C997]" />
                ) : (
                  <Clock size={16} className="text-[#3B4BB9]" />
                )}
                <span className="font-semibold text-[#1E2235]">
                  {chantier.statut === 'en_cours' ? 'En cours' : chantier.statut === 'bloque' ? 'Bloque' : chantier.statut === 'termine' ? 'Termine' : chantier.statut === 'en_attente' ? 'En attente' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Geofencing */}
          {chantier.dernierPointageDistance !== null && (
            <div className="bg-[#F4F6FB] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#6B7294] mb-1">Dernier pointage GPS</p>
                  <p className="text-lg font-bold text-[#1E2235]">{chantier.dernierPointageDistance} <span className="text-sm font-medium text-[#6B7294]">m du chantier</span></p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${chantier.dernierPointageDistance <= 50 ? 'bg-[#E2FBF2] text-[#20C997]' : 'bg-[#FFE5E5] text-[#FF5252]'}`}>
                  {chantier.dernierPointageDistance <= 50 ? 'Conforme' : 'Hors zone'}
                </div>
              </div>
              <div className="mt-2 w-full bg-[#E5E8F0] rounded-full h-1.5">
                <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (chantier.dernierPointageDistance / chantier.rayonGeofencing) * 100)}%`, backgroundColor: chantier.dernierPointageDistance <= 50 ? '#20C997' : '#FF5252' }} />
              </div>
              <p className="text-[10px] text-[#A8AEC5] mt-1">Rayon autorise: {chantier.rayonGeofencing}m</p>
            </div>
          )}

          {/* Journal des pointages */}
          {pointages.length > 0 && (
            <div>
              <h4 className="font-semibold text-[#1E2235] mb-3">Journal des pointages</h4>
              <div className="space-y-2">
                {pointages.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 bg-[#F4F6FB] rounded-xl px-4 py-3">
                    <div className={`w-2 h-2 rounded-full ${p.conforme ? 'bg-[#20C997]' : 'bg-[#FF5252]'}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#1E2235]">{p.technicien_nom || 'Technicien'}</p>
                      <p className="text-xs text-[#6B7294]">{p.type === 'arrivee' ? 'Arrivee' : 'Depart'} — {p.distance}m</p>
                    </div>
                    <span className="text-[10px] text-[#A8AEC5]">{new Date(p.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
