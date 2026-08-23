import { Request, Response } from 'express';
import type { Pool } from 'pg';
import { LoggerService } from '../services/notifications/logger.service';
import type { IChantierRepository, IMissionRepository, IEquipeRepository } from '../repositories/interfaces';

export interface PayloadERP {
  evenement: string;
  referenceERP: string;
  payload: {
    referenceERP: string;
    nomChantier: string;
    adresse?: string;
    latitude?: number;
    longitude?: number;
    rayonGeofencing?: number;
    clientNom?: string;
    clientTelephone?: string;
    ficheTechnique?: Record<string, unknown>;
    dxfUrl?: string;
    pdfUrl?: string;
    complexite?: string;
    [k: string]: unknown;
  };
}

export function creerWebhookHandler(
  db: Pool, chantierRepo: IChantierRepository,
  missionRepo: IMissionRepository, equipeRepo: IEquipeRepository,
  logger: LoggerService, webhookSecret: string
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      if (req.headers['x-webhook-secret'] !== webhookSecret) {
        res.status(401).json({ erreur: 'Non autorisé' }); return;
      }
      const body = req.body as PayloadERP;
      if (!body.referenceERP || !body.payload?.nomChantier) {
        res.status(400).json({ erreur: 'Payload invalide.' }); return;
      }

      logger.info(`Webhook: ${body.evenement}`, { ref: body.referenceERP });

      switch (body.evenement) {
        case 'ORDRE_FABRICATION_TERMINE':
          await insererDemande(body, db, logger, res);
          break;
        default:
          res.status(202).json({ message: 'Ignoré' });
      }
    } catch (err: any) {
      logger.error('Erreur webhook', { erreur: err.message });
      if (!res.headersSent) res.status(500).json({ erreur: 'Erreur interne.', detail: err.message });
    }
  };
}

async function insererDemande(body: PayloadERP, db: Pool, logger: LoggerService, res: Response) {
  const { referenceERP, payload } = body;
  const validComplexity = (c?: string): string =>
    ['FACILE','MOYENNE','DIFFICILE'].includes(c || '') ? c! : 'MOYENNE';

  const exist = await db.query(
    `SELECT id, statut FROM demandes_integration WHERE reference_commande_erp = $1`, [referenceERP]
  );
  if (exist.rows.length > 0) {
    return res.status(200).json({ demandeId: exist.rows[0].id, statut: exist.rows[0].statut, message: 'Déjà existante.' });
  }

  const { rows } = await db.query(
    `INSERT INTO demandes_integration
       (reference_commande_erp, client_nom, client_telephone, adresse_chantier,
        nom_chantier, latitude, longitude, details_ascenseur,
        fiche_technique, dxf_url, pdf_url, complexite)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      referenceERP, payload.clientNom ?? 'Inconnu', payload.clientTelephone ?? null,
      payload.adresse ?? null, payload.nomChantier,
      payload.latitude ?? 36.7535, payload.longitude ?? 3.0588,
      JSON.stringify(payload), payload.ficheTechnique ? JSON.stringify(payload.ficheTechnique) : null,
      payload.dxfUrl ?? null, payload.pdfUrl ?? null,
      validComplexity(payload.complexite),
    ]
  );

  logger.info('Demande intégration créée', { demandeId: rows[0].id, ref: referenceERP });
  res.status(201).json({
    demandeId: rows[0].id, statut: 'EN_ATTENTE_VALIDATION',
    message: `✅ Commande "${payload.nomChantier}" en attente d'approbation.`,
  });
}
