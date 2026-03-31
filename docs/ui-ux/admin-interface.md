# Admin Interface – UI/UX Specification

## Context

We are building a very simple internal admin interface for a booking system (therapy sessions). The goal is not to create a full-featured admin panel, but a minimal, highly practical internal tool.

This document defines:

* UI structure
* UX flows
* user actions
* edge cases

---

## Core Principles

* Minimalistic, fast, no visual noise
* Optimized for daily operational use
* Admin must see state immediately and act quickly
* No unnecessary confirmations unless destructive
* Avoid complex interactions (no drag & drop, no fancy calendars)
* Prefer tables and simple controls over visual components

---

## Main Screens

---

## 1. Login Screen

### Purpose

Secure access to admin.

### UI

* Username field
* Password field
* Login button

### Behavior

* On success → redirect to `/admin/slots`
* On failure → show simple error ("Invalid credentials")
* No password reset in V1

---

## 2. Slots Management (`/admin/slots`)

### Purpose

Main operational screen to manage availability.

---

### UI Structure

* Date navigation:

  * switch between day / week view

* Slots grouped by day:

  * date header
  * list/table of slots under each day

Each slot shows:

* time
* status:

  * open
  * locked
  * reserved
  * confirmed
  * cancelled
* assigned email (if exists)

---

### Slot Actions

Per slot:

* Block slot
* Unblock slot
* Cancel slot

Actions should be:

* immediate
* visible (state updates instantly)
* without unnecessary confirmation (except cancel if needed)

---

## Slot Creation (CRITICAL FEATURE)

### A. Single Slot Creation

* Select date
* Select time
* Create slot

---

### B. Bulk Slot Creation (PRIMARY USE CASE)

Admin creates multiple slots at once.

#### Inputs

* Date range:

  * FROM date
  * TO date

* Option:

  * Exclude weekends (default: ON)

* Time definition:

  * predefined time slots OR manual input list
  * example: 09:00, 10:00, 11:00

---

### Preview Step (MANDATORY)

Before confirming, system must show:

* List of slots that will be created
* Clear indication of:

  * new slots
  * skipped slots (already exist)

---

### Behavior

* Creation must be fast (few clicks)
* Avoid duplicates:

  * warn if overlapping
* Allow partial creation:

  * create only missing slots
  * skip existing ones

---

## 3. Reservations List (`/admin/reservations`)

### Purpose

Overview of all bookings.

---

### Table Columns

* Created at
* Session date & time
* Email
* Reservation status:

  * draft
  * pending_payment
  * confirmed
  * cancelled
  * expired
* Payment status:

  * unpaid
  * paid
  * expired
* Amount

---

### Filters

* Today
* Upcoming
* Unpaid
* Confirmed
* Expired

Filters must be:

* quick to switch
* persistent during session

---

### Actions

* Open reservation detail

---

## 4. Reservation Detail (`/admin/reservations/:id`)

### Content

* Email
* Slot (date + time)
* Reservation status
* Payment status
* Amount
* Timestamps:

  * created
  * paid
  * expired

---

### Admin Actions

* Confirm reservation manually
* Cancel reservation
* Mark as handled externally (e.g. refund outside system)

---

### Optional

* Admin note field

---

## 5. Billing documents (`/admin/billing`)

### Purpose

Read and operate on **internal billing documents** created when Stripe `checkout.session.completed` runs (`billing_documents` in DB). Complements accounting needs without replacing the accounting system — see `docs/payments/invoicing-mvp-implementation.md`, `docs/DB-SCHEMA.md`, `docs/STRIPE-ARCHITECTURE.md`.

### Navigation

* Entry from the admin shell (same session as slots/reservations): list at **`GET /admin/billing`**.
* **Detail** per document: **`GET /admin/billing/:id`**.

### List screen (`/admin/billing`)

* **Table** of documents for the current query (up to **150** rows per request in code).
* **Search:** one field **`q`** (GET) — e-mail, doklad ID, ID rezervácie/platby, číslo **`CT-…`**, Stripe **`cs_…`** (see label on `admin/billing-list.ejs`; backed by `billingDocumentsRepo.searchForAdmin`).
* **Export:** **`GET /admin/billing/export.csv`** — optional same **`q`**; up to **2000** rows; UTF-8 BOM for Excel; filename `billing-documents.csv`.

### Detail screen (`/admin/billing/:id`)

Show at minimum (parity with ops needs):

* **document_number** (when issued), internal type, status, amounts (net / VAT / gross), **customer_email_snapshot**, links to **payment** / **reservation** where present.
* **Stripe** session id and related refs for support.
* **PDF:** path / “generated at”; indicate if missing.
* **Email:** last send (`email_sent_at`, provider message id if stored).
* **Notes:** operator-visible **notes** field (internal).

### Actions

| Action | HTTP | UX expectation |
|--------|------|----------------|
| Regenerate PDF | `POST /admin/billing/:id/regenerate-pdf` | Replace PDF on disk; redirect back to detail; show flash/error if `NO_NUMBER` / missing row (`billingDeliveryService.regenerateBillingPdfAdmin`). |
| Resend invoice email | `POST /admin/billing/:id/resend-email` | Uses template **`billing-invoice-resend`**; requires existing PDF and valid snapshot email; logs with **`actor_type = admin`** in `email_sent_log`. |
| Update note | `POST /admin/billing/:id/note` | Persist operator note on the document row. |

### UX principles (same as rest of admin)

* **Fast** table + detail; no wizard.
* **Flash messages** after POST actions (`adminFlash` session): success/error text from `mapBillingActionError` for regenerate/resend (e.g. missing PDF, bad email, Resend skipped).
* **Destructive:** regenerating PDF overwrites file; operator should understand replacement (no multi-version history in MVP).

### Out of scope in UI (today)

* Creating or voiding documents by hand (except pipeline + actions above).
* Linked **correction / refund** documents — **not** implemented; refunds remain `docs/STRIPE-ARCHITECTURE.md` future extensions.

---

## States & Logic

---

### Slot States

* **Open** → available for booking
* **Locked** → temporarily held
* **Reserved** → email entered, not paid
* **Confirmed** → paid
* **Cancelled** → not available

---

### Reservation States

* **Draft** → initial state
* **Pending payment** → waiting for payment
* **Confirmed** → payment completed
* **Cancelled** → manually cancelled
* **Expired** → payment not completed in time

---

### Relationship (High Level)

* Slot reflects real availability
* Reservation reflects user progress
* Expired reservation should release slot back to open

---

## Critical UX Cases

---

### 1. Locked but Not Paid

* Reservation expires
* Slot becomes available again
* Admin sees expired reservation

---

### 2. Duplicate Slot Creation

* Bulk overlaps existing slots
* System warns before creation
* Allows partial creation (skip duplicates)

---

### 3. Manual Intervention

Admin must be able to:

* confirm reservation
* cancel reservation

UX requirement:

* fast
* clear
* safe (basic confirmation for destructive actions)

---

### 4. High Volume Slot Creation

* Admin creates multiple days at once
* Must be:

  * predictable
  * fast
  * clearly previewed

---

### 5. Partial Availability

* Some slots already exist in range

Preview must clearly show:

* what will be created
* what will be skipped

---

## UX Tone

* Calm
* Neutral
* Non-technical
* No marketing language
* No unnecessary confirmations
* Destructive actions should be clear but not annoying

---

## Summary

This admin is:

* a practical internal tool
* focused on speed and clarity
* optimized for managing **slots**, **reservations**, and **billing documents** (list, detail, export, PDF regenerate, invoice resend) with minimal friction

No advanced features, no visual complexity — only what is necessary for daily operation.
