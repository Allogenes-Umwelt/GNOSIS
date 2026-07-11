#!/usr/bin/env bash
# GNOSIS — instalador de un comando para escritorio (Podman o Docker).
# Uso:  ./docker/install.sh          (desde la raíz del repo, o desde donde sea)
set -euo pipefail

# Ir a la raíz del repo (este script vive en docker/)
cd "$(cd "$(dirname "$0")/.." && pwd)"

echo "── GNOSIS · instalación en contenedor ──────────────────────────"

# 1. Elegir motor: podman-compose > docker compose
if command -v podman-compose >/dev/null 2>&1; then
  COMPOSE="podman-compose"
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  COMPOSE="podman compose"
elif docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  echo "ERROR: no encontré podman-compose ni 'docker compose'."
  echo "Instala Podman (https://podman.io) y opcionalmente:  pip install podman-compose"
  exit 1
fi
echo "Motor: $COMPOSE"

# 2. Crear .env desde la plantilla si no existe
if [ ! -f .env ]; then
  cp docker/.env.example .env
  echo ""
  echo "Se creó .env desde la plantilla. ANTES de continuar, edítalo:"
  echo "  - DEEPSEEK_API_KEY   (para el chat Gnosis·IA)"
  echo "  - FLASK_SECRET_KEY   (genera una con:"
  echo "      python -c \"import secrets; print(secrets.token_hex(32))\" )"
  echo ""
  read -r -p "Presiona Enter cuando hayas editado .env (o Ctrl-C para salir)… " _
fi

# 3. Construir y levantar
echo "Construyendo la imagen y levantando el servicio…"
$COMPOSE -f docker/compose.yaml up -d --build

echo ""
echo "── Listo ───────────────────────────────────────────────────────"
echo "GNOSIS está en:  http://127.0.0.1:5001"
echo "Logs:            $COMPOSE -f docker/compose.yaml logs -f"
echo "Detener:         $COMPOSE -f docker/compose.yaml down"
