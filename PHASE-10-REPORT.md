# MARKYRA — PHASE 10
# VISUAL PRODUCT COMPLETION

**Date** 29 Aug 2026 · Verified in a real browser at four viewports

---

## STATUS

> **VISUAL PRODUCT COMPLETE — DEMO DATA, NO BASEMAP**

```
typecheck PASS · lint PASS · web build PASS (7 routes)
browser acceptance: 32/32
```

`npm install && npm run dev` opens the real product at `localhost:3000` with no
database, no API and no configuration.

---

## 1 · WHAT EXISTED, AND WHAT DIDN'T

The audit found **two routes** (`/` and `/b/[id]`), four components, 38 lines of
tokens, and **41 inline style blocks**. There was no map page, no search page, no
category page, no claim UI, no owner surface, and no design system — styling was
inline objects scattered through JSX.

That is a prototype, not a product. This phase built the product.

## 2 · WHAT WAS BUILT

**A real design system.** 240 lines of CSS: two separate colour ramps (UI dark
and desaturated; category saturated and map-only), a type scale, spacing,
elevation, motion tokens honouring `prefers-reduced-motion`, and ~40 component
classes. The inline styles are gone from the shared components.

**Seven routes**, all working: discovery home · map + synchronised list ·
search · category · shopfront · claim · for-business.

**The map is now a product surface**: 36 pins with category colour and
attention-weighted size, working zoom controls, a viewport that fits the data
rather than leaving half the canvas empty, selection state, and a desktop list
that stays synchronised with it.

**Mobile is a first-class layout**, not a squeeze: the bottom sheet with three
detents appears below 900px and the side list disappears. Verified with no
horizontal overflow at 390, 430 and 768.

**The claim flow is real.** In API mode it calls the actual endpoints and the
code goes to the number **already on the listing** — never one the claimant
types. In demo mode the screens render and say plainly that no claim is created.

**The weekly market is visible** as the 100-seat grid, with tiers, unpurchasable
curated seats, and vacancy shown honestly.

## 3 · THE HONESTY PROBLEM, AND HOW IT WAS SOLVED

The brief asked for a product a non-technical person can open in one command. The
system has **zero real businesses** and no basemap. Those two facts are in
tension: a beautiful empty product shows nothing, and inventing content would be
the worst possible outcome.

The resolution:

- **Demo data is a typed, separate origin.** Every demo record carries
  `origin: 'DEMO'` and an id prefixed `demo-`. The demo module has no path to
  staging, validation or publish — the pipeline is the only way real data enters.
- **Demo mode can never be silent.** A persistent banner on every screen reads
  *وضع تجريبي — البيانات المعروضة ليست أنشطة حقيقية* and, in Latin so it survives
  any screenshot, `DEMO DATA · REAL = 0`.
- **Names are generic-descriptive** — «واجهة عرض ١», «Vitrine Démo 1» — not
  plausible Tunis business names. A screenshot cannot be read as a real directory.
- **The market shows an illustrative layout** and states on screen that no
  business has bought a seat.
- **The map states its own limitation** instead of faking a basemap.

The product looks finished. Nothing in it claims to be real.

## 4 · WHAT THE PRODUCT COMMUNICATES

The trust model is now visible rather than documented. The home page carries a
panel titled **«الثقة لا تُشترى»**. Trust renders as a **mark beside the name**
(✓ verified, ● claimed). Sponsorship renders as the **word مموّل at the edge** of
a card or beneath a pin — never a badge, never near the name, in a colour used
nowhere else. The distinction survives a greyscale screenshot.

Search states that paid visibility does not affect results. The shopfront frames
market participation as a **fact**, not a sponsorship label, because nothing on
that page was purchased — only the placement that led there. The claim flow says
**«المطالبة ليست توثيقًا»** before the user starts.

## 5 · WHAT WAS DELIBERATELY NOT DONE

No fake business names. No invented sales, seat purchases, revenue, ratings,
reviews, user counts or activity. No stock photography standing in for real
shopfronts. No fabricated basemap. No screen implying a live pilot.

Every one of those would have made the screenshots better and the product a lie.

## 6 · KNOWN LIMITATIONS

- **No basemap** — externally blocked; the map shows real positions on a neutral
  surface with a banner.
- **Demo photos are category glyphs**, not images — we have no licensed
  photography and would not fabricate any.
- **Owner dashboard is explanatory, not operational.** `/for-business` explains
  claiming, verification and the market; a live owner analytics surface needs
  real traffic to be anything but a fake chart.
- **No offers UI, no receipt screen** — both require real data to be honest.

## 7 · NEXT

Unchanged and still outside code: counsel decisions D-11 and D-12, field
collection of the first 10–25 real businesses, the PMTiles basemap archive, and
procurement of SMS and error tracking. The moment real records exist, the same
screens render them: the frontend switches to API mode automatically and the
demo banner disappears on its own.
