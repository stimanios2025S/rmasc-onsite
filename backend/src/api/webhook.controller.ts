import { Request, Response } from 'express';
import type { Pool } from 'pg';
import { LoggerService } from '../services/notifications/logger.service';
import type { IChantierRepository, IMissionRepository, IEquipeRepository } from '../repositories/interfaces';
import type { Phase } from '../types/mission.types';

const TYPE_EQUIPE: Record<string, string> = { mecanique: 'mecanique', electrique: 'electrique', verification: 'mixte' };

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
    // 1. Vérifier le secret partagé
    const secretRecu = req.headers['x-webhook-secret'] as string | undefined;
    if (!secretRecu || secretRecu !== webhookSecret) {
      logger.warn('Webhook ERP rejeté — secret invalide', { ip: req.ip });
      res.status(401).json({ erreur: 'Non autorisé' });
      return;
    }

    const body = req.body as PayloadERP;

    // 2. Valider le payload
    if (!body.referenceERP || !body.payload?.nomChantier) {
      res.status(400).json({ erreur: 'Payload invalide. referenceERP et nomChantier requis.' });
      return;
    }

    logger.info(`Webhook ERP recu: ${body.evenement}`, { reference: body.referenceERP });

    // 3. Traiter selon l'événement
    switch (body.evenement) {
      case 'ORDRE_FABRICATION_TERMINE':
        await traiterOrdreTermine(body, db, chantierRepo, missionRepo, equipeRepo, logger, res);
        break;
      default:
        res.status(202).json({ message: `Événement "${body.evenement}" ignoré` });
    }
  };
}

async function traiterOrdreTermine(
  body: PayloadERP,
  db: Pool,
  chantierRepo: IChantierRepository,
  missionRepo: IMissionRepository,
  equipeRepo: IEquipeRepository,
  logger: LoggerService,
  res: Response
): Promise<void> {
  const ref = body.referenceERP;
  const p = body.payload;

  // Vérifier si le chantier existe déjà
  const existant = await chantierRepo.trouverParReferenceERP(ref);
  if (existant) {
    logger.info('Chantier déjà existant', { reference: ref });
    res.status(200).json({ message: 'Chantier déjà créé', chantierId: existant.id });
    return;
  }

  const lat = p.latitude ?? 45.75;
  const lng = p.longitude ?? 4.85;
  const rayon = p.rayonGeofencing ?? 50;

  // Insérer le chantier dans la base
  const { rows } = await db.query(
    `INSERT INTO chantiers (reference_commande_erp, nom_chantier, adresse, coordonnees, rayon_geofencing, statut,
                            client_nom, client_telephone, date_debut_prevue)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, 'planifie', $7, $8, NOW())
     RETURNING id`,
    [ref, p.nomChantier, p.adresse ?? null, lng, lat, rayon, p.clientNom ?? null, p.clientTelephone ?? null]
  );
  const chantierId = rows[0].id;
  logger.info('Chantier créé depuis ERP', { chantierId, reference: ref });

  // Trouver une équipe mécanique disponible
  const equipe = await equipeRepo.trouverDisponible('mecanique');
  if (!equipe) {
    logger.warn('Aucune équipe mécanique disponible', { chantierId });
    res.status(201).json({
      chantierId,
      message: 'Chantier créé, mais aucune équipe mécanique disponible. Affectation manuelle requise.',
    });
    return;
  }

  // Créer la première mission (mécanique)
  const mission = await missionRepo.creer({
    chantierId,
    equipeId: equipe.id,
    phase: 'mecanique',
    notes: `Créée depuis ERP — ordre ${ref}`,
  });

  logger.info('Mission mécanique créée', { missionId: mission.id, equipe: equipe.nom });

  res.status(201).json({
    chantierId,
    missionId: mission.id,
    equipeId: equipe.id,
    equipeNom: equipe.nom,
    message: `Chantier "${p.nomChantier}" créé. Équipe ${equipe.nom} assignée à la phase Mécanique.`,
  });
}
