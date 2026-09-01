'use client';
import { useState, FormEvent, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, Eye, EyeOff, Loader2, Package, ArrowRight } from 'lucide-react';

function useCityscape(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0;
    function resize() { if (!canvas) return; w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);

    interface Tower { x: number; baseW: number; targetH: number; currentH: number; delay: number; color: string; windowColor: string; }
    function makeTowers(): Tower[] {
      return [
        { rx: 0.1, bw: 0.025, th: 0.4, d: 0, c: '#1a1206', wc: '#cc8822' },
        { rx: 0.25, bw: 0.02, th: 0.55, d: 0.3, c: '#1c1408', wc: '#dd9933' },
        { rx: 0.4, bw: 0.03, th: 0.35, d: 0.6, c: '#181008', wc: '#bb7722' },
        { rx: 0.55, bw: 0.022, th: 0.65, d: 0.15, c: '#1a1208', wc: '#cc9933' },
        { rx: 0.7, bw: 0.028, th: 0.45, d: 0.45, c: '#1c1406', wc: '#dd8822' },
        { rx: 0.85, bw: 0.02, th: 0.3, d: 0.7, c: '#18100a', wc: '#bb8833' },
      ].map(c => ({ x: c.rx * w, baseW: c.bw * w, targetH: c.th * h, currentH: 0, delay: c.d, color: c.c, windowColor: c.wc }));
    }

    let towers = makeTowers();
    const startTime = performance.now();

    function drawFrame() {
      if (!ctx || !canvas) return;
      animRef.current = requestAnimationFrame(drawFrame);
      const t = (performance.now() - startTime) / 1000;
      ctx.clearRect(0, 0, w, h);

      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0c0804'); sky.addColorStop(0.5, '#100c06'); sky.addColorStop(1, '#080604');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

      const groundY = h * 0.72;
      const ground = ctx.createLinearGradient(0, groundY - 40, 0, h);
      ground.addColorStop(0, '#0e0a04'); ground.addColorStop(1, '#060404');
      ctx.fillStyle = ground; ctx.fillRect(0, groundY - 40, w, h - groundY + 40);

      ctx.fillStyle = '#0c0a06';
      ctx.beginPath(); ctx.moveTo(0, groundY - 20);
      for (let mx = 0; mx <= w; mx += 3) {
        const mh = Math.sin(mx * 0.003) * 30 + Math.sin(mx * 0.007) * 15;
        ctx.lineTo(mx, groundY - 20 - mh);
      }
      ctx.lineTo(w, groundY - 20); ctx.closePath(); ctx.fill();

      towers.forEach((tower, i) => {
        tower.x = tower.rx * w; tower.baseW = tower.bw * w; tower.targetH = tower.th * h;
        if (t > tower.delay && tower.currentH < tower.targetH) tower.currentH = Math.min(tower.currentH + tower.targetH * 0.008, tower.targetH);
        const th = tower.currentH; if (th <= 0) return;
        const tx = tower.x, bw = tower.baseW, ty = groundY - th;
        ctx.fillStyle = tower.color; ctx.fillRect(tx - bw / 2, ty, bw, th);
        const wc = Math.floor(th / 20);
        ctx.strokeStyle = tower.windowColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
        for (let wi = 1; wi <= wc; wi++) {
          const wy = ty + (wi / (wc + 1)) * th;
          ctx.beginPath(); ctx.moveTo(tx - bw / 2 + 2, wy); ctx.lineTo(tx + bw / 2 - 2, wy); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });

      const scanY = ((t * 30) % h);
      ctx.fillStyle = 'rgba(204,136,34,0.02)'; ctx.fillRect(0, scanY, w, 2);
    }

    function onResize() { resize(); towers = makeTowers(); }
    window.addEventListener('resize', onResize);
    drawFrame();
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('resize', onResize); cancelAnimationFrame(animRef.current); };
  }, [canvasRef]);
}

export default function MagasinierLoginPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [afficherMdp, setAfficherMdp] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  useCityscape(canvasRef);

  const handleConnexion = async (e: FormEvent) => {
    e.preventDefault();
    setErreur('');
    setChargement(true);
    try {
      const res = await fetch('/api/magasinier/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant, motDePasse }),
      });
      const data = await res.json();
      if (!res.ok) { setErreur(data.erreur || 'Erreur de connexion.'); setChargement(false); return; }
      localStorage.setItem('rmasc_magasinier_token', data.token);
      localStorage.setItem('rmasc_magasinier_user', JSON.stringify(data.user));
      router.push('/magasinier/dashboard');
    } catch {
      setErreur('Impossible de contacter le serveur.');
      setChargement(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden" style={{ background: '#080604' }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ display: 'block' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 65% 50%, rgba(8,6,4,0.2) 0%, rgba(8,6,4,0.7) 100%)' }} />

      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row items-center justify-center p-4 md:p-8 gap-8 lg:gap-16">
        <div className="hidden lg:flex flex-col justify-center w-full max-w-lg">
          <div className="flex items-center gap-3 mb-14">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #cc8822 0%, #aa6611 100%)', boxShadow: '0 4px 30px rgba(204,136,34,0.5)' }}>
              <Package size={26} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-xl tracking-tight">RMASC Magasin</p>
              <p className="text-[10px] text-white/25 tracking-[0.25em] uppercase mt-0.5">Gestion Équipements</p>
            </div>
          </div>
          <div className="mb-12">
            <h1 className="text-5xl xl:text-6xl font-black text-white leading-[0.92] mb-6" style={{ letterSpacing: '-0.03em' }}>
              EQUIPMENT<br />
              <span style={{ background: 'linear-gradient(135deg, #ffaa44 0%, #cc8822 50%, #ffcc66 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                LOGISTICS.
              </span>
            </h1>
            <p className="text-white/35 text-base font-medium leading-relaxed max-w-sm">
              Préparez et expédiez les équipements aux équipes sur site en temps réel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { icon: '📦', label: 'Préparation' },
              { icon: '🚚', label: 'Expédition' },
              { icon: '📋', label: 'Suivi' },
              { icon: '⚡', label: 'Temps Réel' },
            ].map(f => (
              <span key={f.label} className="flex items-center gap-1.5 text-xs text-white/40 border border-white/[0.06] rounded-full px-3.5 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="text-sm">{f.icon}</span> {f.label}
              </span>
            ))}
          </div>
        </div>

        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #cc8822, #aa6611)', boxShadow: '0 4px 24px rgba(204,136,34,0.4)' }}>
              <Package size={22} className="text-white" />
            </div>
            <p className="text-white font-bold text-lg">RMASC Magasin</p>
          </div>

          <div className="rounded-3xl p-8 md:p-10" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(40px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
            <div className="mb-8">
              <h2 className="text-white font-bold text-2xl tracking-tight mb-1">Espace Magasinier</h2>
              <p className="text-white/35 text-sm">Connectez-vous pour gérer les équipements</p>
            </div>

            {erreur && (
              <div className="mb-5 rounded-xl px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                {erreur}
              </div>
            )}

            <form onSubmit={handleConnexion} className="space-y-5">
              <div>
                <label className="block text-[11px] text-white/30 font-semibold mb-2 uppercase tracking-[0.15em]">Identifiant</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><User size={16} className="text-white/25" /></div>
                  <input type="text" value={identifiant} onChange={e => setIdentifiant(e.target.value)} placeholder="Votre identifiant" required
                    className="w-full rounded-xl pl-11 pr-4 py-3.5 text-sm font-medium text-white placeholder-white/20 outline-none transition-all focus:ring-2 focus:ring-amber-500/40"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-white/30 font-semibold mb-2 uppercase tracking-[0.15em]">Mot de passe</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock size={16} className="text-white/25" /></div>
                  <input type={afficherMdp ? 'text' : 'password'} value={motDePasse} onChange={e => setMotDePasse(e.target.value)} placeholder="••••••••" required
                    className="w-full rounded-xl pl-11 pr-12 py-3.5 text-sm font-medium text-white placeholder-white/20 outline-none transition-all focus:ring-2 focus:ring-amber-500/40"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }} />
                  <button type="button" onClick={() => setAfficherMdp(!afficherMdp)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/25 hover:text-white/50 transition-colors">
                    {afficherMdp ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={chargement}
                className="w-full text-white font-bold py-3.5 rounded-xl uppercase tracking-wider text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #cc8822 0%, #aa6611 100%)', boxShadow: '0 4px 24px rgba(204,136,34,0.35), inset 0 1px 0 rgba(255,255,255,0.12)' }}>
                {chargement ? <><Loader2 size={18} className="animate-spin" /> Connexion...</> : <>Connexion <ArrowRight size={16} /></>}
              </button>
            </form>

            <div className="mt-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <span className="text-[10px] text-white/25 uppercase tracking-[0.2em] whitespace-nowrap font-medium">Demo</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>
              <div className="flex justify-center gap-2">
                <button type="button" onClick={() => setIdentifiant('magasinier1')}
                  className="font-semibold rounded-lg px-3.5 py-1.5 text-xs transition-all hover:scale-105"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                  Magasinier
                </button>
              </div>
              <p className="text-[11px] text-white/15 text-center mt-6 font-medium">RMASC Factory — SARL au capital de 100.000 DA</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
