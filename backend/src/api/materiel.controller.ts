import { Router } from 'express';
import { Pool } from 'pg';
import { LoggerService } from '../services/notifications/logger.service';
import { SmsService } from '../services/sms/sms.service';
import { eventBus } from '../services/events/event-bus';

/**
 * Materiel Controller — Demandes de matériel + Signalements retards/problèmes
 *
 * Worker:
 *   POST /api/materiel/demande      — Soumettre une demande de matériel
 *   POST /api/materiel/signaler     — Signaler un retard / problème
 *
 * Admin:
 *   GET  /api/materiel           — Liste des demandes (filtrable)
 *   PATCH /api/materiel/:id      — Modifier le statut d'une demande
 *   GET  /api/materiel/:id/pdf   — Télécharger le PDF
 */
export function creerMaterielRouter(pool: Pool, logger: LoggerService, smsService?: SmsService): Router {
  const router = Router();

  // ═══ WORKER: Demande de matériel ════════════════════════════════════════
  router.post('/demande', async (req, res) => {
    try {
      const { equipeId, chantierId, missionId, items, description, photoUrl } = req.body;
      if (!equipeId || !chantierId) {
        return res.status(400).json({ erreur: 'equipeId et chantierId requis.' });
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ erreur: 'Au moins un article requis.' });
      }

      const { rows } = await pool.query(
        `INSERT INTO demandes_materiel (equipe_id, chantier_id, mission_id, items, description, photo_url, type_demande)
         VALUES ($1, $2, $3, $4, $5, $6, 'materiel')
         RETURNING id, date_creation`,
        [equipeId, chantierId, missionId || null, JSON.stringify(items), description || null, photoUrl || null]
      );

      const demande = rows[0];

      // Récupérer infos pour SSE + SMS
      const infoRes = await pool.query(
        `SELECT e.nom AS equipe_nom, c.nom_chantier AS chantier_nom
         FROM equipes e, chantiers c WHERE e.id = $1 AND c.id = $2`,
        [equipeId, chantierId]
      );
      const info = infoRes.rows[0] || { equipe_nom: 'Inconnue', chantier_nom: 'Inconnu' };

      // Générer le PDF
      const pdfUrl = await genererPDF(pool, demande.id, info, items, description, 'materiel');
      if (pdfUrl) {
        await pool.query(`UPDATE demandes_materiel SET pdf_url = $1 WHERE id = $2`, [pdfUrl, demande.id]);
      }

      // SSE broadcast
      eventBus.emit('demande_materiel', {
        demandeId: demande.id,
        type: 'materiel',
        equipeNom: info.equipe_nom,
        chantierNom: info.chantier_nom,
        items: items.length,
        date: demande.date_creation,
      });

      logger.info('Demande matériel créée', { id: demande.id, equipe: info.equipe_nom, items: items.length });

      res.status(201).json({ id: demande.id, message: 'Demande envoyée.', pdfUrl });
    } catch (err: any) {
      logger.error('Erreur demande matériel', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ═══ WORKER: Signaler retard / problème ════════════════════════════════
  router.post('/signaler', async (req, res) => {
    try {
      const { equipeId, chantierId, missionId, description, photoUrl, motif } = req.body;
      if (!equipeId || !chantierId || !description) {
        return res.status(400).json({ erreur: 'equipeId, chantierId et description requis.' });
      }

      const items = [{ nom: motif || 'Problème signalé', quantite: 1, categorie: 'SIGNALEMENT' }];

      const { rows } = await pool.query(
        `INSERT INTO demandes_materiel (equipe_id, chantier_id, mission_id, items, description, photo_url, type_demande)
         VALUES ($1, $2, $3, $4, $5, $6, 'retard')
         RETURNING id, date_creation`,
        [equipeId, chantierId, missionId || null, JSON.stringify(items), description, photoUrl || null]
      );

      const demande = rows[0];

      const infoRes = await pool.query(
        `SELECT e.nom AS equipe_nom, c.nom_chantier AS chantier_nom
         FROM equipes e, chantiers c WHERE e.id = $1 AND c.id = $2`,
        [equipeId, chantierId]
      );
      const info = infoRes.rows[0] || { equipe_nom: 'Inconnue', chantier_nom: 'Inconnu' };

      // Générer le PDF
      const pdfUrl = await genererPDF(pool, demande.id, info, items, description, 'retard');
      if (pdfUrl) {
        await pool.query(`UPDATE demandes_materiel SET pdf_url = $1 WHERE id = $2`, [pdfUrl, demande.id]);
      }

      // SSE broadcast
      eventBus.emit('signalement_probleme', {
        demandeId: demande.id,
        type: 'retard',
        equipeNom: info.equipe_nom,
        chantierNom: info.chantier_nom,
        description,
        date: demande.date_creation,
      });

      // Also insert into notifications_retard for existing admin page
      if (missionId) {
        try {
          await pool.query(
            `INSERT INTO notifications_retard (chantier_id, mission_id, equipe_id, motif, photo_url, lue)
             VALUES ($1, $2, $3, $4, $5, FALSE)`,
            [chantierId, missionId, equipeId, description, photoUrl || null]
          );
        } catch (_) { /* non-critical */ }
      }

      logger.info('Signalement créé', { id: demande.id, equipe: info.equipe_nom, type: 'retard' });

      res.status(201).json({ id: demande.id, message: 'Signalement envoyé.', pdfUrl });
    } catch (err: any) {
      logger.error('Erreur signalement', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ═══ ADMIN: Liste des demandes ═════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const { type, statut } = req.query;
      let sql = `
        SELECT dm.id, dm.items, dm.description, dm.photo_url, dm.type_demande, dm.statut, dm.pdf_url,
               TO_CHAR(dm.date_creation, 'YYYY-MM-DD HH24:MI') AS date_creation,
               e.nom AS equipe_nom, e.type AS equipe_type,
               c.nom_chantier AS chantier_nom, c.reference_commande_erp AS chantier_ref
        FROM demandes_materiel dm
        JOIN equipes e ON e.id = dm.equipe_id
        JOIN chantiers c ON c.id = dm.chantier_id
        WHERE 1=1`;
      const params: any[] = [];
      let idx = 1;

      if (type && type !== 'tous') {
        sql += ` AND dm.type_demande = $${idx++}`;
        params.push(type);
      }
      if (statut && statut !== 'tous') {
        sql += ` AND dm.statut = $${idx++}`;
        params.push(statut);
      }

      sql += ` ORDER BY dm.date_creation DESC LIMIT 50`;

      const { rows } = await pool.query(sql, params);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ═══ ADMIN: Modifier le statut ═════════════════════════════════════════
  router.patch('/:id', async (req, res) => {
    try {
      const { statut } = req.body;
      if (!statut || !['EN_ATTENTE', 'EN_COURS', 'EN_ROUTE', 'LIVREE', 'TRAITE', 'REFUSE'].includes(statut)) {
        return res.status(400).json({ erreur: 'Statut invalide.' });
      }
      const { rows } = await pool.query(
        `UPDATE demandes_materiel SET statut = $1, date_modification = NOW()
         WHERE id = $2 RETURNING equipe_id, chantier_id, description`,
        [statut, req.params.id]
      );
      // Notify the team via SSE
      if (rows.length > 0 && rows[0].equipe_id) {
        const { eventBus } = require('../services/events/event-bus');
        const statusMsg: Record<string, string> = {
          EN_ROUTE: '📦 Votre matériel est en route !',
          LIVREE: '✅ Matériel livré sur site.',
          EN_COURS: '⏳ Demande en cours de traitement.',
          TRAITE: '✅ Demande traitée.',
          REFUSE: '❌ Demande refusée.',
        };
        eventBus.emit('demande_materiel', {
          equipeId: rows[0].equipe_id,
          chantierId: rows[0].chantier_id,
          message: statusMsg[statut] || `Statut: ${statut}`,
        });
      }
      res.json({ message: 'Statut mis à jour.' });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ═══ ADMIN: Télécharger le PDF ═════════════════════════════════════════
  router.get('/:id/pdf', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT dm.*, e.nom AS equipe_nom, e.type AS equipe_type,
                c.nom_chantier AS chantier_nom, c.reference_commande_erp AS chantier_ref, c.adresse AS chantier_adresse
         FROM demandes_materiel dm
         JOIN equipes e ON e.id = dm.equipe_id
         JOIN chantiers c ON c.id = dm.chantier_id
         WHERE dm.id = $1`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ erreur: 'Introuvable.' });

      const d = rows[0];
      const html = genererHTML(d);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}

// ═══ PDF GENERATION (HTML-based, printable) ═══════════════════════════════

async function genererPDF(
  pool: Pool, id: string, info: any, items: any[], description: string | null, type: string
): Promise<string | null> {
  // PDF URL is the endpoint that renders the HTML — the admin can print-to-PDF from browser
  return `/api/materiel/${id}/pdf`;
}

function genererHTML(d: any): string {
  const items = Array.isArray(d.items) ? d.items : JSON.parse(d.items || '[]');
  const isRetard = d.type_demande === 'retard';
  const title = isRetard ? 'Signalement de Problème / Retard' : 'Demande de Matériel';
  const badgeColor = isRetard ? '#f59e0b' : '#6366f1';

  const itemsHTML = items.map((item: any, i: number) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#1f2937;">${item.nom || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;text-align:center;">${item.quantite || 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${item.categorie || '—'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${title} — RMASC</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
      @page { margin: 15mm; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; background: #f9fafb; padding: 32px; }
    .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 32px; }
    .header h1 { font-size: 22px; margin-bottom: 4px; }
    .header p { opacity: 0.8; font-size: 13px; }
    .badge { display: inline-block; background: ${badgeColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-top: 8px; }
    .content { padding: 32px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .meta-item { background: #f9fafb; border-radius: 12px; padding: 16px; border: 1px solid #e5e7eb; }
    .meta-label { font-size: 10px; text-transform: uppercase; font-weight: 700; color: #9ca3af; letter-spacing: 0.5px; margin-bottom: 4px; }
    .meta-value { font-size: 14px; font-weight: 600; color: #1f2937; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { background: #f3f4f6; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; font-weight: 700; color: #6b7280; letter-spacing: 0.5px; }
    .footer { padding: 24px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
    .footer p { font-size: 11px; color: #9ca3af; }
    .print-btn { background: #4f46e5; color: white; border: none; padding: 10px 24px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .print-btn:hover { background: #4338ca; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛗 RMASC OnSite</h1>
      <p>${title}</p>
      <span class="badge">${isRetard ? '⚠ PROBLÈME' : '📦 MATÉRIEL'}</span>
    </div>
    <div class="content">
      <div class="meta">
        <div class="meta-item">
          <div class="meta-label">Équipe</div>
          <div class="meta-value">${d.equipe_nom || '—'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Chantier</div>
          <div class="meta-value">${d.chantier_nom || '—'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Référence</div>
          <div class="meta-value">${d.chantier_ref || '—'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Date</div>
          <div class="meta-value">${d.date_creation || '—'}</div>
        </div>
      </div>

      ${d.description ? `
      <div style="margin-bottom:24px;">
        <h3 style="font-size:13px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Description</h3>
        <p style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;font-size:14px;color:#92400e;">${d.description}</p>
      </div>
      ` : ''}

      <h3 style="font-size:13px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">
        ${isRetard ? 'Détails du problème' : 'Articles demandés'}
      </h3>
      <table>
        <thead>
          <tr>
            <th style="border-radius:8px 0 0 0;">#</th>
            <th>Désignation</th>
            <th style="text-align:center;">Qté</th>
            <th>Catégorie</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;">Aucun article</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="footer">
      <p>RMASC OnSite — Document généré automatiquement</p>
      <button class="print-btn no-print" onclick="window.print()">🖨️ Imprimer / PDF</button>
    </div>
  </div>
</body>
</html>`;
}
