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
  scanType: ScanType
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
    const { claudeScan } = await import('@/lib/scanners/claude-scanner');
    const { result } = await claudeScan(imageBase64, mediaType, scanType, apiKey);
    return result;
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
