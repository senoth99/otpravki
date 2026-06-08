#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="otpravki"
PORT="${PORT:-3000}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"

echo "==> Otpravki deploy (Debian)"
echo "    Папка: $APP_DIR"
echo "    Порт:  $PORT"

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

install_node() {
  if command -v node &>/dev/null && [[ "$(node -v | cut -d. -f1 | tr -d v)" -ge 18 ]]; then
    echo "==> Node $(node -v) уже установлен"
    return
  fi

  echo "==> Устанавливаю Node.js 20..."
  as_root apt-get update -qq
  as_root apt-get install -y curl ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_20.x | as_root bash -
  as_root apt-get install -y nodejs
  echo "==> Node $(node -v), npm $(npm -v)"
}

install_node
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "==> Создаю .env из .env.example"
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a
source .env
set +a
PORT="${PORT:-3000}"

if ! command -v lp &>/dev/null; then
  echo "==> Устанавливаю CUPS для печати..."
  as_root apt-get install -y cups cups-client
fi
as_root systemctl enable cups 2>/dev/null || true
as_root systemctl start cups 2>/dev/null || true

echo "==> Устанавливаю зависимости..."
npm ci

mkdir -p "$DATA_DIR/cache"
API_URL="${PRODUCTS_API_URL:-https://api.cashercollection.com}"
echo "==> Кэширую товары (если есть интернет)..."
if PRODUCTS_JSON="$(curl -fsS --max-time 30 "${API_URL}/products" 2>/dev/null)"; then
  node -e "
    const fs = require('fs');
    const products = JSON.parse(process.argv[1]).filter(
      (p) => !p.isDeleted && p.inStock && p.images?.length,
    );
    fs.writeFileSync(
      process.argv[2],
      JSON.stringify({ fetchedAt: Date.now(), data: products }),
    );
    console.log('    товаров в кэше:', products.length);
  " "$PRODUCTS_JSON" "$DATA_DIR/cache/products.json"
else
  echo "    нет сети — сборка продолжится без кэша"
fi

echo "==> Собираю приложение..."
npm run build

echo "==> Готовлю standalone..."
mkdir -p "$DATA_DIR/cache" "$DATA_DIR/sync" "$DATA_DIR/workspace"
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static

UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
echo "==> Настраиваю systemd ($SERVICE_NAME)..."

as_root tee "$UNIT_FILE" > /dev/null <<EOF
[Unit]
Description=Otpravki — сборка и отправка заказов
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
Group=${USER}
WorkingDirectory=${APP_DIR}/.next/standalone
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=HOSTNAME=0.0.0.0
Environment=DATA_DIR=${DATA_DIR}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EnvironmentFile=-${APP_DIR}/.env
ExecStart=/usr/bin/env node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

as_root systemctl daemon-reload
as_root systemctl enable "$SERVICE_NAME"
as_root systemctl restart "$SERVICE_NAME"

sleep 1

if as_root systemctl is-active --quiet "$SERVICE_NAME"; then
  STATUS="работает"
else
  STATUS="ошибка — смотри: sudo journalctl -u $SERVICE_NAME -n 30"
fi

LAN_IP=""
if command -v hostname &>/dev/null; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [[ -z "$LAN_IP" ]] && command -v ip &>/dev/null; then
  LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1); exit}')"
fi

echo ""
echo "=============================================="
echo "  Otpravki — $STATUS"
echo "=============================================="
echo ""
echo "  На этом компьютере:"
echo "    http://127.0.0.1:${PORT}/otpravki"
echo ""
if [[ -n "$LAN_IP" ]]; then
  echo "  С телефона / планшета в той же WiFi-сети:"
  echo "    http://${LAN_IP}:${PORT}/otpravki"
  echo ""
fi
echo "  Проверка API:"
echo "    curl http://127.0.0.1:${PORT}/api/health"
echo ""
echo "  Управление:"
echo "    sudo systemctl status  $SERVICE_NAME"
echo "    sudo systemctl restart $SERVICE_NAME"
echo "    sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "  Кэш товаров:    $DATA_DIR/cache"
echo "  Лог синхронизации: $DATA_DIR/sync/events.jsonl"
echo ""
if command -v lpstat &>/dev/null; then
  echo "  Принтер (авто):"
  lpstat -p 2>/dev/null | sed 's/^/    /' || echo "    подключи USB-принтер — CUPS подхватит сам"
  echo "    проверка: curl http://127.0.0.1:${PORT}/api/print"
  echo ""
fi
