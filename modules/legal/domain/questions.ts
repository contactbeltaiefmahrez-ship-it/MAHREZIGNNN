/**
 * The questions counsel must answer. Stated here so the entry gate can compute
 * which remain open, rather than a person remembering.
 *
 * Nothing in this file is a legal opinion. Each entry is a QUESTION with the
 * technical facts attached; the answer comes from counsel and is stored in
 * `legal_decision`.
 */
export interface LegalQuestion {
  id: string; topic: string; question: string;
  technicalFact: string; ifYes: string; ifNo: string;
}

export const D11_QUESTIONS: readonly LegalQuestion[] = [
  { id: 'D-11.Q1', topic: 'basemap use',
    question: 'May MARKYRA use an OSM-derived extract as its basemap?',
    technicalFact: 'A PMTiles archive is generated from an upstream OSM extract and served as a static file from object storage behind a CDN. No OSM data enters CORE.',
    ifYes: 'Basemap activates; ODbL attribution renders persistently on every map surface.',
    ifNo: 'A non-ODbL basemap source must be licensed, or the map ships without a basemap in its degraded state.' },
  { id: 'D-11.Q2', topic: 'overlay',
    question: 'May MARKYRA render its proprietary business records on top of that basemap?',
    technicalFact: 'Business pins are fetched from the CORE API at runtime and added to MapLibre as a separate source. They are never baked into the tile archive.',
    ifYes: 'Current implementation stands unchanged.',
    ifNo: 'Business rendering must be separated from the OSM basemap surface entirely.' },
  { id: 'D-11.Q3', topic: 'derivative database',
    question: 'Does combining MARKYRA business records with OSM-derived geography create a Derivative Database under ODbL?',
    technicalFact: 'CORE and GEO are separate PostgreSQL instances. The application role is DENIED connect on GEO. No dblink or postgres_fdw exists. The only crossing is a delegation_code text value assigned OFFLINE in the seeding pipeline.',
    ifYes: 'Share-alike may attach; the affected elements must be identified and the offline crossing may need replacing with a non-ODbL boundary source.',
    ifNo: 'The current separation is sufficient; document it as the compliance boundary.' },
  { id: 'D-11.Q4', topic: 'scope of share-alike',
    question: 'If a derivative database exists, which elements become subject to ODbL?',
    technicalFact: 'Candidate elements: delegation_code on business rows; delegation polygons in GEO; the PMTiles archive; nothing else touches OSM.',
    ifYes: 'Identified elements must be offered under ODbL; the business database must be separable.',
    ifNo: 'No share-alike obligation on the business database.' },
  { id: 'D-11.Q5', topic: 'attribution',
    question: 'What attribution text, placement and persistence are required?',
    technicalFact: 'Attribution is currently rendered on map surfaces; exact wording and persistence are configurable.',
    ifYes: 'Implement the specified wording and placement.',
    ifNo: 'n/a — attribution is expected in all interpretations.' },
  { id: 'D-11.Q6', topic: 'commercial use',
    question: 'May MARKYRA monetise a discovery service (paid visibility) while using an OSM-derived basemap?',
    technicalFact: 'Revenue comes from THE MARKET seats — paid visibility for business records, not for geographic data.',
    ifYes: 'Commercial model proceeds.',
    ifNo: 'Either the basemap source changes or the commercial model must be reconsidered — a company-level decision.' },
  { id: 'D-11.Q7', topic: 'tiles and caching',
    question: 'What obligations attach to the generated PMTiles archive, CDN caches and browser caches?',
    technicalFact: 'The archive is immutable, date-stamped, cached at CDN with a one-year TTL, and range-requested by the browser.',
    ifYes: 'Apply the specified notices/terms to the archive and its distribution.',
    ifNo: 'n/a' },
  { id: 'D-11.Q8', topic: 'boundary to maintain',
    question: 'What exact CORE/GEO separation must MARKYRA maintain going forward?',
    technicalFact: 'Currently: separate instances, denied role, no FDW, offline code-only crossing.',
    ifYes: 'Record as the compliance boundary and test it in CI.',
    ifNo: 'Tighten to the specified boundary.' },
];

export const D12_QUESTIONS: readonly LegalQuestion[] = [
  { id: 'D-12.Q1', topic: 'business identity',
    question: 'May MARKYRA publish a business name, category and address obtained from a third party without prior owner consent?',
    technicalFact: 'These are the four required fields; without them a record cannot be published at all.',
    ifYes: 'Third-party sourced identity may be published with provenance recorded.',
    ifNo: 'Only directly authorised business data may be published — the participation model becomes mandatory.' },
  { id: 'D-12.Q2', topic: 'coordinates',
    question: 'May MARKYRA publish geographic coordinates it collected itself for a business premises?',
    technicalFact: 'Coordinates are collected by field observation and stored with a confidence classification; LOW/UNKNOWN cannot be published.',
    ifYes: 'Field collection proceeds as designed.',
    ifNo: 'Coordinates must be owner-supplied or omitted.' },
  { id: 'D-12.Q3', topic: 'phone — publicly displayed',
    question: 'May MARKYRA publish a phone number the business already displays publicly on its own premises or website?',
    technicalFact: 'Only numbers the business already displays publicly are collected; contact_source is recorded per field.',
    ifYes: 'Publish with provenance; removal on request within 5 business days.',
    ifNo: 'Phone is withheld; the Call action is hidden and an alternative contact mechanism becomes a PRODUCT decision.' },
  { id: 'D-12.Q4', topic: 'phone — sole trader',
    question: 'Where the business number is also the owner\'s personal mobile — common among sole traders in the pilot categories — does it become personal data, and does that change the answer to Q3?',
    technicalFact: 'The system cannot distinguish a business line from a personal mobile used for business. No technical signal separates them.',
    ifYes: 'A consent-based model is required for this class; the system must record consent per record.',
    ifNo: 'Treated as business contact data.' },
  { id: 'D-12.Q5', topic: 'phone — third-party sourced',
    question: 'Does a number obtained from a third-party directory require different treatment from one supplied by the owner?',
    technicalFact: 'provenance.contact_source records which applies, per field.',
    ifYes: 'Restrict publication by contact_source; the ingestion pipeline can filter on it.',
    ifNo: 'Uniform treatment.' },
  { id: 'D-12.Q6', topic: 'notice and objection',
    question: 'What notice must a business receive that it has been listed, and what objection route is required?',
    technicalFact: 'Every unclaimed shopfront carries a visible removal request; requests are honoured within 5 business days.',
    ifYes: 'Implement the specified notice and timeline.',
    ifNo: 'n/a' },
  { id: 'D-12.Q7', topic: 'regulatory formalities',
    question: 'Does this processing require a declaration or authorisation under Loi 2004-63 / current INPDP practice, and who is the data controller?',
    technicalFact: 'Processing occurs in an EU region; the operating entity is pending (D-13).',
    ifYes: 'File before the first real publication.',
    ifNo: 'Record the reasoning.' },
  { id: 'D-12.Q8', topic: 'claimant data',
    question: 'What lawful basis covers the claimant\'s phone number and session, and what retention applies?',
    technicalFact: 'owner_account stores a verified phone; verification documents are in restricted storage with a retention timer; audit entries are permanent.',
    ifYes: 'Configure retention accordingly.',
    ifNo: 'Reduce what is stored.' },
  { id: 'D-12.Q9', topic: 'retention of verification evidence',
    question: 'How long may verification documents be retained after a decision?',
    technicalFact: 'retention_expires_at is set at upload; a daily job deletes on expiry.',
    ifYes: 'Set the period in configuration.',
    ifNo: 'n/a' },
];

export const ALL_QUESTION_IDS: readonly string[] =
  [...D11_QUESTIONS, ...D12_QUESTIONS].map((q) => q.id);
