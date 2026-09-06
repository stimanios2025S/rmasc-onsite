'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { estConnecte, getUtilisateur } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!estConnecte()) {
      router.push('/login');
      return;
    }
    const user = getUtilisateur();
    if (user?.role === 'technicien' || user?.role === 'ingenieur') {
      router.push('/mission/active');
      return;
    }
    setChecking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#e4e6ec] flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-stone-500" />
      </div>
    );
  }

  // Plain wrapper — each page owns its own shell/header (AdminShell or custom for /dashboard)
  return <>{children}</>;
}
