/**
 * Document Scanner Adapter
 *
 * Abstraction layer that allows swapping the scanning backend without
 * touching any other code. Provider is selected by environment config:
 *
 *   DOCUMENT_SCANNER_API_URL set  → ExternalApiScanner (production)
 *   NODE_ENV === 'development'    → MockScanner (dev/testing)
 *   Otherwise                     → Error (scanner not configured)
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

  if (process.env.NODE_ENV === 'development') {
    const { mockScan } = await import('@/lib/scanners/mock-scanner');
    return mockScan(scanType);
  }

  throw new Error('Scanner de documentos não configurado. Configure DOCUMENT_SCANNER_API_URL.');
}

/**
 * Check whether scanning is available in the current environment.
 */
export function isScannerAvailable(): boolean {
  return !!process.env.DOCUMENT_SCANNER_API_URL || process.env.NODE_ENV === 'development';
}
