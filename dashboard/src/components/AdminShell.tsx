'use client';
import { useRouter, usePathname } from 'next/navigation';
import { HardHat, Search, Mail, Bell, LogOut } from 'lucide-react';
import { getUtilisateur, deconnecter } from '@/lib/auth';
import SyncNotifications from '@/components/SyncNotifications';

const PILLS = [
  { label: "Vue d'ensemble", href: '/dashboard' },
  { label: 'Chantiers', href: '/dashboard/chantiers' },
  { label: 'Équipes', href: '/dashboard/team-management' },
  { label: 'Véhicules', href: '/dashboard/vehicules' },
  { label: 'Incidents', href: '/dashboard/incidents' },
  { label: 'Demandes', href: '/dashboard/demandes' },
  { label: 'Magasin', href: '/dashboard/magasiniers' },
  { label: 'Temps', href: '/dashboard/timesheet' },
  { label: 'SMS', href: '/dashboard/sms' },
  { label: 'Paramètres', href: '/dashboard/parametres' },
];

export default function AdminShell({
  title,
  subtitle,
  actions,
  children,
  onRefresh,
  notifCount = 0,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  onRefresh?: () => void;
  notifCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = typeof window !== 'undefined' ? getUtilisateur() : null;

  return (
    <div className="min-h-screen bg-[#e4e6ec] text-stone-900 overflow-x-clip">
      <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pt-safe pb-safe">
        {/* ═══ TOP BAR : logo + pills + actions (identique au dashboard) ═══ */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 mb-5 flex-wrap">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 shrink-0 min-w-0" title="Accueil">
            <div className="w-9 h-9 rounded-xl bg-stone-900 flex items-center justify-center shadow shrink-0">
              <HardHat size={18} className="text-white" />
            </div>
            <span className="text-base sm:text-lg font-bold tracking-tight text-stone-900 truncate">rmasc<span className="font-normal"> onsite</span></span>
          </button>

          {/* Pills — scroll horizontal sur petit écran / TV safe */}
          <nav className="flex items-center gap-1 bg-white/60 rounded-full p-1 border border-white overflow-x-auto max-w-full order-3 lg:order-2 w-full lg:w-auto justify-start lg:justify-center scrollbar-none">
            {PILLS.map((p) => {
              const active = pathname === p.href || (p.href !== '/dashboard' && pathname?.startsWith(p.href));
              const isRoot = p.href === '/dashboard';
              const rootActive = pathname === '/dashboard' && isRoot;
              const on = isRoot ? rootActive : active;
              return (
                <button key={p.label} onClick={() => { if (!on) router.push(p.href); }}
                  className={`px-3 sm:px-4 py-2 rounded-full text-[12px] sm:text-[13px] font-medium transition-all whitespace-nowrap shrink-0 ${on ? 'bg-stone-900 text-white shadow' : 'text-stone-500 hover:text-stone-800'}`}>
                  {p.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 order-2 lg:order-3">
            <button onClick={() => router.push('/dashboard/chantiers')}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:shadow transition-all shrink-0" title="Rechercher un chantier">
              <Search size={16} />
            </button>
            <button onClick={() => router.push('/dashboard/demandes')}
              className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:shadow transition-all shrink-0" title="Commandes">
              <Mail size={16} />
              {notifCount > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-rose-400 border-2 border-white" />}
            </button>
            <div className="w-9 h-9 sm:w-[42px] sm:h-[42px] rounded-xl border border-stone-200 flex items-center justify-center bg-white hover:shadow transition-all overflow-hidden shrink-0" title="Notifications temps réel">
              <SyncNotifications onRefresh={onRefresh} />
            </div>
            <button onClick={() => router.push('/dashboard/parametres')}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-amber-200 to-rose-300 border-2 border-white shadow flex items-center justify-center text-[12px] sm:text-[13px] font-bold text-stone-700 hover:shadow-md transition-all shrink-0"
              title={`${user?.prenom || ''} ${user?.nom || ''} — Paramètres`}>
              {(user?.prenom?.[0] || 'E')}{(user?.nom?.[0] || 'G')}
            </button>
            <button onClick={() => { if (confirm('Se déconnecter ?')) deconnecter(); }}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400 hover:text-rose-500 hover:shadow transition-all shrink-0" title="Déconnexion">
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* ═══ TITLE ROW ═══ */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="min-w-0 flex-1 basis-48">
            <h1 className="text-[22px] sm:text-[30px] font-bold tracking-tight text-stone-900 leading-tight break-words">{title}</h1>
            {subtitle && <p className="text-[13px] text-stone-500 mt-1 break-words">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto [&>a]:w-full sm:[&>a]:w-auto">{actions}</div>}
        </div>

        {/* ═══ CONTENT ═══ */}
        {children}

        <p className="text-center text-[11px] text-stone-400 pb-4 pt-6">
          Synchronisé en temps réel • {user?.prenom} {user?.nom}
        </p>
      </div>
    </div>
  );
}
