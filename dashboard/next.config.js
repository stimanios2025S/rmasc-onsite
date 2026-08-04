/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true, // gzip intégré
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4002/api/:path*',
      },
    ];
  },
  async headers() {
    return [
      {
        // Pages HTML: pas de cache (contenu dynamique)
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
      {
        // Assets statiques (_next/static): cache long (rapidité)
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
