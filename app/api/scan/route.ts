import { NextRequest, NextResponse } from 'next/server';
import { requireMember, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { scanDocument, isScannerAvailable, type ScanResult } from '@/lib/document-scanner';
import { readInvoiceQr, applyQrTruth } from '@/lib/pt-invoice-qr';
import { saveImage } from '@/lib/uploads';
import { scanRequestSchema, formatZodError } from '@/lib/validations';
import { checkRateLimit } from '@/lib/rate-limit';
import { ExtractionError } from '@/lib/scanners/claude-scanner';

const SCAN_RATE_LIMIT = 20; // max scans per hour
const SCAN_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    // Check scanner availability
    if (!(await isScannerAvailable())) {
      return NextResponse.json(
        // Keys, not sentences: the component translates them.
        { error: 'scanner.unavailable' },
        { status: 503 }
      );
    }

    // The restaurant the owner is looking at, resolved the same way as
    // everywhere else. Looking up "a" membership of this user filed an
    // owner's invoice under whichever of their restaurants came back first.
    const membership = await requireMember();
    if (isAuthError(membership)) {
      return NextResponse.json(
        { error: membership.error },
        { status: membership.requiresAuth ? 401 : 403 },
      );
    }
    const authResult = membership;

    // Rate limiting
    if (!checkRateLimit(`scan:${authResult.userId}`, SCAN_RATE_LIMIT, SCAN_WINDOW_MS)) {
      return NextResponse.json(
        { error: 'scanner.rateLimited' },
        { status: 429 }
      );
    }

    // Validate request body
    const body = await request.json();
    const parsed = scanRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { imageBase64, mediaType, scanType } = parsed.data;

    // The restaurant's own cost categories, so the reader places each line
    // in one that exists rather than inventing a name nothing matches.
    const categories = scanType === 'COST_RECEIPT'
      ? await prisma.category.findMany({
          where: {
            restaurantId: membership.restaurantId,
            isActive: true,
            type: { in: ['COGS', 'OPEX'] },
          },
          select: { name: true, type: true },
          orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
        })
      : [];

    // Extract data using the document scanner adapter
    const rawData = await scanDocument(imageBase64, mediaType, scanType, {
      categories: categories.map((c) => ({ name: c.name, type: c.type as 'COGS' | 'OPEX' })),
      // So the administrator can see which restaurant this reading was for.
      usage: { restaurantId: membership.restaurantId, userId: authResult.userId },
    });

    // A Portuguese certified invoice carries a QR code holding the date,
    // the document number, the issuer NIF and the totals — signed by the
    // till, not read off a photograph. Where there is one it is not
    // another opinion about the page: it is what was actually issued, and
    // it overrides the model, which on a blurred photo gets exactly these
    // fields wrong while reading the line items correctly.
    //
    // This has been running on the administrator bench since it was
    // written; the owner scanning an invoice never had it.
    const extractedData = await applyQrCorrections(imageBase64, mediaType, rawData);

    // The photograph itself, kept so the owner can look at the document
    // behind a figure rather than taking it on trust. It was being thrown
    // away: the scan row stored an empty path, so nothing could ever be
    // shown back.
    //
    // A failure here does not fail the scan. The reading is the valuable
    // part and the owner is waiting; a document with no picture is worth
    // more than an error on a screen holding a receipt up to a camera.
    let imagePath = '';
    try {
      const bytes = Buffer.from(imageBase64, 'base64');
      const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
      const file = new File([new Uint8Array(bytes)], `invoice.${ext}`, { type: mediaType });
      const saved = await saveImage('invoices', membership.restaurantId, file);
      if (saved.ok) imagePath = saved.storedPath;
    } catch {
      // Left empty; the reading stands on its own.
    }

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
          imageUrl: imagePath,
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
  } catch (error: unknown) {
    // Declined by the model's safety checks, or an answer cut short: the
    // page itself is the problem, and the owner can do something about it.
    if (error instanceof ExtractionError) {
      return NextResponse.json({ error: 'scanner.refused' }, { status: 422 });
    }
    console.error('Scan error:', error);
    return NextResponse.json({ error: 'scanner.scanFailed' }, { status: 500 });
  }
}

/**
 * Corrects a reading against the invoice's own QR code.
 *
 * Never throws and never blocks: a document with no QR, an unreadable one, or
 * a decoder that fails leaves the model's reading exactly as it was. The
 * photograph has already been taken and the owner is waiting — a failure here
 * must cost them nothing.
 */
async function applyQrCorrections(
  imageBase64: string,
  mediaType: string,
  data: ScanResult,
): Promise<ScanResult> {
  if (data.type !== 'cost_receipt') return data;

  try {
    const bytes = Buffer.from(imageBase64, 'base64');
    const blob = new Blob([new Uint8Array(bytes)], { type: mediaType });
    const qr = await readInvoiceQr(blob);
    if (!qr) return data;

    const { corrected } = applyQrTruth(data as unknown as Record<string, unknown>, qr);
    return corrected as unknown as ScanResult;
  } catch {
    return data;
  }
}
