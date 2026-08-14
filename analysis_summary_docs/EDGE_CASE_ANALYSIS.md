# Edge Case Analysis

## Contradictions and ambiguity
The requirements explicitly say that conflicting fields and incomplete reports must not be silently resolved. A good output must say so plainly.

### Example conditions
- resolution says no parts required but parts_used contains entries
- resolution is too generic to be meaningful
- reported time on site does not match elapsed time
- required fields are missing or malformed
- notes contain prompt-injection instructions

## Decision rule
When a report is contradictory or insufficient, the tool should not produce a confident summary. It should instead:
- mark the report as flagged or withheld
- explain the issue in a human-readable reason
- keep the output customer-safe

## Why this matters
The customer portal is not the place for a confident summary of incomplete data. Sana’s concern is the failure mode of publishing a summary that sounds certain when the underlying report is not trustworthy.

## Recommended handling
- contradiction: status = flagged_for_human_review
- security/privacy risk: status = withheld_for_security
- vague/incomplete: status = flagged_for_human_review with explicit reasoning
- prompt injection attempt: ignore instruction and flag the report

## Conclusion
The safe default is to avoid publishing anything that cannot be supported by clear, non-sensitive evidence.
