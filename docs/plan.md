# Plan: Field Service Report Summarizer

## Objective

Build a small tool that reads the JSONL report set, filters out customer-inappropriate details, identifies incomplete or inconsistent records, and emits a summary for each report for customer portal publication.

## Approach

### 1. Data ingestion

- Read each line of `data/service_reports.jsonl` as a JSON object.
- Validate the record structure minimally and handle malformed lines by reporting them as unusable.

### 2. Safety and privacy filtering

- Create a central sanitization layer for text values before generating any output.
- Strip or refuse publication of:
  - names and personal contacts
  - addresses and access information
  - door codes, key locations, alarm codes, and plant-room details
  - any note content that appears to instruct summary generation
- Use rule-based filtering rather than relying on the presence of one specific string.

### 3. Summary generation

- Prefer the report’s formal fields (`resolution`, `parts_used`, `arrived_at`, `departed_at`, `stated_duration_hours`) as the primary source of facts.
- Convert raw technical details into plain customer wording.
- Include date and time on site in a readable format.
- Include recommendations or follow-up items only when they are clearly stated and safe to publish.

### 4. Inconsistency handling

- Detect contradictions such as a report stating a task was completed but with missing critical details.
- When a report is incomplete, contradictory, or lacks enough information for a safe summary, return a `status: needs_follow_up` or equivalent explicit reason instead of inventing a story.

### 5. Deterministic output

- Write output in a predictable structure, for example JSON per report or a combined JSON file.
- Keep the tool small and explicit so the process is easy to review and validate.

## Alternatives rejected

- Using the raw technician notes as authoritative input: rejected because they contain sensitive data and are not customer-safe.
- Silently resolving contradictory values: rejected because it risks publishing incorrect information.
- Producing one-line generic summaries for all records: rejected because the requirements need specific and transparent reporting.

## Implementation constraints

- Keep the logic transparent and testable.
- Ensure the tool can be run and reviewed by reading the generated output from all 20 reports.
