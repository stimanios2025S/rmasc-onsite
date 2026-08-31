export class ErreurMetier extends Error {
  public readonly code: string;
  public readonly statusHttp: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusHttp: number = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ErreurMetier';
    this.code = code;
    this.statusHttp = statusHttp;
    this.details = details;
    Object.setPrototypeOf(this, ErreurMetier.prototype);
  }

  static pointageHorsPerimetre(distance: number, rayon: number): ErreurMetier {
    return new ErreurMetier('POINTAGE_HORS_PERIMETRE',
      `Accès refusé : vous devez être à moins de ${rayon}m du chantier. Distance : ${Math.round(distance)}m.`, 403, { distance, rayon });
  }
  static missionIntrouvable(id: string): ErreurMetier {
    return new ErreurMetier('MISSION_INTROUVABLE', `Mission ${id} introuvable.`, 404);
  }
  static technicienIntrouvable(id: string): ErreurMetier {
    return new ErreurMetier('TECHNICIEN_INTROUVABLE', `Technicien ${id} introuvable ou désactivé.`, 404);
  }
  static chantierIntrouvable(id: string): ErreurMetier {
    return new ErreurMetier('CHANTIER_INTROUVABLE', `Chantier ${id} introuvable.`, 404);
  }
  static aucuneEquipeDisponible(type: string): ErreurMetier {
    return new ErreurMetier('AUCUNE_EQUIPE_DISPONIBLE', `Aucune équipe "${type}" disponible.`, 503);
  }
}
