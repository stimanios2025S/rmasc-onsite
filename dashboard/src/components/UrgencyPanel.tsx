'use client';
import { useState } from 'react';
import { AlertTriangle, MapPin, Package, CheckCircle, X, ChevronRight } from 'lucide-react';
import type { Alerte } from '@/types';

const ICONE_TYPE = {
  blocage: { icon: AlertTriangle, couleur: '#FF5252', fond: '#FFE5E5' },
  perimetre: { icon: MapPin, couleur: '#FF9800', fond: '#FFF3E0' },
  requisition: { icon: Package, couleur: '#3B4BB9', fond: '#E8EAFA' },
  phase: { icon: ChevronRight, couleur: '#20C997', fond: '#E2FBF2' },
};

const PRIORITE_LIBELLE: Record<string, string> = {
  critique: 'CRITIQUE', haute: 'Urgent', moyenne: 'Moyen', basse: 'Info', info: 'Info',
};

const PRIORITE_COULEUR: Record<string, string> = {
  critique: 'bg-[#FF5252] text-white', haute: 'bg-[#FF9800] text-white',
  moyenne: 'bg-[#FFC107] text-[#1E2235]', basse: 'bg-[#E5E8F0] text-[#6B7294]', info: 'bg-[#E5E8F0] text-[#6B7294]',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'a l instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return `il y a ${h}h`;
}

export default function UrgencyPanel({ alertes, onApprouver, onReassigner }: {
  alertes: Alerte[];
  onApprouver: (alerte: Alerte) => void;
  onReassigner: (alerte: Alerte) => void;
}) {
  const [filtre, setFiltre] = useState<'toutes' | 'non_lues'>('non_lues');
  const liste = filtre === 'non_lues' ? alertes.filter(a => !a.lue) : alertes;

  return (
    <div className="bg-white rounded-2xl border border-[#E5E8F0] shadow-[0_2px_8px_rgba(0,0,0,0.06)] h-full flex flex-col">
      {/* En-tête */}
      <div className="flex items-center justify-between p-5 border-b border-[#E5E8F0]">
        <div>
          <h3 className="font-bold text-[#1E2235]">Blocages & Requisitions</h3>
          <p className="text-xs text-[#6B7294] mt-0.5">{alertes.filter(a => !a.lue).length} non lues</p>
        </div>
        <div className="flex bg-[#F4F6FB] rounded-lg p-0.5">
          <button onClick={() => setFiltre('non_lues')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${filtre === 'non_lues' ? 'bg-white shadow-sm text-[#1E2235]' : 'text-[#6B7294]'}`}>
            Non lues
          </button>
          <button onClick={() => setFiltre('toutes')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${filtre === 'toutes' ? 'bg-white shadow-sm text-[#1E2235]' : 'text-[#6B7294]'}`}>
            Toutes
          </button>
        </div>
      </div>

      {/* Flux d'alertes */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#E5E8F0]">
        {liste.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[#A8AEC5]">
            <CheckCircle size={40} className="mb-3" />
            <p className="text-sm font-medium">Aucune alerte</p>
            <p className="text-xs">Tout est sous controle</p>
          </div>
        ) : (
          liste.map((alerte) => {
            const { icon: Icon, couleur, fond } = ICONE_TYPE[alerte.type];
            return (
              <div key={alerte.id} className={`p-4 hover:bg-[#F4F6FB]/50 transition ${!alerte.lue ? 'bg-[#F4F6FB]/30' : ''}`}>
                <div className="flex gap-3">
                  <div className="rounded-xl p-2.5 flex-shrink-0 mt-0.5" style={{ backgroundColor: fond }}>
                    <Icon size={16} style={{ color: couleur }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[#1E2235] leading-tight">{alerte.message}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${PRIORITE_COULEUR[alerte.priorite] ?? 'bg-[#E5E8F0] text-[#6B7294]'}`}>
                        {PRIORITE_LIBELLE[alerte.priorite] ?? alerte.priorite}
                      </span>
                    </div>
                    <p className="text-xs text-[#6B7294] mt-1 line-clamp-2">{alerte.detail}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-[#A8AEC5]">{timeAgo(alerte.horodatage)}</span>
                      <div className="flex gap-1.5">
                        {alerte.type === 'requisition' && (
                          <button onClick={() => onApprouver(alerte)}
                            className="text-[10px] font-semibold px-2 py-1 rounded-md bg-[#20C997]/10 text-[#20C997] hover:bg-[#20C997]/20">
                            Approuver
                          </button>
                        )}
                        <button onClick={() => onReassigner(alerte)}
                          className="text-[10px] font-semibold px-2 py-1 rounded-md bg-[#3B4BB9]/10 text-[#3B4BB9] hover:bg-[#3B4BB9]/20">
                            Reassigner
                        </button>
                      </div>
                    </div>
                    {alerte.pieceERP && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-[#3B4BB9] bg-[#E8EAFA] rounded-md px-2 py-1">
                        <Package size={10} />
                        Piece ERP: {alerte.pieceERP}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
