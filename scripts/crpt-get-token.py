#!/usr/bin/env python3
"""Получение session-токена True API «Честный знак» (ГИС МТ)."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

CADES_BES = 1
CAPICOM_ENCODE_BASE64 = 0
CAPICOM_CURRENT_USER_STORE = 2
CAPICOM_MY_STORE = "My"
CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED = 2


def env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def api_base() -> str:
    return env("CRPT_API_URL", "https://markirovka.crpt.ru/api/v3/true-api").rstrip("/")


def normalize_thumbprint(value: str) -> str:
    return re.sub(r"[^0-9a-fA-F]", "", value).upper()


def http_json(method: str, url: str, body: dict | None = None) -> dict:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json;charset=UTF-8"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {url}: {detail[:500]}") from exc


def import_pycades():
    try:
        import pycades  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "Модуль pycades не установлен. Установите КриптоПро CSP и pycades на сервере."
        ) from exc
    return pycades


def iter_store_certificates(store) -> list:
    """Обход Certificates (pycades 0.1.x: Count + Item, без итератора)."""
    collection = store.Certificates
    count = int(getattr(collection, "Count", 0) or 0)
    certs = []
    for index in range(1, count + 1):
        certs.append(collection.Item(index))
    return certs


def list_certificates() -> list[dict]:
    pycades = import_pycades()
    store = pycades.Store()
    store.Open(
        CAPICOM_CURRENT_USER_STORE,
        CAPICOM_MY_STORE,
        CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED,
    )
    certs = []
    for cert in iter_store_certificates(store):
        try:
            certs.append(
                {
                    "thumbprint": normalize_thumbprint(cert.Thumbprint),
                    "subject": cert.SubjectName,
                    "issuer": cert.IssuerName,
                    "validFrom": str(cert.ValidFromDate),
                    "validTo": str(cert.ValidToDate),
                    "hasPrivateKey": bool(cert.HasPrivateKey()),
                }
            )
        except Exception:
            continue
    store.Close()
    return certs


def find_certificate(thumbprint: str):
    pycades = import_pycades()
    wanted = normalize_thumbprint(thumbprint)
    if not wanted:
        raise RuntimeError("Не задан CRPT_CERT_THUMBPRINT")

    store = pycades.Store()
    store.Open(
        CAPICOM_CURRENT_USER_STORE,
        CAPICOM_MY_STORE,
        CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED,
    )
    cert = None
    for item in iter_store_certificates(store):
        if normalize_thumbprint(item.Thumbprint) == wanted:
            cert = item
            break
    store.Close()
    if cert is None:
        raise RuntimeError(f"Сертификат с отпечатком {wanted} не найден в хранилище My")
    if not cert.HasPrivateKey():
        raise RuntimeError("У сертификата нет приватного ключа (проверь токен АНГАРА)")
    return cert, pycades


def sign_cades_bes(content: str, thumbprint: str, token_pin: str, detached: bool = False) -> str:
    cert, pycades = find_certificate(thumbprint)
    signer = pycades.Signer()
    signer.Certificate = cert
    if token_pin:
        signer.KeyPin = token_pin

    signed_data = pycades.SignedData()
    signed_data.ContentEncoding = CAPICOM_ENCODE_BASE64
    signed_data.Content = content
    signature = signed_data.SignCades(signer, CADES_BES, detached, CAPICOM_ENCODE_BASE64)
    return re.sub(r"[\r\n\s]+", "", signature)


def sign_detached_document(content_base64: str) -> dict:
    thumbprint = env("CRPT_CERT_THUMBPRINT")
    token_pin = env("CRPT_TOKEN_PIN")
    if not content_base64:
        raise RuntimeError("Пустой product_document для подписи")
    signature = sign_cades_bes(content_base64, thumbprint, token_pin, detached=True)
    return {"ok": True, "signature": signature}


def get_token() -> dict:
    base = api_base()
    auth_key = http_json("GET", f"{base}/auth/key")
    uuid = auth_key.get("uuid")
    data = auth_key.get("data")
    if not uuid or not data:
        raise RuntimeError(f"Некорректный ответ /auth/key: {auth_key}")

    thumbprint = env("CRPT_CERT_THUMBPRINT")
    token_pin = env("CRPT_TOKEN_PIN")
    signature = sign_cades_bes(str(data), thumbprint, token_pin)

    payload: dict = {"uuid": uuid, "data": signature, "unitedToken": True}
    inn = env("CRPT_INN")
    if inn:
        payload["inn"] = inn

    token_resp = http_json("POST", f"{base}/auth/simpleSignIn", payload)
    token = token_resp.get("token") or token_resp.get("uuidToken")
    if not token:
        raise RuntimeError(f"Токен не получен: {token_resp}")

    cert, _ = find_certificate(thumbprint)
    return {
        "ok": True,
        "token": token,
        "expireDate": token_resp.get("expireDate"),
        "uuid": uuid,
        "certSubject": cert.SubjectName,
        "certThumbprint": normalize_thumbprint(cert.Thumbprint),
        "apiUrl": base,
    }


def diagnose() -> dict:
    steps: list[dict] = []

    def step(name: str, ok: bool, detail: str) -> None:
        steps.append({"step": name, "ok": ok, "detail": detail})

    thumb = env("CRPT_CERT_THUMBPRINT")
    pin = env("CRPT_TOKEN_PIN")
    step("env_thumbprint", bool(thumb), "Задан" if thumb else "CRPT_CERT_THUMBPRINT пуст")
    step("env_token_pin", bool(pin), "Задан" if pin else "CRPT_TOKEN_PIN пуст")

    try:
        import_pycades()
        step("pycades", True, "import ok")
    except Exception as exc:
        step("pycades", False, str(exc))
        return {"ok": False, "steps": steps}

    try:
        certs = list_certificates()
        step("certificates", len(certs) > 0, f"Найдено: {len(certs)}")
    except Exception as exc:
        step("certificates", False, str(exc))
        return {"ok": False, "steps": steps}

    if thumb:
        try:
            cert, _ = find_certificate(thumb)
            step("certificate", True, cert.SubjectName)
        except Exception as exc:
            step("certificate", False, str(exc))

    try:
        base = api_base()
        auth_key = http_json("GET", f"{base}/auth/key")
        step(
            "auth_key",
            bool(auth_key.get("uuid") and auth_key.get("data")),
            f"uuid={auth_key.get('uuid', '')[:8]}…",
        )
    except Exception as exc:
        step("auth_key", False, str(exc))

    if thumb and pin and all(s["ok"] for s in steps if s["step"] in {"pycades", "certificate", "auth_key"}):
        try:
            result = get_token()
            step("simpleSignIn", True, f"token {len(result['token'])} chars")
        except Exception as exc:
            step("simpleSignIn", False, str(exc))

    return {"ok": all(s["ok"] for s in steps), "steps": steps, "certificates": certs if "certs" in locals() else []}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--list-certs", action="store_true")
    parser.add_argument("--diagnose", action="store_true")
    parser.add_argument("--sign-detached", metavar="BASE64", help="Откреплённая подпись product_document")
    args = parser.parse_args()

    try:
        if args.list_certs:
            print(json.dumps({"ok": True, "certificates": list_certificates()}, ensure_ascii=False))
            return 0
        if args.diagnose:
            print(json.dumps(diagnose(), ensure_ascii=False))
            return 0
        if args.sign_detached is not None:
            print(json.dumps(sign_detached_document(args.sign_detached), ensure_ascii=False))
            return 0
        print(json.dumps(get_token(), ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
