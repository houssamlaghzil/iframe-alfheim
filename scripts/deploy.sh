#!/usr/bin/env bash
set -euo pipefail

# ======================= CONFIG =======================
PROJECT_NAME="alfheim"
APP_PORT="8081"          # port exposé (host)
COMPOSE_FILE="docker-compose.yml"
API_ENV_FILE="server/.env"
# ======================================================

say() { echo -e "\033[1;36m[deploy]\033[0m $*"; }
die() { echo -e "\033[1;31m[deploy]\033[0m $*" >&2; exit 1; }

require_file() {
  local f="$1"
  [[ -f "$f" ]] || die "Fichier manquant: $f"
}

# 0) Pré-checks
say "Répertoire projet: $(pwd)"
require_file "$COMPOSE_FILE"
require_file "Dockerfile"
require_file "server/Dockerfile"
require_file "nginx.conf"

# 1) Installer Docker si absent
if ! command -v docker >/dev/null 2>&1; then
  say "Docker non présent → installation"
  if [[ -f /etc/debian_version ]]; then
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$(. /etc/os-release; echo "$ID")/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/$(. /etc/os-release; echo "$ID") \
      $(. /etc/os-release; echo "$VERSION_CODENAME") stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    die "Distro non Debian/Ubuntu: installe Docker manuellement puis relance."
  fi
else
  say "Docker présent ✔"
fi

# 2) Vérifier docker compose (plugin v2)
if ! docker compose version >/dev/null 2>&1; then
  say "Plugin docker compose absent → installation"
  if [[ -f /etc/debian_version ]]; then
    sudo apt-get update -y
    sudo apt-get install -y docker-compose-plugin
  else
    die "Impossible d’installer docker compose automatiquement."
  fi
else
  say "docker compose OK ✔"
fi

# 3) S’assurer que /docker-compose.yml parasite n’existe pas
if [[ -f /docker-compose.yml ]]; then
  say "Fichier parasite /docker-compose.yml détecté → backup"
  sudo mv /docker-compose.yml /docker-compose.yml.bak.$(date +%s) || true
fi

# 4) Git pull (si repo déjà cloné)
if [ -d .git ]; then
  say "Récupération des mises à jour git"
  git fetch --all --prune
  git reset --hard origin/$(git rev-parse --abbrev-ref HEAD)
else
  say "Pas de .git ici. Skip git pull."
fi

# 5) Vérifier les secrets
if [[ ! -f "$API_ENV_FILE" ]]; then
  cat >&2 <<EOF
$API_ENV_FILE est manquant.
Crée-le avec :
OPENAI_API_KEY=sk-xxxx
FIREBASE_SA={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"...","client_id":"..."}
EOF
  exit 1
fi

# 6) Build & Run
say "Build & run docker"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d --build

# 7) Vérifications
say "Conteneurs:"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps

say "Test HTTP local:"
if command -v curl >/dev/null 2>&1; then
  curl -I "http://127.0.0.1:${APP_PORT}" || true
fi

say "✅ Déployé. Accès: http://<IP>:${APP_PORT}"
