# Counsel decision → technical consequence

Each row states what changes in code, data, UI and publication under each answer.
**Nothing is implemented before the decision is recorded.**

| Decision | If PERMITTED | If NOT PERMITTED |
|---|---|---|
| **D-11.Q1** basemap | Set `NEXT_PUBLIC_PMTILES_URL`; `/ready` stops reporting the basemap as blocked; ODbL attribution renders persistently. | Map stays in its designed degraded state (neutral canvas + real pins + honest banner), or a non-ODbL basemap must be licensed — a **company decision**. |
| **D-11.Q3** derivative database | Current separation documented as the compliance boundary and asserted in CI. | Identify the affected elements; likely replace the OSM-derived delegation boundaries with a non-ODbL source in the seeding pipeline. One pipeline file, no schema change. |
| **D-11.Q4** share-alike scope | n/a | The named elements must be offerable under ODbL and the business database must remain separable — the architecture already permits this. |
| **D-11.Q5** attribution | Implement the specified wording and placement in the map surface. | n/a |
| **D-11.Q6** commercial use | Market seats proceed. | Basemap source changes, or the commercial model is reconsidered — a **company decision**, not an engineering one. |
| **D-12.Q1** third-party identity | Third-party sourced records may publish with provenance. | Only directly authorised data publishes; the participation workflow becomes mandatory and the pilot dataset shrinks to what field consent supports. |
| **D-12.Q2** own coordinates | Field collection proceeds as designed. | Coordinates must be owner-supplied or omitted; a business with no coordinate cannot appear on the map, only in search and list. |
| **D-12.Q3** publicly displayed phone | Publish with `contact_source` recorded; removal on request in 5 business days. | Phone withheld; the Call action is hidden. **An alternative contact mechanism is a PRODUCT decision, not specified here.** |
| **D-12.Q4** sole-trader phone | Treated as business contact data. | A consent-based model for this class: the participation record must capture per-field consent, and the collector needs a rule applicable on the spot. |
| **D-12.Q5** third-party sourced phone | Uniform treatment. | Filter publication by `contact_source` — the ingestion pipeline already records it per field. |
| **D-12.Q6** notice and objection | Implement the specified notice text and timeline. | n/a |
| **D-12.Q7** regulatory formalities | File before the first real publication. | Record the reasoning in `legal_decision`. |
| **D-12.Q8/Q9** claimant data and document retention | Set retention periods in configuration; the deletion job already runs daily. | Reduce what is stored; verification may need to move to a field-visit-only model. |

## Rule
A decision changes the system only after it exists in `legal_decision`. There is
no path from an opinion in an email to a published record.
