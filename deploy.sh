#!/bin/bash
# =============================================================================
# RMASC OnSite — Installation automatique sur le serveur
# =============================================================================
# Usage : bash deploy.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  RMASC OnSite — Installation automatique${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ─── Étape 1 : Cloner le projet ──────────────────────────────────────────
echo -e "${YELLOW}[1/7] Clonage du depot GitHub...${NC}"

REPO="https://github.com/stimanios2025S/rmasc-onsite.git"
DEST="/opt/rmasc-onsite"

if [ -d "$DEST" ]; then
  echo -e "  ${YELLOW}Le dossier $DEST existe deja. Sauvegarde et remplacement...${NC}"
  sudo mv "$DEST" "${DEST}.bak.$(date +%s)"
fi

sudo git clone "$REPO" "$DEST"
sudo chown -R $(whoami):$(whoami) "$DEST"
cd "$DEST"

echo -e "${GREEN}  ✓ Projet clone${NC}"

# ─── Étape 2 : Installation PostgreSQL / PostGIS ─────────────────────────
echo ""
echo -e "${YELLOW}[2/7] Installation PostgreSQL + PostGIS...${NC}"

if ! command -v psql &> /dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq postgresql postgresql-contrib postgis postgresql-16-postgis-3
  echo -e "  ${GREEN}✓ PostgreSQL installe${NC}"
else
  echo -e "  ${GREEN}✓ PostgreSQL deja present${NC}"
fi

# S'assurer que PostGIS est disponible
sudo -u postgres psql -c "CREATE EXTENSION IF NOT EXISTS postgis" 2>/dev/null || true

# ─── Étape 3 : Création de la base de données ────────────────────────────
echo ""
echo -e "${YELLOW}[3/7] Creation de la base de donnees...${NC}"

DB_NAME="rmasc_onsite"
DB_USER="rmasc"
DB_PASS="rmasc_$(openssl rand -hex 8)"

# Supprimer si existe déjà
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;" 2>/dev/null || true

sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# Exécuter le schéma
PGPASSWORD="$DB_PASS" psql -h localhost -U $DB_USER -d $DB_NAME -f "$DEST/database/schema-rmasc-onsite.sql"

echo -e "${GREEN}  ✓ Base de donnees creee${NC}"

# ─── Étape 4 : Installation Node.js ──────────────────────────────────────
echo ""
echo -e "${YELLOW}[4/7] Installation Node.js...${NC}"

if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
  echo -e "${GREEN}  ✓ Node.js $(node -v) installe${NC}"
else
  echo -e "  ${GREEN}✓ Node.js $(node -v) deja present${NC}"
fi

# ─── Étape 5 : Installation dépendances backend ──────────────────────────
echo ""
echo -e "${YELLOW}[5/7] Installation des dependances backend...${NC}"

cd "$DEST/backend"
npm install
npm run build
echo -e "${GREEN}  ✓ Backend compile${NC}"

# ─── Étape 6 : Configuration .env ────────────────────────────────────────
echo ""
echo -e "${YELLOW}[6/7] Configuration de l'environnement...${NC}"

cd "$DEST"
cp -n .env.example .env || true

# Générer un secret pour le webhook ERP
ERP_SECRET="rmasc_whsec_$(openssl rand -hex 16)"

cat > .env << EOF
# RMASC OnSite — Configuration automatique
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS
ERP_WEBHOOK_SECRET=$ERP_SECRET
EOF

echo -e "${GREEN}  ✓ .env cree${NC}"
echo -e "  ${CYAN}┌─────────────────────────────────────────────────────┐${NC}"
echo -e "  ${CYAN}│ Identifiants generes (garde-les precieusement !)    │${NC}"
echo -e "  ${CYAN}├─────────────────────────────────────────────────────┤${NC}"
echo -e "  ${CYAN}│ DB_USER:        $DB_USER${NC}"
echo -e "  ${CYAN}│ DB_PASSWORD:    $DB_PASS${NC}"
echo -e "  ${CYAN}│ WEBHOOK_SECRET: $ERP_SECRET${NC}"
echo -e "  ${CYAN}└─────────────────────────────────────────────────────┘${NC}"

# ─── Étape 7 : Lancement avec PM2 ────────────────────────────────────────
echo ""
echo -e "${YELLOW}[7/7] Installation PM2 et demarrage du service...${NC}"

if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2
fi

cd "$DEST/backend"
pm2 delete rmasc-onsite 2>/dev/null || true
pm2 start dist/index.js --name rmasc-onsite --env production
pm2 save
sudo env PATH=\$PATH:/usr/bin pm2 startup systemd -u $(whoami) --hp /home/$(whoami) 2>/dev/null || true

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Installation terminee avec succes !${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}🌐 Serveur :       http://$(hostname -I 2>/dev/null | awk '{print $1}'):4000${NC}"
echo -e "  ${CYAN}🏥 Health check :  http://$(hostname -I 2>/dev/null | awk '{print $1}'):4000/api/health${NC}"
echo -e ""
echo -e "  ${CYAN}📋 Webhook ERP :   POST http://$(hostname -I 2>/dev/null | awk '{print $1}'):4000/api/webhook/erp${NC}"
echo -e "  ${CYAN}   Header :        X-Webhook-Secret: $ERP_SECRET${NC}"
echo -e ""
echo -e "  ${CYAN}📁 Projet :        $DEST${NC}"
echo -e "  ${CYAN}📁 Logs :          pm2 logs rmasc-onsite${NC}"
echo -e ""
echo -e "  ${CYAN}⚠️  IMPORTANT : Va sur https://github.com/settings/tokens${NC}"
echo -e "  ${CYAN}   et REVOQUE le token que tu as partage dans le chat !${NC}"
echo -e ""
echo -e "${YELLOW}Pour voir les logs en direct : pm2 logs rmasc-onsite${NC}"
