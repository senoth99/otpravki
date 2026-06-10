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

if git -C "$APP_DIR" rev-parse --is-inside-work-tree &>/dev/null; then
  echo "==> Обновляю код из git..."
  git -C "$APP_DIR" pull --ff-only
fi

if [[ ! -f .env ]]; then
  echo "==> Создаю .env из .env.example"
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a
source .env
set +a
PORT="${PORT:-3000}"

reset_mock_workspace() {
  if [[ "${USE_MOCK_ORDERS:-false}" == "false" ]]; then
    return
  fi

  mkdir -p "$DATA_DIR/workspace"
  local token
  token="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || date +%s)"
  echo "$token" > "$DATA_DIR/workspace/reset-token"
  rm -f "$DATA_DIR/workspace/state.json"
  echo "==> Сброс мок-состояния ($token)"
}

reset_mock_workspace

if ! command -v lp &>/dev/null; then
  echo "==> Устанавливаю CUPS для печати..."
  as_root apt-get install -y cups cups-client poppler-utils ghostscript imagemagick
elif ! command -v pdftoppm &>/dev/null || ! command -v gs &>/dev/null; then
  echo "==> Устанавливаю утилиты для PDF-этикеток..."
  as_root apt-get install -y poppler-utils ghostscript imagemagick
fi
as_root systemctl enable cups 2>/dev/null || true
as_root systemctl start cups 2>/dev/null || true

setup_printer() {
  local printer_name="${BARCODE_PRINTER:-OtpravkiLabel}"

  if lpstat -p 2>/dev/null | grep -q '^printer '; then
    local default_dest
    default_dest="$(lpstat -d 2>/dev/null | sed -n 's/.*default destination: //p' | head -1 | tr -d '[:space:]')"
    if [[ -z "$default_dest" || "$default_dest" == "none" || "$default_dest" == *"нет"* ]]; then
      local first
      first="$(lpstat -p 2>/dev/null | awk '/^printer / {print $2; exit}')"
      if [[ -n "$first" ]]; then
        as_root lpoptions -d "$first" 2>/dev/null || true
        echo "==> Принтер по умолчанию: $first"
      fi
    fi
    return
  fi

  echo "==> Ищу USB-принтер..."
  local usb_uri
  usb_uri="$(lpinfo -v 2>/dev/null | awk '/usb:/ {print $2; exit}')"
  if [[ -z "$usb_uri" ]]; then
    echo "    USB-принтер не найден — подключи кабель и снова ./deploy.sh"
    return
  fi

  if as_root lpadmin -p "$printer_name" -E -v "$usb_uri" -m raw 2>/dev/null \
    || as_root lpadmin -p "$printer_name" -E -v "$usb_uri" -i /usr/share/cups/model/textonly.ppd 2>/dev/null \
    || as_root lpadmin -p "$printer_name" -E -v "$usb_uri" -m everywhere 2>/dev/null; then
    as_root lpoptions -d "$printer_name" 2>/dev/null || true
    echo "    добавлен: $printer_name ($usb_uri)"
  else
    echo "    не удалось добавить принтер — выполни вручную:"
    echo "    lpadmin -p $printer_name -E -v $usb_uri -m raw"
  fi
}

setup_printer

echo "==> Устанавливаю зависимости..."
npm ci

mkdir -p "$DATA_DIR/cache" "$DATA_DIR/cache/images"
API_URL="${PRODUCTS_API_URL:-https://api.cashercollection.com}"
echo "==> Кэширую товары (если есть интернет)..."
PRODUCTS_TMP="$(mktemp)"
if curl -fsS --max-time 30 "${API_URL}/products" -o "$PRODUCTS_TMP" 2>/dev/null; then
  node -e "
    const fs = require('fs');
    const products = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).filter(
      (p) => p.images?.length,
    );
    fs.writeFileSync(
      process.argv[2],
      JSON.stringify({ fetchedAt: Date.now(), data: products }),
    );
    console.log('    товаров в кэше:', products.length);
  " "$PRODUCTS_TMP" "$DATA_DIR/cache/products.json"
  rm -f "$PRODUCTS_TMP"
else
  rm -f "$PRODUCTS_TMP"
  echo "    нет сети — сборка продолжится без кэша"
fi

echo "==> Синхронизирую картинки товаров на сервер..."
node "$APP_DIR/scripts/sync-product-images.mjs" "$DATA_DIR" "$API_URL" || echo "    часть картинок не скачалась — докачается при следующем деплое"

BUILD_ID="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || date +%s)"
export BUILD_ID
echo "==> Собираю приложение (build ${BUILD_ID})..."
npm run build

echo "==> Готовлю standalone..."
mkdir -p "$DATA_DIR/cache" "$DATA_DIR/sync" "$DATA_DIR/workspace"
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp "$APP_DIR/server.js" .next/standalone/server.js
cp "$APP_DIR/sync-log.js" .next/standalone/sync-log.js
echo "==> Socket.IO для realtime..."
npm install --prefix .next/standalone --omit=dev socket.io@^4.8.1

UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
echo "==> Настраиваю systemd ($SERVICE_NAME)..."

CASHER_API_KEY_VALUE="${CASHER_API_KEY:-${api:-}}"
ORDERS_API_URL_VALUE="${ORDERS_API_URL:-https://api.cashercollection.com}"
USE_MOCK_ORDERS_VALUE="${USE_MOCK_ORDERS:-false}"

if [[ "${USE_MOCK_ORDERS_VALUE}" == "false" && -z "${CASHER_API_KEY_VALUE}" ]]; then
  echo "    ⚠️  CASHER_API_KEY не задан в .env — API заказов вернёт 401"
fi

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
Environment=NODE_OPTIONS=--dns-result-order=ipv4first
Environment=DATA_DIR=${DATA_DIR}
Environment=BUILD_ID=${BUILD_ID}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=USE_MOCK_ORDERS=${USE_MOCK_ORDERS_VALUE}
Environment=ORDERS_API_URL=${ORDERS_API_URL_VALUE}
Environment=PRODUCTS_API_URL=${PRODUCTS_API_URL:-https://api.cashercollection.com}
Environment=CASHER_API_KEY=${CASHER_API_KEY_VALUE}
Environment=BARCODE_LABEL_WIDTH_MM=${BARCODE_LABEL_WIDTH_MM:-100}
Environment=BARCODE_LABEL_HEIGHT_MM=${BARCODE_LABEL_HEIGHT_MM:-150}
Environment=BARCODE_LABEL_DPI=${BARCODE_LABEL_DPI:-203}
Environment=BARCODE_LABEL_SCALE=${BARCODE_LABEL_SCALE:-0.5}
Environment=BARCODE_LABEL_ROTATION=${BARCODE_LABEL_ROTATION:-180}
EnvironmentFile=-${APP_DIR}/.env
Environment=PORT=${PORT}
Environment=HOSTNAME=0.0.0.0
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

if command -v ufw &>/dev/null && as_root ufw status 2>/dev/null | grep -q "Status: active"; then
  if ! as_root ufw status 2>/dev/null | grep -qE "${PORT}/tcp|${PORT} .+ALLOW"; then
    echo "==> Открываю порт ${PORT}/tcp в ufw (LAN-доступ)..."
    as_root ufw allow "${PORT}/tcp" >/dev/null 2>&1 || true
  fi
fi

if grep -qE '^HOSTNAME=(127\.0\.0\.1|localhost)\b' "$APP_DIR/.env" 2>/dev/null; then
  echo "    ⚠️  В .env HOSTNAME=127.0.0.1 — из LAN не откроется (deploy всё равно форсирует 0.0.0.0)"
fi

LISTEN_ADDR=""
if command -v ss &>/dev/null; then
  LISTEN_ADDR="$(ss -tlnp 2>/dev/null | awk -v p=":${PORT}" '$4 ~ p {print $4; exit}')"
elif command -v netstat &>/dev/null; then
  LISTEN_ADDR="$(netstat -tlnp 2>/dev/null | awk -v p=":${PORT}" '$4 ~ p {print $4; exit}')"
fi
if [[ -n "$LISTEN_ADDR" && "$LISTEN_ADDR" != *"0.0.0.0:${PORT}"* && "$LISTEN_ADDR" != *"[::]:${PORT}"* ]]; then
  echo "    ⚠️  Слушает только $LISTEN_ADDR — с телефона в WiFi не откроется"
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
  if as_root systemctl is-active --quiet nginx 2>/dev/null; then
    echo "    http://${LAN_IP}/otpravki  (через nginx, порт 80)"
  fi
  echo ""
  echo "  Если не открывается — IP мог смениться после перезагрузки роутера."
  echo "  Проверка с сервера: curl -s http://${LAN_IP}:${PORT}/api/health"
  echo ""
fi
echo "  Проверка API:"
echo "    curl http://127.0.0.1:${PORT}/api/health"
echo "    curl http://127.0.0.1:${PORT}/api/health/casher"
if command -v curl &>/dev/null; then
  CASHER_CHECK="$(curl -sf --max-time 15 "http://127.0.0.1:${PORT}/api/health/casher" 2>/dev/null || true)"
  if [[ -n "$CASHER_CHECK" ]] && echo "$CASHER_CHECK" | grep -q '"ok":true'; then
    echo "  Casher API с сервера: OK"
  elif [[ -n "$CASHER_CHECK" ]]; then
    echo "  ⚠️  Casher API с сервера недоступен — «Обновить» не сработает"
    echo "      На Debian: curl -I https://api.cashercollection.com/products"
    echo "      Нужен интернет/DNS на сервере, не только на телефоне"
  fi
fi
echo ""
echo "  Управление:"
echo "    sudo systemctl status  $SERVICE_NAME"
echo "    sudo systemctl restart $SERVICE_NAME"
echo "    sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "  Кэш товаров:    $DATA_DIR/cache"
echo "  Картинки:       $DATA_DIR/cache/images"
echo "  Лог синхронизации: $DATA_DIR/sync/events.jsonl"
echo "  Вытянуть логи:     curl http://127.0.0.1:${PORT}/api/sync/log?lines=200"
echo ""
if command -v lpstat &>/dev/null; then
  echo "  Принтер (авто):"
  lpstat -p 2>/dev/null | sed 's/^/    /' || echo "    подключи USB-принтер — CUPS подхватит сам"
  echo "    проверка: curl http://127.0.0.1:${PORT}/api/print"
  echo ""
fi
