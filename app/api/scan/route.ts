import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { extractFromReceipt } from '@/lib/claude-vision';

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, role: { in: ['OWNER', 'STAFF'] }, active: true },
    });
    if (!membership) {
      return NextResponse.json({ error: 'No restaurant access' }, { status: 403 });
    }

    // Parse request
    const body = await request.json();
    const { imageBase64, mediaType, scanType } = body as {
      imageBase64: string;
      mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
      scanType: 'COST_RECEIPT' | 'DAILY_REPORT';
    };

    if (!imageBase64 || !scanType) {
      return NextResponse.json({ error: 'Missing image or scan type' }, { status: 400 });
    }

    // Extract data using Claude Vision
    const extractedData = await extractFromReceipt(imageBase64, mediaType, scanType);

    // Save scan record
    const scan = await prisma.receiptScan.create({
      data: {
        restaurantId: membership.restaurantId,
        userId: user.id,
        imageUrl: '', // We store base64 in extractedData for now
        scanType: scanType,
        extractedData: extractedData as any,
        status: 'PROCESSED',
      },
    });

    return NextResponse.json({
      success: true,
      data: extractedData,
      scanId: scan.id,
    });
  } catch (error: any) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process receipt' },
      { status: 500 }
    );
  }
}
