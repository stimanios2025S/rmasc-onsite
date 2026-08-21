/** @type {import('next').NextConfig} */
const nextConfig = {
  // ─── Static export ───────────────────────────────────────────────
  // Le dashboard est servi comme fichiers statiques par Express (port 4002).
  // Pas de serveur Next.js séparé — tout est un seul processus.
  output: 'export',
  distDir: 'out',

  poweredByHeader: false,

  // ─── Headers (appliqués aux fichiers statiques exportés) ─────────
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
