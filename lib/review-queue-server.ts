import { prisma } from '@/lib/prisma';
import { supersededScans, type QueuedData, type QueuedReading } from '@/lib/review-queue';

/**
 * Sets aside what is waiting for an invoice that has since been saved.
 *
 * Run wherever the queue is read, so it is true whichever way the invoice got
 * saved. Nothing is deleted: the photo and its reading stay on file.
 */
export async function retireSupersededScans(restaurantId: string): Promise<void> {
  const queued = await prisma.receiptScan.findMany({
    where: { restaurantId, queued: true, reviewedAt: null, linkedEntryId: null },
    select: { id: true, proofStatus: true, extractedData: true },
    take: 200,
  });
  const readings = queued.map((s): QueuedReading => ({
    id: s.id,
    proofStatus: s.proofStatus,
    data: s.extractedData as QueuedData,
  }));

  const numbers = [...new Set(readings.flatMap((r) => r.data?.invoiceNumber ?? []))];
  if (numbers.length === 0) return;

  const saved = await prisma.receiptScan.findMany({
    where: {
      restaurantId,
      linkedEntry: { deletedAt: null },
      OR: numbers.map((number) => ({ extractedData: { path: ['invoiceNumber'], equals: number } })),
    },
    select: { extractedData: true },
  });

  const retired = supersededScans(readings, saved.map((s) => s.extractedData as QueuedData));
  if (retired.length === 0) return;
  await prisma.receiptScan.updateMany({
    where: { id: { in: retired }, restaurantId, linkedEntryId: null },
    data: { reviewedAt: new Date() },
  });
}
