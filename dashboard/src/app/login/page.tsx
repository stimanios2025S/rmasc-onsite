'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [afficherMdp, setAfficherMdp] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [actif, setActif] = useState(true);

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
      router.push('/');
    } catch {
      setErreur('Impossible de contacter le serveur.');
      setChargement(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#B8E1E0] relative overflow-hidden p-4">
      {/* ═══════════════════════════════════════════════════════════════
          GEOMETRIC BACKGROUND LAYERS
          ═══════════════════════════════════════════════════════════════ */}
      {/* Diagonal crimson stripe top-right */}
      <div
        className="absolute -top-20 -right-20 w-[60%] h-[45%] rotate-[8deg] opacity-90"
        style={{ background: 'linear-gradient(180deg, #FF5252 0%, #FF7575 100%)' }}
      />
      {/* Diagonal navy stripe middle */}
      <div
        className="absolute top-[30%] -right-10 w-[55%] h-[40%] rotate-[-6deg] opacity-95"
        style={{ background: 'linear-gradient(180deg, #1E2235 0%, #2A2F45 100%)' }}
      />
      {/* Diagonal mint stripe bottom */}
      <div
        className="absolute -bottom-24 -left-10 w-[50%] h-[40%] rotate-[5deg] opacity-90"
        style={{ background: 'linear-gradient(180deg, #20C997 0%, #38D9A9 100%)' }}
      />
      {/* Small navy accent top-left */}
      <div
        className="absolute top-[15%] -left-12 w-[30%] h-[18%] rotate-[-10deg] opacity-60"
        style={{ background: '#1E2235' }}
      />
      {/* Small crimson accent bottom-right */}
      <div
        className="absolute bottom-[5%] -right-16 w-[25%] h-[15%] rotate-[12deg] opacity-70"
        style={{ background: '#FF5252' }}
      />

      {/* ═══════════════════════════════════════════════════════════════
          LOGIN CARD
          ═══════════════════════════════════════════════════════════════ */}
      <div className="relative z-10 w-full max-w-[420px]">
        {/* ─── CARD ───────────────────────────────────────────────────── */}
        <div className="relative bg-white rounded-3xl shadow-2xl overflow-visible">
          {/* ─── NAVY HEADER ──────────────────────────────────────────── */}
          <div className="relative bg-[#1E2235] rounded-t-3xl px-8 pt-10 pb-8 text-center overflow-hidden">
            {/* Accent shape at bottom of header */}
            <div
              className="absolute bottom-0 left-0 right-0 h-8 -mb-1"
              style={{
                clipPath: 'polygon(0% 100%, 12% 0%, 88% 0%, 100% 100%)',
                background: 'linear-gradient(90deg, #FF5252 0%, #20C997 100%)',
              }}
            />
            <h1 className="text-2xl font-bold text-white tracking-tight mb-1">
              RMASC OnSite
            </h1>
            <p className="text-white/60 text-sm font-medium tracking-wide">
              My Account
            </p>
          </div>

          {/* ─── AVATAR BADGE (centered on the border) ────────────────── */}
          <div className="absolute left-1/2 -translate-x-1/2 top-[calc(theme(spacing.pt-10)+theme(spacing.pb-8))] -translate-y-1/2 z-20">
            <div className="w-16 h-16 rounded-full bg-[#1E2235] border-4 border-white flex items-center justify-center shadow-lg">
              <User size={28} className="text-white" />
            </div>
          </div>

          {/* ─── FORM BODY ────────────────────────────────────────────── */}
          <div className="px-8 pt-12 pb-8">
            {/* Error message */}
            {erreur && (
              <div className="mb-5 bg-[#FFE5E5] border border-[#FF5252]/20 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-7 h-7 bg-[#FF5252]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-[#FF5252]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-xs text-[#FF5252] font-medium">{erreur}</p>
              </div>
            )}

            <form onSubmit={handleConnexion} className="space-y-6">
              {/* ─── LOGIN FIELD ──────────────────────────────────────── */}
              <div className="flex items-center border-b border-[#E0E4EA] pb-3 focus-within:border-[#1E2235] transition-colors">
                <User size={18} className="text-[#8895A7] mr-3 flex-shrink-0" />
                <input
                  type="text"
                  value={identifiant}
                  onChange={e => setIdentifiant(e.target.value)}
                  placeholder="Login"
                  required
                  className="flex-1 bg-transparent text-[#1E2235] text-sm placeholder-[#A8B2C1] outline-none"
                />
                {/* Toggle switch */}
                <button
                  type="button"
                  onClick={() => setActif(!actif)}
                  className={`relative ml-2 w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${
                    actif ? 'bg-[#20C997]' : 'bg-[#D1D5DB]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                      actif ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* ─── PASSWORD FIELD ───────────────────────────────────── */}
              <div>
                <div className="flex items-center border-b border-[#E0E4EA] pb-3 focus-within:border-[#1E2235] transition-colors">
                  <Lock size={18} className="text-[#8895A7] mr-3 flex-shrink-0" />
                  <input
                    type={afficherMdp ? 'text' : 'password'}
                    value={motDePasse}
                    onChange={e => setMotDePasse(e.target.value)}
                    placeholder="Password"
                    required
                    className="flex-1 bg-transparent text-[#1E2235] text-sm placeholder-[#A8B2C1] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setAfficherMdp(!afficherMdp)}
                    className="ml-2 text-[#A8B2C1] hover:text-[#6B7294] flex-shrink-0"
                  >
                    {afficherMdp ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-right mt-1.5">
                  <button type="button" className="text-[11px] text-[#A8B2C1] hover:text-[#6B7294] transition-colors">
                    Forgot password ?
                  </button>
                </p>
              </div>

              {/* ─── SIGN IN BUTTON ───────────────────────────────────── */}
              <button
                type="submit"
                disabled={chargement}
                className="w-full bg-[#FF5252] hover:bg-[#E04848] text-white font-semibold py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-[#FF5252]/25 mt-2"
              >
                {chargement ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            {/* ─── DEMO QUICK ACCESS ──────────────────────────────────── */}
            <div className="mt-8 pt-6 border-t border-[#E5E8F0]">
              <p className="text-[10px] text-[#A8B2C1] text-center mb-3 uppercase tracking-wider font-semibold">
                Demo Access
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'admin', label: 'Admin' },
                  { id: 'dispatcher', label: 'Dispatch' },
                  { id: 'jdupont', label: 'Tech' },
                  { id: 'plefevre', label: 'Eng' },
                ].map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setIdentifiant(a.id)}
                    className="text-[10px] font-medium text-[#6B7294] bg-[#F4F6FB] hover:bg-[#E8EAFA] rounded-lg py-2 transition-colors"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MOBILE ADJUSTMENTS
          ═══════════════════════════════════════════════════════════════ */}
      <style jsx>{`
        @media (max-width: 480px) {
          .max-w-\\\[420px\\\] {
            max-width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
