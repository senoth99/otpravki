# Отчёт о багах — otpravki

> **Статус:** все пункты закрыты (2026-06-12).

Аудит из 81 бага полностью исправлен в двух сессиях.

## Ключевые изменения (сессия 2)

- **Assembly:** `restoreAssemblyForOrder`, `reconcileAssemblyChanges` — восстановление при unship/failed print
- **Print flow:** печать → mark shipped → archive (client auto-mode и `/api/print`)
- **Workspace queue:** все мутации `memoryState` + archive через `enqueueWorkspaceUpdate`
- **API merge:** сохранение active orders при refresh, пустой API не стирает workspace
- **Orders mapper:** корректная агрегация quantity, skip при неизвестном sizeId
- **Auth:** опциональный `OTPRAVKI_API_SECRET` / `NEXT_PUBLIC_OTPRAVKI_API_SECRET` на mutating routes и socket
- **Прочее:** offline banner, LOCKED map gates, legacy map migration, sklad refresh, mock pool tracking, health redact, next.config static cache, redirect query preserve

## Auth (опционально)

По умолчанию auth выключен (trusted LAN). Для защиты:

```env
OTPRAVKI_API_SECRET=your-secret
NEXT_PUBLIC_OTPRAVKI_API_SECRET=your-secret
OTPRAVKI_CORS_ORIGIN=https://your-host
```
