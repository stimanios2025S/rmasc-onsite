-- ============================================================================
-- RMASC OnSite v25 — Checklists PRO : installation + auto-contrôle + vérificateur
-- m7 poulie tendeuse / m12 cabine + 1/2 / e10 apprentissage et réglage étages
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS generer_checklist(text);

CREATE OR REPLACE FUNCTION generer_checklist(p_phase TEXT)
RETURNS JSONB AS $$
BEGIN
  IF p_phase = 'mecanique' THEN
    RETURN '[
      {"id":"m1","label":"Arrivage au chantier — vérification stock & lieu de déchargement","done":false},
      {"id":"m2","label":"Plombage de gaine","done":false},
      {"id":"m3","label":"Installation des rails guides","done":false},
      {"id":"m4","label":"Mise en place de châssis moteur et le moteur","done":false},
      {"id":"m5","label":"Installation de l''arcade avec plateau + le contrepoids","done":false},
      {"id":"m6","label":"L''élingue et l''attelage","done":false},
      {"id":"m7","label":"Installation de régulateur de vitesse et la poulie tendeuse","done":false},
      {"id":"m8","label":"L''inspection","done":false},
      {"id":"m9","label":"Installation des portes paliers","done":false},
      {"id":"m10","label":"Installation de la cabine","done":false},
      {"id":"m11","label":"Installation des portes cabine","done":false},
      {"id":"m12","label":"L''équilibrage du contrepoids — PCP = P. cabine + 1/2 la charge nominale","done":false},
      {"id":"m13","label":"Installation de l''échelle et les ressorts dans la cuve","done":false},
      {"id":"ac-m-rails","label":"1. Rails et guidage","done":false,"subtasks":[
        {"label":"Alignement des rails de cabine et de contrepoids avec une incertitude quasi nulle","done":false},
        {"label":"Respect de la distance entre les pattes de fixation","done":false},
        {"label":"Ponçage des rails au niveau des éclisses","done":false},
        {"label":"Nettoyage des rails-guides et des pattes de fixation","done":false}]},
      {"id":"ac-m-machinerie","label":"2. Machinerie","done":false,"subtasks":[
        {"label":"Fixation solide du châssis moteur et du moteur (aucun risque de mouvement ou de vibration)","done":false},
        {"label":"Installation des stop-câbles (anti-déraillement) sur la poulie de traction et les poulies de renvoi","done":false},
        {"label":"Installation conforme du régulateur de vitesse","done":false},
        {"label":"Nettoyage complet du local machine","done":false}]},
      {"id":"ac-m-portes","label":"3. Portes palières","done":false,"subtasks":[
        {"label":"Fixation solide des portes palières","done":false},
        {"label":"Installation des chasse-pieds sous les seuils ou paroi lisse (portes battantes)","done":false},
        {"label":"Réglages des vantaux des portes","done":false},
        {"label":"Soudure strictement interdite pour la fixation des portes palières","done":false}]},
      {"id":"ac-m-cabine","label":"4. Cabine","done":false,"subtasks":[
        {"label":"Ajustement de la cabine par rapport aux portes palières","done":false},
        {"label":"Positionnement correct et orientation adéquate des graisseurs","done":false},
        {"label":"Fixation du garde-corps sur le toit de cabine","done":false},
        {"label":"Installation de chasse-pieds sous le seuil de la porte de cabine et des portes palières","done":false},
        {"label":"Fixation de la main courante","done":false},
        {"label":"Nettoyage de la cabine (le toit et l’intérieur)","done":false}]},
      {"id":"ac-m-contrepoids","label":"5. Contrepoids","done":false,"subtasks":[
        {"label":"Équilibrage correct du contrepoids (poids cabine + la moitié de la charge nominale)","done":false},
        {"label":"Mise en place des stop-gueuses pour bloquer les gueuses","done":false},
        {"label":"Mise en place du cache de la poulie de renvoi et des tiges de stop-câbles","done":false}]},
      {"id":"ac-m-cuvette","label":"6. Cuvette","done":false,"subtasks":[
        {"label":"Fixation de l’échelle d’accès à la cuvette","done":false},
        {"label":"Mise en place des ressorts (amortisseurs) de cabine et de contrepoids","done":false},
        {"label":"Installation des récupérateurs d’huile pour garder la cuvette propre","done":false},
        {"label":"Mise en place du cache de protection du contrepoids en partie basse","done":false},
        {"label":"Installation des pattes de fixation de départ","done":false},
        {"label":"Nettoyage de la cuvette","done":false}]}
    ]'::jsonb;
  ELSIF p_phase = 'electrique' THEN
    RETURN '[
      {"id":"e1","label":"Installation de l''armoire électrique","done":false},
      {"id":"e2","label":"Raccordement du moteur","done":false},
      {"id":"e3","label":"Installation du pendentif","done":false},
      {"id":"e4","label":"Installation de la boîte d''inspection","done":false},
      {"id":"e5","label":"Installation de la colonne électrique","done":false},
      {"id":"e6","label":"Installation des boutons d''appel paliers","done":false},
      {"id":"e7","label":"Installation des capteurs et le COP (poste à boutons)","done":false},
      {"id":"e8","label":"Mise en place des aimants","done":false},
      {"id":"e9","label":"Vérification générale","done":false},
      {"id":"e10","label":"L''apprentissage et réglage des étages","done":false},
      {"id":"ac-e-machinerie","label":"1. Machinerie (Local Machine)","done":false,"subtasks":[
        {"label":"Fixation solide de l’armoire électrique et propreté interne (sans poussière ni résidus)","done":false},
        {"label":"Séparation adéquate puissance / commande (basse tension) contre les perturbations","done":false},
        {"label":"Serrage de l’armoire électrique","done":false},
        {"label":"Repérage clair de tous les câbles et borniers selon les schémas","done":false},
        {"label":"Raccordement correct des alimentations principales et des terres","done":false},
        {"label":"Bouton d’arrêt d’urgence à proximité du moteur","done":false},
        {"label":"Éclairage de la salle machine + prise de courant en place","done":false},
        {"label":"Grille d’aération + porte avec serrure pour sécuriser le local","done":false},
        {"label":"Protection mécanique des câbles dans les zones de passage ou à risques","done":false},
        {"label":"Nettoyage complet et final de la salle machine","done":false}]},
      {"id":"ac-e-cabine","label":"2. Dans la Cabine","done":false,"subtasks":[
        {"label":"Fixation solide de la boîte d’inspection en toiture de cabine","done":false},
        {"label":"Fins de course installées et testées (haut, bas, survitesse)","done":false},
        {"label":"Sirène d’alarme et ventilateur en service","done":false},
        {"label":"Bouton stop dans le COP (monte-charges)","done":false},
        {"label":"Photocellule installée et contact de surcharge réglé","done":false},
        {"label":"Espace opérateur respecté par rapport aux portes palières","done":false},
        {"label":"Parachute réglé correctement","done":false},
        {"label":"Nettoyage complet et final de la cabine","done":false}]},
      {"id":"ac-e-gaine","label":"3. Dans la Gaine","done":false,"subtasks":[
        {"label":"Cheminement propre des câbles (goulottes, colliers) sans cisaillement ni frottement","done":false},
        {"label":"Câble pendentif fixé (patte en bois au départ + patte à mi-course)","done":false},
        {"label":"Réglage correct des portes palières","done":false},
        {"label":"Câblage correct des contacts de sécurité (chaîne de sécurité)","done":false},
        {"label":"Éclairage de la gaine raccordé","done":false},
        {"label":"Nettoyage approfondi de la gaine","done":false}]},
      {"id":"ac-e-cuvette","label":"4. Dans la Cuvette","done":false,"subtasks":[
        {"label":"Poulie tendeuse du limiteur de vitesse réglée","done":false},
        {"label":"Bouton d’arrêt d’urgence + prise à 40 cm du seuil RDC fixés","done":false},
        {"label":"Mise à la terre effective de toutes les parties métalliques accessibles","done":false},
        {"label":"Nettoyage complet de la cuvette","done":false}]},
      {"id":"ac-e-essais","label":"5. Consignes et Essais Préliminaires","done":false,"subtasks":[
        {"label":"Chaîne de sécurité vérifiée — aucune sécurité pontée avant le départ","done":false},
        {"label":"Armoire nettoyée et tous les coffrets correctement refermés","done":false}]}
    ]'::jsonb;
  ELSIF p_phase = 'verification' THEN
    RETURN '[
      {"id":"vr-m-rails","label":"1. Rails et guidage (mécanique)","done":false,"note":"","subtasks":[
        {"label":"Alignement des rails de cabine et de contrepoids avec une incertitude quasi nulle","done":false},
        {"label":"Respect de la distance entre les pattes de fixation","done":false},
        {"label":"Ponçage des rails au niveau des éclisses","done":false},
        {"label":"Nettoyage des rails-guides et des pattes de fixation","done":false}]},
      {"id":"vr-m-machinerie","label":"2. Machinerie (mécanique)","done":false,"note":"","subtasks":[
        {"label":"Fixation solide du châssis moteur et du moteur (aucun risque de mouvement ou de vibration)","done":false},
        {"label":"Installation des stop-câbles (anti-déraillement) sur la poulie de traction et les poulies de renvoi","done":false},
        {"label":"Installation conforme du régulateur de vitesse","done":false},
        {"label":"Nettoyage complet du local machine","done":false}]},
      {"id":"vr-m-portes","label":"3. Portes palières (mécanique)","done":false,"note":"","subtasks":[
        {"label":"Fixation solide des portes palières","done":false},
        {"label":"Installation des chasse-pieds sous les seuils ou paroi lisse (portes battantes)","done":false},
        {"label":"Réglages des vantaux des portes","done":false},
        {"label":"Soudure strictement interdite pour la fixation des portes palières","done":false}]},
      {"id":"vr-m-cabine","label":"4. Cabine (mécanique)","done":false,"note":"","subtasks":[
        {"label":"Ajustement de la cabine par rapport aux portes palières","done":false},
        {"label":"Positionnement correct et orientation adéquate des graisseurs","done":false},
        {"label":"Fixation du garde-corps sur le toit de cabine","done":false},
        {"label":"Installation de chasse-pieds sous le seuil de la porte de cabine et des portes palières","done":false},
        {"label":"Fixation de la main courante","done":false},
        {"label":"Nettoyage de la cabine (le toit et l’intérieur)","done":false}]},
      {"id":"vr-m-contrepoids","label":"5. Contrepoids (mécanique)","done":false,"note":"","subtasks":[
        {"label":"Équilibrage correct du contrepoids (poids cabine + la moitié de la charge nominale)","done":false},
        {"label":"Mise en place des stop-gueuses pour bloquer les gueuses","done":false},
        {"label":"Mise en place du cache de la poulie de renvoi et des tiges de stop-câbles","done":false}]},
      {"id":"vr-m-cuvette","label":"6. Cuvette (mécanique)","done":false,"note":"","subtasks":[
        {"label":"Fixation de l’échelle d’accès à la cuvette","done":false},
        {"label":"Mise en place des ressorts (amortisseurs) de cabine et de contrepoids","done":false},
        {"label":"Installation des récupérateurs d’huile pour garder la cuvette propre","done":false},
        {"label":"Mise en place du cache de protection du contrepoids en partie basse","done":false},
        {"label":"Installation des pattes de fixation de départ","done":false},
        {"label":"Nettoyage de la cuvette","done":false}]},
      {"id":"vr-e-machinerie","label":"7. Machinerie — Local Machine (électrique)","done":false,"note":"","subtasks":[
        {"label":"Fixation solide de l’armoire électrique et propreté interne (sans poussière ni résidus)","done":false},
        {"label":"Séparation adéquate puissance / commande (basse tension) contre les perturbations","done":false},
        {"label":"Serrage de l’armoire électrique","done":false},
        {"label":"Repérage clair de tous les câbles et borniers selon les schémas","done":false},
        {"label":"Raccordement correct des alimentations principales et des terres","done":false},
        {"label":"Bouton d’arrêt d’urgence à proximité du moteur","done":false},
        {"label":"Éclairage de la salle machine + prise de courant en place","done":false},
        {"label":"Grille d’aération + porte avec serrure pour sécuriser le local","done":false},
        {"label":"Protection mécanique des câbles dans les zones de passage ou à risques","done":false},
        {"label":"Nettoyage complet et final de la salle machine","done":false}]},
      {"id":"vr-e-cabine","label":"8. Dans la Cabine (électrique)","done":false,"note":"","subtasks":[
        {"label":"Fixation solide de la boîte d’inspection en toiture de cabine","done":false},
        {"label":"Fins de course installées et testées (haut, bas, survitesse)","done":false},
        {"label":"Sirène d’alarme et ventilateur en service","done":false},
        {"label":"Bouton stop dans le COP (monte-charges)","done":false},
        {"label":"Photocellule installée et contact de surcharge réglé","done":false},
        {"label":"Espace opérateur respecté par rapport aux portes palières","done":false},
        {"label":"Parachute réglé correctement","done":false},
        {"label":"Nettoyage complet et final de la cabine","done":false}]},
      {"id":"vr-e-gaine","label":"9. Dans la Gaine (électrique)","done":false,"note":"","subtasks":[
        {"label":"Cheminement propre des câbles (goulottes, colliers) sans cisaillement ni frottement","done":false},
        {"label":"Câble pendentif fixé (patte en bois au départ + patte à mi-course)","done":false},
        {"label":"Réglage correct des portes palières","done":false},
        {"label":"Câblage correct des contacts de sécurité (chaîne de sécurité)","done":false},
        {"label":"Éclairage de la gaine raccordé","done":false},
        {"label":"Nettoyage approfondi de la gaine","done":false}]},
      {"id":"vr-e-cuvette","label":"10. Dans la Cuvette (électrique)","done":false,"note":"","subtasks":[
        {"label":"Poulie tendeuse du limiteur de vitesse réglée","done":false},
        {"label":"Bouton d’arrêt d’urgence + prise à 40 cm du seuil RDC fixés","done":false},
        {"label":"Mise à la terre effective de toutes les parties métalliques accessibles","done":false},
        {"label":"Nettoyage complet de la cuvette","done":false}]},
      {"id":"vr-e-essais","label":"11. Consignes et Essais Préliminaires","done":false,"note":"","subtasks":[
        {"label":"Chaîne de sécurité vérifiée — aucune sécurité pontée avant le départ","done":false},
        {"label":"Armoire nettoyée et tous les coffrets correctement refermés","done":false}]}
    ]'::jsonb;
  ELSE
    RETURN '[]'::jsonb;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;
