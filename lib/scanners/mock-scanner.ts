import type { ScanResult, ScanType } from '@/lib/document-scanner';

const MOCK_COST_RECEIPTS: ScanResult[] = [
  {
    type: 'cost_receipt',
    date: new Date().toISOString().split('T')[0],
    vendor: 'Makro Portugal',
    vendorTaxId: '500123456',
    invoiceNumber: 'FT 2026/1234',
    items: [
      { product: 'Azeite Extra Virgem 5L', quantity: 2, unit: 'un', unitPrice: 18.50, total: 37.00 },
      { product: 'Farinha T65 25kg', quantity: 1, unit: 'un', unitPrice: 12.80, total: 12.80 },
      { product: 'Tomate Pelado 2.5kg', quantity: 4, unit: 'un', unitPrice: 3.20, total: 12.80 },
      { product: 'Mozzarella Fresca 1kg', quantity: 3, unit: 'kg', unitPrice: 8.90, total: 26.70 },
    ],
    grandTotal: 89.30,
    suggestedType: 'COGS',
    suggestedCategory: 'Comida',
  },
  {
    type: 'cost_receipt',
    date: new Date().toISOString().split('T')[0],
    vendor: 'Recheio',
    vendorTaxId: '500654321',
    invoiceNumber: 'FT 2026/5678',
    items: [
      { product: 'Cerveja Super Bock 33cl', quantity: 48, unit: 'un', unitPrice: 0.65, total: 31.20 },
      { product: 'Coca-Cola 33cl', quantity: 24, unit: 'un', unitPrice: 0.55, total: 13.20 },
      { product: 'Água Luso 50cl', quantity: 48, unit: 'un', unitPrice: 0.18, total: 8.64 },
      { product: 'Vinho Tinto Casa 5L', quantity: 2, unit: 'un', unitPrice: 7.50, total: 15.00 },
    ],
    grandTotal: 68.04,
    suggestedType: 'COGS',
    suggestedCategory: 'Bebidas',
  },
];

const MOCK_DAILY_REPORT: ScanResult = {
  type: 'daily_report',
  date: new Date().toISOString().split('T')[0],
  dineInRevenue: 1245.80,
  takeawayRevenue: 387.50,
  dineInTickets: 62,
  takeawayTickets: 23,
};

/**
 * Returns realistic sample data for dev/testing.
 * Simulates a small extraction delay.
 */
export async function mockScan(scanType: ScanType): Promise<ScanResult> {
  // Simulate processing delay (300-800ms)
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));

  if (scanType === 'DAILY_REPORT') {
    return { ...MOCK_DAILY_REPORT };
  }

  // Rotate between mock receipts
  const idx = Math.floor(Math.random() * MOCK_COST_RECEIPTS.length);
  return { ...MOCK_COST_RECEIPTS[idx] };
}
