import { ErreurMetier } from '../../errors/erreur-metier';
import type { IMissionRepository, IChantierRepository, IEquipeRepository } from '../../repositories/interfaces';
import type { OrdreMission, Phase } from '../../types/mission.types';
import { NotificationService } from '../notifications/notification.service';
import { LoggerService } from '../notifications/logger.service';

const CHAINE: Record<Phase, Phase | null> = { mecanique: 'electrique', electrique: 'verification', verification: null };
const TYPE_EQUIPE: Record<Phase, string> = { mecanique: 'mecanique', electrique: 'electrique', verification: 'mixte' };

export class RelaisPhaseService {
  constructor(
    private readonly missionRepo: IMissionRepository,
    private readonly chantierRepo: IChantierRepository,
    private readonly equipeRepo: IEquipeRepository,
    private readonly notifier: NotificationService,
    private readonly logger: LoggerService
  ) {}

  async surPhaseTerminee(missionId: string): Promise<void> {
    const mission = await this.missionRepo.trouverParId(missionId);
    if (!mission) throw ErreurMetier.missionIntrouvable(missionId);
    if (mission.statut !== 'termine') {
      this.logger.warn('Mission non terminee', { missionId, statut: mission.statut });
      return;
    }
    this.logger.info('Phase terminee', { missionId, phase: mission.phase });

    if (mission.phase === 'verification') { await this.finaliserChantier(mission); return; }
    const prochaine = CHAINE[mission.phase];
    if (!prochaine) return;
    await this.relayer(mission, prochaine);
  }

  private async relayer(prev: OrdreMission, nextPhase: Phase): Promise<void> {
    const existante = await this.missionRepo.trouverActiveParChantierEtPhase(prev.chantierId, nextPhase);
    if (existante) { this.logger.info('Mission existante', { chantierId: prev.chantierId, phase: nextPhase }); return; }
    const equipe = await this.equipeRepo.trouverDisponible(TYPE_EQUIPE[nextPhase] as Phase);
    if (!equipe) {
      await this.notifier.alerterDispatcher({
        type: 'affectation_manuelle', titre: 'Aucune equipe disponible',
        message: `Phase ${nextPhase} sans equipe.`, missionId: prev.id, chantierId: prev.chantierId, priorite: 'haute',
      });
      throw ErreurMetier.aucuneEquipeDisponible(TYPE_EQUIPE[nextPhase]);
    }
    const nouvelle = await this.missionRepo.creer({
      chantierId: prev.chantierId, equipeId: equipe.id, phase: nextPhase,
      notes: `Declenche depuis phase ${prev.phase}`,
    });
    this.logger.info(`Mission ${nextPhase} creee`, { missionId: nouvelle.id, equipe: equipe.nom });
    await this.notifier.envoyerPush({
      titre: `Nouvelle mission: Phase ${nextPhase}`, corps: `Equipe ${equipe.nom} assignee.`,
      destinataires: [], donnees: { type: 'nouvelle_mission', missionId: nouvelle.id, chantierId: prev.chantierId, phase: nextPhase },
    });
    if (nextPhase === 'verification') {
      await this.notifier.alerterResponsableQA({ chantierId: prev.chantierId, missionId: nouvelle.id, message: 'Phase Electrique terminee. Verification QA requise.' });
    }
  }

  private async finaliserChantier(mission: OrdreMission): Promise<void> {
    await this.chantierRepo.mettreAJourStatut(mission.chantierId, 'reception_officielle');
    const chantier = await this.chantierRepo.trouverParId(mission.chantierId);
    if (!chantier) throw ErreurMetier.chantierIntrouvable(mission.chantierId);
    await this.notifier.envoyerWebhookERP({
      evenement: 'CHANTIER_RECEPTIONNE', referenceERP: chantier.referenceERP,
      payload: { referenceERP: chantier.referenceERP, nomChantier: chantier.nom, dateReception: new Date().toISOString(), missionVerificationId: mission.id },
      dateEnvoi: new Date(),
    });
    await this.notifier.envoyerPush({
      titre: 'Chantier receptionne', corps: `"${chantier.nom}" officiellement receptionne.`,
      destinataires: [], donnees: { type: 'chantier:receptionne', chantierId: mission.chantierId },
    });
    await this.notifier.emettreTableauBord('chantier:receptionne', { chantierId: mission.chantierId, chantierNom: chantier.nom, referenceERP: chantier.referenceERP });
    this.logger.info('Reception Officielle Validee', { chantier: chantier.nom });
  }
}
