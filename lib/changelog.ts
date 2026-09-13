/**
 * What changed in the product, in the owner's language.
 *
 * This is a release note, not a commit log. The reader runs a restaurant and
 * wants to know what is different for them this week; "refactored the costing
 * module" is noise to them, while "the menu calculator now takes prices from
 * your invoices" is the same change described usefully.
 *
 * Three kinds, because they answer different questions:
 *   new          — something you could not do before
 *   improvement  — something you could do, now better
 *   fix          — something that was wrong and no longer is
 *
 * Keep the newest release first. `date` is ISO so it sorts and formats
 * without ambiguity. Bump `CHANGELOG_VERSION` whenever an entry is added: the
 * unread dot compares it against what the reader last opened.
 */

export type ChangeKind = 'new' | 'improvement' | 'fix';

export interface ChangeEntry {
  kind: ChangeKind;
  title: string;
  /** One sentence on why it matters. Optional when the title says it all. */
  detail?: string;
}

export interface Release {
  version: string;
  date: string;
  entries: ChangeEntry[];
}

/**
 * Bumped on every release below. Stored per browser once the reader opens the
 * panel, which is what clears the unread dot.
 */
export const CHANGELOG_VERSION = '2026.09.12';

export const CHANGELOG: Release[] = [
  {
    version: '2026.09.12',
    date: '2026-09-12',
    entries: [
      {
        kind: 'new',
        title: 'Estado — IVA trimestral e IRC',
        detail:
          'Uma estimativa do IVA a entregar em cada trimestre, com o prazo de entrega, e do IRC no fim do ano. As taxas estão actualizadas a 2026: 13% na comida, 23% nas bebidas alcoólicas e refrigerantes, e 15% de IRC até 50.000 €. É uma estimativa para saber o que aí vem — quem entrega a declaração é o seu contabilista.',
      },
      {
        kind: 'new',
        title: 'Calculadora de ementa',
        detail:
          'Em Análises › Ementa. Monte a receita de cada prato e fique a saber quanto deixa, já com o IVA descontado. Os preços dos ingredientes vêm das suas facturas sempre que o nome coincide, por isso uma subida do fornecedor aparece sozinha na margem.',
      },
      {
        kind: 'new',
        title: 'Horários da equipa',
        detail:
          'Uma grelha semanal com os seus colaboradores, que não precisam de conta. Fecha um dia num toque, repete uma semana as vezes que quiser, e exporta em imagem para enviar no WhatsApp.',
      },
      {
        kind: 'new',
        title: 'Explicações em cada número',
        detail:
          'Todos os termos das Análises têm agora um ícone de ajuda. COGS, OPEX, prime cost, ticket médio — passe o rato ou toque para ver o que significam em português simples.',
      },
      {
        kind: 'improvement',
        title: 'A demonstração anual funciona no telemóvel',
        detail:
          'Doze meses não cabem num ecrã pequeno. No telemóvel passa a mostrar um mês de cada vez, com todas as linhas e a percentagem sobre as vendas desse mês.',
      },
      {
        kind: 'improvement',
        title: 'Fotografias na página inicial',
      },
      {
        kind: 'improvement',
        title: 'Pode instalar a app no telemóvel',
        detail:
          'No telemóvel, abra o menu de partilha e escolha "Adicionar ao ecrã principal". Passa a abrir sem as barras do browser, o que dá mais espaço e evita ter de tocar duas vezes nos botões de baixo.',
      },
      {
        kind: 'fix',
        title: 'As Novidades apareciam mal no telemóvel',
        detail:
          'Este painel aparecia como um bloco de texto atrás da página em vez de abrir por cima.',
      },
      {
        kind: 'fix',
        title: 'Botões que pareciam precisar de dois toques',
        detail:
          'No telemóvel havia uma espera antes de o toque fazer efeito, e o fundo da página ficava por baixo da barra do browser.',
      },
      {
        kind: 'fix',
        title: 'A página já não desliza para o lado',
        detail:
          'No telemóvel, arrastar de lado deslocava o ecrã e deixava os botões fora do sítio. O botão + também aparecia cortado na margem.',
      },
      {
        kind: 'fix',
        title: 'O ecrã de espera já não parece parado',
        detail:
          'Ao abrir ou actualizar o painel aparece agora a animação, em vez de uma letra fixa.',
      },
      {
        kind: 'fix',
        title: 'As explicações já não ficavam cortadas no ecrã',
        detail:
          'Nas colunas das pontas da tabela anual, metade do texto ficava fora do ecrã.',
      },
    ],
  },
];

export const KIND_LABEL: Record<ChangeKind, string> = {
  new: 'Novo',
  improvement: 'Melhoria',
  fix: 'Correção',
};

export const KIND_LABEL_EN: Record<ChangeKind, string> = {
  new: 'New',
  improvement: 'Improvement',
  fix: 'Fix',
};

/**
 * Order within a release: new first, then improvements, then fixes.
 *
 * Deliberate — the reader came to find out what they can now do, and a list
 * that opens with bug fixes buries it.
 */
const KIND_ORDER: Record<ChangeKind, number> = { new: 0, improvement: 1, fix: 2 };

export function sortEntries(entries: ChangeEntry[]): ChangeEntry[] {
  return [...entries].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/** Entries of one release grouped by kind, empty groups dropped. */
export function groupByKind(entries: ChangeEntry[]): Array<{ kind: ChangeKind; entries: ChangeEntry[] }> {
  return (['new', 'improvement', 'fix'] as ChangeKind[])
    .map((kind) => ({ kind, entries: entries.filter((e) => e.kind === kind) }))
    .filter((group) => group.entries.length > 0);
}

/** True when this browser has not yet opened the current release. */
export function hasUnread(lastSeenVersion: string | null): boolean {
  return lastSeenVersion !== CHANGELOG_VERSION;
}
