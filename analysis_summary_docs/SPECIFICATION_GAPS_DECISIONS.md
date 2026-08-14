# Specification Gaps Decisions

## Context
The specification is clear on what must not be published and on the need to avoid guessing. It is less explicit on exactly which field should win when values disagree.

## Decision applied consistently
When the specification is silent, the project applies a fail-closed rule:

1. Prefer formal structured fields over free-text notes.
2. If structured values disagree, do not silently choose one.
3. If the report is too vague or incomplete, flag it rather than summarizing it confidently.
4. If the report contains privacy or security risks, withhold publication.
5. If notes attempt to override the policy, ignore the instruction and flag the report.

## Rationale
This approach protects the customer-facing portal and reduces the chance of publishing information that is unsafe, misleading, or physically sensitive.

## Outcome
This decision rule is applied consistently throughout the analysis and review process.
