# КриптоПро CSP + токен «АНГАРА» на Debian

Инструкция для сервера Otpravki (`192.168.1.100`), где USB-токен **MS_KEY K — АНГАРА** (BIFIT) используется для подписи CAdES-BES при получении session-токена True API ГИС МТ.

## Текущее состояние (проверка)

```bash
lsusb | grep -i angara
# Bus 001 Device …: ID 23a0:0008 BIFIT MS_KEY K - Angara

ls /opt/cprocsp/bin/csptest 2>/dev/null || echo "CryptoPro не установлен"
python3 -c "import pycades" 2>/dev/null || echo "pycades не установлен"
```

На момент настройки модуля **КриптоПро CSP не установлен** — требуется ручная установка (deb с [cryptopro.ru](https://www.cryptopro.ru/products/csp/downloads)).

## 1. Установка КриптоПро CSP 5.0 для Linux

1. Скачайте дистрибутив **CSP 5.0 R3+ для Linux x64 (deb)** с сайта КриптоПро (нужна регистрация).
2. Распакуйте архив и установите пакеты:

```bash
cd linux-amd64_deb   # имя каталога может отличаться
sudo ./install.sh    # или: sudo dpkg -i *.deb && sudo apt -f install
```

3. Активируйте лицензию:

```bash
sudo /opt/cprocsp/sbin/amd64/cpconfig -license -set <серийный_номер>
```

4. Проверка:

```bash
/opt/cprocsp/bin/amd64/csptest -keyset -enum_cont -verifycontext
```

## 2. Токен «АНГАРА»

1. Вставьте USB-токен — в `lsusb` должно появиться `BIFIT MS_KEY K - Angara`.
2. Установите драйвер PKCS#11 / rutoken-совместимый модуль, если CSP его не видит (для MS_KEY K часто достаточно стандартного PKCS#11 от BIFIT/КриптоПро).
3. Импортируйте сертификат в хранилище **«Личные» (My)** текущего пользователя (`root` на сервере otpravki):

```bash
/opt/cprocsp/bin/amd64/certmgr -list -store uMy
```

4. Запомните **SHA-1 отпечаток** сертификата → `CRPT_CERT_THUMBPRINT` в `.env`.
5. PIN носителя (часто `12345678` по умолчанию) → `CRPT_TOKEN_PIN` в `.env`.  
   **Не путать** с `CHESTNY_ZNAK_TEST_PIN=1319` — это PIN экрана приложения.

## 3. Регистрация в ЛК Честный знак

Сертификат должен быть зарегистрирован как **API-пользователь** в [markirovka.crpt.ru](https://markirovka.crpt.ru). Без этого `simpleSignIn` вернёт 403.

## 4. Python + pycades

pycades поставляется в комплекте с CSP (каталог `python/` в дистрибутиве):

```bash
cd /path/to/cryptopro-csp/python
sudo python3 setup.py install
python3 -c "import pycades; print('pycades OK')"
```

## 5. Переменные окружения (`/root/otpravki/.env`)

```env
CHESTNY_ZNAK_TEST_PIN=1319
CRPT_API_URL=https://markirovka.crpt.ru/api/v3/true-api
CRPT_CERT_THUMBPRINT=<SHA1 отпечаток>
CRPT_TOKEN_PIN=<PIN токена АНГАРА>
# CRPT_INN=...   # опционально
```

После изменений:

```bash
sudo systemctl restart otpravki
```

## 6. Диагностика

```bash
cd /root/otpravki
python3 scripts/crpt-get-token.py list-certs
python3 scripts/crpt-get-token.py diagnose
python3 scripts/crpt-get-token.py token
```

Через API (после PIN 1319 в UI или cookie):

```bash
curl -c /tmp/cz.txt -X POST http://127.0.0.1:3000/api/chestnye-znaki/verify-pin \
  -H 'Content-Type: application/json' -d '{"pin":"1319"}'
curl -b /tmp/cz.txt -X POST http://127.0.0.1:3000/api/chestnye-znaki/diagnose
curl -b /tmp/cz.txt -X POST http://127.0.0.1:3000/api/chestnye-znaki/token
```

## 7. Скрипт-помощник

```bash
./scripts/setup-cryptopro-angara.sh
```

Проверяет наличие CSP, pycades, токена и выводит подсказки. **Не скачивает** КриптоПро автоматически — нужен deb с сайта.

## Ограничения v1

- Только получение и отображение session-токена (без `/cises/info`).
- Подпись выполняется только на сервере Linux с физическим токеном.
- Без CSP/pycades UI покажет понятную ошибку из API.
