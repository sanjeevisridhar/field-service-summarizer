import fs from 'node:fs/promises';
import path from 'node:path';

import { parseReportsStream } from './parser.js';
import { preValidateReport, postValidateSummary } from './validator.js';
import { generateSummary } from './summarizer.js';

const INPUT_PATH = 'data/service_reports.jsonl';
const OUTPUT_PATH = 'output/results.json';

function safeReportId(report) {
  return report?.report_id || 'UNKNOWN';
}

function safeAssetId(report) {
  return report?.asset || 'UNKNOWN_ASSET';
}

function safeVisitDate(report) {
  if (!report?.arrived_at) return 'UNKNOWN_DATE';
  const date = new Date(report.arrived_at);
  if (Number.isNaN(date.getTime())) return 'UNKNOWN_DATE';
  return date.toISOString().slice(0, 10);
}

function getVisitDuration(report) {
  if (!report?.arrived_at || !report?.departed_at) return null;
  try {
    const arrived = new Date(report.arrived_at);
    const departed = new Date(report.departed_at);
    if (Number.isNaN(arrived.getTime()) || Number.isNaN(departed.getTime()))
      return null;
    return (
      Math.round(
        ((departed.getTime() - arrived.getTime()) / (1000 * 60 * 60)) * 100,
      ) / 100
    );
  } catch {
    return null;
  }
}

function buildPublishedSummary(report, summaryText) {
  const reportId = safeReportId(report);
  const asset = safeAssetId(report);
  const visitDate = safeVisitDate(report);
  const timeOnSite =
    getVisitDuration(report) || report?.stated_duration_hours || 0;

  // Extract what was found and what was done from resolution
  const resolution = String(report?.resolution || '');
  const partsUsed = Array.isArray(report?.parts_used)
    ? report.parts_used.filter(Boolean)
    : [];

  return {
    report_id: reportId,
    status: 'published',
    asset,
    visit_date: visitDate,
    visit_time_on_site_hours: timeOnSite,
    what_was_found: extractIssue(
      resolution,
      String(report?.technician_notes || ''),
    ),
    what_was_done: extractAction(resolution),
    parts_fitted: partsUsed,
    outstanding_or_recommended: extractRecommendations(
      String(report?.technician_notes || ''),
    ),
    summary_text: summaryText,
    redaction_applied: false,
  };
}

function extractIssue(resolution, notes) {
  // Try to extract the issue from the resolution
  const issueMatch = resolution.match(
    /(?:issue|problem|fault|failure|defect|error)[:\s]+([^,.]+)/i,
  );
  if (issueMatch) return issueMatch[1].trim();

  // Look for common issue indicators
  if (/short.?cycl/i.test(resolution)) return 'Unit was short-cycling';
  if (/clogged|block|restrict/i.test(resolution))
    return 'System blockage detected';
  if (/leak/i.test(resolution)) return 'Leak detected';
  if (/fail|fault/i.test(resolution)) return 'Component failure detected';

  // Default to first part of resolution
  const parts = resolution.split(',');
  return parts[0] || 'Service inspection';
}

function extractAction(resolution) {
  // Try to extract the action from the resolution
  const actionMatch = resolution.match(
    /(?:replaced|repaired|adjusted|cleaned|verified|checked|reset)[^,.]*(?:[,.][^,.]*)?/i,
  );
  if (actionMatch) return actionMatch[0].trim();
  return resolution || 'Service work completed';
}

function extractRecommendations(notes) {
  const recommendMatch = notes.match(
    /(?:recommend|suggest|follow.?up|review)[^.]*\./i,
  );
  return recommendMatch ? recommendMatch[0].trim() : '';
}

function buildRejectedReport(reportId, reasonCode, reasonText) {
  return {
    report_id: reportId,
    status: 'rejected',
    refusal_reason_code: reasonCode,
    refusal_reason_text: reasonText,
    insufficient_data: reasonCode === 'INSUFFICIENT_DATA',
    conflicting_data: reasonCode === 'CONFLICTING_DATA',
    prompt_injection_detected: reasonCode === 'PROMPT_INJECTION',
    publication_blocked: true,
    summary_text: null,
  };
}

async function main() {
  const published = [];
  const rejected = [];
  let totalProcessed = 0;

  const inputPath = path.resolve(INPUT_PATH);
  const outputDir = path.dirname(path.resolve(OUTPUT_PATH));

  await fs.mkdir(outputDir, { recursive: true });

  console.log('Starting Field Service Report Summarizer...\n');

  try {
    for await (const item of parseReportsStream(inputPath)) {
      if (!item || item.type === 'parse_error') {
        const reportId = item?.lineNumber
          ? `LINE-${item.lineNumber}`
          : 'PARSE_ERROR';
        rejected.push(
          buildRejectedReport(
            reportId,
            'UNKNOWN',
            `Parse error: ${item?.error || 'Invalid JSON record'}`,
          ),
        );
        totalProcessed += 1;
        console.log(`[${reportId}] ❌ REJECTED (Parse Error)`);
        continue;
      }

      const report = item.report;
      const reportId = safeReportId(report);
      totalProcessed += 1;

      process.stdout.write(`[${reportId}] Processing... `);

      // Pre-validation gate
      const preCheck = preValidateReport(report);
      if (!preCheck.valid) {
        rejected.push(
          buildRejectedReport(
            reportId,
            preCheck.reasonCode,
            preCheck.refusalReason,
          ),
        );
        console.log(`❌ REJECTED (${preCheck.reasonCode})`);
        continue;
      }

      // LLM summarization
      let summaryText;
      try {
        summaryText = await generateSummary(reportId, report);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'LLM generation failed';
        rejected.push(
          buildRejectedReport(
            reportId,
            'UNKNOWN',
            `Summarization failed: ${errorMsg}`,
          ),
        );
        console.log(`❌ REJECTED (LLM Error)`);
        continue;
      }

      // Post-validation gate
      const postCheck = postValidateSummary(summaryText);
      if (!postCheck.safe || postCheck.leakDetected) {
        rejected.push(
          buildRejectedReport(
            reportId,
            postCheck.leakType || 'UNKNOWN',
            `Summary validation failed: ${postCheck.leakType}`,
          ),
        );
        console.log(`❌ REJECTED (${postCheck.leakType})`);
        continue;
      }

      // Build and push published summary
      const publishedSummary = buildPublishedSummary(report, summaryText);
      published.push(publishedSummary);
      console.log('✅ PUBLISHED');
    }

    // Build output payload matching spec schema
    const outputPayload = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalProcessed,
        publishedCount: published.length,
        rejectedCount: rejected.length,
        rejectionReasons: calculateRejectionReasons(rejected),
      },
      published,
      rejected,
    };

    await fs.writeFile(
      path.resolve(OUTPUT_PATH),
      JSON.stringify(outputPayload, null, 2),
      'utf8',
    );

    console.log('\n=== Summary ===');
    console.log(`Total reports: ${outputPayload.metadata.totalProcessed}`);
    console.log(`Published: ${outputPayload.metadata.publishedCount}`);
    console.log(`Rejected: ${outputPayload.metadata.rejectedCount}`);
    console.log(`Output: ${path.resolve(OUTPUT_PATH)}`);
  } catch (error) {
    console.error(
      '\nFatal error:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}

function calculateRejectionReasons(rejected) {
  const reasons = {};
  for (const item of rejected) {
    const code = item.refusal_reason_code || 'UNKNOWN';
    reasons[code] = (reasons[code] || 0) + 1;
  }
  return reasons;
}

main();
