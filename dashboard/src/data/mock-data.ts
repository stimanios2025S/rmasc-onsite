import type { Chantier, Equipe, Alerte, PointageRecent, PerformanceEquipe, CauseRetard, KpiData } from '@/types';

export const KPI_MOCK: KpiData = {
  chantiersActifs: 18, chantiersBloques: 4,
  equipesDeployees: 24, equipesTotal: 30,
  alertesPerimetre: 3,
  evolutionChantiersActifs: 12.5,
  evolutionChantiersBloques: -8.3,
};

export const EQUIPES_MOCK: Equipe[] = [
  { id: 'E1', nom: 'Meca-Nord', type: 'mecanique', membresActifs: 4, membresTotal: 5, chargeActuelle: 2, dureeMoyenneIntervention: 145 },
  { id: 'E2', nom: 'Meca-Sud', type: 'mecanique', membresActifs: 3, membresTotal: 4, chargeActuelle: 1, dureeMoyenneIntervention: 132 },
  { id: 'E3', nom: 'Meca-Est', type: 'mecanique', membresActifs: 5, membresTotal: 5, chargeActuelle: 3, dureeMoyenneIntervention: 158 },
  { id: 'E4', nom: 'Elec-Nord', type: 'electrique', membresActifs: 3, membresTotal: 4, chargeActuelle: 2, dureeMoyenneIntervention: 112 },
  { id: 'E5', nom: 'Elec-Sud', type: 'electrique', membresActifs: 4, membresTotal: 5, chargeActuelle: 1, dureeMoyenneIntervention: 98 },
  { id: 'E6', nom: 'Elec-Ouest', type: 'electrique', membresActifs: 4, membresTotal: 4, chargeActuelle: 3, dureeMoyenneIntervention: 127 },
  { id: 'E7', nom: 'Mixte-Mobile', type: 'mixte', membresActifs: 3, membresTotal: 3, chargeActuelle: 0, dureeMoyenneIntervention: 88 },
];

export const CHANTIERS_MOCK: Chantier[] = [
  { id: 'C001', referenceERP: 'ERP-2026-07-001', nom: 'Pharmacie Centrale Lyon', adresse: '12 Rue de la Republique, 69001 Lyon', coordonnees: { lat: 45.7640, lng: 4.8357 }, phase: 'mecanique', statut: 'en_cours', equipeId: 'E1', equipeNom: 'Meca-Nord', techniciens: ['Jean Dupont', 'Marie Martin'], rayonGeofencing: 50, dernierPointageDistance: 12, dernierPointageHorodatage: '2026-07-28T08:15:00Z', dateCreation: '2026-07-20T10:00:00Z' },
  { id: 'C002', referenceERP: 'ERP-2026-07-002', nom: 'Bureaux Tech3P Marseille', adresse: '45 Avenue du Prado, 13008 Marseille', coordonnees: { lat: 43.2695, lng: 5.3698 }, phase: 'electrique', statut: 'bloque', equipeId: 'E4', equipeNom: 'Elec-Nord', techniciens: ['Pierre Lefevre', 'Sophie Moreau'], rayonGeofencing: 50, dernierPointageDistance: 8, dernierPointageHorodatage: '2026-07-28T09:30:00Z', dateCreation: '2026-07-19T14:00:00Z' },
  { id: 'C003', referenceERP: 'ERP-2026-07-003', nom: 'Entrepot Logistique Paris', adresse: '88 Boulevard de Sebastopol, 75003 Paris', coordonnees: { lat: 48.8566, lng: 2.3522 }, phase: 'verification', statut: 'bloque', equipeId: 'E7', equipeNom: 'Mixte-Mobile', techniciens: ['Lucas Bernard', 'Emma Petit'], rayonGeofencing: 75, dernierPointageDistance: 4, dernierPointageHorodatage: '2026-07-27T16:45:00Z', dateCreation: '2026-07-18T08:00:00Z' },
  { id: 'C004', referenceERP: 'ERP-2026-07-004', nom: 'Clinique Saint-Charles', adresse: '15 Rue des Capucins, 69001 Lyon', coordonnees: { lat: 45.7670, lng: 4.8300 }, phase: 'electrique', statut: 'en_attente', equipeId: 'E5', equipeNom: 'Elec-Sud', techniciens: ['Sarah Dupuis', 'Antoine Germain'], rayonGeofencing: 50, dernierPointageDistance: null, dernierPointageHorodatage: null, dateCreation: '2026-07-25T11:00:00Z' },
  { id: 'C005', referenceERP: 'ERP-2026-07-005', nom: 'Supermarché Auchan Nord', adresse: '200 Route de Geneve, 69140 Rillieux-la-Pape', coordonnees: { lat: 45.8260, lng: 4.8980 }, phase: 'mecanique', statut: 'en_cours', equipeId: 'E2', equipeNom: 'Meca-Sud', techniciens: ['Nicolas Blanc', 'Julie Roux'], rayonGeofencing: 50, dernierPointageDistance: 23, dernierPointageHorodatage: '2026-07-28T07:50:00Z', dateCreation: '2026-07-22T09:00:00Z' },
  { id: 'C006', referenceERP: 'ERP-2026-07-006', nom: 'Residence Les Alizes', adresse: '5 Avenue des Fleurs, 13008 Marseille', coordonnees: { lat: 43.2650, lng: 5.3750 }, phase: 'mecanique', statut: 'termine', equipeId: 'E3', equipeNom: 'Meca-Est', techniciens: ['Hugo Faure', 'Camille Michel'], rayonGeofencing: 50, dernierPointageDistance: 0, dernierPointageHorodatage: '2026-07-27T14:30:00Z', dateCreation: '2026-07-15T08:00:00Z' },
  { id: 'C007', referenceERP: 'ERP-2026-07-007', nom: 'Gare SNCF Part-Dieu', adresse: '5 Place Charles Berardier, 69003 Lyon', coordonnees: { lat: 45.7606, lng: 4.8594 }, phase: 'electrique', statut: 'en_cours', equipeId: 'E6', equipeNom: 'Elec-Ouest', techniciens: ['Thomas Caron', 'Laura Fournier'], rayonGeofencing: 50, dernierPointageDistance: 7, dernierPointageHorodatage: '2026-07-28T08:30:00Z', dateCreation: '2026-07-21T13:00:00Z' },
  { id: 'C008', referenceERP: 'ERP-2026-07-008', nom: 'College Jean Moulin', adresse: '18 Rue des Ecoles, 69007 Lyon', coordonnees: { lat: 45.7300, lng: 4.8400 }, phase: 'verification', statut: 'en_cours', equipeId: 'E7', equipeNom: 'Mixte-Mobile', techniciens: ['Lucas Bernard', 'Emma Petit'], rayonGeofencing: 50, dernierPointageDistance: 15, dernierPointageHorodatage: '2026-07-28T09:00:00Z', dateCreation: '2026-07-10T08:00:00Z' },
  { id: 'C009', referenceERP: 'ERP-2026-07-009', nom: 'Usine Seb Meyzieu', adresse: '15 Rue de la Productique, 69330 Meyzieu', coordonnees: { lat: 45.7700, lng: 5.0000 }, phase: 'mecanique', statut: 'en_attente', equipeId: 'E1', equipeNom: 'Meca-Nord', techniciens: ['Jean Dupont', 'Marie Martin'], rayonGeofencing: 50, dernierPointageDistance: null, dernierPointageHorodatage: null, dateCreation: '2026-07-26T10:00:00Z' },
];

export const ALERTES_MOCK: Alerte[] = [
  { id: 'A001', type: 'blocage', priorite: 'critique', chantierId: 'C002', chantierNom: 'Bureaux Tech3P Marseille', message: 'Piece ERP #A-902 manquante', detail: 'Le disjoncteur principal reference A-902 est manquant dans le colis.', horodatage: '2026-07-28T09:45:00Z', lue: false, pieceERP: 'A-902' },
  { id: 'A002', type: 'blocage', priorite: 'haute', chantierId: 'C003', chantierNom: 'Entrepot Logistique Paris', message: 'Client absent – Signature impossible', detail: 'Le client n\'etait pas present sur site.', horodatage: '2026-07-27T17:00:00Z', lue: false },
  { id: 'A003', type: 'perimetre', priorite: 'moyenne', chantierId: 'C005', chantierNom: 'Supermarché Auchan Nord', message: 'Equipe a 78m du chantier', detail: 'L\'equipe Meca-Sud s\'est eloignee a 78m (limite: 50m).', horodatage: '2026-07-28T10:12:00Z', lue: false },
  { id: 'A004', type: 'requisition', priorite: 'haute', chantierId: 'C002', chantierNom: 'Bureaux Tech3P Marseille', message: 'Requisition #REQ-487 pour piece A-902', detail: 'Montant: 340 EUR.', horodatage: '2026-07-28T09:50:00Z', lue: true, pieceERP: 'A-902' },
  { id: 'A005', type: 'perimetre', priorite: 'basse', chantierId: 'C001', chantierNom: 'Pharmacie Centrale Lyon', message: 'Technicien a 52m (retour zone)', detail: 'Jean Dupont a brievement depasse la zone.', horodatage: '2026-07-28T08:22:00Z', lue: true },
  { id: 'A006', type: 'phase', priorite: 'info', chantierId: 'C006', chantierNom: 'Residence Les Alizes', message: 'Phase Mecanique terminee', detail: 'Passage en Electrique automatique.', horodatage: '2026-07-27T14:35:00Z', lue: true },
  { id: 'A007', type: 'perimetre', priorite: 'moyenne', chantierId: 'C007', chantierNom: 'Gare SNCF Part-Dieu', message: 'Equipe Elec-Ouest a 63m', detail: 'Alerte de perimetre declenchee.', horodatage: '2026-07-28T10:05:00Z', lue: false },
];

export const POINTAGES_MOCK: Record<string, PointageRecent[]> = {
  C001: [
    { id: 'P001', technicienNom: 'Jean Dupont', type: 'arrivee', distanceM: 12, horodatage: '2026-07-28T08:00:00Z', conforme: true },
    { id: 'P002', technicienNom: 'Marie Martin', type: 'arrivee', distanceM: 18, horodatage: '2026-07-28T08:05:00Z', conforme: true },
  ],
  C002: [
    { id: 'P004', technicienNom: 'Pierre Lefevre', type: 'arrivee', distanceM: 8, horodatage: '2026-07-28T09:30:00Z', conforme: true },
  ],
  C005: [
    { id: 'P006', technicienNom: 'Nicolas Blanc', type: 'arrivee', distanceM: 23, horodatage: '2026-07-28T07:30:00Z', conforme: true },
    { id: 'P007', technicienNom: 'Julie Roux', type: 'arrivee', distanceM: 78, horodatage: '2026-07-28T10:12:00Z', conforme: false },
  ],
};

export const PERFORMANCE_MOCK: PerformanceEquipe[] = [
  { equipeNom: 'Meca-Nord', equipeType: 'Mecanique', dureeMoyenneMecanique: 145, dureeMoyenneElectrique: 0, dureeMoyenneVerification: 0, nbMissionsTerminees: 12 },
  { equipeNom: 'Meca-Sud', equipeType: 'Mecanique', dureeMoyenneMecanique: 132, dureeMoyenneElectrique: 0, dureeMoyenneVerification: 0, nbMissionsTerminees: 10 },
  { equipeNom: 'Meca-Est', equipeType: 'Mecanique', dureeMoyenneMecanique: 158, dureeMoyenneElectrique: 0, dureeMoyenneVerification: 0, nbMissionsTerminees: 14 },
  { equipeNom: 'Elec-Nord', equipeType: 'Electrique', dureeMoyenneMecanique: 0, dureeMoyenneElectrique: 112, dureeMoyenneVerification: 0, nbMissionsTerminees: 9 },
  { equipeNom: 'Elec-Sud', equipeType: 'Electrique', dureeMoyenneMecanique: 0, dureeMoyenneElectrique: 98, dureeMoyenneVerification: 0, nbMissionsTerminees: 11 },
  { equipeNom: 'Elec-Ouest', equipeType: 'Electrique', dureeMoyenneMecanique: 0, dureeMoyenneElectrique: 127, dureeMoyenneVerification: 0, nbMissionsTerminees: 8 },
  { equipeNom: 'Mixte-Mobile', equipeType: 'Mixte', dureeMoyenneMecanique: 85, dureeMoyenneElectrique: 92, dureeMoyenneVerification: 78, nbMissionsTerminees: 15 },
];

export const CAUSES_RETARD_MOCK: CauseRetard[] = [
  { cause: 'Pieces manquantes / ERP', pourcentage: 42, couleur: '#FF5252' },
  { cause: 'Client absent', pourcentage: 22, couleur: '#FF9800' },
  { cause: 'Site non prepare', pourcentage: 18, couleur: '#FFC107' },
  { cause: 'Probleme de transport', pourcentage: 10, couleur: '#3B4BB9' },
  { cause: 'Conditions meteo', pourcentage: 5, couleur: '#20C997' },
  { cause: 'Autres', pourcentage: 3, couleur: '#A8AEC5' },
];
