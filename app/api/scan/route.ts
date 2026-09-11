import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { scanDocument, isScannerAvailable } from '@/lib/document-scanner';
import { scanRequestSchema, formatZodError } from '@/lib/validations';
import { checkRateLimit } from '@/lib/rate-limit';

const SCAN_RATE_LIMIT = 20; // max scans per hour
const SCAN_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    // Check scanner availability
    if (!isScannerAvailable()) {
      return NextResponse.json(
        { error: 'Scanner de documentos indisponível. Contacte o suporte.' },
        { status: 503 }
      );
    }

    // Auth check
    const authResult = await requireAuth();
    if (isAuthError(authResult)) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    // Rate limiting
    if (!checkRateLimit(`scan:${authResult.userId}`, SCAN_RATE_LIMIT, SCAN_WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Limite de scans atingido. Tente novamente mais tarde.' },
        { status: 429 }
      );
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: authResult.userId, role: { in: ['OWNER', 'STAFF'] }, active: true },
    });
    if (!membership) {
      return NextResponse.json({ error: 'No restaurant access' }, { status: 403 });
    }

    // Validate request body
    const body = await request.json();
    const parsed = scanRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { imageBase64, mediaType, scanType } = parsed.data;

    // Extract data using the document scanner adapter
    const extractedData = await scanDocument(imageBase64, mediaType, scanType);

    // Save scan record + create vendor/items in a transaction for cost receipts
    const result = await prisma.$transaction(async (tx) => {
      let vendorId: string | null = null;
      let costEntryId: string | null = null;

      // For cost receipts: create vendor and invoice items
      if (extractedData.type === 'cost_receipt' && extractedData.items.length > 0) {
        // Find or create vendor
        const vendor = await tx.vendor.upsert({
          where: {
            restaurantId_name: {
              restaurantId: membership.restaurantId,
              name: extractedData.vendor.trim(),
            },
          },
          update: {
            isActive: true,
            ...(extractedData.vendorTaxId ? { taxId: extractedData.vendorTaxId } : {}),
          },
          create: {
            restaurantId: membership.restaurantId,
            name: extractedData.vendor.trim(),
            taxId: extractedData.vendorTaxId || null,
          },
        });
        vendorId = vendor.id;
      }

      // Save scan record
      const scan = await tx.receiptScan.create({
        data: {
          restaurantId: membership.restaurantId,
          userId: authResult.userId,
          imageUrl: '',
          scanType: scanType,
          extractedData: extractedData as any,
          status: 'PROCESSED',
        },
      });

      return { scan, vendorId, costEntryId };
    });

    return NextResponse.json({
      success: true,
      data: extractedData,
      scanId: result.scan.id,
      vendorId: result.vendorId,
      isMock: !process.env.DOCUMENT_SCANNER_API_URL,
    });
  } catch (error: any) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { error: 'Falha ao processar documento' },
      { status: 500 }
    );
  }
}
