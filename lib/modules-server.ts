import { prisma } from '@/lib/prisma';
import { enabledModules, type ModuleKey } from '@/lib/modules';

/** The modules a restaurant has right now, read from the database. */
export async function restaurantModules(restaurantId: string): Promise<ModuleKey[]> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { plan: true, modules: true },
  });
  return restaurant ? enabledModules(restaurant) : [];
}

/**
 * The error key when the restaurant does not have the module, or null when it
 * does. Every server action of a module calls this: hiding the tab is not
 * enough, an action can be called without the screen.
 */
export async function moduleOff(restaurantId: string, key: ModuleKey): Promise<string | null> {
  return (await restaurantModules(restaurantId)).includes(key) ? null : 'modules.errors.off';
}
