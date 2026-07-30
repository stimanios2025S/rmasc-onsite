'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { estConnecte, getUtilisateur } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

export default function MissionLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!estConnecte()) {
      router.push('/login');
      return;
    }
    const user = getUtilisateur();
    // Admins should use dashboard, not mission portal
    if (user?.role === 'administrateur' || user?.role === 'dispatcher') {
      router.push('/dashboard');
      return;
    }
    setChecking(false);
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return <>{children}</>;
}
