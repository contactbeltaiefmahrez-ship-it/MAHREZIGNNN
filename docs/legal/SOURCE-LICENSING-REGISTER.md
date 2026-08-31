# Source Licensing Register

A source may not reach `APPROVED_FOR_PILOT` without recorded licence evidence —
enforced by a CHECK constraint, not by discipline. **Unknown stays UNKNOWN.**

| Source | Type | Licence | Commercial | Redistribution | Derivative DB | Attribution | Counsel status | Origin |
|---|---|---|---|---|---|---|---|---|
| `FIXTURE` | development fixture | internal | n/a | no | n/a | no | n/a | **FIXTURE** |
| `WINDOW0_TEST` | verification batch | internal | n/a | no | n/a | no | n/a | **TEST** |
| OpenStreetMap (Protomaps/Geofabrik extract) | geographic | **ODbL-1.0** | see D-11.Q6 | see D-11.Q4 | **see D-11.Q3** | **required** | **PENDING COUNSEL** | would be GEO-only, never a business record |
| Tunisian official directories (RNE and similar) | business register | **UNKNOWN** | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | **PENDING COUNSEL** | — |
| Business websites / public profiles | business info | per-site terms, **varies** | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | **PENDING COUNSEL** | — |
| **Direct business participation** | field collection | **direct authorisation** | n/a | n/a | n/a | n/a | **PENDING COUNSEL** (model, not licence) | **preferred first source** |

## Why direct participation is the recommended first source

It has the lowest legal ambiguity of the available options: the business itself
supplies and approves what appears. It does **not** automatically resolve D-12 —
counsel must still confirm the model, the field list and the notice — but it
avoids the separate question of third-party licensing entirely.

## Recording rule
For every source: name, URL/identifier, owner, data type, coverage, licence,
access method, acquisition date, attribution, commercial use, redistribution,
derivative-database status, contact, and counsel status. Never infer a licence
from a page's appearance. Never infer commercial permission from accessibility.
