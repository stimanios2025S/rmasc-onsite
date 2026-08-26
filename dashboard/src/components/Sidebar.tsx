'use client';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, MapPin, Users, AlertTriangle, Settings, LogOut,
  HardHat, Bell, MessageSquareText, Package,
} from 'lucide-react';
import { getUtilisateur } from '@/lib/auth';
import { useState } from 'react';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: MapPin, label: 'Chantiers', href: '/dashboard/chantiers' },
  { icon: Users, label: 'Équipes', href: '/dashboard/equipes' },
  { icon: MessageSquareText, label: 'SMS Auto', href: '/dashboard/sms' },
  { icon: AlertTriangle, label: 'Incidents', href: '/dashboard/incidents' },
  { icon: Package, label: 'Demandes', href: '/dashboard/demandes' },
  { icon: Settings, label: 'Paramètres', href: '/dashboard/parametres' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUtilisateur();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-xl bg-white/80 backdrop-blur-md border border-stone-100 shadow-sm flex items-center justify-center text-stone-500"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {mobileOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
        </svg>
      </button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/20 z-30" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40 w-64
        bg-white/80 backdrop-blur-xl border-r border-white/40 p-5
        flex flex-col transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shrink-0">
            <HardHat size={20} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-stone-800">RMASC OnSite</p>
            <p className="text-[10px] text-stone-400">Command Center</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <button
                key={item.href}
                onClick={() => { router.push(item.href); setMobileOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-gradient-to-r from-orange-100/80 to-rose-100/80 text-stone-800 shadow-sm'
                    : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-stone-100 pt-4">
          <div className="flex items-center gap-3 px-4 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
              {user?.prenom?.[0]}{user?.nom?.[0] || 'EG'}
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-700">{user?.prenom} {user?.nom}</p>
              <p className="text-[10px] text-stone-400">Admin</p>
            </div>
          </div>
          <button
            onClick={() => { localStorage.clear(); router.push('/login'); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut size={18} /> Déconnexion
          </button>
        </div>
      </aside>
    </>
  );
}

export { NAV_ITEMS };
