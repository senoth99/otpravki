#!/usr/bin/env bash
# Проверка окружения КриптоПро + «АНГАРА» на Debian. Не устанавливает CSP автоматически.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> CryptoPro / Angara setup check"
echo "    APP_DIR: $APP_DIR"

if lsusb 2>/dev/null | grep -qi 'angara\|ms_key'; then
  echo "==> USB-токен «АНГАРА» обнаружен:"
  lsusb | grep -iE 'angara|ms_key|bifit' | sed 's/^/    /'
else
  echo "    ⚠️  Токен «АНГАРА» не найден в lsusb — вставьте USB"
fi

CSPTEST=""
for candidate in \
  /opt/cprocsp/bin/amd64/csptest \
  /opt/cprocsp/bin/csptest \
  /opt/cprocsp/bin/amd64/csptestf; do
  if [[ -x "$candidate" ]]; then
    CSPTEST="$candidate"
    break
  fi
done

if [[ -n "$CSPTEST" ]]; then
  echo "==> КриптоПро CSP: $CSPTEST"
  "$CSPTEST" -keyset -enum_cont -verifycontext 2>/dev/null | sed 's/^/    /' || true
else
  echo "    ⚠️  КриптоПро CSP не установлен"
  echo "    Скачайте deb с https://www.cryptopro.ru/products/csp/downloads"
  echo "    Подробнее: docs/CRYPTOPRO-ANGARA.md"
fi

if python3 -c "import pycades" 2>/dev/null; then
  echo "==> pycades: OK"
else
  echo "    ⚠️  pycades не установлен — установите из дистрибутива CSP (python/setup.py install)"
fi

ENV_FILE="$APP_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "==> Переменные в .env:"
  grep -E '^CRPT_|^CHESTNY_ZNAK_' "$ENV_FILE" 2>/dev/null | sed 's/=.*$/=***/' | sed 's/^/    /' || echo "    (не заданы CRPT_* / CHESTNY_ZNAK_*)"
else
  echo "    ⚠️  $ENV_FILE не найден"
fi

if [[ -f "$APP_DIR/scripts/crpt-get-token.py" ]]; then
  echo "==> list-certs (если pycades установлен):"
  python3 "$APP_DIR/scripts/crpt-get-token.py" --list-certs 2>/dev/null | head -c 500 || echo "    (не удалось — см. выше)"
  echo ""
fi

echo ""
echo "Дальше: заполните CRPT_CERT_THUMBPRINT и CRPT_TOKEN_PIN в .env, перезапустите otpravki."
