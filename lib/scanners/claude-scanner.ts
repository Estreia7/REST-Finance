import Anthropic from '@anthropic-ai/sdk';
import type { ScanResult, MediaType, ScanType, CostReceiptResult, DailyReportResult } from '@/lib/document-scanner';

/**
 * Reading a Portuguese invoice or a day's till roll with Claude.
 *
 * Extraction is done through a tool definition rather than by asking for JSON
 * in prose. The difference matters: a model asked for JSON returns prose with
 * JSON in it often enough to need a parser and a retry, while a tool call is
 * validated against the schema before it ever reaches us. `strict: true`
 * makes that a guarantee rather than a strong tendency.
 *
 * Haiku because this runs on every photographed invoice: at a few hundred
 * documents a month the difference between tiers is the difference between a
 * rounding error and a line item. Whether it is accurate enough is exactly
 * what the admin bench exists to answer — see `app/admin/components/
 * ExtractionLabPanel.tsx`.
 */

/** The model this runs on. Held here so the bench can report what answered. */
export const SCANNER_MODEL = 'claude-haiku-4-5';

/**
 * Bumped whenever the prompt or the schema below changes.
 *
 * Logged with every bench run, so a jump in accuracy can be attributed to a
 * prompt change rather than guessed at. Date-stamped rather than numbered:
 * the question asked later is always "what were we sending in September?".
 */
export const PROMPT_VERSION = '2026-09-20.1';

/** Rough per-token prices, for showing what a run cost. USD per 1M tokens. */
const PRICE_PER_MTOK = { input: 1.0, output: 5.0 } as const;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICE_PER_MTOK.input +
    (outputTokens / 1_000_000) * PRICE_PER_MTOK.output
  );
}

/**
 * What the model is told before it looks at the page.
 *
 * Written around the ways Portuguese documents actually differ from the
 * invoices a model has mostly seen: the decimal comma, the day-first date,
 * and the fact that a restaurant's "fecho de caixa" is a till summary rather
 * than an invoice. Each rule here exists because getting it wrong is silent —
 * "1.234,56" read as 1.23 is a plausible number, not an obvious failure.
 */
const SYSTEM_PROMPT = `You read Portuguese restaurant paperwork: supplier invoices (faturas, faturas-recibo) and end-of-day till reports (fecho de caixa, resumo de vendas).

Rules that matter for Portuguese documents:
- Decimal separator is a COMMA. "1.234,56" is one thousand two hundred thirty-four euros and fifty-six cents. Return it as the number 1234.56.
- Dates are DAY first: "03/09/2026" is 3 September 2026. Return every date as YYYY-MM-DD.
- "IVA" is VAT. Totals labelled "Total", "Total a pagar" or "Importância Liquida" are the amount owed INCLUDING VAT unless the document says otherwise.
- "NIF" or "Contribuinte" is the 9-digit tax number. Copy it exactly; do not reformat it.
- A "fatura-recibo" is both invoice and receipt. Treat it as an invoice.

Read only what is printed. If a field is not on the page, omit it rather than inferring it — a missing invoice number is useful information, an invented one is not. If the photograph is too unclear to read a figure, omit that figure instead of guessing at it.`;

/** The instruction attached to the image itself, per document type. */
const USER_PROMPT: Record<ScanType, string> = {
  COST_RECEIPT:
    'This is a supplier invoice. Record every line item with its quantity and price, and the grand total including VAT. Classify it as COGS if it is food, drink or anything that goes into what the restaurant sells; OPEX for everything else (cleaning, gas, rent, repairs, services).',
  DAILY_REPORT:
    "This is a restaurant's end-of-day till report. Record the date and the split between dine-in (sala/mesa/salão) and takeaway (take-away/levantamento/entrega), both revenue and the number of tickets. If the report does not separate the two, put everything under dine-in and leave takeaway at zero.",
};

/**
 * The shapes the model must answer in.
 *
 * These mirror `ScanResult` in lib/document-scanner.ts exactly. They are
 * written out rather than generated from it because the descriptions are
 * doing real work here — they are the only place the model is told what
 * "suggestedType" means — and a generated schema would carry the field names
 * without them.
 */
const COST_RECEIPT_SCHEMA = {
  type: 'object' as const,
  properties: {
    date: { type: 'string', description: 'Invoice date as YYYY-MM-DD.' },
    vendor: { type: 'string', description: 'Supplier name as printed at the top.' },
    vendorTaxId: { type: 'string', description: "Supplier's 9-digit NIF, digits only." },
    invoiceNumber: { type: 'string', description: 'Document number, e.g. "FR 0005/267376".' },
    items: {
      type: 'array',
      description: 'Every line on the invoice, in the order printed.',
      items: {
        type: 'object',
        properties: {
          product: { type: 'string', description: 'Description as printed.' },
          quantity: { type: 'number' },
          unit: { type: 'string', description: 'kg, L, un, cx — as printed.' },
          unitPrice: { type: 'number', description: 'Price for one unit.' },
          total: { type: 'number', description: 'Line total.' },
        },
        required: ['product', 'quantity', 'unitPrice', 'total'],
        additionalProperties: false,
      },
    },
    grandTotal: { type: 'number', description: 'Total payable including VAT.' },
    suggestedType: {
      type: 'string',
      enum: ['COGS', 'OPEX'],
      description: 'COGS if it becomes something the restaurant sells; OPEX otherwise.',
    },
    suggestedCategory: {
      type: 'string',
      description: 'A short Portuguese category, e.g. "Carne", "Bebidas", "Limpeza", "Energia".',
    },
  },
  required: ['date', 'vendor', 'items', 'grandTotal', 'suggestedType', 'suggestedCategory'],
  additionalProperties: false,
};

const DAILY_REPORT_SCHEMA = {
  type: 'object' as const,
  properties: {
    date: { type: 'string', description: 'The day covered, as YYYY-MM-DD.' },
    dineInRevenue: { type: 'number', description: 'Dine-in takings including VAT.' },
    takeawayRevenue: { type: 'number', description: 'Takeaway takings including VAT. Zero if not split out.' },
    dineInTickets: { type: 'integer', description: 'Number of dine-in tickets/covers.' },
    takeawayTickets: { type: 'integer', description: 'Number of takeaway tickets. Zero if not split out.' },
  },
  required: ['date', 'dineInRevenue', 'takeawayRevenue', 'dineInTickets', 'takeawayTickets'],
  additionalProperties: false,
};

/** What a run cost and how long it took, for the bench. */
export interface ScanTelemetry {
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface ClaudeScanOutcome {
  result: ScanResult;
  telemetry: ScanTelemetry;
}

/**
 * Reads one document.
 *
 * Takes the key as an argument rather than reading the environment, because
 * it is stored encrypted in the settings table and only the caller knows how
 * to get at it.
 */
export async function claudeScan(
  imageBase64: string,
  mediaType: MediaType,
  scanType: ScanType,
  apiKey: string,
): Promise<ClaudeScanOutcome> {
  const client = new Anthropic({ apiKey });

  const isReceipt = scanType === 'COST_RECEIPT';
  const toolName = isReceipt ? 'record_invoice' : 'record_daily_report';

  const started = Date.now();
  const response = await client.messages.create({
    model: SCANNER_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: toolName,
        description: isReceipt
          ? 'Records the contents of a supplier invoice.'
          : "Records a restaurant's end-of-day takings.",
        input_schema: isReceipt ? COST_RECEIPT_SCHEMA : DAILY_REPORT_SCHEMA,
        // Guarantees the arguments validate, so no defensive parsing below.
        strict: true,
      },
    ],
    // The model has exactly one useful move here, and saying so stops it
    // answering in prose about a blurred photograph instead of recording
    // what it could read.
    tool_choice: { type: 'tool', name: toolName },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: USER_PROMPT[scanType] },
        ],
      },
    ],
  });
  const durationMs = Date.now() - started;

  const call = response.content.find((b) => b.type === 'tool_use');
  if (!call || call.type !== 'tool_use') {
    // Forced tool use makes this close to impossible, but a refusal or a
    // max_tokens cut-off can still land here, and a silent empty result
    // would look like an extraction failure rather than a stopped one.
    throw new Error(`Model did not return an extraction (stop_reason: ${response.stop_reason}).`);
  }

  const input = call.input as Record<string, unknown>;

  const result: ScanResult = isReceipt
    ? ({ type: 'cost_receipt', ...input } as unknown as CostReceiptResult)
    : ({ type: 'daily_report', ...input } as unknown as DailyReportResult);

  return {
    result,
    telemetry: {
      model: SCANNER_MODEL,
      promptVersion: PROMPT_VERSION,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs,
    },
  };
}
