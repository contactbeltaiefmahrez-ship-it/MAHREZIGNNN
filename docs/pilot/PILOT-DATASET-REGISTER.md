# Pilot Dataset Register

| Version | Created | Records | Corridors | Categories | Sources | Legal basis | Publication | Notes |
|---|---|---|---|---|---|---|---|---|
| *(none)* | — | — | — | — | — | — | — | **MARKYRA PILOT DATASET v0.1 will be created only when the first legitimate real batch exists (§31).** |

## Rules

- A version is frozen with `freezeDataset(label)`, capturing each business with
  its trust level and quality score at that moment.
- Metrics reference an exact version. If the dataset changes, a new version is
  created; historical metrics are never silently re-based.
- **No synthetic fixture may be included in any version** — `pilotMetrics`
  filters to `origin='REAL'` and reports the excluded count.
- Current population: FIXTURE 240 · TEST 10 · **REAL 0**.
