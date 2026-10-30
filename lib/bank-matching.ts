import type { PaymentMethodKey } from '@/lib/payments';

/**
 * Pairs bank movements with the invoices they paid.
 *
 * The amount is the evidence: a transfer of 1.284,53 € and an open invoice of
 * 1.284,53 € are very likely the same thing. The supplier's name or the
 * invoice number in the movement's description, and a date between the
 * invoice and a while after its due date, decide between candidates. One
 * transfer often settles several invoices from the same supplier, so sums of
 * two or three of them are tried too.
 *
 * It only suggests. Nothing is marked paid until the owner confirms, except
 * the matches strong enough to be called "certain" — and even those only when
 * the owner presses "reconcile automatically".
 *
 * Pure, and tested in tests/bank-matching.test.ts.
 */

export type BankKind = 'PAYMENT' | 'INCOME' | 'FEE' | 'CASH';

export interface BankMove {
  id: string;
  dateKey: string;
  /** Signed: out is negative. */
  amount: number;
  description: string;
}

export interface OpenCost {
  id: string;
  restaurantId: string;
  dateKey: string;
  dueKey: string;
  /** The whole document, split parts included. */
  amount: number;
  vendorId: string | null;
  vendorName: string | null;
  invoiceNumber: string | null;
  description: string | null;
}

export type Confidence = 'certain' | 'likely' | 'possible';

export interface MatchSuggestion {
  costIds: string[];
  confidence: Confidence;
  score: number;
}

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

// ── What a movement is ──────────────────────────────────────────────────────

const FEE = /\b(COMISS|IMPOSTO DO SELO|IMP SELO|I SELO|MANUTENCAO DE CONTA|MANUT CONTA|DESPESAS DE CONTA|ANUIDADE|JUROS DEVEDORES|COM MANUT|COMIS)/;
const CASH = /\b(LEVANTAMENTO|LEV ATM|ATM|LEVANT)\b/;

/** Money in is never an invoice payment; fees and cash withdrawals are not either. */
export function classifyMove(move: Pick<BankMove, 'amount' | 'description'>): BankKind {
  if (move.amount > 0) return 'INCOME';
  const d = fold(move.description);
  if (FEE.test(d)) return 'FEE';
  if (CASH.test(d)) return 'CASH';
  return 'PAYMENT';
}

/** How the bank says it was paid, for the invoice's payment method. */
export function methodFromDescription(description: string): PaymentMethodKey {
  const d = fold(description);
  if (/\b(DD|DEB DIRECTO|DEBITO DIRECTO|DEBITO DIRETO|DEB DIR|SEPA DD|COBRANCA)\b/.test(d)) return 'DIRECT_DEBIT';
  if (/\b(TRF|TRANSF|TRANSFERENCIA|SEPA)\b/.test(d)) return 'TRANSFER';
  if (/\b(PAG SERV|PAGAMENTO DE SERVICOS|COMPRA|MB|MULTIBANCO|PAG)\b/.test(d)) return 'MULTIBANCO';
  return 'TRANSFER';
}

// ── Scoring ─────────────────────────────────────────────────────────────────

const LEGAL = new Set(['LDA', 'LTDA', 'SA', 'UNIPESSOAL', 'COMERCIO', 'DISTRIBUICAO', 'PORTUGAL', 'SOCIEDADE', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);

/** Whether the movement names the supplier: one distinctive word is enough. */
export function namesVendor(description: string, vendorName: string | null): boolean {
  if (!vendorName) return false;
  const words = new Set(fold(description).split(' '));
  return fold(vendorName).split(' ').some((w) => w.length >= 4 && !LEGAL.has(w) && words.has(w));
}

/** Whether the movement carries the invoice's number, e.g. "FT 2026/4471" → "4471". */
export function citesInvoice(description: string, invoiceNumber: string | null): boolean {
  if (!invoiceNumber) return false;
  const tail = invoiceNumber.match(/(\d{3,})\s*$/)?.[1];
  return !!tail && fold(description).split(' ').includes(tail);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Paid a little before the invoice date at the earliest, two months past due at the latest. */
function inWindow(move: BankMove, cost: OpenCost): boolean {
  return daysBetween(cost.dateKey, move.dateKey) >= -5 && daysBetween(cost.dueKey, move.dateKey) <= 60;
}

function scoreOne(move: BankMove, cost: OpenCost): number {
  let score = 50; // the amount already matches
  if (namesVendor(move.description, cost.vendorName)) score += 30;
  if (citesInvoice(move.description, cost.invoiceNumber)) score += 30;
  // Closer to the due date is likelier.
  score -= Math.min(15, Math.abs(daysBetween(cost.dueKey, move.dateKey)) / 4);
  return score;
}

/**
 * The best ways to explain one payment, strongest first. Empty when nothing
 * on file adds up to it.
 */
export function suggestMatches(move: BankMove, costs: OpenCost[]): MatchSuggestion[] {
  if (classifyMove(move) !== 'PAYMENT') return [];
  const target = cents(Math.abs(move.amount));
  const pool = costs.filter((c) => inWindow(move, c));
  const out: MatchSuggestion[] = [];

  for (const c of pool) {
    if (cents(c.amount) === target) out.push({ costIds: [c.id], confidence: 'possible', score: scoreOne(move, c) });
  }

  // One transfer for several invoices: only within one supplier, who must be
  // named, or every pair of round amounts would match.
  if (out.length === 0) {
    const byVendor = new Map<string, OpenCost[]>();
    for (const c of pool) {
      if (!c.vendorId || !namesVendor(move.description, c.vendorName)) continue;
      byVendor.set(c.vendorId, [...(byVendor.get(c.vendorId) ?? []), c]);
    }
    for (const list of byVendor.values()) {
      const few = list.slice(0, 12);
      for (let i = 0; i < few.length; i++) {
        for (let j = i + 1; j < few.length; j++) {
          if (cents(few[i].amount + few[j].amount) === target) {
            out.push({ costIds: [few[i].id, few[j].id], confidence: 'possible', score: 70 });
          }
          for (let k = j + 1; k < few.length; k++) {
            if (cents(few[i].amount + few[j].amount + few[k].amount) === target) {
              out.push({ costIds: [few[i].id, few[j].id, few[k].id], confidence: 'possible', score: 65 });
            }
          }
        }
      }
    }
  }

  out.sort((a, b) => b.score - a.score);
  if (out.length === 0) return out;

  // How sure: one candidate that the description also points to is certain;
  // one candidate on amount alone, or a clear winner, is likely.
  const [best, second] = out;
  const named = best.costIds.every((id) => {
    const c = pool.find((x) => x.id === id)!;
    return namesVendor(move.description, c.vendorName) || citesInvoice(move.description, c.invoiceNumber);
  });
  if (out.length === 1 && named) best.confidence = 'certain';
  else if (out.length === 1 || (named && (!second || best.score - second.score >= 20))) best.confidence = 'likely';
  return out.slice(0, 5);
}

/**
 * What "reconcile automatically" confirms: only certain matches, and never
 * the same invoice for two movements.
 */
export function autoMatches(moves: BankMove[], costs: OpenCost[]): Array<{ moveId: string; costIds: string[] }> {
  const certain = moves
    .map((m) => ({ m, s: suggestMatches(m, costs)[0] }))
    .filter((x): x is { m: BankMove; s: MatchSuggestion } => x.s?.confidence === 'certain');

  // Two movements wanting the same invoice (two identical transfers to one
  // supplier) cannot both be right, and picking one is a guess: neither is
  // confirmed, and both are left for the owner.
  const wanted = new Map<string, number>();
  for (const { s } of certain) s.costIds.forEach((id) => wanted.set(id, (wanted.get(id) ?? 0) + 1));

  return certain
    .filter(({ s }) => s.costIds.every((id) => wanted.get(id) === 1))
    .map(({ m, s }) => ({ moveId: m.id, costIds: s.costIds }));
}
