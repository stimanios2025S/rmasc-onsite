-- ============================================================================
-- Migration v14 — Fix second members + map issues
-- ============================================================================

BEGIN;

-- 1. Allow nullable coordinates (chantiers can be created without GPS)
ALTER TABLE chantiers ALTER COLUMN coordonnees DROP NOT NULL;

-- 2. Add second member to each team with only 1 member
DO $$
DECLARE
    team_rec RECORD;
    existing_count INT;
    newprenom TEXT;
    newidentifiant TEXT;
    newemail TEXT;
    newrole role_utilisateur;
    member_num INT;
BEGIN
    FOR team_rec IN
        SELECT e.id, e.nom, e.type
        FROM equipes e
        WHERE e.actif = TRUE
        ORDER BY e.type, e.nom
    LOOP
        SELECT COUNT(*) INTO existing_count
        FROM utilisateurs u
        WHERE u.equipe_id = team_rec.id AND u.actif = TRUE;

        IF existing_count < 2 THEN
            SELECT COALESCE(MAX(
                CASE
                    WHEN u.identifiant ~ '^[a-z]+[0-9]+$' THEN
                        (regexp_match(u.identifiant, '([0-9]+)$'))[1]::int
                    ELSE 0
                END
            ), 0) + 1 INTO member_num
            FROM utilisateurs u
            WHERE u.equipe_id = team_rec.id AND u.actif = TRUE;

            newidentifiant := LOWER(REPLACE(team_rec.nom, '-', '')) || member_num;
            newemail := newidentifiant || '@rmasc.dz';
            newprenom := team_rec.nom || '-' || LPAD(member_num::text, 2, '0');

            IF team_rec.type = 'mixte' THEN
                newrole := 'ingenieur';
            ELSE
                newrole := 'technicien';
            END IF;

            INSERT INTO utilisateurs (identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id, actif)
            VALUES (newidentifiant, newemail, crypt('rmasc2026', gen_salt('bf')),
                    newprenom, '', newrole, team_rec.id, TRUE)
            ON CONFLICT (identifiant) DO NOTHING;
        END IF;
    END LOOP;
END $$;

-- 3. Verify results
SELECT e.nom AS equipe, e.type::text, COUNT(u.id) AS membres,
       STRING_AGG(u.prenom, ', ' ORDER BY u.prenom) AS noms
FROM equipes e
LEFT JOIN utilisateurs u ON u.equipe_id = e.id AND u.actif = TRUE
WHERE e.actif = TRUE
GROUP BY e.id, e.nom, e.type
ORDER BY e.type, e.nom;

COMMIT;
