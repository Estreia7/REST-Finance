import { prisma } from './prisma';
import { costUsd } from './ai-models';
import type { ScanType } from './document-scanner';
import type { ScanTelemetry } from './scanners/claude-scanner';
import type { UsageSubject } from './ai-usage';

export interface AiUsageEntry {
  restaurantId: string | null;
  userId: string | null;
  /** "scan" for an owner's document, "bench" for the extraction lab. */
  source: 'scan' | 'bench';
  scanType: ScanType;
  /** What the call reported. Absent when it failed before reaching the model. */
  telemetry?: ScanTelemetry;
  /** What the call read, so the console can name the document. */
  subject?: UsageSubject | null;
  /** The model asked, for a call that failed before any telemetry came back. */
  model: string;
  succeeded: boolean;
  stopReason?: string | null;
  error?: string | null;
}

/**
 * Writes one call to the usage log.
 *
 * Never throws. The scan has already happened and the owner is waiting on
 * its result; a log that cannot be written is a gap in the console, never a
 * failed scan.
 *
 * Not a server action: it trusts the ids it is given, and callers check them.
 */
export async function recordAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    const t = entry.telemetry;
    const model = t?.model ?? entry.model;
    const inputTokens = t?.inputTokens ?? 0;
    const outputTokens = t?.outputTokens ?? 0;

    await prisma.aiUsage.create({
      data: {
        restaurantId: entry.restaurantId,
        userId: entry.userId,
        source: entry.source,
        scanType: entry.scanType,
        model,
        promptVersion: t?.promptVersion ?? null,
        subject: entry.subject ?? undefined,
        inputTokens,
        outputTokens,
        // Priced now, at today's list, and kept: the next price change must
        // not rewrite what this call cost.
        costUsd: costUsd(model, inputTokens, outputTokens),
        durationMs: t?.durationMs ?? null,
        succeeded: entry.succeeded,
        stopReason: entry.stopReason ?? null,
        // A long stack trace is not what the console needs.
        error: entry.error ? entry.error.slice(0, 500) : null,
      },
    });
  } catch (err) {
    console.error('Failed to record AI usage:', err);
  }
}
