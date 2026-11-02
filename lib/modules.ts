import type { Plan } from '@prisma/client';

/**
 * Extra modules: parts of the app a restaurant has only when they are switched
 * on for it. Everything not listed here is the core app, which every plan has.
 *
 * A restaurant has a module when an administrator switched it on for that
 * restaurant (`Restaurant.modules`, from the admin console) or when its plan
 * includes it (`PLAN_MODULES`). Owners cannot switch modules themselves.
 *
 * To add a module: add its key here, gate its screen with `hasModule` and its
 * server actions with `moduleOff` (lib/modules-server.ts), and give it a
 * `modules.<key>.name` and `.body` in both languages. To sell one inside a
 * plan, list it under that plan below; no migration is needed for either.
 */
export const MODULES = ['stock', 'timeClock'] as const;

export type ModuleKey = (typeof MODULES)[number];

/**
 * What each plan includes without an administrator switching it on. Empty
 * for now: the current plans differ only in how they are billed, and extra
 * modules are switched on restaurant by restaurant.
 */
export const PLAN_MODULES: Record<Plan, readonly ModuleKey[]> = {
  TRIAL: [],
  MONTHLY: [],
  YEARLY: [],
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULES as readonly string[]).includes(value);
}

/**
 * The modules a restaurant has, in registry order. Unknown keys in the
 * stored list (a module since retired) are ignored, never trusted.
 */
export function enabledModules(restaurant: { plan: Plan; modules: readonly string[] }): ModuleKey[] {
  const on = new Set<string>([...restaurant.modules, ...PLAN_MODULES[restaurant.plan]]);
  return MODULES.filter((key) => on.has(key));
}

export function hasModule(modules: readonly ModuleKey[] | null | undefined, key: ModuleKey): boolean {
  return !!modules?.includes(key);
}
