import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOwner, isAuthError } from '@/lib/auth-helpers';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSetting, SETTING_KEYS } from '@/lib/settings';
import { recordAiUsage } from '@/lib/ai-usage-server';
import { dayKey } from '@/lib/ai-usage';
import { ASSISTANT_TOOLS, runAssistantTool, ToolInputError } from '@/lib/assistant-tools';

/**
 * "Pergunta": questions about the restaurant's own numbers, answered by
 * Claude with read-only tools over this restaurant's data.
 *
 * The conversation lives in the browser; each request carries the visible
 * turns as plain text. The model never sees another restaurant, never writes,
 * and is told to quote only figures a tool returned. Each question is logged
 * to ai_usage with its cost, like a scan.
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

const MODEL = 'claude-opus-5-5';
const MAX_ROUNDS = 6;
const PER_HOUR = 30;

const bodySchema = z.object({
  language: z.enum(['pt', 'en']).default('pt'),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).min(1).max(20),
});

function systemPrompt(restaurant: string, today: string, language: 'pt' | 'en') {
  return [
    `You answer the owner of the restaurant "${restaurant}" about their own business, inside REST Finance. Today is ${today}. Money is in euros.`,
    'Use the tools for every figure. Never estimate, round loosely or invent a number a tool did not return; if the data is not there, say so plainly and say where in the app it would be entered (Receita, Despesas, Contabilidade).',
    'Choose dates yourself from the question: "last month" is the previous calendar month, "this month" runs from the 1st to today. Say which period you used.',
    'Keep answers short: a sentence or two, then at most a few lines of figures. Plain text only, no tables or headings; a line may start with "- ". Write money like 1.234,56 € in Portuguese and €1,234.56 in English.',
    'Only answer about this restaurant and its numbers. For anything else, say briefly that you can only help with the restaurant\'s figures.',
    language === 'pt'
      ? 'Answer in European Portuguese (português de Portugal), addressing the owner as "você" implicitly, as the app does.'
      : 'Answer in English.',
  ].join('\n');
}

export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  if (isAuthError(owner)) {
    return NextResponse.json({ error: owner.error }, { status: owner.requiresAuth ? 401 : 403 });
  }
  if (!checkRateLimit(`assistant:${owner.userId}`, PER_HOUR, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'assistant.rateLimited' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.messages[0].role !== 'user') {
    return NextResponse.json({ error: 'assistant.badRequest' }, { status: 400 });
  }

  const apiKey = (await getSetting(SETTING_KEYS.anthropicApiKey))?.trim();
  if (!apiKey) return NextResponse.json({ error: 'assistant.unavailable' }, { status: 503 });

  const restaurant = await prisma.restaurant.findUnique({ where: { id: owner.restaurantId }, select: { name: true } });
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = parsed.data.messages.map((m) => ({ role: m.role, content: m.content }));

  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;
  let answer = '';
  let failure: string | null = null;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        // A chat answer over a few figures: low effort keeps it quick.
        output_config: { effort: 'low' },
        system: systemPrompt(restaurant?.name ?? '', dayKey(new Date()), parsed.data.language),
        tools: ASSISTANT_TOOLS,
        messages,
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      stopReason = response.stop_reason;

      if (response.stop_reason === 'refusal') { failure = 'assistant.refused'; break; }

      // Every block goes back as it came, thinking included.
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'pause_turn') continue;

      const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || calls.length === 0) {
        answer = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        break;
      }

      // All results in one user turn, errors included, so parallel calls keep working.
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(calls.map(async (call) => {
        try {
          const content = await runAssistantTool(call.name, call.input as Record<string, unknown>, owner.restaurantId);
          return { type: 'tool_result' as const, tool_use_id: call.id, content };
        } catch (error) {
          const message = error instanceof ToolInputError ? error.message : 'the lookup failed';
          if (!(error instanceof ToolInputError)) console.error('[assistant] tool failed', call.name, error);
          return { type: 'tool_result' as const, tool_use_id: call.id, content: message, is_error: true };
        }
      }));
      messages.push({ role: 'user', content: results });
    }

    if (!answer && !failure) failure = 'assistant.noAnswer';
  } catch (error) {
    console.error('[assistant]', error);
    failure = error instanceof Anthropic.RateLimitError ? 'assistant.busy' : 'assistant.failed';
  } finally {
    await recordAiUsage({
      restaurantId: owner.restaurantId,
      userId: owner.userId,
      source: 'assistant',
      scanType: null,
      model: MODEL,
      telemetry: { model: MODEL, promptVersion: 'assistant-1', inputTokens, outputTokens, durationMs: Date.now() - started },
      succeeded: !!answer,
      stopReason,
      error: failure,
    });
  }

  if (failure) return NextResponse.json({ error: failure }, { status: failure === 'assistant.busy' ? 429 : 502 });
  return NextResponse.json({ answer });
}
