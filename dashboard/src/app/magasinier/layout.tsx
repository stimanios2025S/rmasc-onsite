'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Package, LogOut, HardHat, Menu, X,
} from 'lucide-react';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/magasinier/dashboard' },
  { icon: Package, label: 'Chantiers', href: '/magasinier/chantiers' },
];

export default function MagasinierLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('rmasc_magasinier_token');
    const raw = localStorage.getItem('rmasc_magasinier_user');
    if (!token || !raw) {
      router.push('/magasinier/login');
      return;
    }
    try { setUser(JSON.parse(raw)); } catch { router.push('/magasinier/login'); return; }
    setReady(true);
  }, [router]);

  if (!ready) return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-stone-100 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Hide sidebar on login page
  if (pathname === '/magasinier/login') return <>{children}</>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-stone-100 flex">
      {/* Mobile toggle */}
      <button onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-xl bg-white/80 backdrop-blur-md border border-stone-100 shadow-sm flex items-center justify-center text-stone-500">
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/20 z-30" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white/80 backdrop-blur-xl border-r border-white/40 p-5 flex flex-col transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shrink-0">
            <Package size={20} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-stone-800">RMASC Magasin</p>
            <p className="text-[10px] text-stone-400">Gestion Équipements</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <button key={item.href}
                onClick={() => { router.push(item.href); setMobileOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'bg-gradient-to-r from-amber-100/80 to-orange-100/80 text-stone-800 shadow-sm' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'}`}>
                <item.icon size={18} /> {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-stone-100 pt-4">
          <div className="flex items-center gap-3 px-4 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
              {user?.prenom?.[0]}{user?.nom?.[0] || 'M'}
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-700">{user?.prenom} {user?.nom}</p>
              <p className="text-[10px] text-stone-400">Magasinier</p>
            </div>
          </div>
          <button onClick={() => { localStorage.removeItem('rmasc_magasinier_token'); localStorage.removeItem('rmasc_magasinier_user'); router.push('/magasinier/login'); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all">
            <LogOut size={18} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen lg:ml-0">
        <div className="max-w-7xl mx-auto p-4 lg:p-6 pt-16 lg:pt-6">
          {children}
        </div>
      </main>
    </div>
  );
}
