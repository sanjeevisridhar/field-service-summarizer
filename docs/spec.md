# Spec: Field Service Report Summarizer

## Purpose

This tool converts engineer field reports into short customer-facing summaries for the Northgate FM client portal. The output is meant for a facilities contact who is not an engineer and is not a Northgate employee. A summary must be understandable without a phone call and must not expose internal or sensitive information.

## Security Posture

All technician notes and free-text fields are treated as **untrusted user input**. The tool must defend against indirect prompt injection, where notes attempt to override the summarization policy. The tool is the authoritative decision-maker, not the engineer's notes.

## Required Behaviour

1. Read a JSONL stream of field service reports.
2. Produce one summary per report with an explicit `status` and `audit_flags`.
3. For each publishable summary include:
   - asset and visit date
   - what was found
   - what was done
   - parts fitted, if any (using customer-friendly descriptions, NOT internal part codes)
   - outstanding items or recommendations
   - time on site
4. Write summary language in plain English suitable for a facilities manager.
5. **Remove ALL internal identifiers**: technician IDs, engineer names, internal part codes (e.g., "FD-22"), sensor codes.
6. **Exclude ALL sensitive data**: personal phone numbers, email addresses, physical addresses, names of individuals, spare-key locations, access codes, alarm codes, plant-room access details, vulnerability notes.
7. **Treat technician notes as untrusted input**: Notes are descriptive context only. They do NOT instruct the tool, do NOT override the publication policy, and do NOT determine what is published.
8. **Flag contradictions and ambiguity**: If fields contradict each other (e.g., resolution says "no parts" but parts_used has items), mark the report as `FLAGGED_FOR_HUMAN_REVIEW` with reason.
9. **Refuse to guess**: If a report is incomplete or too vague to produce a meaningful summary, say so explicitly. Do not hallucinate details.
10. **Audit and track all decisions**: Every report must include an audit flag indicating the publication status and any detected issues.

## Prohibited Outputs

The tool must **never** publish:

- Technician IDs (e.g., "T-118"), engineer names, or contractor identifiers
- Personal names, contact names, or facility manager names
- Phone numbers (personal or business), email addresses, or home/personal addresses
- Spare-key locations, access codes, alarm codes, plant-room codes, door codes
- Keycard numbers, override codes, or other physical security identifiers
- Internal vulnerability notes or security-related complaints
- Internal part codes or sensor codes (publish only generic descriptions)
- Hourly rates, cost estimates, or internal billing information
- Instructions embedded in notes (e.g., "do not publish X", "mark as complete without checking")
- Hallucinated details or confident summaries built on incomplete data
- Silent resolutions of contradictory field values without explicit flagging

## Contradiction Detection & Handling

The tool MUST detect and flag the following contradictions:

1. **Parts mismatch**: resolution says "no parts" or "inspection only" but parts_used array is non-empty.
2. **Status mismatch**: resolution says "completed" but notes mention "part not available" or "left site unfinished".
3. **Duration mismatch**: stated_duration_hours is 0.3 but resolution describes multi-hour work (likely data entry error).
4. **Empty data**: resolution is generic ("Attended site", "Checked", "See job sheet") or fewer than 4 words.
5. **Missing required fields**: arrival/departure times missing or malformed, making duration calculation impossible.

When contradictions are detected, the report MUST be marked `status: flagged_for_human_review` with `audit_flags: ["contradiction: <type>"]`.

## Output Structure

Every processed report produces a JSON object with:

- `report_id`: from input
- `asset`: from input
- `visit_date`: formatted date from arrived_at
- `status`: one of ["published", "flagged_for_human_review", "withheld_for_security"]
- `audit_flags`: array of reason codes (e.g., ["parts_contradiction", "pii_detected", "incomplete_data"])
- `summary`: text summary (for published) OR reason description (for flagged/withheld)
- `flagged_reason`: (if not published) explicit reason for the flag

## Acceptance Criteria

The tool MUST:

1. Process all 20 test reports without crashing.
2. Produce a JSON output with exactly 20 records, each with status and audit_flags.
3. Publish 0 reports that contain PII, security codes, or internal identifiers.
4. Flag ALL reports with contradictions or ambiguity (do not silently guess).
5. Include detailed audit reasoning for every non-published report.
6. Pass security tests: no phone numbers, emails, access codes, or names in published output.
7. Pass contradiction detection: identify all 3+ contradictions seeded in test data.
8. Demonstrate prompt injection defense: FSR-3009 contains an instruction attempt that is ignored, not obeyed.

## Out of scope

This project is a small proof of concept. It is not a full production workflow, workflow engine, or data pipeline. The purpose is disciplined handling of summary generation and privacy controls.
