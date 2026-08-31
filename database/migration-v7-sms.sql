-- ============================================================================
-- RMASC OnSite v7 — SMS AUTOMATIQUES (chaîne complète)
--   • Mission terminée        → SMS au propriétaire (El Ghani) + admin/dispatcher
--   • Nouvelle mission        → SMS à l'équipe suivante (chef d'équipe)
--   • Aucune équipe dispo     → SMS d'alerte au propriétaire (assignation manuelle)
--   • Chantier réceptionné    → SMS propriétaire + SMS au client
-- Les SMS sont écrits dans sms_outbox (file d'attente) — le worker backend
-- les envoie via Twilio (ou mode simulation si non configuré).
-- ============================================================================
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 0. SÉCURITÉ : equipe_id nullable (mission en attente d'équipe)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE ordres_de_mission ALTER COLUMN equipe_id DROP NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. TABLE : sms_outbox (file d'attente d'envoi — traitée par le worker)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sms_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telephone VARCHAR(20) NOT NULL,
    destinataire_nom VARCHAR(100),
    contenu TEXT NOT NULL,
    type_evenement VARCHAR(50) NOT NULL,
    chantier_id UUID REFERENCES chantiers(id) ON DELETE SET NULL,
    mission_id UUID REFERENCES ordres_de_mission(id) ON DELETE SET NULL,
    equipe_id UUID REFERENCES equipes(id) ON DELETE SET NULL,
    statut VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE',
    tentative INT NOT NULL DEFAULT 0,
    fournisseur VARCHAR(30),
    erreur TEXT,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_envoi TIMESTAMPTZ,
    prochaine_tentative TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_outbox_attente ON sms_outbox (statut, prochaine_tentative);
CREATE INDEX IF NOT EXISTS idx_sms_outbox_chantier ON sms_outbox (chantier_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. FONCTION : programmer_sms — insère un SMS dans la file
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION programmer_sms(
    p_telephone VARCHAR,
    p_destinataire_nom VARCHAR,
    p_contenu TEXT,
    p_type_evenement VARCHAR,
    p_chantier_id UUID DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL,
    p_equipe_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    IF p_telephone IS NULL OR length(trim(p_telephone)) = 0 THEN
        RETURN; -- pas de numéro → on ne programme rien
    END IF;
    INSERT INTO sms_outbox (telephone, destinataire_nom, contenu, type_evenement, chantier_id, mission_id, equipe_id)
    VALUES (trim(p_telephone), p_destinataire_nom, p_contenu, p_type_evenement, p_chantier_id, p_mission_id, p_equipe_id);
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. FONCTION : telephone_equipe — numéro du chef d'équipe (1er user actif)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION telephone_equipe(p_equipe_id UUID)
RETURNS VARCHAR AS $$
DECLARE v_tel VARCHAR;
BEGIN
    SELECT telephone INTO v_tel FROM utilisateurs
    WHERE equipe_id = p_equipe_id AND actif = TRUE
      AND telephone IS NOT NULL AND telephone <> ''
    ORDER BY date_creation LIMIT 1;
    RETURN v_tel;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. TRIGGER : déclencher la phase suivante + PROGRAMMER LES SMS
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION declencher_phase_suivante()
RETURNS TRIGGER AS $$
DECLARE
    v_prochaine_phase phase_mission;
    v_equipe_type type_equipe;
    v_equipe_id UUID;
    v_equipe_nom VARCHAR;
    v_mission_id UUID;
    v_chantier_nom VARCHAR;
    v_chantier_adresse TEXT;
    v_client_tel VARCHAR;
    v_client_nom VARCHAR;
    v_equipe_fin_nom VARCHAR;
    v_tel VARCHAR;
    r RECORD;
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut != 'termine' THEN
        -- ── Infos chantier + équipe qui vient de terminer ──
        SELECT c.nom_chantier, c.adresse, c.client_telephone, c.client_nom,
               COALESCE(e.nom, 'Équipe non renseignée')
          INTO v_chantier_nom, v_chantier_adresse, v_client_tel, v_client_nom, v_equipe_fin_nom
          FROM chantiers c LEFT JOIN equipes e ON e.id = NEW.equipe_id
         WHERE c.id = NEW.chantier_id;

        -- ── 📲 SMS au propriétaire (admins + dispatchers) : phase terminée ──
        FOR r IN
            SELECT telephone, prenom || ' ' || nom AS nom
            FROM utilisateurs
            WHERE role IN ('administrateur','dispatcher') AND actif = TRUE
              AND telephone IS NOT NULL AND telephone <> ''
        LOOP
            PERFORM programmer_sms(r.telephone, r.nom,
                '✅ RMASC: Phase ' || upper(NEW.phase::text) || ' TERMINÉE sur "' || v_chantier_nom ||
                '" — équipe ' || v_equipe_fin_nom || '.',
                'mission_terminee', NEW.chantier_id, NEW.id, NEW.equipe_id);
        END LOOP;

        -- ═══ CAS 1 : vérification terminée → chantier réceptionné ═══
        IF NEW.phase = 'verification' THEN
            UPDATE chantiers SET statut = 'reception_officielle', date_modification = NOW()
            WHERE id = NEW.chantier_id;

            -- 📲 SMS propriétaire : réception officielle
            FOR r IN
                SELECT telephone, prenom || ' ' || nom AS nom
                FROM utilisateurs
                WHERE role IN ('administrateur','dispatcher') AND actif = TRUE
                  AND telephone IS NOT NULL AND telephone <> ''
            LOOP
                PERFORM programmer_sms(r.telephone, r.nom,
                    '🎉 RMASC: "' || v_chantier_nom || '" officiellement RÉCEPTIONNÉ. Toutes les phases sont terminées. Félicitations !',
                    'chantier_receptionne', NEW.chantier_id, NEW.id, NULL);
            END LOOP;

            -- 📲 SMS au client (si numéro renseigné)
            PERFORM programmer_sms(v_client_tel, v_client_nom,
                '🎉 Bonjour ' || COALESCE(v_client_nom,'cher client') || ', votre ascenseur sur "' ||
                v_chantier_nom || '" est TERMINÉ et officiellement réceptionné. Merci de votre confiance — RMASC.',
                'chantier_receptionne', NEW.chantier_id, NEW.id, NULL);

            RETURN NEW;
        END IF;

        -- ═══ CAS 2 : relais vers la phase suivante ═══
        v_prochaine_phase := CASE NEW.phase
            WHEN 'mecanique' THEN 'electrique'::phase_mission
            WHEN 'electrique' THEN 'verification'::phase_mission
            ELSE NULL
        END;
        IF v_prochaine_phase IS NULL THEN RETURN NEW; END IF;

        v_equipe_type := CASE v_prochaine_phase
            WHEN 'mecanique' THEN 'mecanique'::type_equipe
            WHEN 'electrique' THEN 'electrique'::type_equipe
            WHEN 'verification' THEN 'mixte'::type_equipe
        END;

        -- Ne pas créer de doublon
        IF EXISTS (SELECT 1 FROM ordres_de_mission om
                   WHERE om.chantier_id = NEW.chantier_id AND om.phase = v_prochaine_phase) THEN
            RETURN NEW;
        END IF;

        -- Équipe la MOINS CHARGÉE du bon type (rotation intelligente)
        SELECT e.id, e.nom INTO v_equipe_id, v_equipe_nom
        FROM equipes e
        WHERE e.type = v_equipe_type
          AND e.actif = TRUE
          AND e.id <> NEW.equipe_id
          AND e.disponible_a_partir_de <= NOW()
        ORDER BY
          CASE WHEN e.statut_equipe = 'DISPONIBLE' THEN 0 ELSE 1 END,
          (SELECT COUNT(*) FROM ordres_de_mission om
           WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC
        LIMIT 1;

        IF v_equipe_id IS NULL THEN
            -- ── Aucune équipe dispo → mission en attente + SMS admin ──
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
            VALUES (NEW.chantier_id, NULL, v_prochaine_phase, 'en_attente', NOW(),
                    'Phase ' || v_prochaine_phase || ' — aucune equipe dispo, assignation manuelle requise')
            RETURNING id INTO v_mission_id;

            FOR r IN
                SELECT telephone, prenom || ' ' || nom AS nom
                FROM utilisateurs
                WHERE role IN ('administrateur','dispatcher') AND actif = TRUE
                  AND telephone IS NOT NULL AND telephone <> ''
            LOOP
                PERFORM programmer_sms(r.telephone, r.nom,
                    '⚠️ RMASC: Phase ' || upper(v_prochaine_phase::text) || ' prête sur "' ||
                    v_chantier_nom || '" mais AUCUNE équipe disponible. Assignation manuelle requise.',
                    'aucune_equipe', NEW.chantier_id, NULL, NULL);
            END LOOP;
        ELSE
            -- ── Équipe trouvée → mission créée + SMS à l'équipe ──
            UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = v_equipe_id;

            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours, notes)
            VALUES (NEW.chantier_id, v_equipe_id, v_prochaine_phase, 'en_attente', NOW(),
                    (SELECT duree_estimee_jours FROM configuration_phases WHERE phase = v_prochaine_phase),
                    'Declenche auto depuis phase ' || NEW.phase)
            RETURNING id INTO v_mission_id;

            -- 📲 SMS à l'équipe suivante (chef d'équipe)
            v_tel := telephone_equipe(v_equipe_id);
            PERFORM programmer_sms(v_tel, v_equipe_nom,
                '🛗 RMASC: NOUVELLE MISSION ' || upper(v_prochaine_phase::text) || ' — "' || v_chantier_nom ||
                '" à ' || COALESCE(v_chantier_adresse, 'adresse à confirmer') || '. Équipe ' ||
                v_equipe_nom || '. Ordre disponible dans votre app. — El Ghani',
                'mission_assignee', NEW.chantier_id, v_mission_id, v_equipe_id);
        END IF;

        -- ── Checklist + roadmap ──
        IF v_mission_id IS NOT NULL THEN
            INSERT INTO checklists_phases (mission_id, phase, etapes)
            VALUES (v_mission_id, v_prochaine_phase, generer_checklist(v_prochaine_phase::text));

            INSERT INTO roadmap_chantier (chantier_id, phase, equipe_id, statut, date_debut)
            VALUES (NEW.chantier_id, v_prochaine_phase, v_equipe_id, 'EN_ATTENTE', NOW());
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mission_phase_suivante ON ordres_de_mission;
CREATE TRIGGER trg_mission_phase_suivante
    AFTER UPDATE OF statut ON ordres_de_mission
    FOR EACH ROW WHEN (NEW.statut = 'termine' AND (OLD.statut IS DISTINCT FROM 'termine'))
    EXECUTE FUNCTION declencher_phase_suivante();

-- ═══════════════════════════════════════════════════════════════════════
-- 5. TRIGGER : repos 3 jours après une mission terminée
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION appliquer_repos_equipe()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut != 'termine' THEN
        UPDATE equipes SET statut_equipe = 'EN_REPOS', disponible_a_partir_de = NOW() + INTERVAL '3 days'
        WHERE id = NEW.equipe_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_repos_equipe ON ordres_de_mission;
CREATE TRIGGER trg_repos_equipe
    AFTER UPDATE OF statut ON ordres_de_mission
    FOR EACH ROW WHEN (NEW.statut = 'termine' AND (OLD.statut IS DISTINCT FROM 'termine'))
    EXECUTE FUNCTION appliquer_repos_equipe();

COMMIT;
