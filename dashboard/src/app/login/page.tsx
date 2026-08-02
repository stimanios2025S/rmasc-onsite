'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, Eye, EyeOff, Loader2, HardHat, ArrowRight, ChevronRight } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative overflow-hidden bg-slate-950">
      {/* ═══ INDUSTRIAL BACKGROUND ═══════════════════════════════════ */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950" />
      {/* Architectural grid lines */}
      <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="archgrid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#ffffff" strokeWidth="0.5" />
          </pattern>
          <pattern id="archdots" width="15" height="15" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#8b9cf5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#archgrid)" />
        <rect width="100%" height="100%" fill="url(#archdots)" />
      </svg>
      {/* Glow orbs */}
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-purple-500/10 blur-3xl" />

      {/* ═══ MAIN FRAME ═════════════════════════════════════════════ */}
      <div className="relative z-10 w-full max-w-5xl min-h-[600px] rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-white/10">
        {/* ═══ LEFT: HERO BRAND (7 cols) ════════════════════════════ */}
        <div className="lg:col-span-7 relative bg-cover bg-center p-8 md:p-12 flex flex-col justify-between bg-gradient-to-br from-blue-950/95 via-indigo-950/90 to-slate-950/95">
          {/* Blueprint texture overlay */}
          <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] bg-[length:24px_24px]" />

          {/* Brand logo */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <HardHat size={24} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-none">RMASC OnSite</p>
              <p className="text-[10px] text-white/40 tracking-widest uppercase mt-1">Command Center</p>
            </div>
          </div>

          {/* Center hero content */}
          <div className="relative z-10 py-8">
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-none mb-4">
              ELEVATING<br />EXCELLENCE.
            </h1>
            <p className="text-white/60 font-medium mb-3">
              Where Precision Engineering Meets Real-Time Field Execution.
            </p>
            <p className="text-white/40 text-sm max-w-md leading-relaxed">
              Seamlessly connect factory production, engineering CAD drawings, and field teams across 15 specialized units.
            </p>

            {/* Mini feature chips */}
            <div className="flex flex-wrap gap-2 mt-8">
              {['15 Équipes', 'GPS Géofencing', 'Checklists Phases', 'Approbations ERP'].map(f => (
                <span key={f} className="text-[10px] text-white/50 bg-white/5 border border-white/10 rounded-full px-3 py-1 tracking-wide">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom stats */}
          <div className="relative z-10 flex items-center gap-6 text-white/30 text-[10px] tracking-widest uppercase">
            <span>Mécanique</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Électrique</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Vérification</span>
          </div>
        </div>

        {/* ═══ RIGHT: FROSTED LOGIN CARD (5 cols) ═══════════════════ */}
        <div className="lg:col-span-5 backdrop-blur-xl bg-white/10 border-l border-white/10 p-8 md:p-10 flex flex-col justify-center shadow-xl">
          <div className="mb-8 lg:hidden flex items-center gap-3 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <HardHat size={22} className="text-white" />
            </div>
            <p className="text-white font-bold text-lg">RMASC OnSite</p>
          </div>

          <h2 className="text-white font-bold text-xl mb-1">Welcome back</h2>
          <p className="text-white/50 text-sm mb-8">Sign in to access your workspace</p>

          {/* Error */}
          {erreur && (
            <div className="mb-5 bg-rose-500/15 border border-rose-400/20 rounded-xl px-4 py-3 text-xs text-rose-200 font-medium">
              {erreur}
            </div>
          )}

          <form onSubmit={handleConnexion} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-xs text-white/50 font-medium mb-2 uppercase tracking-wider">My Account</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User size={17} className="text-slate-400" />
                </div>
                <input
                  type="text"
                  value={identifiant}
                  onChange={e => setIdentifiant(e.target.value)}
                  placeholder="Enter your login"
                  required
                  className="w-full bg-white text-slate-900 rounded-xl pl-11 pr-4 py-3 shadow-inner placeholder-slate-400 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={17} className="text-slate-400" />
                </div>
                <input
                  type={afficherMdp ? 'text' : 'password'}
                  value={motDePasse}
                  onChange={e => setMotDePasse(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full bg-white text-slate-900 rounded-xl pl-11 pr-12 py-3 shadow-inner placeholder-slate-400 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setAfficherMdp(!afficherMdp)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {afficherMdp ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Forgot */}
            <div className="flex justify-end">
              <button type="button" className="text-xs text-white/80 hover:text-white hover:underline">
                Forgot password?
              </button>
            </div>

            {/* Sign in */}
            <button
              type="submit"
              disabled={chargement}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl uppercase tracking-wider shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-500/30 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {chargement ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          {/* ─── QUICK DEMO ACCESS ────────────────────────────────── */}
          <div className="mt-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] text-white/40 uppercase tracking-widest whitespace-nowrap">Quick Demo Login</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

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
                  className="bg-white/30 hover:bg-white text-white hover:text-slate-900 font-medium rounded-lg px-3 py-1.5 text-xs transition-all backdrop-blur-sm border border-white/20"
                >
                  {a.label}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-white/70 text-center mt-5">
              RMASC Factory — SARL au capital de 100.000 DA
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
