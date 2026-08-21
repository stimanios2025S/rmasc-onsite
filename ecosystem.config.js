/**
 * PM2 Ecosystem — RMASC OnSite (unifié)
 * Un seul processus : Express (API + Dashboard statique)
 * Port unique : 4002
 *
 * Usage :
 *   pm2 start ecosystem.config.js          → démarrer
 *   pm2 restart rmasc-onsite               → redémarrer
 *   pm2 logs rmasc-onsite                  → voir les logs
 *   pm2 delete rmasc-onsite-dashboard      → supprimer l'ancien (à faire 1 fois)
 */
module.exports = {
  apps: [
    {
      name: 'rmasc-onsite',
      cwd: '/opt/rmasc-onsite/backend',
      script: './dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: '4002',
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/opt/rmasc-onsite/logs/backend-error.log',
      out_file: '/opt/rmasc-onsite/logs/backend-out.log',
      merge_logs: true,
    },
  ],
};
