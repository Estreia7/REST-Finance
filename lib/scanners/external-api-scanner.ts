import type { ScanResult, MediaType, ScanType } from '@/lib/document-scanner';

/**
 * Calls the external Document Scanner API.
 * Activated when DOCUMENT_SCANNER_API_URL is set in environment.
 *
 * Expected API contract:
 *   POST {apiUrl}/scan
 *   Headers: Authorization: Bearer {DOCUMENT_SCANNER_API_KEY}
 *   Body: { imageBase64, mediaType, scanType }
 *   Response: ScanResult JSON
 */
export async function externalApiScan(
  imageBase64: string,
  mediaType: MediaType,
  scanType: ScanType,
  apiUrl: string
): Promise<ScanResult> {
  const apiKey = process.env.DOCUMENT_SCANNER_API_KEY;

  const response = await fetch(`${apiUrl}/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ imageBase64, mediaType, scanType }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Scanner API error (${response.status}): ${body || response.statusText}`);
  }

  const data: ScanResult = await response.json();
  return data;
}
