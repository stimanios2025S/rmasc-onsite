import { ErreurMetier } from '../../errors/erreur-metier';
import type { IBlocageRepository, IMissionRepository, IChantierRepository } from '../../repositories/interfaces';
import type { Blocage, PrioriteBlocage } from '../../types/mission.types';
import { NotificationService } from '../notifications/notification.service';
import { LoggerService } from '../notifications/logger.service';

export interface SignalementBlocageEntree { missionId: string; declarePar: string; raison: string; idPieceERP?: string; photoUrl?: string; priorite?: PrioriteBlocage; }

export class BlocageService {
  constructor(
    private readonly blocageRepo: IBlocageRepository,
    private readonly missionRepo: IMissionRepository,
    private readonly chantierRepo: IChantierRepository,
    private readonly notifier: NotificationService,
    private readonly logger: LoggerService
  ) {}

  async signalerBlocage(input: SignalementBlocageEntree): Promise<Blocage> {
    const mission = await this.missionRepo.trouverParId(input.missionId);
    if (!mission) throw ErreurMetier.missionIntrouvable(input.missionId);
    const priorite: PrioriteBlocage = input.priorite ?? (input.idPieceERP ? 'haute' : 'moyenne');

    const blocage = await this.blocageRepo.creer({
      ordreMissionId: input.missionId, declarePar: input.declarePar, raisonBlocage: input.raison,
      idPieceERP: input.idPieceERP ?? null, priorite, urlsPhotos: input.photoUrl ? [input.photoUrl] : [],
    });

    await this.missionRepo.mettreAJourStatut(input.missionId, 'bloque');
    const chantier = await this.chantierRepo.trouverParId(mission.chantierId);

    await this.notifier.emettreTableauBord('blocage:cree', {
      blocageId: blocage.id, missionId: input.missionId, chantierId: mission.chantierId,
      chantierNom: chantier?.nom ?? 'Inconnu', phase: mission.phase, priorite,
      raison: input.raison, idPieceERP: input.idPieceERP ?? null, statut: 'ouvert',
    });

    await this.notifier.alerterDispatcher({
      type: 'blocage', titre: `Blocage ${priorite}`,
      message: `${priorite.toUpperCase()} — ${chantier?.nom ?? 'Inconnu'}: ${input.raison}`,
      priorite, missionId: input.missionId, chantierId: mission.chantierId,
      donneesComplement: { blocageId: blocage.id, idPieceERP: input.idPieceERP ?? null },
    });

    if (input.idPieceERP) {
      this.logger.info('Requisition ERP necessaire', { piece: input.idPieceERP, urgent: priorite === 'critique' });
    }

    this.logger.warn('Blocage signale', { blocageId: blocage.id, missionId: input.missionId, priorite });
    return blocage;
  }

  async resoudreBlocage(blocageId: string, resoluPar: string, commentaire: string): Promise<void> {
    await this.blocageRepo.mettreAJourStatut(blocageId, 'resolu');
    await this.notifier.emettreTableauBord('blocage:resolu', { blocageId, resoluPar, commentaire });
    this.logger.info('Blocage resolu', { blocageId, resoluPar });
  }
}
