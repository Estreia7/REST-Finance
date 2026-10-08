/**
 * Document Scanner Adapter
 *
 * Abstraction layer that allows swapping the scanning backend without
 * touching any other code. The provider is chosen by what is configured:
 *
 *   DOCUMENT_SCANNER_API_URL set  → ExternalApiScanner (a separate service)
 *   Anthropic key in settings     → ClaudeScanner, which is what runs today
 *   NODE_ENV === 'development'    → MockScanner (dev/testing)
 *   Otherwise                     → Error (scanner not configured)
 *
 * The Claude reader was built for the administrator's extraction bench and
 * stayed there: owners scanning an invoice still went looking for an external
 * service that was never connected, and got "scanner unavailable" with a
 * working reader sitting one import away. Its key lives in the settings
 * table, not the environment, because an administrator sets it from the
 * console — so availability is a question that has to be asked of the
 * database, and cannot be answered synchronously.
 */

// ─── Shared Types (the contract both this app and the external API follow) ───

export interface ScanItem {
  product: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
  /**
   * Which of the restaurant's cost categories the reader thinks this line
   * belongs to, by name. Only a suggestion: the restaurant's own memory of
   * past answers is consulted first.
   */
  category?: string;
  /**
   * What one billed unit holds, read from the description: "BATATA DOCE
   * 2,5K" is 2,5 kg. Lets a bag's price become a price per kilo.
   */
  packAmount?: number;
  packUnit?: 'kg' | 'L';
}

/** A cost category the reader may choose from. */
export interface ScanCategory {
  name: string;
  type: 'COGS' | 'OPEX';
}

export interface CostReceiptResult {
  type: 'cost_receipt';
  date: string; // YYYY-MM-DD
  vendor: string;
  vendorTaxId?: string;
  invoiceNumber?: string;
  items: ScanItem[];
  grandTotal: number;
  suggestedType: 'COGS' | 'OPEX';
  suggestedCategory: string;
}

export interface DailyReportResult {
  type: 'daily_report';
  date: string; // YYYY-MM-DD
  dineInRevenue: number;
  takeawayRevenue: number;
  dineInTickets: number;
  takeawayTickets: number;
}

export type ScanResult = CostReceiptResult | DailyReportResult;

export type MediaType = 'image/jpeg' | 'image/png' | 'image/webp';
export type ScanType = 'COST_RECEIPT' | 'DAILY_REPORT';

// ─── Provider Selection ─────────────────────────────────────────────────────

export async function scanDocument(
  imageBase64: string,
  mediaType: MediaType,
  scanType: ScanType,
  options: {
    /** The restaurant's cost categories, so each line can be placed in one. */
    categories?: ScanCategory[];
    /** Who asked, so the call is logged against them in the usage console. */
    usage?: { restaurantId: string; userId: string };
  } = {},
): Promise<ScanResult> {
  const apiUrl = process.env.DOCUMENT_SCANNER_API_URL;

  if (apiUrl) {
    const { externalApiScan } = await import('@/lib/scanners/external-api-scanner');
    return externalApiScan(imageBase64, mediaType, scanType, apiUrl);
  }

  // The reader that actually runs. Its key is set by an administrator in the
  // console, so it is read from the settings table rather than the env.
  const apiKey = await readScannerKey();
  if (apiKey) {
    const { claudeScan, ExtractionError, SCANNER_MODEL } = await import('@/lib/scanners/claude-scanner');
    const { recordAiUsage } = await import('@/lib/ai-usage-server');
    const who = {
      restaurantId: options.usage?.restaurantId ?? null,
      userId: options.usage?.userId ?? null,
      source: 'scan' as const,
      scanType,
      model: SCANNER_MODEL,
    };

    try {
      const { result, telemetry } = await claudeScan(imageBase64, mediaType, scanType, apiKey, options);
      await recordAiUsage({ ...who, telemetry, succeeded: true, stopReason: 'tool_use' });
      return result;
    } catch (err) {
      // Logged and then rethrown: a failed call was usually still billed,
      // and the caller still has to tell the owner it did not work.
      await recordAiUsage({
        ...who,
        telemetry: err instanceof ExtractionError ? err.telemetry : undefined,
        succeeded: false,
        stopReason: err instanceof ExtractionError ? err.stopReason : null,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  if (process.env.NODE_ENV === 'development') {
    const { mockScan } = await import('@/lib/scanners/mock-scanner');
    return mockScan(scanType);
  }

  throw new Error('Scanner de documentos não configurado.');
}

/**
 * The Anthropic key, or null.
 *
 * Never throws: a settings table that cannot be reached should make the
 * scanner unavailable, which the caller already handles, rather than turning
 * into a 500 on a screen the owner is holding a receipt up to.
 */
async function readScannerKey(): Promise<string | null> {
  try {
    const { getSetting, SETTING_KEYS } = await import('@/lib/settings');
    const key = await getSetting(SETTING_KEYS.anthropicApiKey);
    return key?.trim() ? key : null;
  } catch {
    return null;
  }
}

/**
 * Check whether scanning is available in the current environment.
 */
export async function isScannerAvailable(): Promise<boolean> {
  if (process.env.DOCUMENT_SCANNER_API_URL) return true;
  if (process.env.NODE_ENV === 'development') return true;
  // Asynchronous because the key an administrator set lives in the settings
  // table. The old synchronous version could only see the environment, so it
  // reported "unavailable" for a scanner that was configured and working.
  return (await readScannerKey()) !== null;
}
