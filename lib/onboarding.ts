/**
 * First-run setup: the wizard a new owner goes through, and the checklist that
 * stays on the dashboard until the rest is done.
 *
 * Pure on purpose. The wizard and the dashboard card both read from here, and
 * the tests can check what counts as "done" without a database.
 */

export const ONBOARDING_STEPS = ['restaurant', 'room', 'fixedCosts', 'firstData'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Where step 4 sends the owner to put their first numbers in. */
export const FIRST_DATA_CHOICES = ['import', 'scan', 'revenue'] as const;
export type FirstDataChoice = (typeof FIRST_DATA_CHOICES)[number];

/** The dashboard tab and sub-view each choice opens. */
export const FIRST_DATA_TARGETS: Record<FirstDataChoice, { tab: 'revenue' | 'costs'; sub: string }> = {
  import: { tab: 'revenue', sub: 'import' },
  scan: { tab: 'costs', sub: 'scan' },
  revenue: { tab: 'revenue', sub: 'entry' },
};

/**
 * The fixed costs offered in step 3, each pointed at the default category it
 * books into. Matched on the category's name without accents or case, so a
 * restaurant that kept the defaults lands every row in the right place; one
 * that renamed them falls back to the flag (labour, occupancy), then to none.
 *
 * `directDebit` is only the starting tick: bills usually leave the account by
 * themselves, rent and wages are usually sent by the owner.
 */
export const FIXED_COST_PRESETS = [
  { key: 'rent', category: 'renda', flag: 'occupancy', directDebit: false },
  { key: 'wages', category: 'ordenados', flag: 'labour', directDebit: false },
  { key: 'socialSecurity', category: 'seguranca social', flag: 'labour', directDebit: false },
  { key: 'electricity', category: 'luz', flag: null, directDebit: true },
  { key: 'water', category: 'agua', flag: null, directDebit: true },
  { key: 'gas', category: 'gas', flag: null, directDebit: true },
  { key: 'internet', category: 'internet + tv', flag: null, directDebit: true },
  { key: 'insurance', category: 'seguros', flag: null, directDebit: true },
  { key: 'pos', category: 'pos sistema', flag: null, directDebit: true },
] as const;
export type FixedCostKey = (typeof FIXED_COST_PRESETS)[number]['key'];

export function normaliseName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

interface CategoryLike {
  id: string;
  name: string;
  type: string;
  isLabour?: boolean | null;
  isOccupancy?: boolean | null;
}

/** The OPEX category a preset books into, or null when none fits. */
export function categoryForPreset(key: FixedCostKey, categories: CategoryLike[]): string | null {
  const preset = FIXED_COST_PRESETS.find((p) => p.key === key);
  if (!preset) return null;
  const opex = categories.filter((c) => c.type === 'OPEX');
  const byName = opex.find((c) => normaliseName(c.name) === preset.category);
  if (byName) return byName.id;
  if (preset.flag === 'occupancy') return opex.find((c) => c.isOccupancy)?.id ?? null;
  if (preset.flag === 'labour') return opex.find((c) => c.isLabour)?.id ?? null;
  return null;
}

/**
 * Parses an amount typed in either convention ("1.250,50" or "1250.50").
 * Without a comma, dots that split the number into groups of three are
 * thousands ("1.200" is rent, not €1.20): no one types a monthly cost to the
 * tenth of a cent.
 * Null for empty, zero, negative or unreadable: a row left blank is skipped.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/\s|€/g, '');
  if (!s) return null;
  const normalised = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(s)
      ? s.replace(/\./g, '')
      : s;
  const n = Number(normalised);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export interface RoomInput {
  seats: string;
  serviceHoursPerDay: string;
  monthlyRevenueTarget: string;
}

export type RoomResult =
  | { ok: true; seats: number | null; serviceHoursPerDay: number | null; monthlyRevenueTarget: number | null }
  | { ok: false; error: 'onboarding.room.seatsInvalid' | 'onboarding.room.hoursInvalid' | 'onboarding.room.targetInvalid' };

/** Every field is optional; a filled one has to be believable. */
export function validateRoom(input: RoomInput): RoomResult {
  const seatsRaw = input.seats.trim();
  const hoursRaw = input.serviceHoursPerDay.trim().replace(',', '.');
  const targetRaw = input.monthlyRevenueTarget.trim();

  let seats: number | null = null;
  if (seatsRaw) {
    const n = Number(seatsRaw);
    if (!Number.isInteger(n) || n < 1 || n > 2000) return { ok: false, error: 'onboarding.room.seatsInvalid' };
    seats = n;
  }

  let hours: number | null = null;
  if (hoursRaw) {
    const n = Number(hoursRaw);
    if (!Number.isFinite(n) || n <= 0 || n > 24) return { ok: false, error: 'onboarding.room.hoursInvalid' };
    hours = Math.round(n * 10) / 10;
  }

  let target: number | null = null;
  if (targetRaw) {
    target = parseAmount(targetRaw);
    if (target === null) return { ok: false, error: 'onboarding.room.targetInvalid' };
  }

  return { ok: true, seats, serviceHoursPerDay: hours, monthlyRevenueTarget: target };
}

// ── Dashboard checklist ─────────────────────────────────────────────────────

export interface SetupFacts {
  taxId: string | null;
  municipalityCode: string | null;
  /** Whether the Estado settings were ever saved, i.e. a VAT region chosen. */
  taxSettingsSaved: boolean;
  seats: number | null;
  serviceHoursPerDay: number | null;
  revenueDays: number;
  costEntries: number;
  recurringCosts: number;
  staffCount: number;
  complianceDocs: number;
}

export type ChecklistKey =
  | 'nif' | 'municipality' | 'vatRegion' | 'room'
  | 'firstRevenue' | 'firstCost' | 'fixedCosts' | 'team' | 'compliance';

export interface ChecklistItem {
  key: ChecklistKey;
  done: boolean;
  /** The dashboard tab where it is done. */
  tab: 'settings' | 'estado' | 'revenue' | 'costs' | 'users' | 'compliance';
}

/** In the order an owner should do them: what the numbers need comes first. */
export function setupChecklist(f: SetupFacts): ChecklistItem[] {
  return [
    { key: 'nif', done: Boolean(f.taxId), tab: 'settings' },
    { key: 'municipality', done: Boolean(f.municipalityCode), tab: 'settings' },
    { key: 'vatRegion', done: f.taxSettingsSaved, tab: 'estado' },
    { key: 'room', done: Boolean(f.seats && f.serviceHoursPerDay), tab: 'settings' },
    { key: 'firstRevenue', done: f.revenueDays > 0, tab: 'revenue' },
    { key: 'firstCost', done: f.costEntries > 0, tab: 'costs' },
    { key: 'fixedCosts', done: f.recurringCosts > 0, tab: 'costs' },
    { key: 'team', done: f.staffCount > 0, tab: 'users' },
    { key: 'compliance', done: f.complianceDocs > 0, tab: 'compliance' },
  ];
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}
