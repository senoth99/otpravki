# Честный знак — установка на сервере (Debian)

USB-токен **«АНГАРА»** (СКЗИ MS_KEY K) хранит ключи ЭЦП. Для подписи запросов к True API нужны **КриптоПро CSP** и **pycades** на том же сервере, куда вставлен токен.

## 1. КриптоПро CSP 5.0 для Linux

1. Скачать deb-пакеты с https://cryptopro.ru/products/csp/downloads
2. Установить и активировать лицензию
3. Проверка: `/opt/cprocsp/bin/csp_test` или `csptest -help`

## 2. Токен «АНГАРА»

1. Вставить USB-токен в сервер
2. `lsusb` — должно появиться устройство Multisoft / Angara
3. Проверить контейнеры ключей:
   ```bash
   /opt/cprocsp/bin/csptest -keyset -enum_cont -verifycontext
   ```
4. PIN токена (не путать с PIN приложения 1319) — задать в `.env` как `CRPT_TOKEN_PIN`

## 3. Сертификат и регистрация в ЧЗ

1. Сертификат с приватным ключом должен быть в хранилище «Личные» (My)
2. Отпечаток SHA-1: `/opt/cprocsp/bin/certmgr -list -store uMy`
3. Зарегистрировать сертификат как API-пользователь в ЛК https://markirovka.crpt.ru

## 4. pycades (CAdES-BES на Linux)

1. Установить пакет pycades из дистрибутива КриптоПро (или собрать по инструкции КриптоПро)
2. Проверка:
   ```bash
   python3 -c "import pycades; print('ok')"
   ```

## 5. Переменные в `~/otpravki/.env`

```env
CRPT_API_URL=https://markirovka.crpt.ru/api/v3/true-api
CRPT_CERT_THUMBPRINT=ABCDEF123456...
CRPT_TOKEN_PIN=12345678
CRPT_INN=
CHESTNY_ZNAK_TEST_PIN=1319
```

## 6. Диагностика

После деплоя откройте `/chestnye-znaki`, введите PIN **1319**, либо:

```bash
curl -s -X POST http://127.0.0.1:3000/api/chestnye-znaki/verify-pin \
  -H 'Content-Type: application/json' -d '{"pin":"1319"}' -c /tmp/cz.txt

curl -s http://127.0.0.1:3000/api/chestnye-znaki/diagnose -b /tmp/cz.txt

curl -s -X POST http://127.0.0.1:3000/api/chestnye-znaki/token -b /tmp/cz.txt
```

## 7. Ручной запуск скрипта

```bash
cd ~/otpravki
export CRPT_CERT_THUMBPRINT=...
export CRPT_TOKEN_PIN=...
python3 scripts/crpt-get-token.py --list-certs
python3 scripts/crpt-get-token.py
```
