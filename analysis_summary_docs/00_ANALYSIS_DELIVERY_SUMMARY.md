# Delivery Summary

## Overview
This repository delivers a Node.js field service report summarizer intended for a customer-facing facilities portal. The tool processes service reports, filters out sensitive content, detects contradictions and incomplete records, and produces summaries that are suitable for a facilities contact rather than an engineer.

## Scope
The implementation addresses the following core requirements:
- read JSONL field service reports
- generate a customer-safe summary per report
- handle privacy and physical-security exclusions
- detect contradictions and incomplete records
- avoid publishing instructions embedded in technician notes
- keep output plain-English and customer-readable

## Key decisions
- Notes are treated as a description of the visit, not as instruction to the summarizer.
- When report fields disagree, the tool does not silently resolve the conflict.
- When a report is too vague or incomplete, it is flagged and not summarized confidently.
- Sensitive data is withheld from publication, especially names, phone numbers, emails, access details, and spare-key information.

## Status
The implementation is positioned as a safe, fail-closed summarization workflow for customer-facing publication. The primary risk is not performance but publication safety: the output must be reviewed against what is actually published, not only against the internal logic.

## Evidence and review
The project includes documented process evidence for the required spec-driven sequence, and the generated output has been reviewed for privacy, contradiction handling, and prompt-injection resistance.
