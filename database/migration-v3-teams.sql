-- ============================================================================
-- RMASC OnSite v3 — Restructuration équipes (10 Méca + 10 Élec + 1 Vérif)
-- + Table équipements par équipe
-- ============================================================================
BEGIN;

-- ═══ 1. SUPPRIMER LES ANCIENNES ÉQUIPES (15) ET COMPTES ═══
DELETE FROM utilisateurs WHERE identifiant IN (
  'meca1','meca2','meca3','meca4','meca5',
  'elec1','elec2','elec3','elec4','elec5',
  'verif1','verif2','verif3','verif4','verif5'
);

-- Supprimer les missions orphelines de ces équipes
DELETE FROM ordres_de_mission WHERE equipe_id::text LIKE 'e0010000-%';

DELETE FROM equipes WHERE id::text LIKE 'e0010000-%';

-- ═══ 2. CRÉER LES 21 NOUVELLES ÉQUIPES ═══
-- 10 équipes Mécaniques
INSERT INTO equipes (id, nom, type, couleur_hex) VALUES
('e1000000-0000-4000-8000-000000000001','Meca-01','mecanique','#2196F3'),
('e1000000-0000-4000-8000-000000000002','Meca-02','mecanique','#1976D2'),
('e1000000-0000-4000-8000-000000000003','Meca-03','mecanique','#1565C0'),
('e1000000-0000-4000-8000-000000000004','Meca-04','mecanique','#0D47A1'),
('e1000000-0000-4000-8000-000000000005','Meca-05','mecanique','#1E88E5'),
('e1000000-0000-4000-8000-000000000006','Meca-06','mecanique','#42A5F5'),
('e1000000-0000-4000-8000-000000000007','Meca-07','mecanique','#2962FF'),
('e1000000-0000-4000-8000-000000000008','Meca-08','mecanique','#0277BD'),
('e1000000-0000-4000-8000-000000000009','Meca-09','mecanique','#01579B'),
('e1000000-0000-4000-8000-000000000010','Meca-10','mecanique','#0D47A1');

-- 10 équipes Électriques
INSERT INTO equipes (id, nom, type, couleur_hex) VALUES
('e1000000-0000-4000-8000-000000000011','Elec-01','electrique','#FF9800'),
('e1000000-0000-4000-8000-000000000012','Elec-02','electrique','#F57C00'),
('e1000000-0000-4000-8000-000000000013','Elec-03','electrique','#E65100'),
('e1000000-0000-4000-8000-000000000014','Elec-04','electrique','#BF360C'),
('e1000000-0000-4000-8000-000000000015','Elec-05','electrique','#FF6D00'),
('e1000000-0000-4000-8000-000000000016','Elec-06','electrique','#FB8C00'),
('e1000000-0000-4000-8000-000000000017','Elec-07','electrique','#EF6C00'),
('e1000000-0000-4000-8000-000000000018','Elec-08','electrique','#D84315'),
('e1000000-0000-4000-8000-000000000019','Elec-09','electrique','#E64A19'),
('e1000000-0000-4000-8000-000000000020','Elec-10','electrique','#F4511E');

-- 1 équipe Vérification (1 personne)
INSERT INTO equipes (id, nom, type, couleur_hex) VALUES
('e1000000-0000-4000-8000-000000000021','Verif-01','mixte','#4CAF50');

-- ═══ 3. CRÉER LES COMPTES (mot de passe = rmasc2026) ═══
INSERT INTO utilisateurs (identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id)
SELECT 'meca'||i, 'meca'||i||'@rmasc.dz', crypt('rmasc2026', gen_salt('bf')),
       'Meca-'||LPAD(i::text,2,'0'), '', 'technicien',
       ('e1000000-0000-4000-8000-00000000000'||LPAD(i::text,2,'0'))::uuid
FROM generate_series(1,10) i;

INSERT INTO utilisateurs (identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id)
SELECT 'elec'||i, 'elec'||i||'@rmasc.dz', crypt('rmasc2026', gen_salt('bf')),
       'Elec-'||LPAD(i::text,2,'0'), '', 'technicien',
       ('e1000000-0000-4000-8000-0000000000'||LPAD((i+10)::text,2,'0'))::uuid
FROM generate_series(1,10) i;

INSERT INTO utilisateurs (identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id)
VALUES ('verif1', 'verif1@rmasc.dz', crypt('rmasc2026', gen_salt('bf')),
        'Verif-01', '', 'ingenieur',
        'e1000000-0000-4000-8000-000000000021');

-- ═══ 4. TABLE ÉQUIPEMENTS PAR ÉQUIPE ═══
CREATE TABLE IF NOT EXISTS equipements_equipe (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipe_id UUID NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
    nom VARCHAR(200) NOT NULL,
    categorie VARCHAR(50) NOT NULL DEFAULT 'OUTIL',
    quantite INTEGER NOT NULL DEFAULT 1,
    etat VARCHAR(50) NOT NULL DEFAULT 'OPERATIONNEL', -- OPERATIONNEL / MAINTENANCE / HORS_SERVICE
    date_assignation TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 5. TABLE ÉQUIPEMENTS PAR CHANTIER (exigés pour la mission) ═══
CREATE TABLE IF NOT EXISTS equipements_chantier (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    nom VARCHAR(200) NOT NULL,
    quantite INTEGER NOT NULL DEFAULT 1,
    fourni_par VARCHAR(50) NOT NULL DEFAULT 'RMASC', -- RMASC / CLIENT
    verifie BOOLEAN DEFAULT FALSE
);

-- ═══ 6. TABLE NOTIFICATIONS RETARD ═══
CREATE TABLE IF NOT EXISTS notifications_retard (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    mission_id UUID NOT NULL REFERENCES ordres_de_mission(id) ON DELETE CASCADE,
    equipe_id UUID NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
    motif TEXT NOT NULL,
    etape_id VARCHAR(20),
    photo_url TEXT,
    lue BOOLEAN DEFAULT FALSE,
    date_creation TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
