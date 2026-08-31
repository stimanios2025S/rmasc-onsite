'use client';
import { useState, FormEvent, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, Eye, EyeOff, Loader2, HardHat, ArrowRight } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   CANVAS 2D PROCEDURAL CITYSCAPE — Construction Towers Rising from Terrain
   Zero dependencies — pure Canvas 2D — inspired by ThreeUI TowerLandscape
   ═══════════════════════════════════════════════════════════════════════════ */

function useCityscape(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0;
    function resize() {
      if (!canvas) return;
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // ── Tower configs ──
    interface Tower {
      x: number; baseW: number; targetH: number;
      currentH: number; delay: number; color: string;
      windowColor: string; elevatorColor: string;
      rx: number; bw: number; th: number;
    }

    function makeTowers(): Tower[] {
      const configs = [
        { rx: 0.08, bw: 0.025, th: 0.42, d: 0, c: '#0f2240', wc: '#2266cc', ec: '#3388ee' },
        { rx: 0.18, bw: 0.02, th: 0.55, d: 0.3, c: '#112844', wc: '#2277dd', ec: '#4499ff' },
        { rx: 0.28, bw: 0.03, th: 0.3, d: 0.6, c: '#0d1e38', wc: '#1a5599', ec: '#2266bb' },
        { rx: 0.38, bw: 0.018, th: 0.68, d: 0.15, c: '#0e2040', wc: '#3388cc', ec: '#55aaff' },
        { rx: 0.5, bw: 0.022, th: 0.45, d: 0.45, c: '#10243e', wc: '#2266aa', ec: '#3377cc' },
        { rx: 0.62, bw: 0.032, th: 0.35, d: 0.7, c: '#0c1a30', wc: '#1a4488', ec: '#225599' },
        { rx: 0.72, bw: 0.019, th: 0.25, d: 0.9, c: '#0f2240', wc: '#2266bb', ec: '#4488dd' },
        { rx: 0.82, bw: 0.028, th: 0.5, d: 0.2, c: '#0e1e38', wc: '#225599', ec: '#3366aa' },
        { rx: 0.92, bw: 0.02, th: 0.38, d: 0.55, c: '#112240', wc: '#1a5588', ec: '#226699' },
        { rx: 0.45, bw: 0.035, th: 0.6, d: 0.8, c: '#0d1c35', wc: '#2266bb', ec: '#4488cc' },
      ];
      return configs.map(c => ({
        x: c.rx * w,
        baseW: c.bw * w,
        targetH: c.th * h,
        currentH: 0,
        delay: c.d,
        color: c.c,
        windowColor: c.wc,
        elevatorColor: c.ec,
        rx: c.rx,
        bw: c.bw,
        th: c.th,
      }));
    }

    let towers = makeTowers();

    // ── Particles ──
    interface Particle { x: number; y: number; speed: number; size: number; opacity: number; }
    function makeParticles(): Particle[] {
      return Array.from({ length: 80 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.7 + h * 0.05,
        speed: 0.15 + Math.random() * 0.4,
        size: 1 + Math.random() * 2,
        opacity: 0.15 + Math.random() * 0.3,
      }));
    }

    let particles = makeParticles();

    const startTime = performance.now();

    function drawFrame() {
      if (!ctx || !canvas) return;
      animRef.current = requestAnimationFrame(drawFrame);
      const t = (performance.now() - startTime) / 1000;

      ctx.clearRect(0, 0, w, h);

      // ── Sky gradient ──
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#04040c');
      sky.addColorStop(0.3, '#080818');
      sky.addColorStop(0.6, '#0a0e1e');
      sky.addColorStop(1, '#06060f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // ── Stars ──
      ctx.fillStyle = 'rgba(100,140,200,0.3)';
      for (let i = 0; i < 60; i++) {
        const sx = ((i * 137.508) % w);
        const sy = ((i * 97.31) % (h * 0.5));
        const twinkle = 0.1 + Math.sin(t * 0.5 + i) * 0.2;
        ctx.globalAlpha = twinkle;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.8 + (i % 3) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Ground plane with perspective grid ──
      const groundY = h * 0.72;
      const ground = ctx.createLinearGradient(0, groundY - 40, 0, h);
      ground.addColorStop(0, '#0a1020');
      ground.addColorStop(0.3, '#080c18');
      ground.addColorStop(1, '#04040c');
      ctx.fillStyle = ground;
      ctx.fillRect(0, groundY - 40, w, h - groundY + 40);

      // Grid lines
      ctx.strokeStyle = 'rgba(30,50,80,0.25)';
      ctx.lineWidth = 0.5;
      // Horizontal
      for (let gy = groundY; gy < h; gy += 20) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }
      // Vertical (converging to vanishing point)
      const vpx = w * 0.5;
      const vpy = groundY - 60;
      for (let i = -15; i <= 15; i++) {
        ctx.beginPath();
        ctx.moveTo(vpx + i * 2, vpy);
        ctx.lineTo(vpx + i * 80, h);
        ctx.stroke();
      }

      // ── Ground glow ──
      const glowIntensity = 0.06 + Math.sin(t * 0.8) * 0.02;
      const glow = ctx.createRadialGradient(w * 0.5, groundY, 0, w * 0.5, groundY, w * 0.4);
      glow.addColorStop(0, `rgba(34,102,255,${glowIntensity})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, groundY - 100, w, 200);

      // ── Mountains silhouette ──
      ctx.fillStyle = '#060c16';
      ctx.beginPath();
      ctx.moveTo(0, groundY - 20);
      for (let mx = 0; mx <= w; mx += 3) {
        const mh = Math.sin(mx * 0.003) * 30 + Math.sin(mx * 0.007) * 15 + Math.cos(mx * 0.002) * 20;
        ctx.lineTo(mx, groundY - 20 - mh);
      }
      ctx.lineTo(w, groundY - 20);
      ctx.closePath();
      ctx.fill();

      // ── Towers ──
      towers.forEach((tower, i) => {
        // Reset position on resize
        tower.x = tower.rx * w;
        tower.baseW = tower.bw * w;
        tower.targetH = tower.th * h;

        // Grow animation
        if (t > tower.delay && tower.currentH < tower.targetH) {
          tower.currentH = Math.min(tower.currentH + tower.targetH * 0.008, tower.targetH);
        }

        const th = tower.currentH;
        if (th <= 0) return;

        const tx = tower.x;
        const bw = tower.baseW;
        const ty = groundY - th;

        // Tower body
        ctx.fillStyle = tower.color;
        ctx.fillRect(tx - bw / 2, ty, bw, th);

        // Subtle gradient overlay on body
        const bodyGrad = ctx.createLinearGradient(tx - bw / 2, ty, tx + bw / 2, ty);
        bodyGrad.addColorStop(0, 'rgba(255,255,255,0.04)');
        bodyGrad.addColorStop(0.5, 'transparent');
        bodyGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(tx - bw / 2, ty, bw, th);

        // Window lines (horizontal bands)
        const windowCount = Math.floor(th / 20);
        ctx.strokeStyle = tower.windowColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.35;
        for (let wi = 1; wi <= windowCount; wi++) {
          const wy = ty + (wi / (windowCount + 1)) * th;
          ctx.beginPath();
          ctx.moveTo(tx - bw / 2 + 2, wy);
          ctx.lineTo(tx + bw / 2 - 2, wy);
          ctx.stroke();

          // Window dots
          ctx.fillStyle = tower.windowColor;
          ctx.globalAlpha = 0.2 + Math.sin(t * 1.5 + i + wi) * 0.15;
          const dots = Math.max(2, Math.floor(bw / 6));
          for (let d = 0; d < dots; d++) {
            const dx = tx - bw / 2 + 3 + (d / (dots - 1)) * (bw - 6);
            ctx.beginPath();
            ctx.arc(dx, wy, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;

        // Elevator shaft (vertical glowing line)
        ctx.strokeStyle = tower.elevatorColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 + Math.sin(t * 2 + i) * 0.15;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx, ty + th);
        ctx.stroke();

        // Elevator car (moving dot on shaft)
        const elevY = ty + ((Math.sin(t * 0.8 + i * 2) + 1) / 2) * th;
        ctx.fillStyle = tower.elevatorColor;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(tx, elevY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Base glow ring
        const ringGrad = ctx.createRadialGradient(tx, groundY, 0, tx, groundY, bw);
        ringGrad.addColorStop(0, 'rgba(34,102,255,0.12)');
        ringGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = ringGrad;
        ctx.beginPath();
        ctx.ellipse(tx, groundY, bw * 1.5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── Floating particles ──
      particles.forEach(p => {
        p.y -= p.speed;
        p.x += Math.sin(t + p.y * 0.01) * 0.3;
        if (p.y < -10) {
          p.y = h * 0.75;
          p.x = Math.random() * w;
        }
        ctx.fillStyle = `rgba(68,136,204,${p.opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── Horizontal scan line effect (subtle) ──
      const scanY = ((t * 30) % h);
      ctx.fillStyle = 'rgba(34,102,255,0.02)';
      ctx.fillRect(0, scanY, w, 2);
    }

    // Handle resize
    function onResize() {
      resize();
      towers = makeTowers();
      particles = makeParticles();
    }
    window.addEventListener('resize', onResize);

    drawFrame();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animRef.current);
    };
  }, [canvasRef]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function LoginPage() {
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
    <div className="min-h-screen w-full relative overflow-hidden" style={{ background: '#06060f' }}>
      {/* ═══ CANVAS CITYSCAPE BACKGROUND ═══════════════════════════ */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Gradient overlay for card readability */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 65% 50%, rgba(6,6,15,0.2) 0%, rgba(6,6,15,0.7) 100%)',
      }} />

      {/* ═══ CONTENT OVERLAY ═══════════════════════════════════════ */}
      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row items-center justify-center p-4 md:p-8 gap-8 lg:gap-16">

        {/* ─── LEFT: Brand + Tagline (hidden on mobile) ─── */}
        <div className="hidden lg:flex flex-col justify-center w-full max-w-lg">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-14">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #2266ff 0%, #4488cc 100%)',
              boxShadow: '0 4px 30px rgba(34,102,255,0.5)',
            }}>
              <HardHat size={26} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-xl tracking-tight">RMASC OnSite</p>
              <p className="text-[10px] text-white/25 tracking-[0.25em] uppercase mt-0.5">Command Center</p>
            </div>
          </div>

          {/* Hero text */}
          <div className="mb-12">
            <h1 className="text-5xl xl:text-6xl font-black text-white leading-[0.92] mb-6" style={{ letterSpacing: '-0.03em' }}>
              ELEVATING<br />
              <span style={{
                background: 'linear-gradient(135deg, #4488ff 0%, #2266ff 50%, #88aaff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                EXCELLENCE.
              </span>
            </h1>
            <p className="text-white/35 text-base font-medium leading-relaxed max-w-sm">
              Where precision engineering meets real-time field execution across 15 specialized teams.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: '🏗️', label: '15 Équipes' },
              { icon: '📍', label: 'GPS Géofencing' },
              { icon: '✅', label: 'Checklists' },
              { icon: '⚡', label: 'Temps Réel' },
            ].map(f => (
              <span key={f.label} className="flex items-center gap-1.5 text-xs text-white/40 border border-white/[0.06] rounded-full px-3.5 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="text-sm">{f.icon}</span>
                {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* ─── RIGHT: Glass Login Card ─── */}
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #2266ff, #4488cc)',
              boxShadow: '0 4px 24px rgba(34,102,255,0.4)',
            }}>
              <HardHat size={22} className="text-white" />
            </div>
            <p className="text-white font-bold text-lg">RMASC OnSite</p>
          </div>

          {/* Glass card */}
          <div className="rounded-3xl p-8 md:p-10" style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            {/* Welcome */}
            <div className="mb-8">
              <h2 className="text-white font-bold text-2xl tracking-tight mb-1">Welcome back</h2>
              <p className="text-white/35 text-sm">Sign in to your command center</p>
            </div>

            {/* Error */}
            {erreur && (
              <div className="mb-5 rounded-xl px-4 py-3 text-sm font-medium" style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#fca5a5',
              }}>
                {erreur}
              </div>
            )}

            <form onSubmit={handleConnexion} className="space-y-5">
              {/* Username */}
              <div>
                <label className="block text-[11px] text-white/30 font-semibold mb-2 uppercase tracking-[0.15em]">Account</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User size={16} className="text-white/25" />
                  </div>
                  <input
                    type="text"
                    value={identifiant}
                    onChange={e => setIdentifiant(e.target.value)}
                    placeholder="Enter your login"
                    required
                    className="w-full rounded-xl pl-11 pr-4 py-3.5 text-sm font-medium text-white placeholder-white/20 outline-none transition-all focus:ring-2 focus:ring-blue-500/40"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] text-white/30 font-semibold mb-2 uppercase tracking-[0.15em]">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock size={16} className="text-white/25" />
                  </div>
                  <input
                    type={afficherMdp ? 'text' : 'password'}
                    value={motDePasse}
                    onChange={e => setMotDePasse(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="w-full rounded-xl pl-11 pr-12 py-3.5 text-sm font-medium text-white placeholder-white/20 outline-none transition-all focus:ring-2 focus:ring-blue-500/40"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setAfficherMdp(!afficherMdp)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/25 hover:text-white/50 transition-colors"
                  >
                    {afficherMdp ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Forgot */}
              <div className="flex justify-end">
                <button type="button" className="text-xs text-white/40 hover:text-white/70 transition-colors">
                  Forgot password?
                </button>
              </div>

              {/* Sign in button */}
              <button
                type="submit"
                disabled={chargement}
                className="w-full text-white font-bold py-3.5 rounded-xl uppercase tracking-wider text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-blue-600/20"
                style={{
                  background: 'linear-gradient(135deg, #2266ff 0%, #1a44cc 100%)',
                  boxShadow: '0 4px 24px rgba(34,102,255,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
                }}
              >
                {chargement ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            {/* Demo access */}
            <div className="mt-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <span className="text-[10px] text-white/25 uppercase tracking-[0.2em] whitespace-nowrap font-medium">Quick Demo</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
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
                    className="font-semibold rounded-lg px-3.5 py-1.5 text-xs transition-all hover:scale-105"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.5)',
                    }}
                    onMouseEnter={e => {
                      (e.target as HTMLElement).style.background = 'rgba(34,102,255,0.3)';
                      (e.target as HTMLElement).style.color = '#fff';
                      (e.target as HTMLElement).style.borderColor = 'rgba(34,102,255,0.5)';
                    }}
                    onMouseLeave={e => {
                      (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                      (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)';
                      (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              <p className="text-[11px] text-white/15 text-center mt-6 font-medium">
                RMASC Factory — SARL au capital de 100.000 DA
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
