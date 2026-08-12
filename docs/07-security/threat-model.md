# Threat Model

## CURRENT STATE

### Assets
- SQLite database (orders, customers, staff credentials)
- JWT secrets, master PIN
- WhatsApp session files
- Google Drive OAuth tokens
- Cloud sync credentials

### Trust boundaries
```
[Internet] ← outbound only → [FloCafe Electron] ← LAN → [KDS/Waiter tablets]
```

### Threat actors
| Actor | Threat | Mitigation |
|-------|--------|------------|
| LAN attacker | Token sniffing | JWT expiry; TLS planned |
| Malicious renderer | Process escape | contextIsolation, CSP |
| Local malware | DB/session theft | OS permissions; encryption planned |
| Authenticated insider | Unauthorized voids | Manager PIN, role checks |
| Remote attacker | SSRF, injection | Parameterized SQL, URL allowlist |

### Out of scope (CURRENT)
- Nation-state adversaries
- Multi-tenant cloud isolation (single tenant per install)
