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
export const CHANGELOG_VERSION = '2026.09.23';

export const CHANGELOG: Release[] = [
  {
    version: '2026.09.23',
    date: '2026-09-23',
    entries: [
      {
        kind: 'fix',
        title: 'Voltar à aplicação depois de muito tempo pede para entrar de novo',
        detail:
          'Quem voltava depois de uma longa ausência podia cair num painel vazio, sem nome, sem restaurante e sem números, como se a conta tivesse desaparecido. Agora, quando a sessão já terminou, a aplicação diz-lhe isso mesmo e abre o ecrã de entrada.',
      },
    ],
  },
  {
    version: '2026.09.20',
    date: '2026-09-20',
    entries: [
      {
        kind: 'new',
        title: 'Trazer o histórico de vendas do seu sistema de caixa',
        detail:
          'Em Receita › Importar pode carregar o ficheiro de vendas exportado do seu POS — Excel ou CSV — e a aplicação insere tudo de uma vez, dia a dia e por família de produtos. Antes de gravar mostra o que encontrou: quantos dias, quanto dinheiro, que famílias, e avisa se algum dia já tem valores diferentes dos seus, que só são substituídos se você deixar. Um ano de histórico entra em segundos em vez de ser escrito à mão.',
      },
      {
        kind: 'fix',
        title: '"Fotografar" abre mesmo a câmara',
        detail:
          'No botão +, escolher "Fotografar" levava-o para o separador e voltava a perguntar a mesma coisa, obrigando a começar de novo. Agora a câmara abre logo. E se escolheu "Despesa", abre já preparada para uma fatura de fornecedor em vez do fecho de caixa.',
      },
      {
        kind: 'improvement',
        title: 'Escolher a fotografia sem sair da aplicação',
        detail:
          'Ao inserir um documento, a escolha entre câmara, fototeca e ficheiros passa a ser feita dentro da aplicação, na sua língua, em vez do menu cinzento do telemóvel. Uma fotografia escolhida da fototeca é agora recortada e endireitada tal como uma tirada na hora — antes ficava com a mesa e tudo o resto à volta.',
      },
      {
        kind: 'new',
        title: 'A apresentação corre sozinha numa televisão',
        detail:
          'A apresentação passa a ter endereço próprio, um para português e outro para inglês, e não precisa de conta para abrir. Escreva o endereço no browser da televisão e ela começa: os ecrãs avançam sozinhos e voltam ao início no fim, sem ninguém lhe tocar. O comando da televisão chega para tudo — as setas avançam e recuam, o OK põe em pausa e continua. Em Apresentação, no painel de administração, tem os dois endereços com um botão para copiar cada um.',
      },
      {
        kind: 'improvement',
        title: 'A apresentação diz melhor o que muda no dia a dia',
        detail:
          'A parte final ganhou dois pontos novos — a equipa deixa de andar a perguntar horários, e as faturas antigas encontram-se em dois toques — e no fim há agora um resumo com as quatro ideias que vale a pena levar da conversa.',
      },
    ],
  },
  {
    version: '2026.09.19',
    date: '2026-09-19',
    entries: [
      {
        kind: 'improvement',
        title: 'Digitalizar faturas ficou muito melhor',
        detail:
          'A câmara passa a encontrar sozinha os limites do papel enquanto aponta, e endireita a fotografia por si — mesmo que a tire de lado ou um pouco torta. Depois pode acertar o corte pelos cantos, rodar, e escolher como quer a imagem: normal, realçada (a melhor para talões de caixa desbotados), cinzentos ou preto e branco. Quanto melhor a fotografia, melhor os valores saem certos.',
      },
      {
        kind: 'fix',
        title: 'Exportar para Excel já não prende o telemóvel',
        detail:
          'No iPhone, exportar o histórico de receitas ou de custos levava-o para um ecrã com o ficheiro e só a opção de o abrir noutra aplicação — sem maneira de voltar atrás. Agora o ficheiro é simplesmente guardado e fica onde estava, sem sair da página. O nome do ficheiro passa também a trazer as datas do período exportado, para não ficar com vários iguais na pasta das transferências.',
      },
      {
        kind: 'improvement',
        title: 'O botão + já pergunta o que quer registar',
        detail:
          'No painel, o botão + ia sempre dar à receita, o que só servia para metade das vezes — a outra metade é uma fatura de fornecedor na mão. Agora pergunta primeiro o que quer registar, o ticket diário ou uma despesa, e depois se prefere escrever os valores ou tirar uma fotografia. São dois toques até ao sítio certo, em vez de um toque e depois procurar.',
      },
      {
        kind: 'improvement',
        title: 'A câmara tira a fotografia sozinha, já recortada',
        detail:
          'Aponte para a fatura e não faça mais nada: assim que o documento fica quieto no ecrã, a fotografia é tirada sem precisar de carregar em nada — dá jeito quando tem o telemóvel numa mão e o papel na outra. A página aparece logo recortada e endireitada, sem a mesa nem o que estiver à volta. Se o corte não ficar como queria, "Ajustar recorte" continua lá para acertar os cantos, e o botão de tirar a fotografia também, para quando preferir ser você a escolher o momento.',
      },
      {
        kind: 'improvement',
        title: 'Os dias fechados já se percebem no horário',
        detail:
          'Nos dias em que o restaurante está fechado, cada pessoa passa a ter "Folga" escrito no lugar do turno, num quadrado tracejado que não se confunde com um turno a sério. Em baixo, a nota dos dias encerrados passa a dizer também o dia e o mês — "Seg 21/9" em vez de só "Seg" —, para que ninguém se engane na semana quando a imagem for reencaminhada no WhatsApp.',
      },
      {
        kind: 'fix',
        title: 'Os meses da comparação já se leem pelo nome',
        detail:
          'Em Análises › Comparação, o detalhe mensal mostrava "04/26" em vez do mês. Agora diz "Abril 2026", por extenso e com o ano à frente — e escreve o mês na língua em que está a usar a aplicação.',
      },
      {
        kind: 'new',
        title: 'Fotografar várias faturas de seguida',
        detail:
          'Ao fim de cada fotografia pode escolher entre juntar mais uma página à mesma fatura, ou começar uma fatura nova. Assim trata das faturas todas de uma vez, sem sair da câmara, e uma fatura de duas ou três folhas fica como um só documento. Serve tanto para faturas de fornecedor como para os fechos de caixa.',
      },
    ],
  },
  {
    version: '2026.09.13',
    date: '2026-09-13',
    entries: [
      {
        kind: 'new',
        title: 'Turnos partidos nos horários',
        detail:
          'Marque o almoço e o jantar como um só turno, com a tarde de folga pelo meio: entra às 12:00, pausa das 15:00 às 19:00, sai às 23:00. As horas da semana contam só o tempo trabalhado, sem a pausa, e a imagem que envia no WhatsApp mostra os dois períodos para ninguém aparecer à hora errada. Pode guardar um turno partido para reutilizar, como qualquer outro.',
      },
      {
        kind: 'new',
        title: 'Pedir ajuda sem sair da aplicação',
        detail:
          'Em Definições › Suporte pode escrever-nos: uma dúvida, um problema, uma sugestão ou algo sobre a faturação. A resposta aparece nessa mesma página, por baixo do pedido, com a indicação de se já foi vista, está a ser tratada ou ficou resolvida.',
      },
      {
        kind: 'new',
        title: 'Uma visita guiada para quem entra pela primeira vez',
        detail:
          'Quem abre a conta pela primeira vez passa por uma visita curta que aponta para os sítios que interessam: onde se lança a receita do dia, onde entram as faturas, onde estão as margens e os horários. São poucos passos e pode saltar a qualquer momento — se saltar, não volta a aparecer.',
      },
      {
        kind: 'new',
        title: 'A aplicação fala inglês, e lembra-se da sua escolha',
        detail:
          'Até agora só a página inicial e algumas partes estavam traduzidas; o resto aparecia sempre em português. Agora funciona tudo nas duas línguas — horários, ementas, IVA, conformidade, relatórios, planos, contactos, recuperação de palavra-passe e mensagens de erro. A escolha fica guardada na sua conta, por isso mantém-se ao entrar noutro telemóvel ou computador, e deixa de haver aquele instante em que a página aparece na língua errada. A página inicial continua em português para quem chega de novo, e qualquer visitante pode trocar.',
      },
      {
        kind: 'fix',
        title: 'A palavra-passe já pede o mesmo em todo o lado',
        detail:
          'Ao criar ou alterar a palavra-passe, o formulário aceitava seis caracteres mas depois era recusada por serem precisos oito — sem explicação clara. Passa a pedir oito desde o início, em todos os ecrãs.',
      },
      {
        kind: 'improvement',
        title: 'Os turnos partidos indicam-se pelas horas trabalhadas',
        detail:
          'Antes marcava a entrada, a saída e depois descrevia a pausa ao meio, o que obrigava a fazer as contas ao contrário. Agora indica simplesmente os dois períodos em que a pessoa trabalha — 09:00–15:00 e 19:00–00:00 — e a pausa fica subentendida. As horas da semana continuam a contar só o tempo trabalhado.',
      },
      {
        kind: 'fix',
        title: 'O zoom já não desalinha a aplicação no telemóvel',
        detail:
          'Um toque com dois dedos sem querer deixava a aplicação ampliada e torta, com o topo cortado e os botões de baixo fora do ecrã, sem forma óbvia de voltar ao normal.',
      },
      {
        kind: 'fix',
        title: 'Descarregar o horário já não o tira da aplicação',
        detail:
          'No telemóvel, descarregar a imagem do horário abria um ecrã com o ficheiro e deixava-o preso lá, sem forma de voltar atrás. A aplicação fica agora onde estava e a imagem é guardada ou partilhada por cima.',
      },
      {
        kind: 'fix',
        title: 'Os turnos sugeridos deixam de desaparecer',
        detail:
          'Ao guardar o primeiro turno seu, as sugestões Manhã, Tarde e Noite desapareciam da lista, o que parecia que tinham sido apagadas. Passam a estar sempre disponíveis, ao lado dos seus, marcadas como sugestões. Nenhum turno chegou a ser apagado.',
      },
      {
        kind: 'new',
        title: 'Copiar o horário direto para o WhatsApp',
        detail:
          'Em Horários, o botão "Copiar imagem" põe o horário da semana na área de transferência: abre a conversa do WhatsApp e cola, sem passar por ficheiros. A confirmação diz que semana foi copiada, para não enviar a errada. Ao lado, "Descarregar" guarda a imagem — no telemóvel abre a partilha, com o WhatsApp a um toque.',
      },
      {
        kind: 'improvement',
        title: 'O gráfico de comparação mensal ficou mais fácil de ler',
        detail:
          'Em Análises › Comparação, as barras de cada mês eram largas de mais e sobrava espaço vazio por cima delas. Passam a ser mais estreitas e agrupadas por mês, e a escala acompanha os seus números em vez de esticar até um valor redondo muito acima do maior mês. Os meses com prejuízo aparecem agora abaixo da linha do zero, bem visíveis.',
      },
    ],
  },
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
