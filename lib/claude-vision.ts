import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface CostReceiptExtraction {
  type: 'cost_receipt';
  date: string;
  vendor: string;
  items: Array<{ product: string; quantity: number; unitPrice: number; total: number }>;
  grandTotal: number;
  suggestedType: 'COGS' | 'OPEX';
  suggestedCategory: string;
}

export interface DailyReportExtraction {
  type: 'daily_report';
  date: string;
  dineInRevenue: number;
  takeawayRevenue: number;
  dineInTickets: number;
  takeawayTickets: number;
}

export type ExtractionResult = CostReceiptExtraction | DailyReportExtraction;

export async function extractFromReceipt(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  scanType: 'COST_RECEIPT' | 'DAILY_REPORT'
): Promise<ExtractionResult> {
  const prompt = scanType === 'COST_RECEIPT'
    ? `Analyze this cost receipt/invoice image. Extract the following data in JSON format:
{
  "type": "cost_receipt",
  "date": "YYYY-MM-DD (extract from receipt, or today if not visible)",
  "vendor": "vendor/supplier name",
  "items": [{"product": "name", "quantity": 1, "unitPrice": 0.00, "total": 0.00}],
  "grandTotal": 0.00,
  "suggestedType": "COGS or OPEX (COGS for food/drink/ingredient purchases, OPEX for utilities/rent/services)",
  "suggestedCategory": "suggest one of: Comida, Bebidas, Sobremesas, Consumíveis Diretos, Renda, Internet + TV, Água, Luz, Gás, Manutenção, Material Cozinha, Marketing, Limpeza/Higiene, Outros"
}
Return ONLY valid JSON, no markdown or explanation. All monetary values in euros. If you can't read a value, use 0.`
    : `Analyze this end-of-day POS/cash register report. Extract the following data in JSON format:
{
  "type": "daily_report",
  "date": "YYYY-MM-DD (extract from report)",
  "dineInRevenue": 0.00,
  "takeawayRevenue": 0.00,
  "dineInTickets": 0,
  "takeawayTickets": 0
}
Return ONLY valid JSON, no markdown or explanation. All monetary values in euros.
- "dineInRevenue": revenue from in-restaurant dining (may be labeled as "mesa", "sala", "local", "eat-in")
- "takeawayRevenue": revenue from takeaway/delivery (may be labeled as "takeaway", "take-away", "delivery", "levar")
- If only a total is visible without breakdown, put the full amount in dineInRevenue and 0 in takeawayRevenue
- For ticket counts, look for "nº tickets", "transações", "covers", "clientes". If not visible, use 0.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI');
  }

  // Parse JSON from response, stripping any markdown fencing
  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(jsonStr) as ExtractionResult;
}
