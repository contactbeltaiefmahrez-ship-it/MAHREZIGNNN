# D-12 — LAWFUL BASIS FOR BUSINESS DATA PUBLICATION

MARKYRA intends to publish business listings for Grand Tunis. Some fields are unambiguously commercial; at least one — the phone number of a sole trader — may be personal data, and the system cannot tell the difference technically. These questions establish what may be published, on what basis, and with what notice.

**Nothing here is a legal conclusion.** Each entry states the technical fact as
implemented, the question, and the consequence of each answer. The answer is
yours; the system records it in `legal_decision` and enforces it.

---

## D-12.Q1 — business identity

**QUESTION**
May MARKYRA publish a business name, category and address obtained from a third party without prior owner consent?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
These are the four required fields; without them a record cannot be published at all.

**IF THE ANSWER IS YES / PERMITTED**
Third-party sourced identity may be published with provenance recorded.

**IF THE ANSWER IS NO / NOT PERMITTED**
Only directly authorised business data may be published — the participation model becomes mandatory.

**DECISION REQUIRED** — record as `D-12.Q1/<yyyy-mm>` with scope, conditions and a review date.

---

## D-12.Q2 — coordinates

**QUESTION**
May MARKYRA publish geographic coordinates it collected itself for a business premises?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
Coordinates are collected by field observation and stored with a confidence classification; LOW/UNKNOWN cannot be published.

**IF THE ANSWER IS YES / PERMITTED**
Field collection proceeds as designed.

**IF THE ANSWER IS NO / NOT PERMITTED**
Coordinates must be owner-supplied or omitted.

**DECISION REQUIRED** — record as `D-12.Q2/<yyyy-mm>` with scope, conditions and a review date.

---

## D-12.Q3 — phone — publicly displayed

**QUESTION**
May MARKYRA publish a phone number the business already displays publicly on its own premises or website?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
Only numbers the business already displays publicly are collected; contact_source is recorded per field.

**IF THE ANSWER IS YES / PERMITTED**
Publish with provenance; removal on request within 5 business days.

**IF THE ANSWER IS NO / NOT PERMITTED**
Phone is withheld; the Call action is hidden and an alternative contact mechanism becomes a PRODUCT decision.

**DECISION REQUIRED** — record as `D-12.Q3/<yyyy-mm>` with scope, conditions and a review date.

---

## D-12.Q4 — phone — sole trader

**QUESTION**
Where the business number is also the owner's personal mobile — common among sole traders in the pilot categories — does it become personal data, and does that change the answer to Q3?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
The system cannot distinguish a business line from a personal mobile used for business. No technical signal separates them.

**IF THE ANSWER IS YES / PERMITTED**
A consent-based model is required for this class; the system must record consent per record.

**IF THE ANSWER IS NO / NOT PERMITTED**
Treated as business contact data.

**DECISION REQUIRED** — record as `D-12.Q4/<yyyy-mm>` with scope, conditions and a review date.

---

## D-12.Q5 — phone — third-party sourced

**QUESTION**
Does a number obtained from a third-party directory require different treatment from one supplied by the owner?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
provenance.contact_source records which applies, per field.

**IF THE ANSWER IS YES / PERMITTED**
Restrict publication by contact_source; the ingestion pipeline can filter on it.

**IF THE ANSWER IS NO / NOT PERMITTED**
Uniform treatment.

**DECISION REQUIRED** — record as `D-12.Q5/<yyyy-mm>` with scope, conditions and a review date.

---

## D-12.Q6 — notice and objection

**QUESTION**
What notice must a business receive that it has been listed, and what objection route is required?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
Every unclaimed shopfront carries a visible removal request; requests are honoured within 5 business days.

**IF THE ANSWER IS YES / PERMITTED**
Implement the specified notice and timeline.

**IF THE ANSWER IS NO / NOT PERMITTED**
n/a

**DECISION REQUIRED** — record as `D-12.Q6/<yyyy-mm>` with scope, conditions and a review date.

---

## D-12.Q7 — regulatory formalities

**QUESTION**
Does this processing require a declaration or authorisation under Loi 2004-63 / current INPDP practice, and who is the data controller?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
Processing occurs in an EU region; the operating entity is pending (D-13).

**IF THE ANSWER IS YES / PERMITTED**
File before the first real publication.

**IF THE ANSWER IS NO / NOT PERMITTED**
Record the reasoning.

**DECISION REQUIRED** — record as `D-12.Q7/<yyyy-mm>` with scope, conditions and a review date.

---

## D-12.Q8 — claimant data

**QUESTION**
What lawful basis covers the claimant's phone number and session, and what retention applies?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
owner_account stores a verified phone; verification documents are in restricted storage with a retention timer; audit entries are permanent.

**IF THE ANSWER IS YES / PERMITTED**
Configure retention accordingly.

**IF THE ANSWER IS NO / NOT PERMITTED**
Reduce what is stored.

**DECISION REQUIRED** — record as `D-12.Q8/<yyyy-mm>` with scope, conditions and a review date.

---

## D-12.Q9 — retention of verification evidence

**QUESTION**
How long may verification documents be retained after a decision?

**TECHNICAL FACT (as implemented, verifiable in the repository)**
retention_expires_at is set at upload; a daily job deletes on expiry.

**IF THE ANSWER IS YES / PERMITTED**
Set the period in configuration.

**IF THE ANSWER IS NO / NOT PERMITTED**
n/a

**DECISION REQUIRED** — record as `D-12.Q9/<yyyy-mm>` with scope, conditions and a review date.

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
