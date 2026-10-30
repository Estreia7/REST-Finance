import { prisma } from '@/lib/prisma';

/**
 * Suppliers that are one company written several ways, grouped by tax number.
 *
 * Shared by Accounting › Tidy up, which merges them, and the "Needs you"
 * inbox, which counts them — so the two always agree. Takes the restaurant
 * id rather than reading the session: callers authorise first.
 */
export async function findDuplicateVendorGroups(restaurantId: string) {
  const vendors = await prisma.vendor.findMany({
    where: { restaurantId },
    select: {
      id: true,
      name: true,
      taxId: true,
      _count: { select: { invoiceItems: true, costEntries: true } },
    },
    orderBy: { name: 'asc' },
  });

  // Grouped by tax number, which is the only reliable identity. Suppliers
  // with no NIF on file are left alone: two different butchers can have
  // similar names, and merging those would be worse than leaving them.
  const byTax = new Map<string, typeof vendors>();
  for (const vendor of vendors) {
    const nif = vendor.taxId?.replace(/\D/g, '');
    if (!nif) continue;
    byTax.set(nif, [...(byTax.get(nif) ?? []), vendor]);
  }

  // A supplier with no NIF on file, whose name matches one that has
  // a NIF, is almost always the same company read less well — the tax
  // number is near the top of an invoice and the easiest thing to miss
  // on a poor photograph. Grouped with it rather than left orphaned,
  // since otherwise the only duplicates that can ever be tidied are the
  // ones where both readings already worked.
  for (const vendor of vendors) {
    if (vendor.taxId?.replace(/\D/g, '')) continue;
    const key = simplify(vendor.name);
    if (!key) continue;
    for (const [nif, list] of byTax) {
      if (list.some((v) => simplify(v.name).startsWith(key) || key.startsWith(simplify(v.name)))) {
        byTax.set(nif, [...list, vendor]);
        break;
      }
    }
  }

  const groups = [...byTax.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([taxId, list]) => {
      // The one to keep must have the tax number, or the merged supplier
      // would lose the only reliable thing identifying it and the next
      // invoice would create a fifth row. After that, the fullest name:
      // a reading that got the registered name is the better reading.
      const keep = [...list].sort((a, b) => {
        const aNif = a.taxId ? 1 : 0;
        const bNif = b.taxId ? 1 : 0;
        return bNif - aNif || b.name.length - a.name.length;
      })[0];

      return {
        taxId,
        keep: { id: keep.id, name: keep.name },
        merge: list
          .filter((v) => v.id !== keep.id)
          .map((v) => ({
            id: v.id,
            name: v.name,
            lines: v._count.invoiceItems,
            costs: v._count.costEntries,
          })),
      };
    });

  return groups;
}

/** A supplier name reduced to what identifies it, for loose matching. */
function simplify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // The legal form says nothing about which company it is.
    .replace(/(lda|ltda|sa|s.a|unipessoal|comercio|cash|carry|portugal)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
