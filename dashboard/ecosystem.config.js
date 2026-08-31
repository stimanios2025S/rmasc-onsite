/**
 * PM2 Ecosystem — RMASC OnSite Dashboard
 * Démarrage fiable avec cwd explicite (cause du CSS non servi)
 */
module.exports = {
  apps: [
    {
      name: 'rmasc-onsite-dashboard',
      cwd: '/opt/rmasc-onsite/dashboard',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
    },
  ],
};
