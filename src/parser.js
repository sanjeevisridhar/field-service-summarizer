import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const REQUIRED_FIELDS = [
  'report_id',
  'asset',
  'technician_id',
  'arrived_at',
  'departed_at',
  'stated_duration_hours',
  'parts_used',
  'resolution',
  'technician_notes',
];

export function normalizeReport(rawRecord = {}, lineNumber = 0) {
  const record = { ...rawRecord };

  record.report_id =
    typeof record.report_id === 'string' ? record.report_id.trim() : '';
  record.asset = typeof record.asset === 'string' ? record.asset.trim() : '';
  record.technician_id =
    typeof record.technician_id === 'string' ? record.technician_id.trim() : '';
  record.arrived_at =
    typeof record.arrived_at === 'string' ? record.arrived_at.trim() : '';
  record.departed_at =
    typeof record.departed_at === 'string' ? record.departed_at.trim() : '';
  record.technician_notes =
    typeof record.technician_notes === 'string'
      ? record.technician_notes.trim()
      : '';

  if (!Array.isArray(record.parts_used)) {
    record.parts_used = [];
  } else {
    record.parts_used = record.parts_used
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof record.resolution !== 'string') {
    record.resolution = '';
  }
  record.resolution = record.resolution.trim();

  const numericDuration = Number(record.stated_duration_hours);
  record.stated_duration_hours = Number.isFinite(numericDuration)
    ? numericDuration
    : null;

  return {
    ...record,
    __meta: {
      lineNumber,
      rawSource: rawRecord,
    },
  };
}

export function validateSchema(report) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    const value = report[field];
    if (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (report.arrived_at && !Number.isNaN(Date.parse(report.arrived_at))) {
    // valid parse; not an error
  } else if (report.arrived_at) {
    errors.push('Invalid arrived_at timestamp');
  }

  if (report.departed_at && !Number.isNaN(Date.parse(report.departed_at))) {
    // valid parse; not an error
  } else if (report.departed_at) {
    errors.push('Invalid departed_at timestamp');
  }

  if (
    report.stated_duration_hours !== null &&
    (!Number.isFinite(report.stated_duration_hours) ||
      report.stated_duration_hours < 0)
  ) {
    errors.push('Invalid stated_duration_hours');
  }

  if (
    Array.isArray(report.parts_used) &&
    report.parts_used.some((item) => typeof item !== 'string')
  ) {
    errors.push('parts_used contains non-string entries');
  }

  if (
    typeof report.resolution === 'string' &&
    report.resolution.trim().length === 0
  ) {
    errors.push('resolution is empty');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function* streamReports(filePath) {
  const resolvedPath = path.resolve(filePath);

  const stream = fs.createReadStream(resolvedPath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      yield {
        type: 'parse_error',
        lineNumber,
        raw: line,
        error: error instanceof Error ? error.message : String(error),
      };
      continue;
    }

    const normalized = normalizeReport(parsed, lineNumber);
    yield {
      type: 'report',
      lineNumber,
      report: normalized,
    };
  }
}

export async function* parseReportsStream(filePath) {
  yield* streamReports(filePath);
}
