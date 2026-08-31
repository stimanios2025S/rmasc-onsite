# 🛗 RMASC OnSite v7 — SMS Automatiques

## Ce que fait cette version

Quand une équipe **termine** sa phase, le système programme automatiquement des SMS :

| Événement | SMS envoyé à |
|---|---|
| Mission terminée (méca / élec) | **Propriétaire** (El Ghani) — tous les admins/dispatchers avec numéro |
| Nouvelle mission assignée (équipe suivante) | **L'équipe suivante** (chef d'équipe) — téléphone du 1er utilisateur actif |
| Aucune équipe disponible | **Propriétaire** — alerte assignation manuelle |
| Vérification terminée | **Propriétaire** + **Client** (si `client_telephone` renseigné) |

Les SMS sont écrits dans la table `sms_outbox` (file d'attente). Un **worker backend**
(envoi toutes les 30 s) les envoie via **Twilio** — ou en **mode simulation** tant que
Twilio n'est pas configuré (les SMS sont loggés mais pas envoyés réellement).

---

## 1. Déploiement (serveur)

```bash
cd /opt/rmasc-onsite
git pull origin main

# 1) Migration base de données (depuis la RACINE du repo !)
sudo -u postgres psql -d rmasc_onsite -f database/migration-v6-phase-relay.sql
sudo -u postgres psql -d rmasc_onsite -f database/migration-v7-sms.sql

# 2) Backend
cd /opt/rmasc-onsite/backend
npm install
npm run build
pm2 restart rmasc-onsite

# 3) Dashboard
cd /opt/rmasc-onsite/dashboard
npm install
npm run build
pm2 restart rmasc-dashboard
```

## 2. Activer Twilio (envoi réel)

1. Créer un compte sur https://www.twilio.com (essai gratuit).
2. Acheter un numéro émetteur (onglet *Phone Numbers*).
3. Ajouter dans `/opt/rmasc-onsite/backend/.env` :

```bash
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+12025550123
```

4. Redémarrer le backend :

```bash
cd /opt/rmasc-onsite/backend && pm2 restart rmasc-onsite --update-env && pm2 logs rmasc-onsite --lines 5
```

> **Important** : Twilio exige un numéro vérifié pour les essais (7 jours).
> Pour envoyer vers l'Algérie (+213), vérifiez la disponibilité géographique du numéro acheté.

## 3. Renseigner les numéros de téléphone (obligatoire)

1. Se connecter au dashboard : `https://dashboard.sarl-rmasc.com` (elghani / mot de passe admin).
2. Menu **SMS Auto** (sidebar).
3. Renseigner les numéros de chaque équipe + celui d'El Ghani (le 1er numéro de chaque équipe est utilisé).
   Format accepté : `05XX XX XX XX`, `+213 5XX XX XX XX`, `2135XXXXXXXX`.
4. Cliquer **Enregistrer**.

## 4. Vérifier

- Le badge en haut de la page **SMS Auto** indique le mode (Simulation / Twilio ACTIF).
- Chaque relais de mission crée une ligne dans le journal : statut *En attente → Envoyé / Échec*.
- Mode simulation : les SMS apparaissent dans `pm2 logs rmasc-onsite` avec `[SMS·SIMULATION]`.

## 5. Architecture (pour mémoire)

```
Mission terminée (trigger SQL trg_mission_phase_suivante)
        │
        ▼
INSERT INTO sms_outbox (téléphone, contenu, type, ...)   ← pas de HTTP dans le trigger
        │
        ▼
Worker backend toutes les 30 s (SmsWorker)
        │
        ▼
Provider Twilio (ou Simulation) → SMS réel → statut ENVOYE / ECHEC (3 tentatives max)
```

- Table `sms_outbox` : file d'attente (statut, tentative, backoff 60 s × tentative).
- Fonctions SQL : `programmer_sms(...)`, `telephone_equipe(...)`.
- Backend : `src/services/sms/` (service + worker + providers).
- API admin : `GET /api/admin/sms`, `GET|PUT /api/admin/telephones`.
- Dashboard : page `/dashboard/sms` (journal + annuaire).
