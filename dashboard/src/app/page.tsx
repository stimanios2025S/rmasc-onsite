'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { estConnecte } from '@/lib/auth';
import { Bell } from 'lucide-react';
import KpiCards from '@/components/KpiCards';
import MapView from '@/components/MapView';
import UrgencyPanel from '@/components/UrgencyPanel';
import SlideOverPanel from '@/components/SlideOverPanel';
import AnalyticsSection from '@/components/AnalyticsSection';
import { KPI_MOCK, CHANTIERS_MOCK, ALERTES_MOCK } from '@/data/mock-data';
import type { Chantier, Alerte } from '@/types';

export default function Home() {
  const router = useRouter();
  const [chantierSelectionne, setChantierSelectionne] = useState<Chantier | null>(null);
  const [panelOuvert, setPanelOuvert] = useState(false);

  useEffect(() => {
    if (!estConnecte()) {
      router.push('/login');
    }
  }, [router]);

  const handleSelectionnerChantier = (c: Chantier) => {
    setChantierSelectionne(c);
    setPanelOuvert(true);
  };

  const handleApprouver = (alerte: Alerte) => {
    alert(`Requisition approuvee pour ${alerte.chantierNom}${alerte.pieceERP ? ' (Piece: ' + alerte.pieceERP + ')' : ''}`);
  };

  const handleReassigner = (alerte: Alerte) => {
    alert(`Reaffectation d'equipe pour ${alerte.chantierNom}`);
  };

  const chantiersFiltres = useMemo(() => {
    return CHANTIERS_MOCK.filter(c => c.statut !== 'termine' && c.statut !== 'reception_officielle');
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F6FB]">
      {/* Barre de navigation */}
      <header className="bg-white border-b border-[#E5E8F0] sticky top-0 z-[1000]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1E2235]">RMASC OnSite <span className="text-[#6B7294] font-medium">— Centre de Commandement</span></h1>
            <p className="text-xs text-[#A8AEC5] mt-0.5">Tableau de bord direction • {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 hover:bg-[#F4F6FB] rounded-lg">
              <Bell size={20} className="text-[#6B7294]" />
              <span className="absolute -top-0.5 -right-0.5 bg-[#FF5252] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {ALERTES_MOCK.filter(a => !a.lue).length}
              </span>
            </button>
            <div className="flex items-center gap-2 pl-4 border-l border-[#E5E8F0]">
              <div className="w-8 h-8 rounded-full bg-[#3B4BB9] flex items-center justify-center text-white text-sm font-bold">D</div>
              <span className="text-sm font-medium text-[#1E2235]">Direction</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* KPI Cards */}
        <KpiCards data={KPI_MOCK} />

        {/* Vue principale: Carte + Panneau urgences */}
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 lg:w-[60%]">
            <MapView
              chantiers={chantiersFiltres}
              chantierSelectionne={chantierSelectionne}
              onSelectionner={handleSelectionnerChantier}
            />
          </div>
          <div className="lg:w-[40%] lg:min-w-[380px]">
            <UrgencyPanel
              alertes={ALERTES_MOCK}
              onApprouver={handleApprouver}
              onReassigner={handleReassigner}
            />
          </div>
        </div>

        {/* Section analytique */}
        <AnalyticsSection />
      </main>

      {/* Slide-over panel */}
      <SlideOverPanel
        chantier={chantierSelectionne}
        ouvert={panelOuvert}
        onFermer={() => setPanelOuvert(false)}
      />

      {/* Overlay */}
      {panelOuvert && (
        <div className="fixed inset-0 bg-black/20 z-[1500]" onClick={() => setPanelOuvert(false)} />
      )}
    </div>
  );
}
