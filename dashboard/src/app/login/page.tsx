'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, Eye, EyeOff, Loader2, ArrowRight, HardHat } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [afficherMdp, setAfficherMdp] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  const handleConnexion = async (e: FormEvent) => {
    e.preventDefault();
    setErreur('');
    setChargement(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant, motDePasse }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.erreur || 'Erreur de connexion.');
        setChargement(false);
        return;
      }
      localStorage.setItem('rmasc_token', data.token);
      localStorage.setItem('rmasc_user', JSON.stringify(data.user));
      // Route based on role
      if (data.user.role === 'administrateur' || data.user.role === 'dispatcher') {
        router.push('/dashboard');
      } else {
        router.push('/mission/active');
      }
    } catch {
      setErreur('Impossible de contacter le serveur.');
      setChargement(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#FFF5EC] via-[#FDE8DF] to-[#F3E8FF] p-4">
      {/* ═══ TECH GRID BACKGROUND ═══════════════════════════════════ */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-blue-500" />
          </pattern>
          <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="currentColor" className="text-purple-400" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Glowing orbs */}
      <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-400/10 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-purple-400/10 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-400/5 blur-3xl" />

      {/* ═══ LOGIN CARD ════════════════════════════════════════════ */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/40 backdrop-blur-xl border border-white/20 rounded-3xl p-10 shadow-2xl shadow-indigo-500/5">
          {/* ─── HEADER ──────────────────────────────────────────── */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/20">
              <HardHat size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 leading-tight">
              RMASC OnSite
            </h1>
            <p className="text-sm text-stone-400 font-medium mt-2 tracking-wide">Command Center</p>
          </div>

          {/* ─── ERROR ────────────────────────────────────────────── */}
          {erreur && (
            <div className="mb-6 bg-rose-50/80 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-3 backdrop-blur-sm">
              <div className="w-7 h-7 bg-rose-100 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xs text-rose-600 font-medium">{erreur}</p>
            </div>
          )}

          {/* ─── FORM ─────────────────────────────────────────────── */}
          <form onSubmit={handleConnexion} className="space-y-7">
            {/* Login */}
            <div>
              <label className="block text-xs font-semibold text-stone-400 mb-2 uppercase tracking-wider">
                My Account
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User size={18} className="text-stone-300 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="text"
                  value={identifiant}
                  onChange={e => setIdentifiant(e.target.value)}
                  placeholder="Login"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-transparent border-b border-stone-200 text-sm text-stone-700 placeholder:text-stone-300 outline-none transition-all focus:border-blue-600 focus:shadow-[0_1px_0_0_rgba(37,99,235,0.3)]"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="group relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={18} className="text-stone-300 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type={afficherMdp ? 'text' : 'password'}
                  value={motDePasse}
                  onChange={e => setMotDePasse(e.target.value)}
                  placeholder="Password"
                  required
                  className="w-full pl-11 pr-12 py-3 bg-transparent border-b border-stone-200 text-sm text-stone-700 placeholder:text-stone-300 outline-none transition-all focus:border-blue-600 focus:shadow-[0_1px_0_0_rgba(37,99,235,0.3)]"
                />
                <button
                  type="button"
                  onClick={() => setAfficherMdp(!afficherMdp)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-stone-300 hover:text-stone-500 transition-colors"
                >
                  {afficherMdp ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="flex justify-end">
              <button type="button" className="text-xs text-stone-400 hover:text-stone-600 hover:underline transition-colors">
                Forgot password ?
              </button>
            </div>

            {/* Sign In button */}
            <button
              type="submit"
              disabled={chargement}
              className="w-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-semibold py-3.5 px-6 flex items-center justify-center gap-3 hover:scale-[1.02] hover:shadow-xl hover:shadow-indigo-500/25 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {chargement ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* ─── DEMO ACCESS ──────────────────────────────────────── */}
          <div className="mt-8 pt-6 border-t border-stone-200/50">
            <p className="text-[10px] font-semibold text-stone-300 uppercase tracking-widest text-center mb-4">
              Demo Access
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {[
                { id: 'elghani', label: 'Admin' },
                { id: 'meca1', label: 'Méca' },
                { id: 'elec1', label: 'Élec' },
                { id: 'verif1', label: 'Vérif' },
              ].map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setIdentifiant(a.id)}
                  className="text-xs font-medium text-stone-400 bg-white/30 border border-white/30 rounded-full px-4 py-1.5 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all duration-200"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-stone-300 mt-6">
          RMASC Factory — SARL au capital de 100.000 DA
        </p>
      </div>
    </div>
  );
}
