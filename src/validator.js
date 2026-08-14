const ESSENTIAL_FIELD_KEYS = [
  'asset',
  'report_id',
  'arrived_at',
  'departed_at',
  'technician_notes',
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+instructions/i,
  /system\s+override/i,
  /print\s+secret/i,
  /ignore\s+all\s+previous\s+instructions/i,
  /override\s+summary/i,
  /do\s+not\s+mention/i,
  /hide\s+this/i,
  /bypass\s+validation/i,
  /ignore\s+the\s+rules/i,
  /publish\s+directly/i,
  /omit\s+(?:this|the|that)/i,
  /don't\s+mention/i,
  /important\s+instruction/i,
];

const ACCESS_LEAK_PATTERNS = [
  /(?:door|gate|alarm|keypad|entry|plant\s*room|access)\s*(?:code|pin|passcode|passkey|number)?\s*[:=]?\s*#?\d{3,}/gi,
  /(?:pin|code|passcode|passkey)\s*[:=]?\s*\d{3,}/gi,
  /keybox\s*[:=]?\s*\d{3,}/gi,
  /#\d{3,}/g,
  /\b(?:door|gate|alarm)\s+(?:code|pin)\s+(?:is\s+)?\d{3,}\b/gi,
  /spare\s+key\s+(?:at|held\s+at|location|stored)/i,
  /\bkey\s+location\b/i,
  /plant\s*room\s+(?:code|access|entry)/i,
];

const PERSONAL_DATA_PATTERNS = [
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g, // Names
  /\b\d{3,4}\s?\d{3,4}\s?\d{3,6}\b/g, // Phone numbers
  /\b\d{2,4}[/-]\d{2,4}[/-]\d{2,4}\b/g, // Phone with separators
  /07\d{3}\s?\d{3}\s?\d{3}/gi, // UK mobile
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
  /\b(?:mobile|phone|email)\s+[0-9+\-\s()\.@\w]+/gi, // Labeled personal data
];

const FINANCIAL_PATTERNS = [
  /\$\s?\d+(?:,\d{3})*(?:\.\d{2})?\s*\/\s*hr/i,
  /\$\s?\d+(?:,\d{3})*(?:\.\d{2})?/i,
  /£\s?\d+(?:,\d{3})*(?:\.\d{2})?/i,
  /\b(?:cost|rate|hourly|labour|labor|budget|invoice|quote)\b.*\b(?:\$|£)\d+/i,
  /\b(?:cost\s+us|cost\s+was|charged|bill\s+was)\s*(?:\$|£)\d+/i,
];

const GENERIC_NOTE_PATTERNS = [
  /^n\/?a$/i,
  /^done$/i,
  /^visited\s+site$/i,
  /^checked$/i,
  /^attended\s+site$/i,
  /^no\s+action$/i,
  /^nothing\s+to\s+report$/i,
  /^see\s+job\s+sheet$/i,
];

const STATUS_CONFLICT_PATTERNS = [
  {
    status: /completed|resolved|fixed|done/i,
    note: /could\s+not\s+gain\s+access|turned\s+away|asset\s+untouched|not\s+accessed|no\s+access|unable\s+to\s+gain\s+access/i,
  },
  {
    status: /completed|resolved|fixed|done/i,
    note: /door\s+locked|gate\s+locked|access\s+denied|refused\s+entry/i,
  },
  {
    status: /completed|resolved|fixed|done/i,
    note: /customer\s+not\s+present|site\s+closed|staff\s+not\s+available/i,
  },
];

const EMPLOYEE_BLAME_PATTERNS = [
  /\b(?:dave|jim|mike|paul|sarah|john|mark|tom|steve|dan|matt|alex|sam|chris|daniel|dylan|ryan)\s+(?:forgot|broke|missed|caused|damaged|left|ignored)\b/i,
  /\b(?:employee|technician|engineer|contractor|staff|site\s+manager)\s+(?:forgot|broke|damaged|left|ignored)\b/i,
  /\b(?:he|she|they)\s+(?:forgot|broke|damaged|ignored|left)\b/i,
];

function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function hasGenericNoteText(notes) {
  const normalized = String(notes || '').trim();
  if (!normalized) return true;
  if (normalized.length < 10) return true;
  return GENERIC_NOTE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function detectPromptInjection(text) {
  const normalized = String(text || '');
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function detectAccessLeaks(text) {
  const normalized = String(text || '');
  return ACCESS_LEAK_PATTERNS.some((pattern) => pattern.test(normalized));
}

function detectPersonalData(text) {
  const normalized = String(text || '');
  return PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(normalized));
}

function detectFinancialInfo(text) {
  const normalized = String(text || '');
  return FINANCIAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function detectMetadataConflict(report) {
  const notes = String(report?.technician_notes || '');
  const statusValue = String(
    report?.status || report?.resolution || report?.visit_status || '',
  ).toLowerCase();

  return STATUS_CONFLICT_PATTERNS.some(({ status, note }) => {
    const statusMatches = status.test(statusValue);
    const noteMatches = note.test(notes);
    return statusMatches && noteMatches;
  });
}

function detectDurationConflict(report) {
  if (
    !report?.arrived_at ||
    !report?.departed_at ||
    report?.stated_duration_hours === null
  ) {
    return null;
  }

  try {
    const arrived = new Date(report.arrived_at);
    const departed = new Date(report.departed_at);

    if (Number.isNaN(arrived.getTime()) || Number.isNaN(departed.getTime())) {
      return null;
    }

    const elapsedHours =
      (departed.getTime() - arrived.getTime()) / (1000 * 60 * 60);
    const statedHours = report.stated_duration_hours;
    const tolerance = 0.5;

    if (Math.abs(elapsedHours - statedHours) > tolerance) {
      return {
        elapsedHours: Math.round(elapsedHours * 100) / 100,
        statedHours,
        conflict: true,
      };
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

function detectPartsConflict(report) {
  const partsUsed = Array.isArray(report?.parts_used) ? report.parts_used : [];
  const resolution = String(report?.resolution || '').toLowerCase();

  if (
    partsUsed.length > 0 &&
    /inspection\s+only|no\s+parts\s+required|no\s+action|attended\s+site/i.test(
      resolution,
    )
  ) {
    return {
      partsListed: partsUsed,
      resolutionSaysNoParts: true,
      conflict: true,
    };
  }

  return null;
}

export function preValidateReport(report) {
  if (!report || typeof report !== 'object') {
    return {
      valid: false,
      refusalReason: 'Invalid report object',
      reasonCode: 'INVALID_STRUCTURE',
    };
  }

  // Check essential fields
  for (const field of ESSENTIAL_FIELD_KEYS) {
    if (!isPresent(report[field])) {
      return {
        valid: false,
        refusalReason: `Missing essential field: ${field}`,
        reasonCode: 'INSUFFICIENT_DATA',
      };
    }
  }

  const notes = String(report.technician_notes || '');

  // Check for generic/empty notes
  if (hasGenericNoteText(notes)) {
    return {
      valid: false,
      refusalReason: 'Insufficient content in technician notes',
      reasonCode: 'INSUFFICIENT_DATA',
    };
  }

  // Check for prompt injection
  if (detectPromptInjection(notes)) {
    return {
      valid: false,
      refusalReason:
        'Prompt injection or instruction override detected in technician notes',
      reasonCode: 'PROMPT_INJECTION',
    };
  }

  // Check for access leaks
  if (detectAccessLeaks(notes)) {
    return {
      valid: false,
      refusalReason:
        'Access codes or security-sensitive information detected in report',
      reasonCode: 'UNSAFE_ACCESS_INFO',
    };
  }

  // Check for personal data
  if (detectPersonalData(notes)) {
    return {
      valid: false,
      refusalReason:
        'Personal data (names, phone numbers, email) detected in technician notes',
      reasonCode: 'REDACTION_REQUIRED',
    };
  }

  // Check for financial information
  if (detectFinancialInfo(notes)) {
    return {
      valid: false,
      refusalReason: 'Financial information detected in technician notes',
      reasonCode: 'REDACTION_REQUIRED',
    };
  }

  // Check for metadata conflicts
  if (detectMetadataConflict(report)) {
    return {
      valid: false,
      refusalReason: 'Report metadata conflicts with technician note content',
      reasonCode: 'CONFLICTING_DATA',
    };
  }

  // Check for duration conflicts
  const durationConflict = detectDurationConflict(report);
  if (durationConflict?.conflict) {
    return {
      valid: false,
      refusalReason: `Duration mismatch: stated ${durationConflict.statedHours}h but elapsed time is ${durationConflict.elapsedHours}h`,
      reasonCode: 'CONFLICTING_DATA',
    };
  }

  // Check for parts conflict
  const partsConflict = detectPartsConflict(report);
  if (partsConflict?.conflict) {
    return {
      valid: false,
      refusalReason: `Parts listed (${partsConflict.partsListed.join(', ')}) but resolution states no parts required`,
      reasonCode: 'CONFLICTING_DATA',
    };
  }

  return {
    valid: true,
    refusalReason: null,
    reasonCode: null,
  };
}

function redactSensitiveText(text) {
  let redacted = String(text || '');

  redacted = redacted.replace(ACCESS_LEAK_PATTERNS, '[ACCESS CODE REDACTED]');
  redacted = redacted.replace(
    /\b(?:door|gate|alarm|keypad|entry|passcode|passkey|keybox)\b[^\n.]*[:=]?\s*\d{3,}/gi,
    '[ACCESS CODE REDACTED]',
  );
  redacted = redacted.replace(
    /\b(?:PIN|pin)\s*[:=]?\s*\d{3,}\b/gi,
    '[PIN REDACTED]',
  );
  redacted = redacted.replace(
    /\b(?:#|code\s*[:=]?\s*)\d{3,}\b/g,
    '[ACCESS CODE REDACTED]',
  );
  redacted = redacted.replace(
    /spare\s+key\s+(?:at|held\s+at|location|stored)[^\.]*(?:\.|$)/gi,
    '[KEY LOCATION REDACTED]',
  );

  return redacted;
}

export function postValidateSummary(summaryText) {
  const input = String(summaryText || '');

  if (!input.trim()) {
    return {
      safe: false,
      redactedText: '',
      leakDetected: true,
      leakType: 'EMPTY_SUMMARY',
    };
  }

  const accessMatch = ACCESS_LEAK_PATTERNS.some((pattern) =>
    pattern.test(input),
  );
  if (accessMatch) {
    return {
      safe: false,
      redactedText: redactSensitiveText(input),
      leakDetected: true,
      leakType: 'UNSAFE_ACCESS_INFO',
    };
  }

  const personalMatch = PERSONAL_DATA_PATTERNS.some((pattern) =>
    pattern.test(input),
  );
  if (personalMatch) {
    return {
      safe: false,
      redactedText: input,
      leakDetected: true,
      leakType: 'REDACTION_REQUIRED',
    };
  }

  const blameMatch = EMPLOYEE_BLAME_PATTERNS.some((pattern) =>
    pattern.test(input),
  );
  if (blameMatch) {
    return {
      safe: false,
      redactedText: redactSensitiveText(input),
      leakDetected: true,
      leakType: 'EMPLOYEE_BLAME',
    };
  }

  const financialMatch = FINANCIAL_PATTERNS.some((pattern) =>
    pattern.test(input),
  );
  if (financialMatch) {
    return {
      safe: false,
      redactedText: redactSensitiveText(input),
      leakDetected: true,
      leakType: 'FINANCIAL_INFO',
    };
  }

  return {
    safe: true,
    redactedText: input,
    leakDetected: false,
    leakType: null,
  };
}

export function resolveSilentSpecCase(report) {
  const notes = String(report?.technician_notes || '');
  const hasFollowUpDate =
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(notes) ||
    /\bfollow\s*[- ]?up\b/i.test(notes);
  const actionCompleted =
    /completed|resolved|fixed|repaired|returned\s+to\s+service/i.test(
      String(report?.resolution || ''),
    );
  const accessBlocked =
    /could\s+not\s+gain\s+access|turned\s+away|denied|locked|site\s+closed|not\s+present/i.test(
      notes,
    );

  if (accessBlocked) {
    return {
      decision: 'REFUSE_PUBLICATION',
      reason:
        'Access was not obtained or the visit did not proceed; the report cannot be published as complete.',
      flag: 'INCOMPLETE_VISIT',
    };
  }

  if (!hasFollowUpDate && !actionCompleted) {
    return {
      decision: 'REFUSE_PUBLICATION',
      reason:
        'Work was only partially completed and no follow-up plan is available; silent assumption is not permitted.',
      flag: 'PARTIAL_WORK_NO_FOLLOWUP',
    };
  }

  return {
    decision: 'PUBLISH_WITH_CAUTION',
    reason:
      'Work status is partially complete, but a follow-up plan or completion evidence exists; publish only with explicit clarity.',
    flag: 'PARTIAL_WORK_WITH_FOLLOWUP',
  };
}

export default {
  preValidateReport,
  postValidateSummary,
  resolveSilentSpecCase,
};
