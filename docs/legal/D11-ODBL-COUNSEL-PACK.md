# D-11 — ODbL / CORE-GEO LEGAL QUESTION PACK

MARKYRA serves an OSM-derived basemap and overlays its own business records at runtime. The two datasets live in separate database instances; the application role is denied access to the OSM side. These questions establish whether that separation is the right one and what obligations attach.

**Nothing here is a legal conclusion.** Each entry states the technical fact as
implemented, the question, and the consequence of each answer. The answer is
yours; the system records it in `legal_decision` and enforces it.

---

## D-11.Q1 — basemap use

**QUESTION**
May MARKYRA use an OSM-derived extract as its basemap?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
A PMTiles archive is generated from an upstream OSM extract and served as a static file from object storage behind a CDN. No OSM data enters CORE.

**IF THE ANSWER IS YES / PERMITTED**
Basemap activates; ODbL attribution renders persistently on every map surface.

**IF THE ANSWER IS NO / NOT PERMITTED**
A non-ODbL basemap source must be licensed, or the map ships without a basemap in its degraded state.

**DECISION REQUIRED** — record as `D-11.Q1/<yyyy-mm>` with scope, conditions and a review date.

---

## D-11.Q2 — overlay

**QUESTION**
May MARKYRA render its proprietary business records on top of that basemap?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
Business pins are fetched from the CORE API at runtime and added to MapLibre as a separate source. They are never baked into the tile archive.

**IF THE ANSWER IS YES / PERMITTED**
Current implementation stands unchanged.

**IF THE ANSWER IS NO / NOT PERMITTED**
Business rendering must be separated from the OSM basemap surface entirely.

**DECISION REQUIRED** — record as `D-11.Q2/<yyyy-mm>` with scope, conditions and a review date.

---

## D-11.Q3 — derivative database

**QUESTION**
Does combining MARKYRA business records with OSM-derived geography create a Derivative Database under ODbL?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
CORE and GEO are separate PostgreSQL instances. The application role is DENIED connect on GEO. No dblink or postgres_fdw exists. The only crossing is a delegation_code text value assigned OFFLINE in the seeding pipeline.

**IF THE ANSWER IS YES / PERMITTED**
Share-alike may attach; the affected elements must be identified and the offline crossing may need replacing with a non-ODbL boundary source.

**IF THE ANSWER IS NO / NOT PERMITTED**
The current separation is sufficient; document it as the compliance boundary.

**DECISION REQUIRED** — record as `D-11.Q3/<yyyy-mm>` with scope, conditions and a review date.

---

## D-11.Q4 — scope of share-alike

**QUESTION**
If a derivative database exists, which elements become subject to ODbL?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
Candidate elements: delegation_code on business rows; delegation polygons in GEO; the PMTiles archive; nothing else touches OSM.

**IF THE ANSWER IS YES / PERMITTED**
Identified elements must be offered under ODbL; the business database must be separable.

**IF THE ANSWER IS NO / NOT PERMITTED**
No share-alike obligation on the business database.

**DECISION REQUIRED** — record as `D-11.Q4/<yyyy-mm>` with scope, conditions and a review date.

---

## D-11.Q5 — attribution

**QUESTION**
What attribution text, placement and persistence are required?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
Attribution is currently rendered on map surfaces; exact wording and persistence are configurable.

**IF THE ANSWER IS YES / PERMITTED**
Implement the specified wording and placement.

**IF THE ANSWER IS NO / NOT PERMITTED**
n/a — attribution is expected in all interpretations.

**DECISION REQUIRED** — record as `D-11.Q5/<yyyy-mm>` with scope, conditions and a review date.

---

## D-11.Q6 — commercial use

**QUESTION**
May MARKYRA monetise a discovery service (paid visibility) while using an OSM-derived basemap?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
Revenue comes from THE MARKET seats — paid visibility for business records, not for geographic data.

**IF THE ANSWER IS YES / PERMITTED**
Commercial model proceeds.

**IF THE ANSWER IS NO / NOT PERMITTED**
Either the basemap source changes or the commercial model must be reconsidered — a company-level decision.

**DECISION REQUIRED** — record as `D-11.Q6/<yyyy-mm>` with scope, conditions and a review date.

---

## D-11.Q7 — tiles and caching

**QUESTION**
What obligations attach to the generated PMTiles archive, CDN caches and browser caches?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
The archive is immutable, date-stamped, cached at CDN with a one-year TTL, and range-requested by the browser.

**IF THE ANSWER IS YES / PERMITTED**
Apply the specified notices/terms to the archive and its distribution.

**IF THE ANSWER IS NO / NOT PERMITTED**
n/a

**DECISION REQUIRED** — record as `D-11.Q7/<yyyy-mm>` with scope, conditions and a review date.

---

## D-11.Q8 — boundary to maintain

**QUESTION**
What exact CORE/GEO separation must MARKYRA maintain going forward?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
Currently: separate instances, denied role, no FDW, offline code-only crossing.

**IF THE ANSWER IS YES / PERMITTED**
Record as the compliance boundary and test it in CI.

**IF THE ANSWER IS NO / NOT PERMITTED**
Tighten to the specified boundary.

**DECISION REQUIRED** — record as `D-11.Q8/<yyyy-mm>` with scope, conditions and a review date.

---

## Recording your answer

```
recordDecision({ decisionRef, questionId, counselName, decidedOn,
                 decision, scope, conditions?, reviewBy?, documentReference? })
registerBasis({ ref, description, decisionRefs, dataCategories })
activateBasis(ref)
```

Until a basis is registered **and** activated, publishing real data fails with a
database error. That is intentional.
