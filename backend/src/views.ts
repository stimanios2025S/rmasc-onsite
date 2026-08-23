import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

export function creerPages(pool: Pool): Router {
  const router = Router();

  // ─── Accueil ──────────────────────────────────────────────────────────
  router.get('/', (_req: Request, res: Response) => {
    res.redirect('/chantiers');
  });

  // ─── Chantiers ────────────────────────────────────────────────────────
  router.get('/chantiers', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT c.id, c.reference_commande_erp AS ref, c.nom_chantier AS nom,
               c.statut, c.client_nom, c.adresse, c.rayon_geofencing,
               TO_CHAR(c.date_creation, 'YYYY-MM-DD HH24:MI') AS date_creation,
               (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.chantier_id = c.id) AS nb_missions,
               (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.chantier_id = c.id AND om.statut = 'en_cours') AS missions_en_cours,
               (SELECT COUNT(*) FROM blocages_et_requisitions b JOIN ordres_de_mission om ON om.id = b.ordre_mission_id WHERE om.chantier_id = c.id AND b.statut IN ('ouvert','en_cours')) AS blocages
        FROM chantiers c
        ORDER BY c.date_creation DESC
      `);
      res.send(renderChantiers(rows));
    } catch (err: any) {
      res.status(500).send(`Erreur : ${err.message}`);
    }
  });

  // ─── Missions ─────────────────────────────────────────────────────────
  router.get('/missions', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT om.id, om.phase, om.statut, c.nom_chantier AS chantier,
               e.nom AS equipe,
               TO_CHAR(om.date_declenchement, 'YYYY-MM-DD HH24:MI') AS declenchement,
               TO_CHAR(om.date_debut_effectif, 'YYYY-MM-DD HH24:MI') AS debut,
               TO_CHAR(om.date_fin_effectif, 'YYYY-MM-DD HH24:MI') AS fin,
               om.priorite,
               (SELECT COUNT(*) FROM blocages_et_requisitions b WHERE b.ordre_mission_id = om.id AND b.statut IN ('ouvert','en_cours')) AS blocages
        FROM ordres_de_mission om
        JOIN chantiers c ON c.id = om.chantier_id
        JOIN equipes e ON e.id = om.equipe_id
        ORDER BY om.date_creation DESC
      `);
      res.send(renderMissions(rows));
    } catch (err: any) {
      res.status(500).send(`Erreur : ${err.message}`);
    }
  });

  // ─── Détail chantier ─────────────────────────────────────────────────
  router.get('/chantier/:id', async (req: Request, res: Response) => {
    try {
      const chantier = await pool.query(
        `SELECT id, reference_commande_erp AS ref, nom_chantier AS nom,
                statut, client_nom, client_telephone, adresse,
                CASE WHEN coordonnees IS NOT NULL THEN ST_X(coordonnees::geometry) END AS lng,
                CASE WHEN coordonnees IS NOT NULL THEN ST_Y(coordonnees::geometry) END AS lat,
                rayon_geofencing,
                TO_CHAR(date_creation, 'YYYY-MM-DD HH24:MI') AS date_creation
         FROM chantiers WHERE id = $1`, [req.params.id]
      );
      if (!chantier.rows[0]) return res.status(404).send('Chantier introuvable');

      const missions = await pool.query(
        `SELECT om.id, om.phase, om.statut, e.nom AS equipe, om.priorite,
                TO_CHAR(om.date_declenchement, 'YYYY-MM-DD HH24:MI') AS declenchement,
                TO_CHAR(om.date_debut_effectif, 'YYYY-MM-DD HH24:MI') AS debut,
                TO_CHAR(om.date_fin_effectif, 'YYYY-MM-DD HH24:MI') AS fin
         FROM ordres_de_mission om
         JOIN equipes e ON e.id = om.equipe_id
         WHERE om.chantier_id = $1
         ORDER BY om.phase`, [req.params.id]
      );

      const blocages = await pool.query(
        `SELECT b.id, b.raison_blocage, b.priorite, b.statut,
                TO_CHAR(b.date_creation, 'YYYY-MM-DD HH24:MI') AS date_creation
         FROM blocages_et_requisitions b
         JOIN ordres_de_mission om ON om.id = b.ordre_mission_id
         WHERE om.chantier_id = $1
         ORDER BY b.date_creation DESC`, [req.params.id]
      );

      res.send(renderChantierDetail(chantier.rows[0], missions.rows, blocages.rows));
    } catch (err: any) {
      res.status(500).send(`Erreur : ${err.message}`);
    }
  });

  return router;
}

// ═══════════════════════════════════════════════════════════════════════
//  RENDERERS
// ═══════════════════════════════════════════════════════════════════════

const NAV = `
<nav>
  <div class="nav-inner">
    <div class="nav-brand">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/></svg>
      <span>RMASC <em>OnSite</em></span>
    </div>
    <div class="nav-links">
      <a href="/chantiers" class="nav-link" data-page="chantiers">Chantiers</a>
      <a href="/missions" class="nav-link" data-page="missions">Missions</a>
      <a href="https://dashboard.sarl-rmasc.com" target="_blank" class="nav-link nav-external">Dashboard ↗</a>
    </div>
  </div>
</nav>`;

const FOOT = `
<footer>
  <p>RMASC OnSite v1.0 — Plateforme de gestion des opérations de terrain</p>
  <p>Propulsé par le Groupe RMASC</p>
</footer>`;

function page(title: string, body: string, active: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} — RMASC OnSite</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#F4F6FB;color:#1E2235;min-height:100vh;display:flex;flex-direction:column}

/* Navigation */
nav{background:linear-gradient(135deg,#2E3C9E 0%,#3B4BB9 100%);color:#fff;position:sticky;top:0;z-index:100;box-shadow:0 2px 12px rgba(59,75,185,0.3)}
.nav-inner{max-width:1200px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between}
.nav-brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:700;letter-spacing:-0.5px}
.nav-brand em{font-style:normal;font-weight:400;opacity:0.85}
.nav-links{display:flex;gap:4px}
.nav-link{color:rgba(255,255,255,0.8);text-decoration:none;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:500;transition:all 0.2s}
.nav-link:hover{background:rgba(255,255,255,0.12);color:#fff}
.nav-link.active{background:rgba(255,255,255,0.18);color:#fff;font-weight:600}
.nav-external{opacity:0.7}
.nav-external:hover{opacity:1}

/* Main */
main{flex:1;max-width:1200px;margin:0 auto;padding:24px;width:100%}

/* Page header */
.page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
.page-header h2{font-size:24px;font-weight:700;color:#1E2235}
.page-header .count{font-size:14px;color:#6B7294;font-weight:500}

/* Cards stats */
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px}
.stat-card{background:#fff;border-radius:12px;padding:20px;border:1px solid #E5E8F0;box-shadow:0 2px 8px rgba(0,0,0,0.04)}
.stat-card .stat-label{font-size:12px;color:#6B7294;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.stat-card .stat-value{font-size:28px;font-weight:700;color:#1E2235}
.stat-card .stat-value.green{color:#20C997}
.stat-card .stat-value.red{color:#FF5252}
.stat-card .stat-value.blue{color:#3B4BB9}
.stat-card .stat-value.orange{color:#FF9800}

/* Table */
.table-wrap{background:#fff;border-radius:16px;border:1px solid #E5E8F0;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04)}
table{width:100%;border-collapse:collapse}
thead th{background:#F8F9FE;text-align:left;padding:14px 20px;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#6B7294;font-weight:700;border-bottom:1px solid #E5E8F0}
tbody td{padding:14px 20px;border-bottom:1px solid #F0F1F6;font-size:14px;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#F8F9FE}
tbody tr{cursor:pointer;transition:background 0.15s}

/* Badges */
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;white-space:nowrap}
.badge.mecanique{background:#E8F4FD;color:#2196F3}
.badge.electrique{background:#FFF3E0;color:#E65100}
.badge.verification{background:#E8F5E9;color:#2E7D32}
.badge.planifie,.badge.en_attente{background:#E8EAFA;color:#3B4BB9}
.badge.en_cours{background:#E2FBF2;color:#0CA678}
.badge.termine,.badge.reception_officielle{background:#E2FBF2;color:#20C997}
.badge.bloque{background:#FFE5E5;color:#FF5252}
.badge.suspendu{background:#FFF3E0;color:#FF9800}
.badge.basse{background:#E5E8F0;color:#6B7294}
.badge.moyenne{background:#FFF3E0;color:#FF9800}
.badge.haute{background:#FFE5E5;color:#FF5252}
.badge.critique{background:#FF5252;color:#fff}

/* Phase indicator */
.phase-indicator{display:flex;gap:8px;align-items:center}
.phase-dot{width:10px;height:10px;border-radius:50%;display:inline-block;flex-shrink:0}
.phase-dot.mecanique{background:#2196F3}
.phase-dot.electrique{background:#FF9800}
.phase-dot.verification{background:#4CAF50}

/* Blocage indicator */
.blocage-warn{color:#FF5252 !important}
.blocage-ok{color:#20C997 !important}

/* Empty state */
.empty-state{text-align:center;padding:64px 24px;color:#A8AEC5}
.empty-state svg{margin-bottom:16px;opacity:0.4}
.empty-state p{font-size:16px;margin-bottom:4px}
.empty-state .sub{font-size:13px}

/* Detail page */
.detail-header{background:#fff;border-radius:16px;padding:32px;border:1px solid #E5E8F0;margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,0.04)}
.detail-header h1{font-size:28px;font-weight:700;color:#1E2235;margin-bottom:4px}
.detail-header .ref{color:#6B7294;font-size:14px;margin-bottom:16px}
.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.detail-item label{font-size:11px;color:#6B7294;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px}
.detail-item span{font-size:15px;font-weight:500;color:#1E2235}
.detail-section{margin-top:32px}
.detail-section h3{font-size:18px;font-weight:600;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #E8EAFA}

/* Footer */
footer{text-align:center;padding:20px;color:#A8AEC5;font-size:12px;border-top:1px solid #E5E8F0;margin-top:24px}
footer p{margin:2px 0}

/* Responsive */
@media(max-width:768px){
  .nav-inner{height:56px;padding:0 16px}
  .nav-brand{font-size:16px}
  .nav-links{gap:2px}
  .nav-link{padding:6px 10px;font-size:12px}
  main{padding:16px}
  .page-header{flex-direction:column;align-items:flex-start;gap:4px}
  .stats-row{grid-template-columns:repeat(2,1fr)}
  thead th,tbody td{padding:10px 12px;font-size:12px}
}

/* Animations */
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
main > *{animation:fadeIn 0.3s ease-out}
</style>
<script>
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.nav-link').forEach(a=>{
    if(a.dataset.page==='${active}') a.classList.add('active')
  })
  // Click row to detail
  document.querySelectorAll('tr[data-href]').forEach(row=>{
    row.addEventListener('click',()=>{window.location=row.dataset.href})
  })
})
</script>
</head>
<body>
${NAV}
<main>
${body}
</main>
${FOOT}
</body>
</html>`;
}

function renderChantiers(chantiers: any[]): string {
  const stats = {
    total: chantiers.length,
    enCours: chantiers.filter(c => c.statut === 'en_cours').length,
    bloques: chantiers.filter(c => c.statut === 'bloque').length,
    termines: chantiers.filter(c => c.statut === 'termine' || c.statut === 'reception_officielle').length,
  };

  const body = `
<div class="page-header">
  <h2>Chantiers</h2>
  <span class="count">${stats.total} chantier${stats.total > 1 ? 's' : ''}</span>
</div>

<div class="stats-row">
  <div class="stat-card">
    <div class="stat-label">En cours</div>
    <div class="stat-value green">${stats.enCours}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Bloqués</div>
    <div class="stat-value red">${stats.bloques}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">En attente</div>
    <div class="stat-value blue">${stats.total - stats.enCours - stats.bloques - stats.termines}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Terminés</div>
    <div class="stat-value">${stats.termines}</div>
  </div>
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Réf. ERP</th>
        <th>Nom du chantier</th>
        <th>Statut</th>
        <th>Client</th>
        <th>Missions</th>
        <th>Créé le</th>
      </tr>
    </thead>
    <tbody>
      ${chantiers.length === 0 ? `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <p>Aucun chantier enregistré</p>
            <p class="sub">Les chantiers apparaîtront ici quand l'ERP enverra des commandes</p>
          </div>
        </td>
      </tr>` : chantiers.map(c => `
      <tr data-href="/chantier/${c.id}">
        <td><span style="font-weight:600;color:#3B4BB9;font-size:12px">${c.ref || '—'}</span></td>
        <td><span style="font-weight:600">${c.nom || '—'}</span></td>
        <td><span class="badge ${c.statut}">${(c.statut || '').replace(/_/g, ' ')}</span></td>
        <td>${c.client_nom || '<span style="color:#A8AEC5">—</span>'}</td>
        <td>${c.missions_en_cours > 0 ? `<span style="color:#20C997;font-weight:600">${c.missions_en_cours}</span><span style="color:#A8AEC5;font-size:12px">/${c.nb_missions}</span>` : `<span style="color:#A8AEC5">${c.nb_missions}</span>`}</td>
        <td style="color:#6B7294;font-size:13px">${c.date_creation || '—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`;

  return page('Chantiers', body, 'chantiers');
}

function renderMissions(missions: any[]): string {
  const stats = {
    total: missions.length,
    enCours: missions.filter(m => m.statut === 'en_cours').length,
    bloquees: missions.filter(m => m.statut === 'bloque').length,
    enAttente: missions.filter(m => m.statut === 'en_attente').length,
  };

  const body = `
<div class="page-header">
  <h2>Missions</h2>
  <span class="count">${stats.total} mission${stats.total > 1 ? 's' : ''}</span>
</div>

<div class="stats-row">
  <div class="stat-card">
    <div class="stat-label">En cours</div>
    <div class="stat-value green">${stats.enCours}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Bloquées</div>
    <div class="stat-value red">${stats.bloquees}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">En attente</div>
    <div class="stat-value blue">${stats.enAttente}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Terminées</div>
    <div class="stat-value">${stats.total - stats.enCours - stats.bloquees - stats.enAttente}</div>
  </div>
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Phase</th>
        <th>Statut</th>
        <th>Chantier</th>
        <th>Équipe</th>
        <th>Priorité</th>
        <th>Blocages</th>
        <th>Déclenché</th>
        <th>Début</th>
      </tr>
    </thead>
    <tbody>
      ${missions.length === 0 ? `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <p>Aucune mission enregistrée</p>
            <p class="sub">Les missions sont créées automatiquement depuis les chantiers</p>
          </div>
        </td>
      </tr>` : missions.map(m => `
      <tr>
        <td>
          <div class="phase-indicator">
            <span class="phase-dot ${m.phase}"></span>
            <span class="badge ${m.phase}">${m.phase || '—'}</span>
          </div>
        </td>
        <td><span class="badge ${m.statut}">${(m.statut || '').replace(/_/g, ' ')}</span></td>
        <td><span style="font-weight:500">${m.chantier || '—'}</span></td>
        <td>${m.equipe || '—'}</td>
        <td><span class="badge ${m.priorite || 'moyenne'}">${m.priorite || 'normale'}</span></td>
        <td>${m.blocages > 0 ? `<span class="blocage-warn" style="font-weight:700">${m.blocages}</span>` : '<span class="blocage-ok">✓</span>'}</td>
        <td style="color:#6B7294;font-size:13px">${m.declenchement || '—'}</td>
        <td style="color:#6B7294;font-size:13px">${m.debut || '<span style="color:#A8AEC5">—</span>'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`;

  return page('Missions', body, 'missions');
}

function renderChantierDetail(chantier: any, missions: any[], blocages: any[]): string {
  const body = `
<div class="detail-header">
  <h1>${chantier.nom || 'Chantier'}</h1>
  <div class="ref">${chantier.ref || ''} ${chantier.adresse ? '— ' + chantier.adresse : ''}</div>
  <div class="detail-grid">
    <div class="detail-item">
      <label>Statut</label>
      <span><span class="badge ${chantier.statut}">${(chantier.statut || '').replace(/_/g, ' ')}</span></span>
    </div>
    <div class="detail-item">
      <label>Client</label>
      <span>${chantier.client_nom || '—'}</span>
    </div>
    <div class="detail-item">
      <label>Téléphone</label>
      <span>${chantier.client_telephone || '—'}</span>
    </div>
    <div class="detail-item">
      <label>Coordonnées GPS</label>
      <span>${chantier.lat ? `${parseFloat(chantier.lat).toFixed(4)}, ${parseFloat(chantier.lng).toFixed(4)}` : '—'}</span>
    </div>
    <div class="detail-item">
      <label>Rayon géofencing</label>
      <span>${chantier.rayon_geofencing || 50} m</span>
    </div>
    <div class="detail-item">
      <label>Créé le</label>
      <span>${chantier.date_creation || '—'}</span>
    </div>
  </div>
</div>

<div class="detail-section">
  <h3>Missions (${missions.length})</h3>
  ${missions.length === 0 ? '<p style="color:#A8AEC5">Aucune mission pour ce chantier.</p>' : `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Phase</th><th>Statut</th><th>Équipe</th><th>Priorité</th><th>Déclenché</th><th>Début</th><th>Fin</th></tr></thead>
      <tbody>
        ${missions.map(m => `
        <tr>
          <td><div class="phase-indicator"><span class="phase-dot ${m.phase}"></span><span class="badge ${m.phase}">${m.phase}</span></div></td>
          <td><span class="badge ${m.statut}">${(m.statut || '').replace(/_/g, ' ')}</span></td>
          <td>${m.equipe || '—'}</td>
          <td><span class="badge ${m.priorite || 'moyenne'}">${m.priorite || 'normale'}</span></td>
          <td style="color:#6B7294;font-size:13px">${m.declenchement || '—'}</td>
          <td style="color:#6B7294;font-size:13px">${m.debut || '—'}</td>
          <td style="color:#6B7294;font-size:13px">${m.fin || '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`}
</div>

<div class="detail-section">
  <h3>Blocages (${blocages.length})</h3>
  ${blocages.length === 0 ? '<p style="color:#A8AEC5">Aucun blocage signalé.</p>' : `
  <div class="table-wrap">
    <table>
      <thead><tr><th>Raison</th><th>Priorité</th><th>Statut</th><th>Date</th></tr></thead>
      <tbody>
        ${blocages.map(b => `
        <tr>
          <td>${b.raison_blocage || '—'}</td>
          <td><span class="badge ${b.priorite}">${b.priorite || 'moyenne'}</span></td>
          <td><span class="badge ${b.statut}">${(b.statut || '').replace(/_/g, ' ')}</span></td>
          <td style="color:#6B7294;font-size:13px">${b.date_creation || '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`}
  <div style="margin-top:24px">
    <a href="/chantiers" style="color:#3B4BB9;text-decoration:none;font-weight:500;">← Retour aux chantiers</a>
  </div>
</div>`;

  return page(chantier.nom || 'Chantier', body, 'chantiers');
}
