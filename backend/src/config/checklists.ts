/**
 * Checklists by phase — used as fallbacks when generer_checklist() SQL function is unavailable.
 * Verification checklist covers ALL steps from both mechanical & electrical guides.
 */

export const MECHANICAL_STEPS = [
  { id: 'm1', label: 'Arrivage au chantier — vérification stock & lieu de déchargement', done: false },
  { id: 'm2', label: 'Plombage de gaine', done: false },
  { id: 'm3', label: 'Montage guidage / guiderail', done: false, subtasks: [{ label: 'Départ', done: false }, { label: '50%', done: false }, { label: '100%', done: false }] },
  { id: 'm4', label: 'Montage de moteur et plombage de moteur', done: false },
  { id: 'm5', label: 'Installation arcade et contrepoids', done: false },
  { id: 'm6', label: 'Install régulateur de vitesse et poulies', done: false },
  { id: 'm7', label: 'Install câbles de suspension et lingue', done: false },
  { id: 'm8', label: 'Installation des plateaux', done: false },
  { id: 'm9', label: 'Installation des portes', done: false, subtasks: [{ label: 'Départ', done: false }, { label: '50%', done: false }, { label: '100%', done: false }] },
  { id: 'm10', label: 'Installation de cabine', done: false },
  { id: 'm11', label: 'Installation des portes cabine', done: false },
  { id: 'm12', label: 'Charger le contrepoids', done: false },
];

export const ELECTRICAL_STEPS = [
  { id: 'e1', label: 'Installation armoire', done: false },
  { id: 'e2', label: 'Installation pendentif', done: false },
  { id: 'e3', label: 'Installation boîte inspection', done: false },
  { id: 'e4', label: 'Installation bouton appel palier', done: false },
  { id: 'e5', label: 'Installation bouton appel cabine', done: false },
  { id: 'e6', label: 'Installation de colonne montante', done: false },
  { id: 'e7', label: 'Raccordement machine', done: false },
  { id: 'e8', label: 'Raccordement toit cabine et inspection', done: false },
  { id: 'e9', label: 'Raccordement colonne', done: false },
  { id: 'e10', label: 'Installation des aimants', done: false },
  { id: 'e11', label: 'Les essais et réglages', done: false },
];

export const VERIFICATION_STEPS = [
  // ── Phase 1: Pointage matinal ──
  { id: 'vr01', label: 'Pointage matinal — briefing d\'équipe (absences, tâches, sécurité)', done: false },
  // ── Phase 2: Vérification conformité mécanique ──
  { id: 'vr02', label: 'Contrôle pression d\'essayage', done: false, note: '' },
  { id: 'vr03', label: 'Métrage diamètres — conformité plan', done: false, note: '' },
  { id: 'vr04', label: 'Vérification conformité métrage usine', done: false, note: '' },
  { id: 'vr05', label: 'Vérification conformité des soudures', done: false, note: '' },
  { id: 'vr06', label: 'Vérification conformité des supports (qualité, espacement)', done: false, note: '' },
  { id: 'vr07', label: 'Détection anomalies sur chantier', done: false, note: '' },
  { id: 'vr08', label: 'Vérification conformité plomberie', done: false, note: '' },
  // ── Phase 3: Calepinage ──
  { id: 'vr09', label: 'Calepinage — correspondance réception/plan', done: false, note: '' },
  { id: 'vr10', label: 'Entrées/sorties conformes au plan', done: false, note: '' },
  { id: 'vr11', label: 'Emplacement des flexibles vérifié', done: false, note: '' },
  { id: 'vr12', label: 'Diamètres, flèches, coudes conformes', done: false, note: '' },
  // ── Phase 4: Accessibilité points de soudure ──
  { id: 'vr13', label: 'Accessibilité échelles / escaliers / passerelles', done: false, note: '' },
  { id: 'vr14', label: 'État échafaudages / plans inclinés', done: false, note: '' },
  // ── Phase 5: Montage ──
  { id: 'vr15', label: 'Préparation étiquettes / installation', done: false, note: '' },
  { id: 'vr16', label: 'Non-ouverture des boîtiers vérifiée', done: false, note: '' },
  { id: 'vr17', label: 'Plan de maintenance / fiches techniques présents', done: false, note: '' },
  { id: 'vr18', label: 'Outillage conforme et complet', done: false, note: '' },
  // ── Phase 6: Nettoyage mécanique ──
  { id: 'vr19', label: 'Purge / circulation d\'eau effectuée', done: false, note: '' },
  { id: 'vr20', label: 'Drainages / hydros / trop-pleins en place', done: false, note: '' },
  { id: 'vr21', label: 'Rétention sous réservoirs vérifiée', done: false, note: '' },
  { id: 'vr22', label: 'Chicanes aérauliques installées', done: false, note: '' },
  { id: 'vr23', label: 'Gicleurs en place', done: false, note: '' },
  { id: 'vr24', label: 'Propreté générale mécanique', done: false, note: '' },
  // ── Phase 7: Vérification conformité électrique ──
  { id: 'vr25', label: 'Conformité générale électrique vérifiée', done: false, note: '' },
  { id: 'vr26', label: 'Accessibilité / disponibilité des prises', done: false, note: '' },
  { id: 'vr27', label: 'Conformité des travaux électriques', done: false, note: '' },
  // ── Phase 8: Assemblage & étalonnage ──
  { id: 'vr28', label: 'Préparation surface de travail', done: false, note: '' },
  { id: 'vr29', label: 'Assemblage câbles vérifié', done: false, note: '' },
  { id: 'vr30', label: 'Emballage câbles conforme', done: false, note: '' },
  { id: 'vr31', label: 'Étalonnage effectué et conforme', done: false, note: '' },
  // ── Phase 9: Tests fonctionnels ──
  { id: 'vr32', label: 'Vérification bon fonctionnement mécanisme', done: false, note: '' },
  { id: 'vr33', label: 'Test 20 ouvertures/fermetures passé', done: false, note: '' },
  // ── Phase 10: Finition & remise en état ──
  { id: 'vr34', label: 'Travaux de finition effectués', done: false, note: '' },
  { id: 'vr35', label: 'Remise en état / propreté générale', done: false, note: '' },
  { id: 'vr36', label: 'Balisage / zones de circulation en place', done: false, note: '' },
  // ── Phase 11: Fin de journée ──
  { id: 'vr37', label: 'Nettoyage / remise en ordre du chantier', done: false, note: '' },
  { id: 'vr38', label: 'Compte-rendu envoyé à El Ghani', done: false, note: '' },
  { id: 'vr39', label: 'Photos avancées du chantier', done: false, note: '' },
  { id: 'vr40', label: 'Briefing sécurité fin de journée', done: false, note: '' },
];

export function getChecklistForPhase(phase: string) {
  switch (phase) {
    case 'mecanique': return MECHANICAL_STEPS;
    case 'electrique': return ELECTRICAL_STEPS;
    case 'verification': return VERIFICATION_STEPS;
    default: return [];
  }
}
