# API Reference (Phase 2B)

Base URL: `/api`

All responses are JSON. Errors return `{ "ok": false, "error": "...", "message": "...", "details": {...} }`.

---

## GET /api/slots

List available slots in a date range.

**Query params:**

- `from` (required): ISO date YYYY-MM-DD
- `to` (required): ISO date YYYY-MM-DD (max 31 days range)

**Example:**

```bash
curl "http://localhost:3000/api/slots?from=2026-03-05&to=2026-03-10"
```

**Response 200:**

```json
{
  "ok": true,
  "range": { "from": "2026-03-05", "to": "2026-03-10" },
  "slots": [
    {
      "id": 1,
      "startAt": "2026-03-05T18:00:00.000Z",
      "endAt": "2026-03-05T19:00:00.000Z",
      "timezone": "Europe/Bratislava",
      "status": "open",
      "capacity": 1,
      "isLocked": false,
      "lockExpiresAt": null
    }
  ]
}
```

---

## POST /api/slots/:slotId/lock

Lock a slot for 15 minutes.

**Body (optional):**

```json
{ "email": "optional@domain.com" }
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/slots/1/lock \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

**Response 200:**

```json
{
  "ok": true,
  "slotId": 1,
  "lockToken": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2026-03-05T18:15:00.000Z"
}
```

**Response 409 (already locked):**

```json
{
  "ok": false,
  "error": "SLOT_LOCKED",
  "message": "Slot is already locked",
  "details": { "retryAfterSeconds": 523 }
}
```

---

## POST /api/reservations

Create a reservation from a valid lock.

**Body:**

```json
{
  "slotId": 1,
  "lockToken": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@domain.com"
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"slotId":1,"lockToken":"YOUR-LOCK-TOKEN","email":"user@example.com"}'
```

**Response 201:**

```json
{
  "ok": true,
  "reservation": {
    "id": 1,
    "slotId": 1,
    "email": "user@domain.com",
    "status": "pending_payment",
    "createdAt": "2026-03-05T18:05:00.000Z"
  }
}
```

---

## Seed data (optional)

To create a few slots for testing:

```sql
INSERT INTO slots (start_at, end_at, timezone, status, capacity) VALUES
('2026-03-05 18:00:00', '2026-03-05 19:00:00', 'Europe/Bratislava', 'open', 1),
('2026-03-06 10:00:00', '2026-03-06 11:00:00', 'Europe/Bratislava', 'open', 1),
('2026-03-07 14:00:00', '2026-03-07 15:00:00', 'Europe/Bratislava', 'open', 1);
```
