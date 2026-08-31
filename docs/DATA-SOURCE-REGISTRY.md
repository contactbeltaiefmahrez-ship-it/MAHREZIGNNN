# MARKYRA — Data Source Registry

Every source must be registered here **and** in the `data_source` table, with an
`approved_at` timestamp, before a single record from it may be staged. The
pipeline refuses an unregistered source (`stageBatch` throws).

## Registered

| Code | Kind | Licence | Attribution | Commercial | Auto-extract | Reliability | Status |
|---|---|---|---|---|---|---|---|
| `FIXTURE` | FIXTURE | internal | no | n/a | yes | 3 | **Development only. Never in production.** |

## Assessed but NOT approved — acquisition is a founder/counsel task

| Candidate | Assessment | Blocker |
|---|---|---|
| **OpenStreetMap** (Geofabrik / Protomaps extracts) | Usable as a **geographic reference layer**. ODbL-1.0: attribution mandatory, share-alike applies to derived databases. | Approved for GEO only. **Must not become MARKYRA business records** — an OSM POI is a geographic observation, not a verified business. D-11 governs the boundary. |
| **Tunisian official business directories** (RNE and similar) | Highest reliability if licensed. | Terms of use and redistribution rights **not established**. Requires counsel. No automated extraction until then. |
| **Business websites / public profiles** | Field-verifiable, good for phone and hours. | Per-site terms vary; blanket scraping is prohibited by §07. Only manual, per-record collection with recorded consent or public-display justification. |
| **Field collection** (agents walking the pilot corridors) | **The recommended primary source.** Highest coordinate confidence, clean provenance, no licence ambiguity, doubles as the claim funnel. | Operational cost only. |
| **Business submission** | Clean provenance and consent by definition. | Requires the product to be live — a bootstrapping problem, not a licence one. |

## The rule
> Publicly visible does not mean licensed for reuse (§07).
> A source whose legal status is unknown does not ship (§38).
