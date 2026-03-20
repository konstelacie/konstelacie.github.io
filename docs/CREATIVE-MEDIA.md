# Creative media (Facebook ads & funnel video)

**Purpose:** One place to understand where video and related creative files live, what is served by the site vs what is for Meta Ads only, and how naming should stay consistent.

**Deployment note:** Large binaries can bloat the repo. Prefer **Git LFS** for committed masters, or keep only **exports/thumbnails/scripts** in git and store huge sources elsewhere—see [What to commit](#what-to-commit).

---

## Layout at a glance

| Location | Role |
|----------|------|
| `creative/facebook-ads/` | Assets **for Meta / Facebook ads** only—not served as static files from citimtedasom.sk. |
| `creative/funnel/` | **Working area** for funnel video: masters, alternates, notes—before or besides publishing to `public/`. |
| `public/assets/media/funnel/` | Files **actually used on the site** (embedded in funnel pages). URL path: `/assets/media/funnel/…`. |

Flow in short:

- **FB ad:** produce → store under `creative/facebook-ads/` (and upload to Ads Manager; the repo holds what you want versioned).
- **Funnel:** master/edit in `creative/funnel/` if useful → copy **final** assets into `public/assets/media/funnel/` → reference in HTML/EJS with **root-relative** URLs, e.g. `src="/assets/media/funnel/pilot-intro.webm"`.

---

## `creative/facebook-ads/`

Use **English file names** (project convention). Subfolders are optional but recommended as you add campaigns:

```
creative/facebook-ads/
├── README.md
├── {campaign-or-batch}/          # e.g. pilot-2025-q1
│   ├── video/                    # exports for placements
│   ├── thumbnails/
│   └── copy-notes.md             # optional: headlines, UTMs, links
```

- Put **placement-specific exports** (square, vertical, feed) here—not in `public/`, unless a funnel page intentionally reuses the same file.
- Keep a short **copy-notes** or link to your ads doc when text/UTMs matter for consistency with `docs/ui-ux/01-fb-ad-entry-point.md`.

---

## `creative/funnel/` vs `public/assets/media/funnel/`

| | `creative/funnel/` | `public/assets/media/funnel/` |
|---|-------------------|--------------------------------|
| **Served on site?** | No | Yes (`/assets/media/funnel/…`) |
| **Typical contents** | Premiere/Resolve exports, `.psd` references, scratch files, A/B cuts | Only what pages reference (compressed web-friendly formats) |

**Rule:** Anything linked from `src/views/funnels/` or client JS must live under `public/assets/…` and use **root-relative** paths (see `docs/PRACTICES.md`).

Related UX notes: `docs/ui-ux/02-landing-page-video-flow.md`, task hacks `docs/task-hacks/01-video-fb-ad.md` and `docs/task-hacks/02-video-funnel.md`.

---

## What to commit

- **Usually commit:** final web exports in `public/assets/media/funnel/`, small thumbnails, README/copy notes, lightweight FB exports in `creative/facebook-ads/`.
- **Consider Git LFS or external storage:** multi‑GB ProRes masters, raw screen captures, project files tied to heavy NLE projects.
- If the repo grows too large, add targeted `.gitignore` rules under `creative/**` for specific patterns (e.g. `*.prproj`, large `*.mov`)—document any ignore in this file so the team agrees.

---

## Checklist when adding a new funnel video

1. Final asset(s) in `public/assets/media/funnel/` with clear English filenames.
2. Page references `src="/assets/media/funnel/…"` (no `../` asset paths).
3. Optional: mirror or document the master in `creative/funnel/` if you need parity with source exports.

---

## Checklist when adding a new FB ad batch

1. Files under `creative/facebook-ads/{campaign-or-batch}/`.
2. Upload to Meta; keep repo copy aligned with what you actually run (or note version in folder name).
3. Align entry URL and messaging with `docs/ui-ux/01-fb-ad-entry-point.md` where relevant.
