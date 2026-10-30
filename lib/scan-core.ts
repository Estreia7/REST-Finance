import { prisma } from '@/lib/prisma';
import { scanDocument, type ScanResult, type MediaType, type ScanType } from '@/lib/document-scanner';
import { readInvoiceQr, applyQrTruth, type InvoiceQrData } from '@/lib/pt-invoice-qr';
import { checkVendorReading, looksLikeCustomer, type CustomerIdentity } from '@/lib/vendor-reading';
import { saveImage, saveDocument } from '@/lib/uploads';

/**
 * Reads one document for one restaurant and records the reading.
 *
 * The part of a scan that does not care who asked: the camera in the app and
 * an invoice emailed to the restaurant's address both end here. Callers
 * authorise and rate-limit first; this takes the restaurant and the person
 * the reading is filed under as given.
 */
export async function processScan(input: {
  restaurantId: string;
  userId: string;
  base64: string;
  mediaType: MediaType;
  scanType: ScanType;
  /** Where it came from: the app, or the restaurant's invoice email address. */
  source?: 'APP' | 'EMAIL';
}): Promise<{ data: ScanResult; scanId: string }> {
  const { restaurantId, userId, base64, mediaType, scanType } = input;

  // The restaurant's own cost categories, so the reader places each line
  // in one that exists rather than inventing a name nothing matches.
  const categories = scanType === 'COST_RECEIPT'
    ? await prisma.category.findMany({
        where: { restaurantId, isActive: true, type: { in: ['COGS', 'OPEX'] } },
        select: { name: true, type: true },
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
      })
    : [];

  // Who the invoice is addressed to: the restaurant and its owners. Told
  // to the reader, and checked against after, because an invoice made out
  // to the owner by name was read with the owner as the supplier.
  const customer = scanType === 'COST_RECEIPT' ? await customerOf(restaurantId) : null;

  const rawData = await scanDocument(base64, mediaType, scanType, {
    categories: categories.map((c) => ({ name: c.name, type: c.type as 'COGS' | 'OPEX' })),
    // So the administrator can see which restaurant this reading was for.
    usage: { restaurantId, userId },
    ...(customer ? { customer } : {}),
  });

  // A Portuguese certified invoice carries a QR code holding the date, the
  // document number, the issuer NIF and the totals — signed by the till, not
  // read off a photograph. Where there is one it overrides the model, which
  // on a blurred photo gets exactly these fields wrong. A PDF is the
  // supplier's own file, read as text, so there is no photograph to doubt.
  const corrected = mediaType === 'application/pdf'
    ? { data: rawData, qr: null, changed: [] as string[] }
    : await applyQrCorrections(base64, mediaType, rawData);
  const data = customer
    ? await checkSupplier(restaurantId, corrected.data, corrected.qr, corrected.changed, customer)
    : corrected.data;

  // The document itself, kept so the owner can look at what is behind a
  // figure. A failure here does not fail the scan: the reading is the
  // valuable part, and a document with no picture beats an error.
  let filePath = '';
  try {
    const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
    if (mediaType === 'application/pdf') {
      const saved = await saveDocument(restaurantId, new File([bytes], 'invoice.pdf', { type: mediaType }), 'invoices');
      if (saved.ok) filePath = saved.storedPath;
    } else {
      const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
      const saved = await saveImage('invoices', restaurantId, new File([bytes], `invoice.${ext}`, { type: mediaType }));
      if (saved.ok) filePath = saved.storedPath;
    }
  } catch {
    // Left empty; the reading stands on its own.
  }

  // The reading only. No supplier is created here: that waits until the
  // owner has seen the invoice and saved it.
  const scan = await prisma.receiptScan.create({
    data: {
      restaurantId,
      userId,
      imageUrl: filePath,
      scanType,
      extractedData: data as object,
      status: 'PROCESSED',
    },
    select: { id: true },
  });

  return { data, scanId: scan.id };
}

/**
 * Corrects a reading against the invoice's own QR code.
 *
 * Never throws and never blocks: a document with no QR, an unreadable one, or
 * a decoder that fails leaves the model's reading exactly as it was.
 */
async function applyQrCorrections(
  imageBase64: string,
  mediaType: string,
  data: ScanResult,
): Promise<{ data: ScanResult; qr: InvoiceQrData | null; changed: string[] }> {
  if (data.type !== 'cost_receipt') return { data, qr: null, changed: [] };

  try {
    const bytes = Buffer.from(imageBase64, 'base64');
    const blob = new Blob([new Uint8Array(bytes)], { type: mediaType });
    const qr = await readInvoiceQr(blob);
    if (!qr) return { data, qr: null, changed: [] };

    const { corrected, changed } = applyQrTruth(data as unknown as Record<string, unknown>, qr);
    return { data: corrected as unknown as ScanResult, qr, changed };
  } catch {
    return { data, qr: null, changed: [] };
  }
}

/** The restaurant's name and NIF, and the names of its owners. */
async function customerOf(restaurantId: string): Promise<CustomerIdentity> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      name: true,
      taxId: true,
      memberships: { where: { role: 'OWNER' }, select: { user: { select: { name: true } } } },
    },
  });
  return {
    names: [restaurant?.name ?? '', ...(restaurant?.memberships ?? []).map((m) => m.user.name ?? '')].filter(Boolean),
    taxIds: restaurant?.taxId ? [restaurant.taxId] : [],
  };
}

/**
 * Checks the supplier read off the invoice before the owner sees it.
 *
 * The customer's own NIF is never kept as the supplier's. A supplier already
 * on file under the NIF is named, so the review screen can show the name the
 * invoice will actually be filed under. Everything checked is kept with the
 * reading, so a wrong supplier can be explained afterwards.
 */
async function checkSupplier(
  restaurantId: string,
  data: ScanResult,
  qr: InvoiceQrData | null,
  qrChanged: string[],
  customer: CustomerIdentity,
): Promise<ScanResult> {
  if (data.type !== 'cost_receipt') return data;
  try {
    const verdict = checkVendorReading(data, customer, qr);
    const known = verdict.vendorTaxId
      ? await prisma.vendor.findFirst({
          where: { restaurantId, taxId: verdict.vendorTaxId },
          select: { id: true, name: true },
        })
      : null;
    return {
      ...data,
      vendorTaxId: verdict.vendorTaxId,
      checks: {
        qrRead: !!qr,
        qrChanged,
        qrBuyerNif: qr?.buyerNif ?? null,
        doubt: verdict.doubt,
        knownVendor: known?.name ?? null,
        knownVendorId: known?.id ?? null,
        knownVendorIsCustomer: known ? looksLikeCustomer(known.name, customer) : false,
      },
    };
  } catch {
    return data;
  }
}
