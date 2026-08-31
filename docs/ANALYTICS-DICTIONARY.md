# MARKYRA — Analytics Dictionary

Two streams. Financial and audit data are **not** analytics and live in CORE.

| Event | Stream | Meaning | Counts toward |
|---|---|---|---|
| `map_open` | B | map surface rendered | secondary |
| `map_ready` | B | map interactive | secondary |
| `map_pin_click` | B | pin selected | H4 |
| `map_cluster_click` | B | cluster expanded | H4 |
| `viewport_query` | B | viewport refetch | performance |
| `search` | B | a search was submitted | **H1 denominator** |
| `search_zero_results` | B | no match; query retained for seeding | secondary |
| `category_select` | B | category chip | secondary |
| `business_open` | B | shopfront rendered; `source` distinguishes map/list/search | **H1 numerator, H2 denominator, H4** |
| `contact_click` | B | call or WhatsApp tap | **H2 numerator** |
| `directions_click` | B | directions handoff | **H2 numerator** |
| `claim_started` | A | claim initiated | **H3 denominator** |
| `claim_completed` | A | minimum profile finished | **H3 numerator** |
| `verification_completed` | A | ops approved verification | secondary |
| `viewport_delivered` | A | server-measured delivered impressions | receipts |
| `business_view` | A | server-side shopfront view | receipts |

Every event carries `traffic_segment` (INTERNAL · OPS · BUSINESS · TEST_USER ·
ORGANIC · BOT). Property keys resembling a phone, email, token, password, code
or name are dropped by the scrubber before storage.

## Integrity checks (§41)

Duplicate events (Stream A carries an idempotency key) · missing events
(reconcile funnel counts against database state) · impossible sequences
(`claim_completed` without `claim_started`) · internal traffic contamination
(segment column) · timezone (all timestamps UTC, rendered Africa/Tunis) ·
business attribution (events for non-REAL businesses excluded from metrics).
