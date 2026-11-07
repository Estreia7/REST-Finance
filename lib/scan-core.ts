import { prisma } from '@/lib/prisma';
import { scanDocument, type ScanPage, type ScanResult, type MediaType, type ScanType } from '@/lib/document-scanner';
import { readInvoiceQr, applyQrTruth, parseInvoiceQr, type InvoiceQrData } from '@/lib/pt-invoice-qr';
import { checkVendorReading, looksLikeCustomer, type CustomerIdentity } from '@/lib/vendor-reading';
import { saveImage, saveDocument, resolveStoredPath } from '@/lib/uploads';
import { isWholeInvoice, issuesOfWholeInvoice } from '@/lib/whole-invoice';
import { betterProof, checkReading, documentIssues, foldNotes, isDiscountNote, rereadHint, settleFigures, type CheckedReading, type Proof } from '@/lib/invoice-checks';
import { isCreditNoteNumber } from '@/lib/credit-notes';
import { cleanTaxId, readerNote, rulesFor } from '@/lib/supplier-knowledge';
import { invoiceUnit, unusualPrice } from '@/lib/line-setup';
import { withoutBatch } from '@/lib/invoice-categories';
import { normalizeProductName } from '@/lib/price-tracking';
import { ourNifs } from '@/lib/restaurant-nif';
import { readFile } from 'node:fs/promises';

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
  /** For an emailed invoice: who sent it, and the attachment's name. */
  fromEmail?: string | null;
  fileName?: string | null;
  /** The pages after the first. */
  extraPages?: ScanPage[];
  /** What the QR said on the original photographs, read in the browser. */
  qrTexts?: string[];
  /** Photographed to deal with later. */
  queued?: boolean;
}): Promise<{ data: ScanResult; scanId: string }> {
  const { restaurantId, userId, base64, mediaType, scanType, extraPages = [], qrTexts = [] } = input;
  const { data, proof } = await readDocument({ restaurantId, userId, base64, mediaType, scanType, extraPages, qrTexts });

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

  const pageUrls: string[] = [];
  for (const page of extraPages) {
    try {
      const ext = page.mediaType === 'image/png' ? 'png' : page.mediaType === 'image/webp' ? 'webp' : 'jpg';
      const bytes = new Uint8Array(Buffer.from(page.base64, 'base64'));
      const saved = await saveImage('invoices', restaurantId, new File([bytes], `invoice.${ext}`, { type: page.mediaType }));
      if (saved.ok) pageUrls.push(saved.storedPath);
    } catch {
      // As above: the reading stands without this page's picture.
    }
  }

  // The reading only. No supplier is created here: that waits until the
  // owner has seen the invoice and saved it.
  const scan = await prisma.receiptScan.create({
    data: {
      restaurantId,
      userId,
      imageUrl: filePath,
      pageUrls,
      queued: input.queued ?? false,
      scanType,
      extractedData: data as object,
      status: 'PROCESSED',
      source: input.source ?? 'APP',
      fromEmail: input.fromEmail?.slice(0, 320) ?? null,
      fileName: input.fileName?.slice(0, 255) ?? null,
      proofStatus: proof?.status ?? null,
    },
    select: { id: true },
  });

  return { data, scanId: scan.id };
}

/**
 * Reads a document, proves it, and reads it again if it does not add up.
 *
 * The cheap reader goes first because most pages are fine. A page that fails
 * goes to a stronger one, told what went wrong and what the document's own
 * record says, and the better of the two stands. Saves nothing.
 */
async function readDocument(input: {
  restaurantId: string;
  userId: string;
  base64: string;
  mediaType: MediaType;
  scanType: ScanType;
  extraPages?: ScanPage[];
  qrTexts?: string[];
}): Promise<{ data: ScanResult; proof: Proof | null }> {
  const { restaurantId, userId, base64, mediaType, scanType, extraPages = [], qrTexts = [] } = input;

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

  const options = {
    categories: categories.map((c) => ({ name: c.name, type: c.type as 'COGS' | 'OPEX' })),
    // So the administrator can see which restaurant this reading was for.
    usage: { restaurantId, userId },
    extraPages,
    ...(customer ? { customer } : {}),
  };

  // A Portuguese certified invoice carries a QR code holding the date, the
  // document number, the issuer NIF, the totals and the base of each VAT rate
  // — written by the till, not read off a photograph. Where there is one it
  // overrides the model. A PDF is the supplier's own file, read as text and
  // proved against its printed VAT table instead: there is no decoder for it.
  const qr = scanType === 'COST_RECEIPT' && mediaType !== 'application/pdf'
    ? await findQr([{ base64, mediaType }, ...extraPages], qrTexts)
    : null;

  // What is known about how this supplier prints, when the QR says who it is
  // before a word is read.
  const known = await supplierNote(qr?.issuerNif, qr?.documentType);

  const firstRead = await scanDocument(base64, mediaType, scanType, { ...options, hint: known });
  let printedTotal = firstRead.type === 'cost_receipt' ? firstRead.grandTotal : null;
  let reading = withQrTruth(asPaid(firstRead), qr);
  let proof = proofOf(reading.data, qr);

  ({ reading, proof } = tidied(reading, proof, qr));

  if (proof?.status === 'failed') {
    try {
      // Without a QR, the first reading is what says who the supplier is.
      const vendorTaxId = reading.data.type === 'cost_receipt' ? reading.data.vendorTaxId : null;
      const note = known || await supplierNote(vendorTaxId, null);
      const { SCANNER_RETRY_MODEL } = await import('@/lib/scanners/claude-scanner');
      const secondRead = await scanDocument(base64, mediaType, scanType, {
        ...options,
        model: SCANNER_RETRY_MODEL,
        hint: note + rereadHint(proof, reading.data as unknown as CheckedReading),
      });
      const again = withQrTruth(asPaid(secondRead), qr);
      const second = proofOf(again.data, qr);
      if (second && betterProof(proof, second) === 'second') {
        reading = again;
        proof = second;
        if (secondRead.type === 'cost_receipt') printedTotal = secondRead.grandTotal;
      }
      ({ reading, proof } = tidied(reading, proof, qr));
    } catch {
      // The first reading stands, and goes to the owner to confirm.
    }
  }

  const checked = customer
    ? await checkSupplier(restaurantId, reading.data, qr, reading.changed, customer)
    : reading.data;
  if (checked.type !== 'cost_receipt') return { data: checked, proof: null };

  const number = checked.invoiceNumber?.trim() ?? '';
  const creditNote = !!qr?.isCreditNote || isCreditNoteNumber(number);
  // Money coming back has its own screen and its own rules.
  const found = creditNote ? [] : documentIssues({
    reading: checked,
    proof,
    qrRead: !!qr,
    qrTotal: qr?.grandTotal ?? null,
    printedTotal,
    pages: 1 + extraPages.length,
    isPdf: mediaType === 'application/pdf',
  });
  // A repair is only its total: its lines need not reach anything, as long as
  // the QR or the VAT table says what that total is.
  const categoryType = new Map(categories.map((c) => [c.name, c.type]));
  const wholeInvoice = !creditNote && isWholeInvoice({
    type: checked.suggestedType,
    lines: checked.items.map((item) => ({ type: item.category ? categoryType.get(item.category) : null })),
  });
  const totalVouched = wholeInvoice && (!!qr || !!checked.vatSummary?.length);
  const issues = totalVouched ? issuesOfWholeInvoice(found, true) : found;
  const standing = totalVouched && proof?.status === 'failed' ? null : proof;

  return {
    proof: standing,
    data: {
      ...checked,
      checks: {
        qrRead: !!qr,
        qrChanged: reading.changed,
        qrBuyerNif: qr?.buyerNif ?? null,
        doubt: null,
        knownVendor: null,
        knownVendorId: null,
        knownVendorIsCustomer: false,
        ...checked.checks,
        ...(standing ? { proof: standing } : {}),
        creditNote,
        wholeInvoice,
        printedTotal,
        issues,
        oddPrices: wholeInvoice ? 0 : await oddPrices(restaurantId, checked.items),
      },
    },
  };
}

/** How many lines are priced far from what the product usually costs. */
async function oddPrices(
  restaurantId: string,
  items: Array<{ product: string; unit?: string; unitPrice: number }>,
): Promise<number> {
  try {
    const names = items.map((item) => normalizeProductName(item.product));
    const past = await prisma.invoiceItem.findMany({
      where: { restaurantId, normalizedName: { in: names } },
      select: { normalizedName: true, unit: true, unitPrice: true },
      take: 2000,
    });
    return items.filter((item, i) => {
      // Money off varies with what was bought: it has no usual price.
      if (item.unitPrice < 0) return false;
      const history = past
        .filter((p) => p.normalizedName === names[i] && invoiceUnit(p.unit) === invoiceUnit(item.unit))
        .map((p) => Number(p.unitPrice));
      return unusualPrice(item.unitPrice, history) !== null;
    }).length;
  } catch {
    // Unknown is not the same as fine: a person looks.
    return items.length;
  }
}

/** What the reader should know about this supplier's invoices, or nothing. */
async function supplierNote(taxId: string | null | undefined, docType: string | null | undefined): Promise<string> {
  const nif = cleanTaxId(taxId);
  if (!nif) return '';
  try {
    const rules = await prisma.supplierKnowledge.findMany({
      where: { taxId: nif, active: true },
      select: { note: true, docType: true, active: true },
    });
    return readerNote(rulesFor(rules, docType));
  } catch {
    // Reading without the hint beats not reading.
    return '';
  }
}

/** Reads a stored document again with today's reader. Saves nothing. */
export async function rereadStoredDocument(input: {
  restaurantId: string;
  userId: string;
  storedPath: string;
  /** The pages after the first. */
  extraPaths?: string[];
  qrTexts?: string[];
}): Promise<{ data: ScanResult; proof: Proof | null }> {
  const file = resolveStoredPath(input.storedPath);
  if (!file) throw new Error('Stored document not found');
  const bytes = await readFile(file);
  const lower = input.storedPath.toLowerCase();
  const mediaType: MediaType = lower.endsWith('.pdf')
    ? 'application/pdf'
    : lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return readDocument({
    restaurantId: input.restaurantId,
    userId: input.userId,
    base64: bytes.toString('base64'),
    mediaType,
    scanType: 'COST_RECEIPT',
    extraPages: await storedPages(input.extraPaths ?? []),
    qrTexts: input.qrTexts,
  });
}

/** Stored pages, ready for the reader. A page that has gone missing is skipped. */
async function storedPages(paths: string[]): Promise<ScanPage[]> {
  const pages: ScanPage[] = [];
  for (const path of paths) {
    const file = resolveStoredPath(path);
    if (!file) continue;
    const bytes = await readFile(file).catch(() => null);
    if (!bytes) continue;
    const lower = path.toLowerCase();
    const mediaType: MediaType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    pages.push({ base64: bytes.toString('base64'), mediaType });
  }
  return pages;
}

/**
 * The QR of a document: what the browser read off the original photograph, or
 * failing that, the first page here that gives one up. It may be on any page.
 */
async function findQr(pages: ScanPage[], qrTexts: string[]): Promise<InvoiceQrData | null> {
  for (const text of qrTexts) {
    const parsed = parseInvoiceQr(text);
    if (parsed) return parsed;
  }
  for (const page of pages) {
    const qr = await decodeQr(page.base64, page.mediaType);
    if (qr) return qr;
  }
  return null;
}

/** The QR on a stored photograph, or null. Costs nothing: no model is involved. */
export async function readStoredQr(storedPath: string): Promise<InvoiceQrData | null> {
  const lower = storedPath.toLowerCase();
  if (!storedPath || lower.endsWith('.pdf')) return null;
  try {
    const file = resolveStoredPath(storedPath);
    if (!file) return null;
    const bytes = await readFile(file);
    const mediaType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return await decodeQr(bytes.toString('base64'), mediaType);
  } catch {
    return null;
  }
}

/** The QR on a photograph, or null. Never throws: a failed decode changes nothing. */
async function decodeQr(imageBase64: string, mediaType: string): Promise<InvoiceQrData | null> {
  try {
    const bytes = Buffer.from(imageBase64, 'base64');
    return await readInvoiceQr(new Blob([new Uint8Array(bytes)], { type: mediaType }));
  } catch {
    return null;
  }
}

/** A reading with its explanatory rows gone and tied discounts on their products. */
function asPaid(data: ScanResult): ScanResult {
  if (data.type !== 'cost_receipt') return data;
  const items = data.items.map((item) => ({ ...item, product: withoutBatch(item.product) }));
  return { ...data, ...foldNotes(items, data.discountTotal) };
}

/** A reading with the QR's fields taking the place of what was read. */
function withQrTruth(data: ScanResult, qr: InvoiceQrData | null): { data: ScanResult; changed: string[] } {
  if (!qr || data.type !== 'cost_receipt') return { data, changed: [] };
  const { corrected, changed } = applyQrTruth(data as unknown as Record<string, unknown>, qr);
  return { data: corrected as unknown as ScanResult, changed };
}

/**
 * Puts right what the document's own figures can settle, with nobody asked.
 *
 * A discount note read as a line goes, a line with the wrong VAT rate gets the
 * one its value must have for each rate to reach what the invoice states, and
 * values printed with VAT go back to before it. Kept only if the figures come out
 * better for it.
 */
function tidied(
  reading: { data: ScanResult; changed: string[] },
  proof: Proof | null,
  qr: InvoiceQrData | null,
): { reading: { data: ScanResult; changed: string[] }; proof: Proof | null } {
  if (!proof || reading.data.type !== 'cost_receipt') return { reading, proof };
  let best = { reading, proof };

  const keep = (items: typeof reading.data.items) => {
    if (best.reading.data.type !== 'cost_receipt' || items.length === 0) return;
    const data = { ...best.reading.data, items };
    const next = proofOf(data, qr);
    if (next && betterProof(best.proof, next) === 'second') best = { reading: { ...best.reading, data }, proof: next };
  };

  const plain = reading.data.items.filter((item) => !isDiscountNote(item.product));
  if (plain.length < reading.data.items.length) keep(plain);

  const lines = best.reading.data.type === 'cost_receipt' ? best.reading.data.items : [];
  const shifted = best.proof.problems.some((p) => p.kind === 'line');
  if (best.proof.status === 'failed' && !shifted && best.proof.truth.length > 0) {
    const discount = best.reading.data.type === 'cost_receipt' ? best.reading.data.discountTotal ?? 0 : 0;
    const settled = settleFigures(lines.map((item) => ({ ...item, productName: item.product })), best.proof.truth, discount);
    if (settled) {
      keep(lines.flatMap((item, i) => (settled.drop.includes(i) ? [] : [{
        ...item,
        vatRate: settled.rates[i],
        total: settled.totals[i],
        unitPrice: settled.unitPrices[i],
        grossTotal: settled.grossTotals[i] ?? undefined,
      }])));
    }
  }
  return best;
}

function proofOf(data: ScanResult, qr: InvoiceQrData | null): Proof | null {
  if (data.type !== 'cost_receipt') return null;
  return checkReading(data, qr);
}

/** The restaurant's name and NIFs (old and new, after a change), and the names of its owners. */
async function customerOf(restaurantId: string): Promise<CustomerIdentity> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      name: true,
      taxId: true,
      newTaxId: true,
      memberships: { where: { role: 'OWNER' }, select: { user: { select: { name: true } } } },
    },
  });
  return {
    names: [restaurant?.name ?? '', ...(restaurant?.memberships ?? []).map((m) => m.user.name ?? '')].filter(Boolean),
    taxIds: restaurant ? ourNifs(restaurant) : [],
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
