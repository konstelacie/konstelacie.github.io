# GSC Verification Checklist – citimtedasom.sk

Use this checklist after deploying the canonical/SEO changes to resolve "Alternate page with proper canonical tag" and improve indexability.

---

## 1. Resubmit sitemap

- [ ] Open [Google Search Console](https://search.google.com/search-console) → property **citimtedasom.sk**
- [ ] Go to **Sitemaps**
- [ ] Enter `sitemap.xml` (or `https://citimtedasom.sk/sitemap.xml`) if not already submitted
- [ ] Click **Submit**
- [ ] Note: Sitemap now includes only indexable URLs:
  - `https://citimtedasom.sk/`
  - `https://citimtedasom.sk/temy/rodicia-a-rodina/vina-voci-rodicom/`
  - `https://citimtedasom.sk/temy/rodicia-a-rodina/zodpovedny-za-pohodu-rodicov/`

---

## 2. Inspect canonical URLs (not alternates)

- [ ] In GSC, open **URL Inspection**
- [ ] Inspect the **canonical URLs** (trailing slash, no index.html):
  - [ ] `https://citimtedasom.sk/`
  - [ ] `https://citimtedasom.sk/temy/rodicia-a-rodina/vina-voci-rodicom/`
  - [ ] `https://citimtedasom.sk/temy/rodicia-a-rodina/zodpovedny-za-pohodu-rodicov/`
- [ ] For each: confirm "URL is on Google" or "URL is not on Google" and that the canonical reported matches the inspected URL
- [ ] Avoid inspecting alternates (e.g. `/index.html` or `/temy/.../index.html`) – focus on canonical URLs

---

## 3. Request indexing for canonical article URLs

- [ ] In URL Inspection, for `https://citimtedasom.sk/`:
  - Inspect → Request indexing (if not recently requested)
- [ ] For `https://citimtedasom.sk/temy/rodicia-a-rodina/vina-voci-rodicom/`:
  - Inspect → Request indexing
- [ ] For `https://citimtedasom.sk/temy/rodicia-a-rodina/zodpovedny-za-pohodu-rodicov/`:
  - Inspect → Request indexing

---

## 4. Verify robots.txt and live site

- [ ] Open `https://citimtedasom.sk/robots.txt`
- [ ] Confirm:
  ```
  User-agent: *
  Allow: /

  Sitemap: https://citimtedasom.sk/sitemap.xml
  ```
- [ ] Spot-check a few pages: view source and verify:
  - All pages have `<link rel="canonical" href="https://citimtedasom.sk/.../" />` (trailing slash, no index.html)
  - Indexable pages have `<meta property="og:url" content="https://citimtedasom.sk/.../" />` matching canonical

---

## 5. Monitor coverage

- [ ] In GSC → **Pages** (or Coverage), monitor after a few days:
  - "Indexed" count for the 3 canonical URLs (homepage + 2 articles)
  - "Alternate page with proper canonical tag" may persist for a while – this is expected
  - Success metric: canonical URLs get indexed; alternates (e.g. `/index.html`) stay as alternates
- [ ] Noindex pages should remain excluded; only the 3 indexable URLs should be indexed

---

**Date completed:** ________________
