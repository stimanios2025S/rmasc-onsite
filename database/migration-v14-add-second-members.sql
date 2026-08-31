-- ============================================================================
-- Migration v14 — Add second member to each team
-- Each team (Meca, Elec, Verif) should have exactly 2 members
-- ============================================================================

BEGIN;

-- Add a second member to each team that currently has only 1 member
-- We use a naming pattern consistent with the existing migration-v3 structure

-- For teams that have exactly 1 member, add a second one
DO $$
DECLARE
    team_rec RECORD;
    existing_count INT;
    newprenom TEXT;
    newnom TEXT;
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
        -- Count existing members
        SELECT COUNT(*) INTO existing_count
        FROM utilisateurs u
        WHERE u.equipe_id = team_rec.id AND u.actif = TRUE;

        IF existing_count < 2 THEN
            -- Get the next member number for this team
            SELECT COALESCE(MAX(
                CASE
                    WHEN u.identifiant ~ '^[a-z]+[0-9]+$' THEN
                        (regexp_match(u.identifiant, '([0-9]+)$'))[1]::int
                    ELSE 0
                END
            ), 0) + 1 INTO member_num
            FROM utilisateurs u
            WHERE u.equipe_id = team_rec.id AND u.actif = TRUE;

            -- Generate second member details
            newidentifiant := LOWER(REPLACE(team_rec.nom, '-', '')) || member_num;
            newemail := newidentifiant || '@rmasc.dz';
            newprenom := team_rec.nom || '-' || LPAD(member_num::text, 2, '0');
            newnom := '';

            -- Determine role based on team type
            IF team_rec.type = 'mixte' THEN
                newrole := 'ingenieur';
            ELSE
                newrole := 'technicien';
            END IF;

            -- Insert the second member
            INSERT INTO utilisateurs (identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id, actif)
            VALUES (
                newidentifiant,
                newemail,
                crypt('rmasc2026', gen_salt('bf')),
                newprenom,
                newnom,
                newrole,
                team_rec.id,
                TRUE
            )
            ON CONFLICT (identifiant) DO NOTHING;

            RAISE NOTICE 'Added member % to team %', newprenom, team_rec.nom;
        ELSE
            RAISE NOTICE 'Team % already has % members, skipping', team_rec.nom, existing_count;
        END IF;
    END LOOP;
END $$;

-- Verify: show all teams with member counts
SELECT e.nom AS equipe, e.type::text, COUNT(u.id) AS membres
FROM equipes e
LEFT JOIN utilisateurs u ON u.equipe_id = e.id AND u.actif = TRUE
WHERE e.actif = TRUE
GROUP BY e.id, e.nom, e.type
ORDER BY e.type, e.nom;

COMMIT;
