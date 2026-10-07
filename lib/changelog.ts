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
export const CHANGELOG_VERSION = '2026.10.08.1';

export const CHANGELOG: Release[] = [
  {
    version: '2026.10.08.1',
    date: '2026-10-08',
    entries: [
      {
        kind: 'new',
        title: 'As bebidas passam a ter margem, como qualquer prato',
        detail:
          'Uma Super Bock não é um ingrediente, é um produto: vende-se tal como se compra. Até agora ficava em Preços sem preço de venda, e quase um quarto da receita não tinha margem em sítio nenhum. Agora está na Ementa com o preço a que vende, o IVA certo — 23% no álcool, 13% no resto — e o custo da garrafa por baixo, a contar nas médias ao lado dos hambúrgueres.',
      },
      {
        kind: 'new',
        title: 'Diga que linha da factura é o seu ingrediente',
        detail:
          'O fornecedor escreve "Carne Picada Novilho" e na cozinha é o "Piano Carne" — nomes que nunca se encontravam sozinhos, e o ingrediente ficava à espera de um preço que já estava no sistema. Abra o ingrediente, em "Nomes nas facturas", e marque o que é seu. O preço entra na hora, e pode marcar mais do que um.',
      },
      {
        kind: 'improvement',
        title: 'Ver a factura a partir do histórico de custos',
        detail:
          'Cada custo que veio de uma digitalização tem agora um olho que abre a fotografia da factura, sem sair da página.',
      },
      {
        kind: 'improvement',
        title: 'Saber quantos ingredientes vêm de cada linha',
        detail:
          'Em Contabilidade › Linhas, uma linha que alimenta mais do que um ingrediente passa a dizer quantos — uma caixa de carne costuma ser o hambúrguer e a dose extra.',
      },
      {
        kind: 'new',
        title: 'Arraste entre as duas colunas',
        detail:
          'Se um produto estiver do lado errado, arraste-o para o outro. Ao passar para unitários pergunta a que preço o vende, porque sem preço não há margem; ao passar para ingredientes avisa que sai da Ementa antes de o fazer. Quem não quiser arrastar tem o mesmo numa seta em cada linha.',
      },
      {
        kind: 'improvement',
        title: 'A aba Ingredientes passou a Produtos, em duas colunas',
        detail:
          'Tem lá tudo o que a casa compra, mas não é tudo a mesma coisa: de um lado os ingredientes, que se compram ao quilo ou ao litro e entram nas receitas; do outro os unitários, que se compram à unidade ou em pack e se vendem tal como vêm. Cada um com o seu ícone, para se ver num relance qual é qual.',
      },
      {
        kind: 'fix',
        title: 'Responder à pergunta ficou a um toque',
        detail:
          'O aviso dizia para abrir cada produto, mas o sítio mais à mão abria o custo da garrafa e não a pergunta. Agora a pergunta está na própria linha, com dois botões — "a cozinha faz" ou "vende-se como se compra" — e as bebidas passaram a mostrar o custo, a margem e o food cost como os pratos.',
      },
      {
        kind: 'new',
        title: 'Diga quais é que a cozinha faz',
        detail:
          'Um batido leva ingredientes, uma cerveja não, e a caixa registadora não sabe a diferença — só regista o que vendeu. Por isso em Análises › Ementa cada produto tem agora duas opções: "a cozinha faz" ou "vende-se como se compra". Os que trouxemos da caixa ficam marcados até dizer, e um aviso em cima leva-o a eles.',
      },
      {
        kind: 'improvement',
        title: 'A lista de ingredientes voltou a ser de ingredientes',
        detail:
          'As garrafas e os cafés saíram do meio da alface, do bacon e do pão. Continuam a dar-se para editar — ficam num grupo à parte, no fim da lista, com o que cada um custou.',
      },
      {
        kind: 'fix',
        title: 'Uma garrafa de meio litro conta como uma garrafa',
        detail:
          'A "AGUA 0.5L" estava a contar-se ao litro por causa do nome, e uma fatura de garrafas teria ficado com metade do custo real. Passa a contar-se à unidade. Nenhuma receita que já estivesse escrita foi tocada.',
      },
      {
        kind: 'fix',
        title: 'Trazer a carta da caixa funciona em qualquer sistema',
        detail:
          'Antes só reconhecia as bebidas se a família na caixa se chamasse BEBIDAS ou CAFETARIA. Agora olha para o que a caixa cobrou: o que levou dinheiro é um produto, o que ringe a zero é um extra que vai dentro de outra coisa. Funciona com qualquer nomenclatura — e os molhos continuam ingredientes mesmo quando são vendidos como extra pago.',
      },
    ],
  },
  {
    version: '2026.10.07.3',
    date: '2026-10-07',
    entries: [
      {
        kind: 'improvement',
        title: 'A aba das faturas mostra faturas, não linhas de produto',
        detail:
          'Em Contabilidade › Faturas passa a ver uma fatura por linha: o número do documento, o fornecedor, a data, o total e quantas linhas tem. Os ícones ao lado abrem a fotografia ou eliminam a fatura com os dados que ela alimentou. A lista por produto continua ao lado, em Linhas.',
      },
      {
        kind: 'fix',
        title: 'O recorte deixou de agarrar o QR code',
        detail:
          'Ao fotografar uma fatura, o recorte automático às vezes agarrava o quadrado do QR em vez da folha. Agora verificamos que o que foi encontrado tem forma de página — e quando não tem, abre a folha inteira para ajustar à mão, em vez de um canto dela.',
      },
      {
        kind: 'improvement',
        title: 'Perguntamos quando a embalagem levanta dúvidas',
        detail:
          'Uma embalagem de 1 kg entra como 1 kg sem perguntar nada. Mas quando é um balde de 5,7 kg ou garrafas de 1,5 L, as duas leituras fazem contas certas e só o dono sabe qual quer — por isso mostramos as duas e escolhe. Um engano aqui punha 16,99 o quilo em algo que custou 2,98.',
      },
      {
        kind: 'improvement',
        title: 'Uma embalagem de 1 kg entra como 1 kg',
        detail:
          'Quando a fatura diz "TOPPING MORANGO 1KG" e cobra uma embalagem, passamos a guardar um quilo e não uma unidade. Assim uma receita que leve 50 g consegue calcular o custo — com "unidades" não conseguia. O ketchup de 5,7 kg fica a 2,98 o quilo, e o total da fatura não muda.',
      },
      {
        kind: 'improvement',
        title: 'Ligar uma linha da fatura a vários ingredientes, sem andar à procura',
        detail:
          'Ao digitalizar uma fatura, cada linha mostra também os ingredientes parecidos — a carne picada traz a Carne Smash e a Extra Carne para marcar com um toque. Para qualquer outro, escreva parte do nome na caixa de procura em vez de percorrer a lista inteira.',
      },
      {
        kind: 'new',
        title: 'Ver a fatura por trás de cada número',
        detail:
          'Em Contabilidade, cada linha tem um ícone que abre a fotografia da fatura. O mesmo no histórico de preços de um ingrediente: clicar num preço mostra o documento onde ele aparece, sem sair do sítio onde estava.',
      },
      {
        kind: 'new',
        title: 'Eliminar uma fatura e o que ela alimentou',
        detail:
          'A partir da fatura aberta pode eliminá-la. Saem as linhas, sai o custo do historial, e os ingredientes que tinham o preço dessa fatura voltam ao preço da anterior — em vez de ficarem com um valor de um documento que já não existe.',
      },
      {
        kind: 'improvement',
        title: 'As faturas mais recentes primeiro, quinze de cada vez',
        detail:
          'A lista começa nas quinze mais recentes, com um botão para mostrar mais.',
      },
      {
        kind: 'new',
        title: 'O mapa de férias, pronto a afixar',
        detail:
          'Em Equipa › Férias, o mapa de férias do ano sai numa folha A4 com o nome e o NIF do restaurante, as férias de cada colaborador num calendário do ano, os dias úteis e o lugar para assinar. A lei pede que esteja afixado de 15 de abril a 31 de outubro. Pode pré-visualizá-lo antes de descarregar o PDF.',
      },
      {
        kind: 'fix',
        title: 'As explicações dos valores já não ficam cortadas',
        detail:
          'Na demonstração de resultados anual, a explicação que aparece ao passar sobre o "i" ficava escondida atrás do cabeçalho da tabela. Agora aparece sempre por cima de tudo.',
      },
    ],
  },
  {
    version: '2026.10.06.5',
    date: '2026-10-06',
    entries: [
      {
        kind: 'fix',
        title: 'Apagar um custo apaga também a sua fatura',
        detail:
          'Apagar um custo deixava as linhas da fatura em Contabilidade, por isso via um custo no historial e duas faturas no arquivo. Já desaparecem as duas coisas, e as linhas que tinham ficado para trás foram removidas.',
      },
      {
        kind: 'fix',
        title: 'Um fornecedor, não quatro',
        detail:
          'O mesmo talho aparecia quatro vezes, com nomes diferentes, porque cada leitura da fatura apanhava o nome de outra maneira. Agora reconhecemos o fornecedor pelo NIF, e em Contabilidade › Arrumar pode juntar os que já ficaram repetidos.',
      },
      {
        kind: 'improvement',
        title: 'Os preços dizem de que unidade falam',
        detail:
          'Em Contabilidade, o preço unitário passa a trazer a unidade: €9,90/kg em vez de €9,90. Nove euros e noventa o quilo e nove euros e noventa a caixa são compras diferentes.',
      },
      {
        kind: 'new',
        title: 'O histórico de preço de cada ingrediente',
        detail:
          'Ao abrir um ingrediente, uma secção que se abre e fecha mostra o que pagou de cada vez, com a data e a subida ou descida face à compra anterior. Clicar numa linha leva à fatura que lhe deu origem.',
      },
      {
        kind: 'improvement',
        title: 'Procurar nas listas longas',
        detail:
          'A lista de ingredientes passou dos noventa e o historial de custos pode ter um ano inteiro. Ambos têm agora uma caixa de procura — escreve "bacon" e aparece o que interessa. Ignora acentos, por isso "pao" encontra "PÃO".',
      },
      {
        kind: 'new',
        title: 'Avisamos quando a fotografia não dá para ler',
        detail:
          'Antes de digitalizar, olhamos para a fotografia: se estiver desfocada ou demasiado escura, pedimos outra e dizemos porquê. Uma fatura tremida não dá erro — devolve nomes quase certos e valores quase certos, e isso é pior do que não devolver nada.',
      },
      {
        kind: 'fix',
        title: 'A mesma fatura já não se regista duas vezes',
        detail:
          'Se digitalizar uma fatura que já lançou, mostramos qual é — fornecedor, número e data — antes de gravar seja o que for. Antes o custo entrava à mesma e só as linhas eram recusadas.',
      },
      {
        kind: 'improvement',
        title: 'As quantidades das faturas de grossista',
        detail:
          'Numa fatura de cash-and-carry cada linha traz duas quantidades — o peso e o número de embalagens. Já distinguimos: a costelinha a 3,840 kg fica a 5,49 o quilo, e o ketchup de 5,7 kg fica como uma embalagem a 16,99. Antes trocávamos as colunas e o custo por quilo saía errado.',
      },
      {
        kind: 'improvement',
        title: 'A data e o número vêm do QR code da fatura',
        detail:
          'As faturas portuguesas certificadas trazem um QR com a data, o número do documento, o NIF e o total — assinados pelo sistema de faturação. Passámos a lê-lo: numa fotografia tremida, estes valores deixam de depender do que se consegue ver no papel.',
      },
      {
        kind: 'fix',
        title: 'A mesma fatura já não entra duas vezes',
        detail:
          'Se digitalizar a mesma fatura outra vez, avisamos em vez de duplicar as linhas — que fariam a mercadoria parecer o dobro do que foi comprada.',
      },
      {
        kind: 'new',
        title: 'Contabilidade: todas as faturas num sítio',
        detail:
          'Uma página nova no menu. Todas as linhas de todas as faturas digitalizadas, com o preço de cada produto, o fornecedor e o número do documento — e pode procurar por produto ou por fatura. Mostra também quanto já pagou a cada fornecedor, e o que ainda falta identificar.',
      },
      {
        kind: 'improvement',
        title: 'Ao digitalizar, perguntamos o que é cada linha',
        detail:
          'Antes criávamos um ingrediente novo por cada nome que o fornecedor usa. Agora mostramos as hipóteses — "Carne Picada Novilho" sugere a sua "Carne Smash" — e basta confirmar uma vez. Pode ligar a mais do que um, porque a mesma carne serve o hambúrguer e o extra.',
      },
      {
        kind: 'new',
        title: 'Juntar ingredientes repetidos',
        detail:
          'Em Contabilidade › Arrumar. Quando trouxemos os produtos do sistema de caixa ficou com "EXTRA CARNE" ao lado de "Carne Smash" para a mesma carne. Agora pode juntá-los: o nome mantém-se e o custo passa a ser um só.',
      },
      {
        kind: 'improvement',
        title: 'As faturas passam a alimentar os seus ingredientes',
        detail:
          'Ao digitalizar uma fatura, cada linha fica guardada com o preço por quilo e o fornecedor, e liga-se aos ingredientes que já tem — o "Carne Picada Novilho" do talho passa a ser a sua "Carne Smash". Perguntamos uma vez por produto novo e nunca mais. Uma linha pode alimentar vários ingredientes, porque a mesma carne serve o hambúrguer e o extra. Daqui vêm os avisos de subida de preço e o custo real dos pratos.',
      },
      {
        kind: 'improvement',
        title: 'A derrama do seu município, com as taxas oficiais',
        detail:
          'Em Configurações › Restaurante procure o município onde paga a derrama. A estimativa de IRC passa a usar as taxas que a Autoridade Tributária publicou para cada um dos 308 municípios — incluindo os que não cobram nada. Em Estado › IRC › Pressupostos escolhe se lhe cabe uma taxa reduzida ou uma isenção, com a condição de cada uma ao lado e o seu volume de negócios do ano anterior para comparar.',
      },
    ],
  },
  {
    version: '2026.10.06.4',
    date: '2026-10-06',
    entries: [
      {
        kind: 'fix',
        title: 'Digitalizar faturas voltou a funcionar',
        detail:
          'Fotografar uma fatura dava "Scanner de documentos indisponível". O leitor estava a funcionar — era só a parte do cliente que procurava outro serviço, nunca ligado. Já lê as faturas e os relatórios do dia.',
      },
      {
        kind: 'improvement',
        title: 'Talões digitalizados com papel branco, sem sombras',
        detail:
          'O filtro Realçado agora limpa a sombra da mão e o fundo mais escuro de um talão comprido, e tira o amarelo do papel térmico: fica papel branco e letra preta de uma ponta à outra. O Preto e branco também deixou de perder a letra na parte mais escura.',
      },
    ],
  },
  {
    version: '2026.10.06.3',
    date: '2026-10-06',
    entries: [
      {
        kind: 'improvement',
        title: 'A ementa arrumada por secções, com pesquisa',
        detail:
          'Em Análises › Ementa os pratos aparecem agrupados pelas secções da carta — Menus, Hambúrgueres, Bebidas — com atalhos no topo para saltar para cada uma e uma caixa para procurar um prato pelo nome.',
      },
      {
        kind: 'improvement',
        title: 'Os ingredientes de cada prato à vista, para mexer ali mesmo',
        detail:
          'Já não é preciso abrir o prato: as quantidades mudam-se na própria lista, e para juntar um ingrediente basta começar a escrever o nome e escolhê-lo. Só aparecem as unidades que fazem sentido para o que está a comprar.',
      },
      {
        kind: 'new',
        title: 'Um ingrediente em vários pratos de uma vez',
        detail:
          'Carregue em Selecionar, marque os pratos — ou uma secção inteira — e adicione o pão, o molho ou o copo a todos de uma só vez.',
      },
      {
        kind: 'fix',
        title: 'A quantidade volta a ver-se quando junta um ingrediente',
        detail: 'A caixa da unidade ocupava a linha toda e escondia o número que estava a escrever.',
      },
    ],
  },
  {
    version: '2026.10.06.2',
    date: '2026-10-06',
    entries: [
      {
        kind: 'new',
        title: 'O mapa da sua carta',
        detail:
          'Em Análises › Ementa há agora um mapa: cada prato ligado ao que leva, e os ingredientes partilhados a puxar os pratos uns para os outros — vê-se logo quando meia carta depende do mesmo pão. Os pratos ainda sem receita ficam de fora, sozinhos, a mostrar o que falta fazer. Abre no computador, onde há espaço para lhe mexer.',
      },
      {
        kind: 'new',
        title: 'A sua carta vem do sistema de caixa',
        detail:
          'Na Ementa há agora um botão que traz os produtos que já importou das vendas: o que a cozinha compõe entra como prato com o preço real a que vende, e o que se compra tal como se vende — bebidas, molhos, ingredientes — entra em Preços à espera do custo das faturas. Mostra o que vai fazer antes de confirmar. Depois é só abrir cada prato e dizer o que leva.',
      },
      {
        kind: 'new',
        title: 'Custos fixos que se lançam sozinhos todos os meses',
        detail:
          'Ao registar um custo em Custos › Inserir, marque "Repete todos os meses" — renda, internet, um contrato de 12 meses — e escolha o dia do mês e por quantos meses. A aplicação lança-o sozinha nesse dia, mesmo nos meses em que não abrir a aplicação. Por baixo do formulário vê os custos fixos em curso e pode mudar o valor ou terminá-los; os meses já lançados ficam como estão.',
      },
    ],
  },
  {
    version: '2026.10.06.1',
    date: '2026-10-06',
    entries: [
      {
        kind: 'fix',
        title: 'A sua foto de perfil aparece mesmo',
        detail:
          'Carregar a foto dizia que tinha sido guardada — e tinha —, mas continuava a aparecer a inicial em todo o lado. Já se vê no menu lateral, nas definições e na lista da equipa, onde cada colega aparece com a sua.',
      },
      {
        kind: 'new',
        title: 'Relatório anual, e estimativa de impostos no PDF',
        detail:
          'O relatório em PDF já pode cobrir o ano inteiro, não só um mês. Em qualquer dos dois vem agora uma estimativa do IVA — o que liquidou nas vendas, o que pode deduzir nas compras e o que sobra para entregar. No anual junta-se o IRC estimado. São estimativas para planear, não substituem a declaração do contabilista. Em Análises › Relatório.',
      },
      {
        kind: 'new',
        title: 'Os produtos mais vendidos no relatório',
        detail:
          'O PDF passa a incluir dois tops de dez: por receita, que mostra o que sustenta o negócio, e por unidades, que mostra o que a cozinha mais produz. São listas diferentes e é isso que as torna úteis.',
      },
      {
        kind: 'fix',
        title: 'A data nos formulários deixou de aparecer ao centro',
        detail:
          'No iPhone o campo da data aparecia centrado enquanto os restantes começavam à esquerda, o que parecia um erro. Já alinha com os outros.',
      },
      {
        kind: 'improvement',
        title: 'O peso de cada linha na demonstração de resultados',
        detail:
          'Cada linha do P&L mensal mostra agora duas percentagens: quanto pesa na receita — a que se compara com os valores de referência do setor — e quanto pesa dentro da sua secção, que diz onde o COGS ou as despesas se gastam de facto. Em Análises › P&L.',
      },
      {
        kind: 'improvement',
        title: 'No telemóvel, o P&L anual abre no ano',
        detail:
          'Carregar em Anual mostrava o mês em curso e os totais do ano não eram alcançáveis no telemóvel. Agora abre no ano inteiro, e o mês continua a um toque no mesmo seletor.',
      },
      {
        kind: 'fix',
        title: 'Os separadores já deslizam no telemóvel',
        detail:
          'Em Análises os últimos separadores ficavam fora do ecrã sem forma de lá chegar. A barra desliza, e o separador escolhido aparece sozinho.',
      },
      {
        kind: 'fix',
        title: 'Fechar os valores de um mês no gráfico',
        detail:
          'Nos gráficos do Painel, tocar num mês abria os valores e nada os fechava — tapavam o próprio gráfico. Agora fecham com um toque fora, ou tocando outra vez no mesmo mês.',
      },
      {
        kind: 'fix',
        title: 'Em Custos só se registam custos',
        detail:
          'O ecrã de digitalizar dentro de Custos deixava escolher Relatório Diário, que é receita. A escolha desapareceu: cada separador digitaliza o que lhe diz respeito.',
      },
    ],
  },
  {
    version: '2026.10.05.5',
    date: '2026-10-05',
    entries: [
      {
        kind: 'new',
        title: 'Os seus produtos, um a um',
        detail:
          'Em Análises › Produtos pode procurar qualquer produto e ver quantos vendeu em cada mês do ano. A tabela mostra todos, do que mais rende ao que menos, com o peso de cada um na receita — e no topo, o mais vendido e o menos vendido. Vem dos ficheiros de vendas por produto que importa do seu POS.',
      },
      {
        kind: 'new',
        title: 'Os ingredientes que a cozinha mais prepara',
        detail:
          'No Painel, um ranking dos dez extras mais pedidos nos últimos 12 meses. Como não têm preço próprio, contam-se por vezes pedidas — serve para saber o que ter preparado e o que deixar de encomendar. Tomou o lugar do Lucro Líquido, que o P&L já mostra com mais detalhe.',
      },
      {
        kind: 'improvement',
        title: 'Quantos dias de trabalho já foram, e onde o mês vai acabar',
        detail:
          'O cartão da receita no Painel diz agora quantos dias de trabalho já passaram este mês e quantos faltam, a média por dia, e uma estimativa de onde o mês fecha se os dias que faltam correrem como os que já foram. Conta dias de trabalho, não dias do calendário: os dias que marcou como fechados não entram na média.',
      },
    ],
  },
  {
    version: '2026.10.05.4',
    date: '2026-10-05',
    entries: [
      {
        kind: 'improvement',
        title: 'O logótipo do seu restaurante em toda a aplicação',
        detail:
          'O logótipo que carrega em Configurações aparece agora no menu lateral, na barra de cima (também no telemóvel), no topo do Painel e na imagem do horário enviada à equipa. Sem logótipo, aparecem as iniciais do restaurante — e o menu lateral leva-o direto ao sítio onde o pode carregar.',
      },
    ],
  },
  {
    version: '2026.10.05.3',
    date: '2026-10-05',
    entries: [
      {
        kind: 'improvement',
        title: 'Para onde foi o dinheiro, mês a mês',
        detail:
          'No Painel, os custos por categoria deixaram de mostrar só o mês atual: agora são um gráfico do ano inteiro, igual ao do que se vendeu, com cada mês repartido pelas suas categorias de custo e o peso de cada uma no ano.',
      },
      {
        kind: 'improvement',
        title: 'Escolher o ano em cada gráfico do Painel',
        detail:
          'O que se vendeu e para onde foi o dinheiro têm agora as suas próprias setas de ano, independentes do gráfico da receita — pode comparar as vendas deste ano com os custos do ano passado.',
      },
      {
        kind: 'improvement',
        title: 'No telemóvel, toque num mês para ver os valores',
        detail:
          'Nos gráficos do Painel, tocar numa barra mostra os valores desse mês, como passar o rato no computador.',
      },
    ],
  },
  {
    // A second release the same day: the first had already gone out, and
    // adding to it would leave the unread dot dark for anyone who opened it.
    version: '2026.10.05.2',
    date: '2026-10-05',
    entries: [
      {
        kind: 'new',
        title: 'Férias da equipa, contadas como manda a lei',
        detail:
          'Em Equipa › Férias, um calendário do mês mostra quem está fora, e por baixo cada colaborador tem os dias a que tem direito, os marcados, os gozados e os que ainda faltam. Contam-se dias úteis (segunda a sexta, sem feriados): 22 por ano, menos no ano de entrada, e o que sobra pode ser gozado até 30 de abril. Indique a data de entrada de cada um para o primeiro ano ficar certo. Quem está de férias aparece assim no horário e na imagem enviada à equipa.',
      },
      {
        kind: 'improvement',
        title: 'Receita e custos lado a lado, mês a mês',
        detail:
          'No Painel, o gráfico da receita por canal deu lugar a duas barras por mês: o que entrou e o que saiu, com os totais do ano por cima e a diferença de cada mês ao passar o rato. O gráfico do que se vendeu tem barras mais finas e cores mais fáceis de distinguir, com o peso de cada categoria no ano.',
      },
      {
        kind: 'improvement',
        title: 'Voltar à semana atual num toque',
        detail:
          'Em Horários, o botão "Esta semana" está sempre à vista. Na vista de mês, abre o mês atual e leva-o diretamente à semana de hoje, que fica destacada.',
      },
    ],
  },
  {
    version: '2026.10.05',
    date: '2026-10-05',
    entries: [
      {
        kind: 'improvement',
        title: 'Ver o mês inteiro no horário',
        detail:
          'Em Horários, no computador, escolha "Mês" para ver as semanas do mês umas por baixo das outras — Semana 1, Semana 2, e assim por diante. Cada semana tem os seus botões, para copiar e enviar à equipa só a que precisa. No telemóvel o horário continua por semana.',
      },
      {
        kind: 'improvement',
        title: 'O IVA das vendas vem do seu sistema de caixa',
        detail:
          'Em Estado › IVA, nos dias em que as vendas foram importadas da caixa, o IVA liquidado é o que a caixa realmente cobrou, família a família — já não é repartido pelos pressupostos. Os pressupostos só contam para os dias registados à mão, só com o total, e a página diz qual é qual. O IRC passa a usar as mesmas vendas sem IVA.',
      },
      {
        kind: 'improvement',
        title: 'O fim de semana destaca-se no horário',
        detail:
          'Sábado e domingo aparecem num tom diferente, no ecrã e na imagem enviada à equipa, para se encontrarem num relance.',
      },
    ],
  },
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
