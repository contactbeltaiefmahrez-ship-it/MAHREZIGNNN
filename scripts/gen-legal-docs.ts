/** Generates the counsel packs from the question definitions the code uses,
 *  so the documents and the entry gate can never drift apart. */
import { writeFileSync } from 'node:fs';
import { D11_QUESTIONS, D12_QUESTIONS, type LegalQuestion } from '../modules/legal/service.ts';

const render = (title: string, intro: string, qs: readonly LegalQuestion[]): string => `# ${title}

${intro}

**Nothing here is a legal conclusion.** Each entry states the technical fact as
implemented, the question, and the consequence of each answer. The answer is
yours; the system records it in \`legal_decision\` and enforces it.

${qs.map((q) => `---

## ${q.id} — ${q.topic}

**QUESTION**
${q.question}

**TECHNICAL FACT (as implemented, verifiable in the repository)**
${q.technicalFact}

**IF THE ANSWER IS YES / PERMITTED**
${q.ifYes}

**IF THE ANSWER IS NO / NOT PERMITTED**
${q.ifNo}

**DECISION REQUIRED** — record as \`${q.id}/<yyyy-mm>\` with scope, conditions and a review date.
`).join('\n')}
---

## Recording your answer

\`\`\`
recordDecision({ decisionRef, questionId, counselName, decidedOn,
                 decision, scope, conditions?, reviewBy?, documentReference? })
registerBasis({ ref, description, decisionRefs, dataCategories })
activateBasis(ref)
\`\`\`

Until a basis is registered **and** activated, publishing real data fails with a
database error. That is intentional.
`;

writeFileSync('docs/legal/D11-ODBL-COUNSEL-PACK.md', render(
  'D-11 — ODbL / CORE-GEO LEGAL QUESTION PACK',
  'MARKYRA serves an OSM-derived basemap and overlays its own business records at runtime. The two datasets live in separate database instances; the application role is denied access to the OSM side. These questions establish whether that separation is the right one and what obligations attach.',
  D11_QUESTIONS));

writeFileSync('docs/legal/D12-DATA-PUBLICATION-COUNSEL-PACK.md', render(
  'D-12 — LAWFUL BASIS FOR BUSINESS DATA PUBLICATION',
  'MARKYRA intends to publish business listings for Grand Tunis. Some fields are unambiguously commercial; at least one — the phone number of a sole trader — may be personal data, and the system cannot tell the difference technically. These questions establish what may be published, on what basis, and with what notice.',
  D12_QUESTIONS));

console.log('generated D-11 and D-12 counsel packs from code');
