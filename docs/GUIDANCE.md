# Official guidance: how it works and how to verify it

Resolve must never invent official requirements, complaint deadlines or escalation rules. The guidance engine stores **only** information taken from official sources, with clear verification status.

## Data model (`guidance_sources`)

| Field | Meaning |
| --- | --- |
| `title`, `institution`, `country` | What the source is and who published it (country = ISO code, e.g. `NG`) |
| `issue_category` | One of the four problem types, or empty for "all problem types" |
| `source_url` | The official page (https only) |
| `content` | A faithful summary of what the source says. This text is given to the AI |
| `publication_date` | Date the source was published, if stated |
| `effective_from` / `effective_until` | When the guidance applies. Records outside this window are not shown or used |
| `verified_at` | When a person last checked the summary against the source |
| `status` | `verified`, `unverified`, `outdated` or `archived` |

Anyone can read non-archived records. Only administrators can create or edit them (enforced by RLS).

## How the app uses guidance

- Retrieval: records for the user's country that match the case's category (or apply to all), are in effect today and not archived. Verified records come first.
- The AI receives the records with their IDs and statuses. It may only cite those IDs, and Resolve removes any it invents. The prompt forbids stating deadlines or rules unless they appear in a **verified** record.
- Users always see the status. Unverified records show *Not yet verified by Resolve — check the official source*.

## Current records

The MVP includes four CBN sources supplied by the product owner:

1. https://www.cbn.gov.ng/supervision/cpdcomgt.html
2. https://www.cbn.gov.ng/FinInc/FinLit/LodgeComplaint.html
3. https://complaintsportal.cbn.gov.ng/
4. https://complaintsportal.cbn.gov.ng/Categories

These pages could not be reached from the build environment, so they are stored as links with status `unverified` and no summarised requirements.

## Verification checklist (for an administrator)

1. Open the official page and read it in full.
2. In **Admin: guidance**, open the record and replace the content with an accurate, plain-language summary of what the page actually says, for example:
   - the steps a consumer should follow (e.g. complain to the institution first, then escalate)
   - any timelines **exactly as stated**
   - what information or documents to include
   - official contact channels
   - anything the page says the regulator will not handle
3. Fill in the publication and effective dates if the page states them.
4. If the guidance applies only to one problem type, choose that category. You can create separate records per category.
5. Set the status to **verified** and tick the confirmation box. The verification date is set automatically.
6. Re-check verified records periodically. If a page changes or disappears, set the record to `outdated` or `archived`.

## Adding new countries, regulators or categories

- New country or regulator: add records with the right `country` code and `institution`. No code changes are needed.
- New problem category: add it to `ISSUE_CATEGORIES` in `src/lib/constants.ts` and to the CHECK constraints in a new migration (on `cases.issue_category` and `guidance_sources.issue_category`).
