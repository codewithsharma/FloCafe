# R8 — Staff & Workforce OS

**Date:** 2026-08-15  
**Status:** COMPLETE  
**Schema:** v82 (unchanged — no money/schema rewrite)  
**Suite:** `npm run test:r8`  
**Baseline:** R7 `9015457`

---

## Purpose

Production-quality Staff & Workforce OS for Operavia Restaurant / café, deepened on the existing `users` + shift + RBAC foundation.

Does **not** rebuild authentication. Does **not** create a second staff store. Does **not** implement payroll, scheduling, attendance clocks, biometrics, commissions, or multi-location HR.

---

## Delivered functionality

| Area                   | Delivered                                                                   |
| ---------------------- | --------------------------------------------------------------------------- |
| Staff management       | List, create, edit, activate/deactivate, role assignment (existing 5 roles) |
| Search / filter        | `search` (name/email), `role`, `active`                                     |
| Staff profile / detail | `GET /api/staff/:id` + UI `/staff/detail/?id=`                              |
| Shift depth            | Recent shifts + open_shift_count on detail; `GET /api/staff/working`        |
| RBAC                   | Owner/manager management; server authoritative; last-owner protected        |
| Audit                  | `staff.created/updated/deactivated/activated`, `role.changed`               |
| Validation             | Zod list/create/update/params including lifecycle routes                    |
| Offline                | Local SQLite only                                                           |

---

## Architecture

- SoR: `users` table (dual mount `/api/staff` + `/api/users`)
- Reads: `main/services/staff-workforce.ts`
- Mutations: `main/routes/staff.ts` (preserves staff-authz semantics)
- Shifts: existing `shifts` table / `main/services/shift.ts` (cash terminal model)
- Auth: unchanged `requireRole` + password/PIN policy

---

## APIs

| Method | Path                                      | Roles                                           |
| ------ | ----------------------------------------- | ----------------------------------------------- |
| GET    | `/api/staff` (`search`, `role`, `active`) | owner/manager                                   |
| GET    | `/api/staff/working`                      | owner/manager                                   |
| GET    | `/api/staff/:id`                          | owner/manager                                   |
| POST   | `/api/staff`                              | owner/manager (manager: operational roles only) |
| PUT    | `/api/staff/:id`                          | owner/manager (role change: owner only)         |
| POST   | `/api/staff/:id/deactivate`               | owner/manager                                   |
| POST   | `/api/staff/:id/reactivate`               | owner/manager                                   |

---

## UI

- `/staff` — search, role/active filters, currently-working strip, grid CRUD
- `/staff/detail/?id=` — profile, today performance, shift history (static-export safe)

---

## RBAC

| Role                    | Access                                       |
| ----------------------- | -------------------------------------------- |
| Owner                   | Full staff management + role changes         |
| Manager                 | Operational staff only (cashier/waiter/chef) |
| Cashier / Waiter / Chef | No staff management APIs                     |

Last active owner cannot be deactivated or demoted.

---

## Offline / concurrency

- All staff CRUD and workforce reads are local SQLite.
- Deactivate/reactivate use CAS (`is_active` predicate); double deactivate → 400.
- Last-owner demote/deactivate guarded in SQL.

---

## Audit

- `staff.created`
- `staff.updated`
- `staff.deactivated`
- `staff.activated` (reactivate path; replaces prior `staff.reactivated` action name)
- `role.changed` (emitted when role actually changes, alongside `staff.updated`)

Entity type remains `user`.

---

## Tests

`npm run test:r8` — S-STAFF-01 … S-STAFF-20.

Preserve: `test:staff-authz`, R7–R5, R4.1, H1–H4, money-cents, process-kill, orders-authz, restaurant-isolation.

---

## Capability matrix impact

Existing staff roles / PIN / shift management / staff activity remain Existing.  
Permissions stay Hardening (no fine-grained permission matrix).  
Attendance / Scheduling / Tips / Payroll remain Planned / Later / Out of scope.

---

## Remaining gaps / out of scope

- Payroll, commissions, tips pooling
- Advanced scheduling / leave
- Biometric / clock-in attendance (beyond shift open association)
- Fine-grained custom permissions
- Employee self-service portal
- Multi-location staff
- Cloud-required workforce sync
