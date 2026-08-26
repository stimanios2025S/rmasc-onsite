'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { estConnecte, getUtilisateur } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
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
    // Redirect technicians to mobile portal
    if (user?.role === 'technicien' || user?.role === 'ingenieur') {
      router.push('/mission/active');
      return;
    }
    setChecking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FFF5EC] via-[#FDE8DF] to-[#F3E8FF] flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF5EC] via-[#FDE8DF] to-[#F3E8FF] flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
