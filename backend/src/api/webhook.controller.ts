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
    [k: string]: unknown;
  };
}

export function creerWebhookHandler(
  db: Pool,
  chantierRepo: IChantierRepository,
  missionRepo: IMissionRepository,
  equipeRepo: IEquipeRepository,
  logger: LoggerService,
  webhookSecret: string
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const secretRecu = req.headers['x-webhook-secret'] as string | undefined;
      if (!secretRecu || secretRecu !== webhookSecret) {
        res.status(401).json({ erreur: 'Non autorisé' });
        return;
      }

      const body = req.body as PayloadERP;
      if (!body.referenceERP || !body.payload?.nomChantier) {
        res.status(400).json({ erreur: 'Payload invalide.' });
        return;
      }

      logger.info(`Webhook ERP: ${body.evenement}`, { ref: body.referenceERP });

      switch (body.evenement) {
        case 'ORDRE_FABRICATION_TERMINE':
          await insererDemandeIntegration(body, db, logger, res);
          break;
        default:
          res.status(202).json({ message: 'Ignoré' });
      }
    } catch (err: any) {
      logger.error('Erreur webhook', { erreur: err?.message ?? String(err) });
      if (!res.headersSent) {
        res.status(500).json({ erreur: 'Erreur interne.', detail: err?.message });
      }
    }
  };
}

/** Insère la commande ERP dans la file d'attente (approbation admin) */
async function insererDemandeIntegration(
  body: PayloadERP,
  db: Pool,
  logger: LoggerService,
  res: Response
): Promise<void> {
  const { referenceERP, payload } = body;

  // Vérifier si déjà en attente
  const exist = await db.query(
    `SELECT id, statut FROM demandes_integration WHERE reference_commande_erp = $1`,
    [referenceERP]
  );
  if (exist.rows.length > 0) {
    logger.info('Demande déjà existante', { ref: referenceERP });
    res.status(200).json({
      demandeId: exist.rows[0].id,
      statut: exist.rows[0].statut,
      message: `Demande déjà enregistrée (${exist.rows[0].statut}).`,
    });
    return;
  }

  const { rows } = await db.query(
    `INSERT INTO demandes_integration
       (reference_commande_erp, client_nom, client_telephone, adresse_chantier,
        nom_chantier, latitude, longitude, details_ascenseur)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      referenceERP,
      payload.clientNom ?? 'Inconnu',
      payload.clientTelephone ?? null,
      payload.adresse ?? null,
      payload.nomChantier,
      payload.latitude ?? 45.75,
      payload.longitude ?? 4.85,
      JSON.stringify({
        typeMotorisation: (payload as any).typeMotorisation ?? null,
        nombreEtages: (payload as any).nombreEtages ?? null,
      }),
    ]
  );

  logger.info('Demande intégration créée', { demandeId: rows[0].id, ref: referenceERP });

  res.status(201).json({
    demandeId: rows[0].id,
    statut: 'EN_ATTENTE_VALIDATION',
    message: `✅ Commande "${payload.nomChantier}" mise en attente d'approbation par El Ghani.`,
  });
}
