import { NextRequest, NextResponse } from 'next/server';
import { requireMember, isAuthError } from '@/lib/auth-helpers';
import { isScannerAvailable } from '@/lib/document-scanner';
import { processScan } from '@/lib/scan-core';
import { scanRequestSchema, formatZodError } from '@/lib/validations';
import { checkRateLimit } from '@/lib/rate-limit';
import { ExtractionError } from '@/lib/scanners/claude-scanner';

const SCAN_RATE_LIMIT = 20; // max scans per hour
const SCAN_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * A photograph or PDF from the app. Authorises, limits and validates; the
 * reading itself is lib/scan-core.ts, shared with invoices that arrive by
 * email.
 */
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

    // Rate limiting
    if (!checkRateLimit(`scan:${membership.userId}`, SCAN_RATE_LIMIT, SCAN_WINDOW_MS)) {
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
    const { data, scanId } = await processScan({
      restaurantId: membership.restaurantId,
      userId: membership.userId,
      base64: imageBase64,
      mediaType,
      scanType,
      source: 'APP',
    });

    return NextResponse.json({
      success: true,
      data,
      scanId,
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
