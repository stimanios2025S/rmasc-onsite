'use client';
import { HardHat, AlertTriangle, Users, MapPin, TrendingUp, TrendingDown } from 'lucide-react';
import type { KpiData } from '@/types';

function KpiCard({ titre, valeur, icone, couleur, evolution, unite }: {
  titre: string; valeur: string | number; icone: React.ReactNode;
  couleur: string; evolution?: number; unite?: string;
}) {
  const pos = evolution !== undefined && evolution >= 0;
  return (
    <div className="bg-white rounded-2xl p-5 flex items-start gap-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-[#E5E8F0]">
      <div className="rounded-xl p-3 flex-shrink-0" style={{ backgroundColor: `${couleur}15` }}>
        <div style={{ color: couleur }}>{icone}</div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#6B7294] mb-1">{titre}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[#1E2235]">{valeur}</span>
          {unite && <span className="text-sm text-[#A8AEC5]">{unite}</span>}
        </div>
        {evolution !== undefined && (
          <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${pos ? 'text-[#20C997]' : 'text-[#FF5252]'}`}>
            {pos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>{Math.abs(evolution)}% vs mois dernier</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KpiCards({ data }: { data: KpiData }) {
  const items = [
    { titre: 'Chantiers Actifs', valeur: data.chantiersActifs, icone: <HardHat size={24} />, couleur: '#20C997', evolution: data.evolutionChantiersActifs },
    { titre: 'Chantiers Bloques', valeur: data.chantiersBloques, icone: <AlertTriangle size={24} />, couleur: '#FF5252', evolution: data.evolutionChantiersBloques, unite: undefined, badge: true },
    { titre: 'Equipes Deployees', valeur: `${data.equipesDeployees}/${data.equipesTotal}`, icone: <Users size={24} />, couleur: '#3B4BB9', unite: 'equipages' },
    { titre: 'Alertes Perimetre GPS', valeur: data.alertesPerimetre, icone: <MapPin size={24} />, couleur: '#FF9800' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {items.map((item, i) => (
        <div key={i} className="relative">
          {item.badge && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5252] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FF5252]"></span>
            </span>
          )}
          <KpiCard {...item} />
        </div>
      ))}
    </div>
  );
}
