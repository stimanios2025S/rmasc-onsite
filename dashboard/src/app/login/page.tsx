'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { HardHat, Eye, EyeOff, Loader2, Building2,ArrowRight, CheckCircle2 } from 'lucide-react';

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
      router.push('/');
    } catch {
      setErreur('Impossible de contacter le serveur.');
      setChargement(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F4F6FB]">
      {/* ─── PANEL GAUCHE - Branding ─────────────────────────────────── */}
      <div className="lg:w-1/2 bg-gradient-to-br from-[#2E3C9E] via-[#3B4BB9] to-[#4A5AC8] relative overflow-hidden flex flex-col justify-center items-center p-8 lg:p-12 min-h-[300px] lg:min-h-screen">
        {/* Cercles décoratifs */}
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute top-1/3 right-1/4 w-32 h-32 rounded-full bg-white/5" />

        <div className="relative z-10 text-center lg:text-left max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3 justify-center lg:justify-start mb-8">
            <div className="w-14 h-14 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <HardHat size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">RMASC</h1>
              <p className="text-sm text-white/70">OnSite</p>
            </div>
          </div>

          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
            Plateforme de gestion<br />des opérations de terrain
          </h2>
          <p className="text-white/70 text-sm lg:text-base leading-relaxed mb-8">
            Gérez vos chantiers, suivez vos équipes en temps réel,
            et pilotez l&apos;installation des ascenseurs de la
            fabrication à la réception.
          </p>

          {/* Fonctionnalités */}
          <div className="hidden lg:block space-y-3">
            {[
              'Pointage GPS avec géofencing',
              'Gestion des phases chantier',
              'Alertes et blocages en temps réel',
              'Dashboard direction',
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-white/80 text-sm">
                <CheckCircle2 size={16} className="text-[#20C997]" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer branding */}
        <div className="absolute bottom-6 left-0 right-0 text-center">
          <p className="text-white/30 text-xs">RMASC Factory — SARL au capital de 100.000 DA</p>
        </div>
      </div>

      {/* ─── PANEL DROIT - Formulaire ────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8 lg:hidden">
            <div className="w-16 h-16 bg-gradient-to-br from-[#2E3C9E] to-[#3B4BB9] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <HardHat size={36} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-[#1E2235]">RMASC OnSite</h2>
            <p className="text-sm text-[#6B7294] mt-1">Connectez-vous à votre espace</p>
          </div>

          <div className="hidden lg:block mb-8">
            <h2 className="text-2xl font-bold text-[#1E2235]">Bon retour !</h2>
            <p className="text-sm text-[#6B7294] mt-1">Connectez-vous à votre espace de travail</p>
          </div>

          {/* Message d'erreur */}
          {erreur && (
            <div className="mb-4 bg-[#FFE5E5] border border-[#FF5252]/20 rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 bg-[#FF5252]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#FF5252]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-sm text-[#FF5252] font-medium">{erreur}</p>
            </div>
          )}

          <form onSubmit={handleConnexion} className="space-y-5">
            {/* Identifiant */}
            <div>
              <label className="block text-sm font-semibold text-[#1E2235] mb-1.5">Identifiant</label>
              <div className="relative">
                <input
                  type="text"
                  value={identifiant}
                  onChange={e => setIdentifiant(e.target.value)}
                  placeholder="Votre identifiant"
                  required
                  className="w-full px-4 py-3 bg-white border border-[#E5E8F0] rounded-xl text-sm text-[#1E2235] placeholder:text-[#A8AEC5] outline-none focus:border-[#3B4BB9] focus:ring-2 focus:ring-[#3B4BB9]/10 transition-all"
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-[#1E2235]">Mot de passe</label>
                <button type="button" className="text-xs text-[#3B4BB9] font-medium hover:underline">
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <input
                  type={afficherMdp ? 'text' : 'password'}
                  value={motDePasse}
                  onChange={e => setMotDePasse(e.target.value)}
                  placeholder="Votre mot de passe"
                  required
                  className="w-full px-4 py-3 bg-white border border-[#E5E8F0] rounded-xl text-sm text-[#1E2235] placeholder:text-[#A8AEC5] outline-none focus:border-[#3B4BB9] focus:ring-2 focus:ring-[#3B4BB9]/10 transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setAfficherMdp(!afficherMdp)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A8AEC5] hover:text-[#6B7294]"
                >
                  {afficherMdp ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Bouton */}
            <button
              type="submit"
              disabled={chargement}
              className="w-full bg-gradient-to-r from-[#2E3C9E] to-[#3B4BB9] text-white font-semibold py-3 px-6 rounded-xl hover:from-[#3B4BB9] hover:to-[#4A5AC8] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-[#3B4BB9]/20"
            >
              {chargement ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Accès rapides */}
          <div className="mt-8 pt-6 border-t border-[#E5E8F0]">
            <p className="text-xs text-[#A8AEC5] text-center mb-3">Accès rapide — Démo</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'admin', label: 'Administrateur' },
                { id: 'dispatcher', label: 'Dispatcher' },
                { id: 'jdupont', label: 'Technicien' },
                { id: 'plefevre', label: 'Ingénieur' },
              ].map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setIdentifiant(a.id)}
                  className="text-xs text-[#6B7294] bg-[#F4F6FB] hover:bg-[#E8EAFA] rounded-lg py-2 px-3 transition-colors text-center"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
