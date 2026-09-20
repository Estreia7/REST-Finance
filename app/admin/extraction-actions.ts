'use server';

import { readFile } from 'node:fs/promises';
import { requireAdmin, isAuthError } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { toClientError } from '@/lib/errors';
import { saveImage, resolveStoredPath, IMAGE_MIME } from '@/lib/uploads';
import { getSetting, setSetting, deleteSetting, SETTING_KEYS } from '@/lib/settings';
import { maskSecret } from '@/lib/crypto';
import { claudeScan, SCANNER_MODEL, PROMPT_VERSION, estimateCostUsd } from '@/lib/scanners/claude-scanner';
import { checkExtraction } from '@/lib/pt-validation';
import { readInvoiceQr, compareWithQr } from '@/lib/pt-invoice-qr';
import type { MediaType, ScanType } from '@/lib/document-scanner';

/**
 * The extraction bench.
 *
 * A place to photograph real paperwork, see exactly what the reader made of
 * it, and record what was actually on the page — so that "is this accurate
 * enough to put in front of a restaurant owner?" is answered with a number
 * rather than an impression.
 *
 * Admin-only and deliberately separate from the client-side scanner: these
 * runs are experiments, and mixing them into a restaurant's real records
 * would corrupt the books to measure a model.
 */

/** Whether the reader is configured, and a preview of the stored key. */
export async function getExtractionSettings() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const key = await getSetting(SETTING_KEYS.anthropicApiKey);
    const row = await prisma.appSetting.findUnique({
      where: { key: SETTING_KEYS.anthropicApiKey },
      select: { updatedAt: true },
    });

    return {
      success: true,
      data: {
        configured: Boolean(key),
        // Never the key itself: it would land in a response, a log and a
        // screenshot of this screen.
        preview: key ? maskSecret(key) : '',
        fromDatabase: Boolean(row),
        updatedAt: row?.updatedAt ?? null,
        model: SCANNER_MODEL,
        promptVersion: PROMPT_VERSION,
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read extraction settings', error, 'read') };
  }
}

export async function setAnthropicApiKey(key: string) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const trimmed = key.trim();
    if (!trimmed) return { error: 'admin.extraction.keyEmpty' };
    // Not a validation of the credential — only of the shape, so an obvious
    // paste of the wrong thing is caught before it costs a round trip.
    if (!trimmed.startsWith('sk-ant-')) return { error: 'admin.extraction.keyMalformed' };

    await setSetting(SETTING_KEYS.anthropicApiKey, trimmed, admin.userId);
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save key', error, 'write') };
  }
}

export async function clearAnthropicApiKey() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    await deleteSetting(SETTING_KEYS.anthropicApiKey);
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to clear key', error, 'write') };
  }
}

/**
 * Runs one document through the reader and records what came back.
 *
 * The image is kept, not just the result: a run that cannot be looked at
 * again is not evidence of anything, and the whole point of this screen is to
 * build a corpus that a prompt change can be re-measured against.
 */
export async function runExtractionTest(formData: FormData) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const file = formData.get('image');
    const scanType = String(formData.get('scanType') ?? '') as ScanType;
    const notes = String(formData.get('notes') ?? '').trim();

    if (!(file instanceof File)) return { error: 'admin.extraction.noImage' };
    if (scanType !== 'COST_RECEIPT' && scanType !== 'DAILY_REPORT') {
      return { error: 'admin.extraction.badType' };
    }

    const apiKey = await getSetting(SETTING_KEYS.anthropicApiKey);
    if (!apiKey) return { error: 'admin.extraction.noKey' };

    const saved = await saveImage('extraction-tests', admin.userId, file);
    if (!saved.ok) return { error: saved.error };

    const record = await prisma.extractionTest.create({
      data: {
        userId: admin.userId,
        scanType,
        imagePath: saved.storedPath,
        imageName: file.name || 'sem-nome',
        model: SCANNER_MODEL,
        promptVersion: PROMPT_VERSION,
        notes: notes || null,
        status: 'PENDING',
      },
    });

    // The QR is read first and independently of the model. Where a
    // Portuguese certified invoice carries one, it is not another opinion
    // about the page — it is what the till actually recorded.
    const bytes = await readFile(resolveStoredPath(saved.storedPath)!);
    const qr =
      scanType === 'COST_RECEIPT'
        ? await readInvoiceQr(new Blob([new Uint8Array(bytes)], { type: IMAGE_MIME[saved.kind] }))
        : null;

    try {
      const { result, telemetry } = await claudeScan(
        bytes.toString('base64'),
        IMAGE_MIME[saved.kind] as MediaType,
        scanType,
        apiKey,
      );

      const data = result as unknown as Record<string, unknown>;
      const warnings = checkExtraction(data);
      const qrComparison = qr ? compareWithQr(data, qr) : [];

      const updated = await prisma.extractionTest.update({
        where: { id: record.id },
        data: {
          status: 'PROCESSED',
          extracted: result as never,
          // Everything that could be checked without the paper, kept with the
          // run so the list can show which need a human first.
          fieldScores: { warnings, qr: qr ?? null, qrComparison } as never,
          inputTokens: telemetry.inputTokens,
          outputTokens: telemetry.outputTokens,
          durationMs: telemetry.durationMs,
        },
      });

      return { success: true, data: { id: updated.id } };
    } catch (err: unknown) {
      // A failed run is still a result: it says this document defeats the
      // reader, which is exactly what the bench is for.
      await prisma.extractionTest.update({
        where: { id: record.id },
        data: { status: 'FAILED', error: err instanceof Error ? err.message : String(err) },
      });
      return { error: toClientError('Extraction failed', err, 'generic') };
    }
  } catch (error: unknown) {
    return { error: toClientError('Failed to run test', error, 'generic') };
  }
}

/** The runs, newest first. */
export async function getExtractionTests(scanType?: ScanType) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const rows = await prisma.extractionTest.findMany({
      where: scanType ? { scanType } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      success: true,
      data: rows.map((r) => ({
        ...r,
        costUsd:
          r.inputTokens !== null && r.outputTokens !== null
            ? estimateCostUsd(r.inputTokens, r.outputTokens)
            : null,
      })),
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to read tests', error, 'read') };
  }
}

/**
 * Records what was actually on the document, and scores the run against it.
 *
 * Scoring is per field and deliberately strict on the fields that matter:
 * a total that is a cent out is wrong, because it would reconcile wrongly.
 * Only the fields the administrator filled in are scored — a blank is "not
 * checked", not "the model invented this".
 */
export async function setExtractionTruth(id: string, truth: Record<string, unknown>) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const row = await prisma.extractionTest.findUnique({ where: { id } });
    if (!row) return { error: 'admin.extraction.notFound' };

    const extracted = (row.extracted ?? {}) as Record<string, unknown>;
    const scores: Record<string, boolean> = {};

    for (const [field, expected] of Object.entries(truth)) {
      if (expected === null || expected === undefined || expected === '') continue;
      scores[field] = matches(extracted[field], expected);
    }

    const checked = Object.values(scores);
    const accuracy = checked.length > 0
      ? checked.filter(Boolean).length / checked.length
      : null;

    const existing = (row.fieldScores ?? {}) as Record<string, unknown>;

    await prisma.extractionTest.update({
      where: { id },
      data: {
        truth: truth as never,
        // Merged rather than replaced: the automatic warnings and the QR
        // comparison were written when the run happened and are still true.
        fieldScores: { ...existing, fields: scores } as never,
        accuracy,
      },
    });

    return { success: true, data: { accuracy } };
  } catch (error: unknown) {
    return { error: toClientError('Failed to save truth', error, 'write') };
  }
}

/**
 * Whether an extracted value matches the truth typed in.
 *
 * Money is compared to the cent, text case-insensitively and without
 * surrounding whitespace — "FARMACIA GODINHO BELO" and "Farmácia Godinho
 * Belo" are the same supplier read off the same page, and counting that as a
 * miss would measure the administrator's typing, not the reader.
 */
function matches(got: unknown, expected: unknown): boolean {
  if (typeof expected === 'number' || (typeof expected === 'string' && /^-?[\d.,]+$/.test(expected))) {
    const a = toNumber(got);
    const b = toNumber(expected);
    if (a !== null && b !== null) return Math.abs(a - b) < 0.005;
  }
  return normalise(got) === normalise(expected);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  // Accepts both the printed Portuguese form and the form the model returns.
  const cleaned = value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalise(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    // Accents differ between what is printed and what is typed; they are not
    // what is being measured here.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Removes a run and its image. */
export async function deleteExtractionTest(id: string) {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    await prisma.extractionTest.delete({ where: { id } });
    return { success: true };
  } catch (error: unknown) {
    return { error: toClientError('Failed to delete test', error, 'write') };
  }
}

/** Headline numbers across the corpus, for deciding whether this is ready. */
export async function getExtractionSummary() {
  try {
    const admin = await requireAdmin();
    if (isAuthError(admin)) return { error: admin.error };

    const rows = await prisma.extractionTest.findMany({
      select: {
        scanType: true, accuracy: true, status: true,
        inputTokens: true, outputTokens: true, durationMs: true,
      },
    });

    const summarise = (subset: typeof rows) => {
      const scored = subset.filter((r) => r.accuracy !== null);
      const timed = subset.filter((r) => r.durationMs !== null);
      return {
        runs: subset.length,
        failed: subset.filter((r) => r.status === 'FAILED').length,
        // Null rather than zero when nothing has been checked: "no data" and
        // "everything wrong" must not look the same on a dashboard.
        scored: scored.length,
        meanAccuracy: scored.length
          ? scored.reduce((s, r) => s + (r.accuracy ?? 0), 0) / scored.length
          : null,
        meanDurationMs: timed.length
          ? Math.round(timed.reduce((s, r) => s + (r.durationMs ?? 0), 0) / timed.length)
          : null,
        totalCostUsd: subset.reduce(
          (s, r) => s + estimateCostUsd(r.inputTokens ?? 0, r.outputTokens ?? 0),
          0,
        ),
      };
    };

    return {
      success: true,
      data: {
        all: summarise(rows),
        receipts: summarise(rows.filter((r) => r.scanType === 'COST_RECEIPT')),
        reports: summarise(rows.filter((r) => r.scanType === 'DAILY_REPORT')),
      },
    };
  } catch (error: unknown) {
    return { error: toClientError('Failed to summarise', error, 'read') };
  }
}
