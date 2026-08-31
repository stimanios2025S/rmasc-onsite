-- ============================================================================
-- RMASC OnSite v5 — DONNÉES RÉELLES DE PRODUCTION (usine)
-- 18 équipes mécaniques + 3 équipes électriques + 1 vérification
-- 23 chantiers en cours de réalisation
-- ============================================================================
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. RESTRUCTURER LES ÉQUIPES (18 Méca + 3 Élec + 1 Vérif)
-- ═══════════════════════════════════════════════════════════════════════

-- Supprimer les anciennes équipes et leurs comptes
DELETE FROM utilisateurs WHERE identifiant LIKE 'meca%' OR identifiant LIKE 'elec%' OR identifiant = 'verif1';
DELETE FROM ordres_de_mission WHERE equipe_id::text LIKE 'e1000000-%';
DELETE FROM checklists_phases;
DELETE FROM equipes WHERE id::text LIKE 'e1000000-%';

-- 18 ÉQUIPES MÉCANIQUES
INSERT INTO equipes (id, nom, type, couleur_hex) VALUES
('f0000000-0000-4000-8000-000000000001','Meca-01','mecanique','#2196F3'),
('f0000000-0000-4000-8000-000000000002','Meca-02','mecanique','#1976D2'),
('f0000000-0000-4000-8000-000000000003','Meca-03','mecanique','#1565C0'),
('f0000000-0000-4000-8000-000000000004','Meca-04','mecanique','#0D47A1'),
('f0000000-0000-4000-8000-000000000005','Meca-05','mecanique','#1E88E5'),
('f0000000-0000-4000-8000-000000000006','Meca-06','mecanique','#42A5F5'),
('f0000000-0000-4000-8000-000000000007','Meca-07','mecanique','#2962FF'),
('f0000000-0000-4000-8000-000000000008','Meca-08','mecanique','#0277BD'),
('f0000000-0000-4000-8000-000000000009','Meca-09','mecanique','#01579B'),
('f0000000-0000-4000-8000-000000000010','Meca-10','mecanique','#0D47A1'),
('f0000000-0000-4000-8000-000000000011','Meca-11','mecanique','#64B5F6'),
('f0000000-0000-4000-8000-000000000012','Meca-12','mecanique','#1E88E5'),
('f0000000-0000-4000-8000-000000000013','Meca-13','mecanique','#1976D2'),
('f0000000-0000-4000-8000-000000000014','Meca-14','mecanique','#2196F3'),
('f0000000-0000-4000-8000-000000000015','Meca-15','mecanique','#1565C0'),
('f0000000-0000-4000-8000-000000000016','Meca-16','mecanique','#0D47A1'),
('f0000000-0000-4000-8000-000000000017','Meca-17','mecanique','#0277BD'),
('f0000000-0000-4000-8000-000000000018','Meca-18','mecanique','#2962FF');

-- 3 ÉQUIPES ÉLECTRIQUES
INSERT INTO equipes (id, nom, type, couleur_hex) VALUES
('f0000000-0000-4000-8000-000000000101','Elec-01','electrique','#FF9800'),
('f0000000-0000-4000-8000-000000000102','Elec-02','electrique','#F57C00'),
('f0000000-0000-4000-8000-000000000103','Elec-03','electrique','#E65100');

-- 1 ÉQUIPE VÉRIFICATION
INSERT INTO equipes (id, nom, type, couleur_hex) VALUES
('f0000000-0000-4000-8000-000000000201','Verif-01','mixte','#4CAF50');

-- ═══════════════════════════════════════════════════════════════════════
-- 2. CRÉER LES COMPTES (18 meca + 3 elec + 1 verif) — mdp: rmasc2026
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO utilisateurs (identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id)
SELECT 'meca'||LPAD(i::text,2,'0'),
       'meca'||LPAD(i::text,2,'0')||'@rmasc.dz',
       crypt('rmasc2026', gen_salt('bf')),
       'Meca-'||LPAD(i::text,2,'0'), '', 'technicien',
       ('f0000000-0000-4000-8000-0000000000'||LPAD(i::text,3,'0'))::uuid
FROM generate_series(1,18) i;

INSERT INTO utilisateurs (identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id)
SELECT 'elec'||i,
       'elec'||i||'@rmasc.dz',
       crypt('rmasc2026', gen_salt('bf')),
       'Elec-'||LPAD(i::text,2,'0'), '', 'technicien',
       ('f0000000-0000-4000-8000-0000000001'||LPAD(i::text,2,'0'))::uuid
FROM generate_series(1,3) i;

INSERT INTO utilisateurs (identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id)
VALUES ('verif1', 'verif1@rmasc.dz', crypt('rmasc2026', gen_salt('bf')),
        'Verif-01', '', 'ingenieur',
        'f0000000-0000-4000-8000-000000000201');

-- ═══════════════════════════════════════════════════════════════════════
-- 3. LES 23 CHANTIERS RÉELS EN COURS
-- ═══════════════════════════════════════════════════════════════════════

-- 1-4: Région Béjaïa
INSERT INTO chantiers (reference_commande_erp, nom_chantier, adresse, coordonnees, statut, complexite) VALUES
('R-2026-0001','Fateh areston','Béjaïa',ST_SetSRID(ST_MakePoint(5.0580, 36.7500),4326),'en_cours','MOYENNE'),
('R-2026-0002','ben azzouz béni kssila','Béni Ksila, Béjaïa',ST_SetSRID(ST_MakePoint(5.0300, 36.7800),4326),'en_cours','MOYENNE'),
('R-2026-0003','Djarmouli akbou','Akbou, Béjaïa',ST_SetSRID(ST_MakePoint(4.5300, 36.4600),4326),'en_cours','FACILE'),
('R-2026-0004','Université BBA','Bordj Bou Arréridj',ST_SetSRID(ST_MakePoint(4.7700, 36.0700),4326),'en_cours','DIFFICILE');

-- 5-10: Région Tizi Ouzou
INSERT INTO chantiers (reference_commande_erp, nom_chantier, adresse, coordonnees, statut, complexite) VALUES
('R-2026-0005','aures emballage Tizi','Tizi Ouzou',ST_SetSRID(ST_MakePoint(4.0500, 36.7100),4326),'en_cours','MOYENNE'),
('R-2026-0006','villa DBK Tizi','Tizi Ouzou',ST_SetSRID(ST_MakePoint(4.0600, 36.7200),4326),'en_cours','FACILE'),
('R-2026-0007','Samir bahloul Tizi','Tizi Ouzou',ST_SetSRID(ST_MakePoint(4.0500, 36.7100),4326),'en_cours','MOYENNE'),
('R-2026-0008','haouimdi Malek Tizi','Tizi Ouzou',ST_SetSRID(ST_MakePoint(4.0400, 36.7000),4326),'en_cours','FACILE'),
('R-2026-0009','Kamel ben Tayeb Tizi','Tizi Ouzou',ST_SetSRID(ST_MakePoint(4.0700, 36.7300),4326),'en_cours','MOYENNE'),
('R-2026-0010','salle des fêtes tamaghra Tizi','Tamaghra, Tizi Ouzou',ST_SetSRID(ST_MakePoint(4.0300, 36.6900),4326),'en_cours','FACILE');

-- 11-15: Région Alger
INSERT INTO chantiers (reference_commande_erp, nom_chantier, adresse, coordonnees, statut, complexite) VALUES
('R-2026-0011','boutelja immo Houcine dey','Hussein Dey, Alger',ST_SetSRID(ST_MakePoint(3.1000, 36.7400),4326),'en_cours','DIFFICILE'),
('R-2026-0012','ramy cosmétiques rouiba','Rouiba, Alger',ST_SetSRID(ST_MakePoint(3.2800, 36.7300),4326),'en_cours','MOYENNE'),
('R-2026-0013','promotion BENZ cheraga Alger','Chéraga, Alger',ST_SetSRID(ST_MakePoint(2.9200, 36.7700),4326),'en_cours','MOYENNE'),
('R-2026-0014','Batata Kouba','Kouba, Alger',ST_SetSRID(ST_MakePoint(3.0900, 36.7300),4326),'en_cours','FACILE'),
('R-2026-0015','aures emballage boufarik','Boufarik, Blida',ST_SetSRID(ST_MakePoint(3.2400, 36.5700),4326),'en_cours','MOYENNE');

-- 16-19: Oran
INSERT INTO chantiers (reference_commande_erp, nom_chantier, adresse, coordonnees, statut, complexite) VALUES
('R-2026-0016','Saidi oran','Oran',ST_SetSRID(ST_MakePoint(-0.6400, 35.7000),4326),'en_cours','MOYENNE'),
('R-2026-0017','EURL hayem nour oran','Oran',ST_SetSRID(ST_MakePoint(-0.6300, 35.7100),4326),'en_cours','FACILE'),
('R-2026-0018','baddache oran','Oran',ST_SetSRID(ST_MakePoint(-0.6500, 35.6900),4326),'en_cours','MOYENNE'),
('R-2026-0019','Ouari Oran','Oran',ST_SetSRID(ST_MakePoint(-0.6200, 35.7200),4326),'en_cours','FACILE');

-- 20-23: Autres régions
INSERT INTO chantiers (reference_commande_erp, nom_chantier, adresse, coordonnees, statut, complexite) VALUES
('R-2026-0020','baddache BBA','Bordj Bou Arréridj',ST_SetSRID(ST_MakePoint(4.7700, 36.0800),4326),'en_cours','MOYENNE'),
('R-2026-0021','Eurl magestique de voyage el qala','El Kala, El Tarf',ST_SetSRID(ST_MakePoint(8.4400, 36.8900),4326),'en_cours','DIFFICILE'),
('R-2026-0022','rida liso sidi aiche','Sidi Aïch, Béjaïa',ST_SetSRID(ST_MakePoint(4.6600, 36.6200),4326),'en_cours','MOYENNE'),
('R-2026-0023','aiyadi oran','Oran',ST_SetSRID(ST_MakePoint(-0.6300, 35.7000),4326),'en_cours','FACILE');

-- ═══════════════════════════════════════════════════════════════════════
-- 4. ASSIGNER LES ÉQUIPES AUX CHANTIERS (méca → chantiers 1-18, élec → chantiers 19-23)
--    Créer missions + checklists mécaniques
-- ═══════════════════════════════════════════════════════════════════════

-- Mission mécanique pour chaque chantier, équipes méca 1-18
INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours)
SELECT c.id, e.id, 'mecanique', 'en_cours', NOW(), 4.0
FROM chantiers c
JOIN equipes e ON e.nom = 'Meca-'||LPAD(row_number() OVER (ORDER BY c.reference_commande_erp)::text,2,'0')
WHERE c.reference_commande_erp BETWEEN 'R-2026-0001' AND 'R-2026-0018';

-- Checklists mécaniques pour ces missions
INSERT INTO checklists_phases (mission_id, phase, etapes)
SELECT om.id, 'mecanique', generer_checklist('mecanique')
FROM ordres_de_mission om WHERE om.phase = 'mecanique';

-- Marquer les équipes méca 1-18 en mission
UPDATE equipes SET statut_equipe = 'EN_MISSION'
WHERE nom IN ('Meca-01','Meca-02','Meca-03','Meca-04','Meca-05','Meca-06','Meca-07','Meca-08',
              'Meca-09','Meca-10','Meca-11','Meca-12','Meca-13','Meca-14','Meca-15','Meca-16','Meca-17','Meca-18');

-- Mission électrique pour les chantiers 19-23 (équipes élec 1-3, rotation)
INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours)
SELECT c.id, e.id, 'electrique', 'en_cours', NOW(), 3.0
FROM (
  SELECT id, row_number() OVER (ORDER BY reference_commande_erp) AS rn
  FROM chantiers WHERE reference_commande_erp BETWEEN 'R-2026-0019' AND 'R-2026-0023'
) c
JOIN equipes e ON e.nom = 'Elec-'||LPAD(((c.rn - 1) % 3 + 1)::text,2,'0');

-- Checklists électriques
INSERT INTO checklists_phases (mission_id, phase, etapes)
SELECT om.id, 'electrique', generer_checklist('electrique')
FROM ordres_de_mission om WHERE om.phase = 'electrique';

-- Marquer les équipes élec en mission
UPDATE equipes SET statut_equipe = 'EN_MISSION'
WHERE nom IN ('Elec-01','Elec-02','Elec-03');

COMMIT;
