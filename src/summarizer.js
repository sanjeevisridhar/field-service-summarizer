import process from 'node:process';
import 'dotenv/config';

/**
 * Extract key fields from report data for summary generation
 */
function extractReportContext(reportData) {
  const asset = reportData?.asset || 'Equipment';
  const visitDate = reportData?.arrived_at
    ? new Date(reportData.arrived_at).toISOString().slice(0, 10)
    : 'Unknown date';
  const resolution = reportData?.resolution || 'No resolution provided';
  const parts =
    Array.isArray(reportData?.parts_used) && reportData.parts_used.length > 0
      ? reportData.parts_used.join(', ')
      : 'No parts required';
  const notes = reportData?.technician_notes || 'No additional notes';
  const durationHours = reportData?.stated_duration_hours || 0;

  return { asset, visitDate, resolution, parts, notes, durationHours };
}

/**
 * Build system prompt for LLM
 */
function buildSystemPrompt() {
  return `You are a professional technical writer for facilities management. 
Your task is to generate clear, concise customer-facing summaries of field service reports.

Guidelines:
- Write in plain language suitable for non-technical facility managers
- Include what was found, what was done, and any recommendations
- Keep summaries to 2-4 sentences maximum
- NEVER include access codes, employee names, phone numbers, or financial details
- Focus on the asset, issue, and resolution`;
}

/**
 * Build user prompt with report data
 */
function buildUserPrompt(reportData) {
  const { asset, visitDate, resolution, parts, notes, durationHours } =
    extractReportContext(reportData);

  return `Please generate a customer-facing summary for the following field service report:

Asset: ${asset}
Visit Date: ${visitDate}
Duration: ${durationHours} hours
Issue/Work: ${resolution}
Parts Used: ${parts}
Technician Notes: ${notes}

Create a concise summary (2-4 sentences) that describes what was found and what was done. Focus on customer value, not technical jargon.`;
}

/**
 * Generate mock summary for testing without API
 */
function generateMockSummary(reportData) {
  const { asset, resolution, parts, durationHours } =
    extractReportContext(reportData);

  const actionVerb = resolution.toLowerCase().includes('replaced')
    ? 'replaced'
    : resolution.toLowerCase().includes('cleaned')
      ? 'cleaned'
      : resolution.toLowerCase().includes('adjusted')
        ? 'adjusted'
        : 'serviced';

  const partInfo =
    parts !== 'No parts required'
      ? ` A replacement ${parts.split(',')[0].trim()} was fitted.`
      : '';

  const recommendation = reportData?.technician_notes
    ?.toLowerCase()
    .includes('recommend')
    ? ' Further maintenance is recommended as per technician notes.'
    : ' Continue with regular maintenance schedule.';

  return `During the service visit to ${asset}, we ${actionVerb} the equipment and verified proper operation.${partInfo}${recommendation}`;
}

/**
 * Call LLM API to generate summary
 */
async function callLLMAPI(systemPrompt, userPrompt, reportId) {
  const endpoint = process.env.LLM_API_ENDPOINT;
  const apiKey = process.env.CUSTOM_API_KEY;
  const bearerToken = process.env.CUSTOM_BEARER_TOKEN;
  const modelName = process.env.LLM_MODEL_NAME || 'gpt-4o';

  if (!endpoint) {
    throw new Error('LLM_API_ENDPOINT is not configured');
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-portkey-provider': process.env.PORTKEY_PROVIDER,
        ...(apiKey && { 'x-api-key': apiKey }),
        ...(bearerToken && { Authorization: `Bearer ${bearerToken}` }),
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: 512,
        temperature: 0.7,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    const summary =
      data.choices?.[0]?.message?.content ||
      data.content ||
      data.message?.content ||
      '';

    if (!summary.trim()) {
      throw new Error('API returned empty content');
    }

    return summary.trim();
  } catch (error) {
    throw new Error(
      `LLM API call failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Main function to generate summary for a report
 */
export async function generateSummary(reportId, reportData) {
  if (!reportId || !reportData) {
    throw new Error('reportId and reportData are required');
  }

  // Build prompts
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(reportData);

  // Use mock mode if configured
  if (process.env.USE_MOCK_LLM === 'true') {
    return generateMockSummary(reportData);
  }

  // Use real LLM API
  try {
    return await callLLMAPI(systemPrompt, userPrompt, reportId);
  } catch (error) {
    throw new Error(
      `Failed to generate summary for ${reportId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export default { generateSummary };
