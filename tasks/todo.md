# Orçamento anual (substitui "Metas")

## Situação hoje (2026-10-24)
- Análises › Metas guarda um único número (`Restaurant.monthlyRevenueTarget`)
  igual para todos os meses. Não há plano de custos nem comparação.
- O erro do ecrã: o € fica por cima do valor porque `.input-field` (fora de
  `@layer`) repõe `px-4` e anula o `pl-8`. O mesmo defeito existe em
  `admin/page.tsx:606`, `UserManagementPanel.tsx:93`,
  `MunicipalityPicker.tsx:106` (os outros já usam `!pl-`).
- Outro erro escondido: o progresso compara com a receita do período
  selecionado no topo (pode ser "esta semana"), não com a do mês.

## Proposta
Um orçamento por ano, organizado nas mesmas bandas do P&L (USAR): Receita,
Custo das mercadorias, Pessoal, Despesas operacionais, Ocupação → Resultado.

1. **Orçamento base** — 12 meses por linha. Linhas por categoria (as mesmas
   do P&L, para comparar linha a linha) + linhas livres.
   - Custo das mercadorias pode ser planeado como **% da receita**: se a
     receita mudar, o custo acompanha.
2. **Importar do ano anterior** — preenche a partir do P&L real de N-1, com
   um ajuste opcional (ex.: +5%). Escolher quais bandas importar (por omissão
   todas). Meses sem dados ficam a 0, sinalizados.
3. **Simulações** ("e se…") — itens que se ligam/desligam por cima do base:
   - Contratar pessoa: salário bruto, mês de entrada → custo mensal =
     bruto × 14/12 × (1 + 23,75% TSU) + subsídio de alimentação.
   - Comprar equipamento: valor e mês; pago de uma vez ou repartido por N
     meses.
   - Novo custo fixo mensal (ex.: renda, software) a partir de um mês.
   - Variação de receita (% a partir de um mês, ex.: preços +3%).
   - Variação de custo de mercadorias (% , ex.: fornecedor +5%).
   Mostra lado a lado: Base, Com simulações, e a diferença no resultado anual.
4. **Comparação** — Orçado vs Real por mês e acumulado do ano (YTD), por
   banda e por categoria, com desvio € e %.
5. Topo do painel: a meta do mês nos KPIs passa a vir da receita orçada
   desse mês (cai para o valor antigo se não houver orçamento).

## Modelo de dados (migração nova, nada apagado)
- `Budget` (restaurantId, year, único por restaurante+ano)
- `BudgetLine` (budgetId, section, categoryId?, label, months Decimal[12],
  revenuePercent? para linhas em % da receita)
- `BudgetScenarioItem` (budgetId, kind, label, active, parâmetros: amount,
  startMonth, spreadMonths, percent…)
- `monthlyRevenueTarget` fica na tabela (fallback), deixa de ter ecrã.

## Passos
- [x] Corrigir o padding nos campos com ícone (o ecrã de Metas saiu; ficaram
      admin, utilizadores e concelho)
- [x] Prisma: modelos + migração escrita à mão, verificada em PGlite
- [x] `lib/budget.ts`: cálculo puro (base, simulações, comparação) + testes
- [x] `budget-actions.ts`: ler/gravar, importar N-1, CRUD de simulações
- [x] `BudgetPanel.tsx` (desktop: 12 meses em grelha; telemóvel: um mês)
      no lugar de Metas em Análises
- [x] KPIs usam a receita orçada do mês
- [x] Traduções pt + en, glossário, changelog, apresentação
- [x] Tour: sem passo novo (é um ecrã de segunda ordem)
- [x] Testes, typecheck, build, QA visual desktop + telemóvel em pt e en

## Revisão (2026-10-24)
- Migração: esquema do HEAD + SQL novo = esquema novo ("No difference").
- 28 testes novos em `tests/budget.test.ts`; suite completa e build passam.
- Visto no browser: importar 2025 (+5%/+2%), aviso dos meses sem receita,
  editar células, contratação (€1000 brutos → €1649,45/mês) e equipamento
  repartido, comparação Jan–Set, telemóvel 390px, inglês.
- O total do ano é editável: reparte em proporção (mantém a sazonalidade).
- A meta antiga (`monthly_revenue_target`) fica como recurso para o KPI do
  mês enquanto não houver orçamento; sem ecrã para a editar.
- Build local no Node 24 precisa de
  `NODE_OPTIONS="--max-old-space-size=8192 --max-semi-space-size=64"`.

---

# Apresentação: movimento que explica, texto que pergunta

## Situação hoje (2026-10-09)
- A apresentação do admin e o deck de TV partilham dez figuras SVG estáticas
  (`app/components/presentation/figures.tsx`). Só a secção de abertura tem
  um fade de entrada.
- O site público já tem um sistema de animação por entrada em cena
  (`.is-visible` + classes `rf-*` em `globals.css`, `WhenVisible` em
  `app/components/landing/Illustrations.tsx`). As figuras da apresentação
  não o usam.
- O texto é bom mas descritivo: diz o que a figura mostra, não a pergunta
  que a figura responde.

## Plano
- [x] `WhenVisible` partilhado em `app/components/presentation/`. (O landing
      mantém a sua cópia: não valia a pena alargar o âmbito.)
- [x] Cada figura anima uma vez a sua mecânica. Classes `pres-*` em
      `globals.css`, inertes sob `prefers-reduced-motion` (verificado: zero
      elementos escondidos ou a animar com movimento reduzido).
- [x] Deck de TV: confirmado, cada ecrã remonta e a figura anima de novo.
- [x] Painel: secções entram ao chegar ao ecrã; cartões em escada (`--i`).
- [x] Texto: sete perguntas por cima dos títulos, explicações mais diretas,
      pt + en. Títulos mantidos.
- [x] Testes, build, QA visual (admin 1440 + tablet 820, deck /pt 1920).
- [x] Sem números novos, sem claims novos: só o modo de dizer.

## Revisão (2026-10-10)
- Nada de bibliotecas: CSS + IntersectionObserver, como o site já fazia.
- O que vi a mexer no browser: ponteiro a rodar e a parar em "Atenção",
  ingredientes a entrar antes da margem, cascata coluna a coluna.
- Não revisto: o deck em televisão real (só no Chromium a 1920×1080).

---

# Embalagens na fatura + "cérebro" visível no admin

## Situação hoje (2026-10-08)
- "BATATA DOCE 2,5K" não é reconhecido como embalagem de 2,5 kg: o
  `packSizeOf` (`lib/invoice-matching.ts:376`) só aceita `kg|g|l|ml|cl`, não
  `K` sozinho. Sem embalagem não há pergunta, a linha fica "1 un × preço do
  saco" e o `refreshIngredientCosts` grava o preço do saco como preço por kg
  do ingrediente → receitas 2,5× mais caras. O total está certo.
- O prompt do leitor manda explicitamente NÃO dividir pelo tamanho da
  embalagem, e o leitor não devolve o tamanho.
- Mesmo quando a embalagem é lida ("5,7KG"), a pergunta abre em "embalagens"
  e a resposta do dono não fica memorizada: volta a ser perguntada.
- 4 sítios copiam `unitPrice` para `Ingredient.invoiceUnitCost` sem comparar
  unidades (`reconcile-actions.ts:523`, `menu-actions.ts:33`,
  `accounting-actions.ts:654` e `:984`).
- A leitura original (`ReceiptScan.extractedData`) não está ligada às linhas
  gravadas: `receiptScanId` e `linkedEntryId` nunca são escritos. Não dá para
  comparar "o que foi lido" com "o que ficou".

## Plano
1. [x] Leitor: campo novo por linha `packAmount/packUnit` = o que uma
       embalagem contém, lido da descrição. Quantidade e preço continuam como
       faturados. Mesma chamada.
2. [x] `packSizeOf` aceita `K`, `KGR`, `LTR` e multipacks `NxM`.
3. [x] Cérebro aprende embalagens (`InvoiceLineMemory.packAmount/packUnit`).
4. [x] Converte sozinha quando é seguro (memória, ou leitor + descrição de
       acordo, ou embalagem de 1 kg) — com nota e "Contar em embalagens".
       Senão pergunta, aberta em "por kg" se o ingrediente é medido em kg/L.
       Uma pergunta deixada no valor por defeito não é memorizada.
5. [x] `lib/ingredient-costs*.ts`: uma função, os 4 sítios usam-na.
6. [x] `scanId` ligado às linhas (`receiptScanId`) e ao custo (`linkedEntryId`).
7. [x] `ScanCorrection`: fornecedor, data, total, tipo, categoria, embalagem,
       preço unitário — com quem corrigiu (dono / memória / verificação).
       (Ingrediente e "não é ingrediente" ficam de fora: o leitor não os dá.)
8. [x] Admin › Clientes › restaurante › "Cérebro", com "Recalcular custos".
9. [x] Traduções, changelog (fix + improvement), testes, build, QA.
       Apresentação: sem alteração (é uma correção, não uma capacidade nova).
10. [ ] Dados do Daniel: já não precisa de acesso meu — o custo corrige-se
       sozinho quando ele abrir a Ementa, ou pelo botão "Recalcular custos"
       no Cérebro do restaurante. A linha da fatura (1 un × 6,25) está certa
       como faturada e fica.

## Revisão (2026-10-08, embalagens + cérebro)
- 848 testes passam (22 novos em `tests/pack-sizes.test.ts`), typecheck e
  build limpos, detetor de design sem achados.
- Migração verificada em PGlite: esquema anterior + migração = esquema novo.
- QA local com o caso do Daniel recriado: o Cérebro mostrou "Batata doce
  6,25 €/kg → devia ser 2,50 €/kg"; "Recalcular custos" corrigiu-o. No ecrã
  do dono a batata doce veio convertida (5 kg × 2,50 €) e na segunda fatura
  "Já sabíamos que cada embalagem tem 2,5 kg". Encontrado e corrigido no QA:
  respostas por defeito estavam a ser memorizadas.
- Não testado: uma leitura real com o Haiku 5.5 a devolver `packAmount`.

---

# Haiku 5.5 + consola de uso de IA

## Situação hoje (2026-10-08)
- O leitor de faturas corre em `claude-haiku-4-5` ($1 / $5 por MTok).
  Saiu o `claude-haiku-5-5` ($0,10 / $0,50 até 100k tokens), ~30% mais
  tokens pelo mesmo texto → ~87% mais barato por leitura.
- Os scans reais dos donos deitam fora a telemetria (tokens, modelo, duração).
  Só a bancada do admin a guarda. Não sabemos quem gasta quanto.
- `estimateCostUsd` usa um preço fixo: os testes antigos em 4.5 seriam
  mostrados ao preço do 5.5 depois da troca.
- A rota `/api/scan` devolve frases em português para o toast (regra 4).

## Plano
- [x] `lib/ai-models.ts`: tabela de preços por modelo (com o escalão >100k do
      Haiku 5.5) e `costUsd(model, input, output)`. Testes.
- [x] Scanner: `claude-haiku-5-5`, `max_tokens` 8192, `PROMPT_VERSION` novo,
      recusa (`stop_reason: refusal`) como erro próprio com telemetria.
- [x] Tabela `AiUsage` (`ai_usage`): uma linha por chamada ao modelo —
      restaurante, utilizador, origem (scan/bancada), tipo, modelo, tokens,
      custo gravado no momento, duração, sucesso, stop reason. Migração.
- [x] Gravar uso em todos os scans reais (sucesso e falha) e na bancada.
      Gravar nunca pode partir o scan.
- [x] Bancada: custo por run calculado com o modelo de cada run.
- [x] `/api/scan`: erros como chaves, recusa com mensagem própria.
- [x] Separador novo no admin, "Uso de IA": período, KPIs (custo, chamadas,
      tokens, falhas, custo médio), custo por dia, por modelo, ranking de
      donos (com os seus restaurantes) e de restaurantes, tabela de preços.
- [x] Traduções pt + en, testes de paridade e de strings, typecheck, build.
- [x] QA visual desktop + telemóvel.

## Revisão (2026-10-08)
- 826 testes passam (12 novos em `tests/ai-usage.test.ts`), typecheck e
  `next build` limpos.
- Migração verificada num Postgres local (PGlite): esquema anterior + a
  migração nova = esquema novo, `migrate diff` sem diferenças.
- QA visual com dados de teste, desktop pt e telemóvel en, sem erros na
  consola. Corrigido no QA: eixo do gráfico cortado, preços com 4 casas,
  projeção que escondia a descida de preço (agora usa os últimos 7 dias).
- Não testado: uma chamada real ao `claude-haiku-5-5` (não há chave local).
  Falta correr a bancada com faturas reais para comparar a precisão.
- O histórico do consumo só começa com este deploy: os scans antigos não
  guardaram tokens.
- Tour: sem passo novo (só admin). Apresentação: sem alteração.
  Changelog: uma correção (mensagens de erro do scan na língua do dono).

---

# Categorias por linha de fatura + "cérebro" por restaurante

## Situação hoje (2026-10-07)
- A categoria fica na fatura inteira (um `CostEntry`), nunca na linha. Uma
  fatura do Makro com comida, bebidas e detergente vai toda para uma só
  categoria.
- A categoria vem do Haiku como texto livre (`suggestedCategory`). Se esse texto
  não for igual ao nome de uma categoria, fica "Sem categoria". O dono não a vê
  nem a pode corrigir no ecrã de revisão.
- A única coisa que a app aprende é "texto da linha → ingrediente"
  (`InvoiceItemLink`). Não aprende fornecedor → categoria nem linha → categoria.
  As linhas que o dono salta também não ficam memorizadas.
- As linhas de limpeza e embalagens são propostas por defeito como novos
  ingredientes.
- Bug: `taxId?.replace(/D/g, '')` remove a letra D em vez dos não-dígitos
  (`reconcile-actions.ts:316`, `accounting-actions.ts:291`).

## Desenho
**Dinheiro.** Uma fatura passa a dar um `CostEntry` por categoria. Cada um
recebe uma parte do total com IVA, proporcional à soma das suas linhas, e o
arredondamento vai para a parte maior. A P&L continua a ler `CostEntry`, por
isso não muda. Apagar ou abrir a fatura trata todas as partes como um só
documento.

**Linha.** O `InvoiceItem` ganha `categoryId` e `categorySource`
(OWNER | MEMORY | AI | INHERITED).

**Cérebro.** Uma tabela nova, `CategoryMemory`, com restaurante, fornecedor
(opcional), texto normalizado, categoria, número de confirmações e data em que
foi vista pela última vez. A tabela só é escrita quando o dono confirma. Gravar
uma fatura sem mexer numa sugestão conta como confirmação. Corrigir mais tarde
em Contabilidade também ensina.

**Ordem para decidir a categoria de cada linha** (do mais barato para o mais
caro):
1. Memória exata: este texto deste fornecedor (depois de qualquer fornecedor) → certo
2. Memória parecida: semelhança alta com textos já ensinados do mesmo fornecedor → sugerido
3. Hábito do fornecedor: tudo o que veio dele foi para X, com 3 ou mais confirmações (EDP → Luz) → sugerido
4. Haiku: a categoria de cada linha é pedida na mesma chamada que já lê a
   fatura, escolhida de uma lista fechada com as categorias do restaurante.
   Não há chamada extra nem custo extra. → sugerido

**Ingredientes.** Só as linhas de custo de mercadoria (COGS) passam pelo
emparelhamento com ingredientes. As de limpeza deixam de virar ingredientes.

**Ecrã de revisão.**
- Cada linha mostra a sua categoria, com um seletor com pesquisa.
- As linhas aparecem agrupadas por categoria, com subtotal.
- Cada categoria indica se foi "aprendida" ou "sugerida".
- Há um botão para mudar todas as linhas de uma vez.
- Aparece um indicador "12 de 14 linhas já sabia".

**Contabilidade.** Mudar a categoria de uma linha numa fatura antiga move o
valor entre partes e ensina o cérebro.

**Histórico.** As faturas antigas ficam como estão. As suas linhas herdam a
categoria da fatura como INHERITED e não servem de memória, porque uma fatura
do Makro mal categorizada iria ensinar mal.

## Passos
- [x] Schema + migração `20261008090000_invoice_line_categories` (escrita à mão:
      o `prisma migrate diff` local não imprime nada). Linhas antigas → INHERITED.
- [x] `lib/invoice-categories.ts` puro: resolver por camadas + repartir o total
      (cêntimos por maior resto) — 19 testes.
- [x] Scanner: categoria por linha, lista fechada (enum) das categorias do
      restaurante; PROMPT_VERSION 2026-10-08.1. Rota do scan passou a
      `requireMember` (restaurante ativo, não "uma" membership).
- [x] Pré-visualização: aplica o cérebro; fornecedor encontrado pelo NIF primeiro.
- [x] Gravar: todas as linhas ficam (as "não é ingrediente" também, para levar a
      sua parte); `rebalanceInvoice` reparte numa transação; memória escrita.
- [x] UI de revisão: chip de categoria por linha (aprendido / sugerido / falta),
      diálogo com pesquisa, "usar em todas", total por categoria, "já sabia X de Y".
      Linhas OPEX escondem os ingredientes.
- [x] Contabilidade › Linhas: chip por linha → `setInvoiceLineCategory` reparte de
      novo e ensina. Apagar uma parte apaga a fatura toda. Fundir fornecedores
      leva a memória. Linhas OPEX/"não é ingrediente" deixam de contar como
      por identificar e saem da lista de nomes para ligar a ingredientes.
- [x] `/D/g` → `/\D/g` (reconcile-actions, accounting-actions).
- [x] pt/en, changelog (2026.10.08.1), apresentação (passos 2 e 3). Sem passo no
      tour: vive dentro do fluxo de digitalização que já existe.
- [x] tsc, 814 testes, `next build` OK.

## Revisão
- Não verificado no ecrã nem contra dados reais: não há base de dados local.
- O dry-run da migração em produção (BEGIN … ROLLBACK) foi bloqueado pelas
  permissões; fica para correr antes do push.
- Em vez de agrupar as linhas por categoria (reordenava a lista debaixo do
  dedo ao mudar uma), mostra-se o total por categoria por cima.
- O IVA é repartido em proporção ao valor líquido das linhas: estimativa (6% vs
  23%), mas as partes somam sempre o total ao cêntimo.

# Férias dos colaboradores

## Decisões (2026-10-05)
- Na tab **Equipa**, como sub-vista "Férias" ao lado dos acessos. Usa os
  colaboradores dos Horários (sem conta), não os acessos à aplicação.
- Contagem **como a lei** (art. 238.º CT): dias úteis seg–sex, sem feriados
  nacionais. O feriado municipal e o Carnaval não entram.
- 22 dias por ano, vencidos a 1 de janeiro. No ano de admissão, 2 dias por mês
  completo, até 20, gozáveis após 6 meses (art. 239.º); se o ano acabar antes,
  até 30 de junho do ano seguinte, com teto de 30 dias nesse ano.
- O que sobra passa para o ano seguinte até **30 de abril** (art. 240.º).
- As férias aparecem no **horário** (célula "Férias") e na imagem enviada.
- Marcar férias por cima de turnos pede confirmação e remove esses turnos;
  repetir uma semana não marca turnos em dias de férias.

## Feito
- [x] Schema: `ScheduleEmployee.startDate` + modelo `EmployeeLeave`; migração
      `20261005170000_employee_leave` (gerada com `prisma migrate diff`).
- [x] `lib/leave.ts` puro: feriados (Páscoa), dias úteis, direito, saldo com
      transição — 23 testes.
- [x] `leave-actions.ts`: visão do ano, marcar/alterar/remover, data de entrada.
      Erros como chaves.
- [x] Painel Férias (calendário mensal + saldo por colaborador + diálogos) na
      tab Equipa, com sub-vista Acessos. `Dialog` passou a componente partilhado.
- [x] Horários: célula "Férias" na grelha, no telemóvel e na imagem; `setShift`
      recusa dias de férias; repetir semana salta-os.
- [x] pt/en, changelog (release 2026.10.05.2), apresentação. Sem passo no tour.
- [x] tsc limpo, 539 testes, `next build` OK.

## Revisão
- Não verificado no ecrã (sem browser nesta sessão) nem contra dados reais.
- A transição de dias só conta a partir do primeiro ano com férias registadas,
  para quem começa a usar a app não ver +22 dias "do ano passado".
- Feriado municipal, Carnaval e feriados regionais não entram.

# Tab de Horários

## Decisões (2026-09-12)
- Colaboradores próprios do horário, **sem login**.
- Turnos: atalhos pré-definidos **e** horas livres.
- Só para o dono (requireOwner em todas as actions).
- Export JPG por semana para WhatsApp.

## Feito

- [x] Schema: ScheduleEmployee, ShiftTemplate, Shift, ScheduleClosure +
      migração SQL manual.
- [x] `lib/schedule.ts` — aritmética pura de semanas/horas (24 testes).
- [x] `app/dashboard/schedule-actions.ts` — todas com requireOwner.
- [x] Grelha semanal desktop + vista por dia no telemóvel.
- [x] Fechar um dia num toque; repetir a semana X vezes.
- [x] Adicionar/editar/remover colaboradores (soft delete).
- [x] Export JPG via sharp (6 testes).
- [x] Tab + sidebar + TopBar + traduções pt/en.

## Review

### Decisões que vale a pena registar
- **ScheduleEmployee não é User.** O copeiro entra no horário e nunca abre a
  app. Obrigar a email e convite tornava a feature inútil para metade da
  equipa que ela existe para organizar.
- **Minutos desde a meia-noite, não timestamps.** Uma grelha que se repete
  toda a semana não tem nada a ver com fusos nem com a mudança da hora: um
  turno "09:00–17:00" continua 09:00–17:00 para quem o trabalha.
- **Turno que passa da meia-noite.** 17:00→02:00 dá 9h, não −15h. Se fosse
  negativo, o total semanal encolhia à medida que alguém trabalha até mais
  tarde. Está testado.
- **Remover alguém é soft delete.** Os turnos passados ficam; um horário que
  reescreve a história quando uma pessoa sai não é registo de nada. Só os
  turnos futuros é que são apagados, para não mandar à equipa uma imagem com
  o nome de quem já não vem.
- **Copiar semanas não sobrepõe sem avisar.** Deitar fora em silêncio uma
  semana que alguém passou tempo a montar é destruição que nenhum undo
  resolve aqui — pergunta primeiro.
- **Dia fechado é tabela própria.** É um facto sobre o restaurante, não sobre
  uma pessoa, e tem de sobreviver a todos os colaboradores saírem desse dia.
- **A imagem existe porque é assim que os horários circulam.** Uma imagem
  chega à conversa que a equipa já lê e funciona no telemóvel mais velho da
  cozinha; um link exigia conta a toda a gente.

### Verificação
- tsc limpo, `next build` limpo, 220 testes (30 novos).
- Imagem JPG gerada e inspeccionada: acentos, "&" escapado, dia fechado como
  banda contínua, totais semanais em coluna própria.
- Grelha verificada a 1440px e 390px — sem scroll horizontal.
- Detector de design da skill impeccable: limpo.

### Por fazer / a confirmar
- **A migração ainda não correu** — a base de dados está em standby. Corre no
  próximo `prisma migrate deploy`.
- O painel foi verificado com dados de exemplo, não com dados reais.
- Templates de turno: as actions existem (saveTemplate/deleteTemplate) mas
  ainda não há ecrã para os gerir; por agora usam-se os três por omissão
  (Manhã/Tarde/Noite). É o passo seguinte natural.

---

# Pagamentos: o que está pago, o que está por pagar, e quando vence (2026-10-10)

Decisões do dono: débito direto fica programado até ao vencimento e passa a
pago sozinho nesse dia; os custos já lançados ficam **por pagar** (por rever);
fornecedor sem prazo = 30 dias; o custo fixo diz como é pago e cada mês herda.

## Plano
- [x] Schema + migração: `PaymentMethod`; `Vendor.paymentTermsDays`;
      `CostEntry.invoiceNumber/paymentMethod/paidAt/dueDate`;
      `RecurringCost.paymentMethod`. Backfill do nº de fatura a partir das linhas.
      Verificar em PGlite.
- [x] `lib/payments.ts` (puro, testado): vencimento efetivo, estado
      (paga/programada/por pagar/em atraso), escalões de dias, resumo.
- [x] Ações: lista por fornecedor, resumo do dashboard, marcar paga(s),
      desfazer, alterar vencimento, prazo do fornecedor, associar fatura
      (nº escrito ou fotografada).
- [x] Lançar custo: fornecedor, nº fatura, "Já paga / Por pagar", método,
      vencimento. Igual no scanner. Custo fixo guarda o método.
- [x] Associar fatura mais tarde: no Histórico de custos e nos Pagamentos;
      um scan com nº já escrito num custo oferece associar-se a ele.
- [x] Contabilidade › Pagamentos: agrupado por fornecedor, filtro rápido
      (por pagar / em atraso / pagas / todas), seleção em massa.
- [x] Dashboard: cartão sempre visível — em atraso (nº e valor) e escalões.
- [x] pt/en, changelog, apresentação, testes, QA visual.
- Tour: **sem passo novo** — é um sub-separador e o cartão do dashboard
  aponta para lá sozinho.

## Review

### Decisões
- **O pagamento vive no custo original**, nunca nas partes de uma fatura
  dividida por categoria: é um documento, paga-se uma vez. O valor a pagar é
  o original mais as partes.
- **Vencimento guardado só quando é do dono.** Sem data própria, é a data do
  custo + prazo do fornecedor (30 por omissão), calculado na leitura: mudar
  o prazo de um fornecedor move logo todas as faturas em aberto dele.
- **Custo sem fornecedor vence na própria data** (renda, ordenados, uma conta
  escrita à mão). Não há prazo a somar. Pressuposto meu — fácil de mudar em
  `dueDateFor` (lib/payments.ts).
- **Débito direto não é guardado como pago**: fica com método DIRECT_DEBIT e
  sem data de pagamento, e passa a pago quando chega o vencimento. Sem
  agendador, sem estado que fique para trás.
- **Custos antigos ficam por pagar**, como escolhido. Para a revisão: filtro
  Em atraso, selecionar todas, marcar de uma vez.
- **Custo fixo guarda método e fornecedor**; cada mês gerado herda os dois.
  Os custos fixos já existentes escolhem o método na lista de custos fixos.
- **Juntar fatura**: fotografar substitui data, total e fornecedor pelos da
  fatura e mantém o estado do pagamento; escrever só o número também serve.
  Um scan com um número já escrito num custo propõe juntar-se a ele.
- Tour: sem passo novo (sub-separador; o cartão do dashboard leva lá).
- Apresentação: nova capacidade com desenho próprio, no painel e no deck.

### Verificação
- tsc limpo, build limpo, 887 testes (23 novos em tests/payments.test.ts).
- Migração verificada em PGlite a partir do schema anterior: sem diferenças.
  Backfill do nº de fatura testado com linhas reais.
- Fluxo real no browser: formulário recusa sem resposta; paga a dinheiro,
  por pagar e débito direto guardados certos; custo fixo de agosto lançou
  setembro e outubro com o mesmo fornecedor e débito direto; marcar 2 como
  pagas; mudar prazo moveu os vencimentos.
- Screenshots desktop e telemóvel, pt e en.

### Por verificar
- O passo de pagamento no scanner e o juntar fatura por fotografia não foram
  corridos ponta a ponta: precisam de uma leitura real pela IA.

---

# Fornecedor errado numa fatura: corrigir, e não voltar a acontecer (2026-10-11)

Caso real: FR 26202304/0000049479 (Smash and Dough). Lida a 07/10 com o nome
do cliente ("DANIEL MARQUES ARAÚJO") e o NIF certo do fornecedor
(500145415); relida a 08/10 como "RECHEIO-ALBUFEIRA", recusada como
duplicada. Como os fornecedores se encontram pelo NIF, o NIF do Recheio
ficou com o nome do Daniel, e todas as faturas Recheio seguintes iriam para
lá. O QR não tem culpa: só traz NIFs, nunca nomes, e o NIF estava certo.
O pedido: a app deve permitir corrigir (não corrigir eu à mão).

## Plano
- [x] Corrigir na app, a partir da fatura (Faturas, pré-visualização, aviso
      de duplicado do scanner) e do fornecedor (Fornecedores):
      - "O nome deste fornecedor está errado" → renomear/NIF; vale para
        todas as faturas dele; se colidir com outro, juntar os dois.
      - "Esta fatura é de outro fornecedor" → mover só esta fatura: custo e
        partes, linhas, respostas aprendidas, correções; repreçar
        ingredientes; oferecer apagar o fornecedor que ficar vazio.
      - Sugerir o que outra leitura da mesma fatura disse.
      - Registar a correção no Cérebro.
- [x] Prevenir:
      - Prompt: emitente vs cliente; dizer ao leitor quem é o cliente
        (restaurante, donos, NIF do restaurante).
      - Verificação depois da leitura: NIF igual ao do cliente (QR B ou NIF
        do restaurante) ou nome igual ao do cliente → aviso no ecrã de
        revisão; fornecedor já conhecido pelo NIF → usar o nome guardado.
      - O nome mais longo já não substitui sozinho o de um fornecedor.
      - Deixar de criar fornecedores antes da revisão (rota do scan).
      - Guardar o resultado do QR na leitura, para se saber da próxima vez.
      - NIF do fornecedor editável na revisão; NIF do restaurante nas
        Definições.
- [x] pt/en, changelog, testes, QA.

## Review

### Causa (FR 26202304/0000049479)
- O leitor tirou o **nome** do bloco do cliente e o **NIF** certo do
  fornecedor. O QR não carrega nomes, por isso não podia ajudar no nome.
- Os fornecedores encontram-se pelo NIF, logo o NIF do Recheio ficou com o
  nome do dono. Pior: a regra "o nome mais comprido ganha" deixaria uma
  leitura com o nome do cliente renomear um fornecedor bom.
- O restaurante não tinha NIF guardado e não havia onde o escrever.

### O que ficou
- Corrigir: na lista de Faturas, na pré-visualização, em Fornecedores e no
  aviso de duplicado do scanner. Renomear (todas as faturas) ou mover uma
  fatura (custo e partes, linhas, memórias/ligações copiadas ou movidas,
  correções; ingredientes repreçados; fornecedor vazio pode ser apagado).
  Sugere o nome de outras leituras, exceto as que o dono já rejeitou.
- Prevenir: prompt sabe quem é o cliente (PROMPT_VERSION 2026-10-11.1);
  verificação depois da leitura guardada em `checks`; nome mais comprido
  só substitui se for o mesmo nome por extenso; a rota do scan deixou de
  criar fornecedores; NIF editável na revisão; NIF da empresa nas Definições.

### Verificação
- 897 testes (10 novos), tsc e build limpos.
- No browser, com o caso real reproduzido: renomear pôs o nome do Recheio no
  NIF e registou a correção; mover levou linha, custo e memória e apagou o
  fornecedor vazio; chamada real ao scan marcou o NIF guardado com nome de
  cliente e não criou fornecedor.

### Por fazer pelo dono
- Em produção, abrir a fatura e usar "Corrigir fornecedor" (a outra
  leitura já sugere RECHEIO-ALBUFEIRA). Não mexi nos dados.
- Escrever o NIF da empresa em Definições.
- O aviso no ecrã de revisão só foi visto pelo pedido ao servidor, não com
  uma leitura real da IA.

---

# Onboarding wizard + centred layout (2026-10-30)

Plan: ~/.claude/plans/https-app-mytinz-com-onboarding-regiao-o-nifty-leaf.md (Tinz audit + roadmap).

- [x] `/onboarding`: 4 skippable steps (restaurant + VAT region, dining room, fixed costs, first numbers)
- [x] Dashboard gate (owners only, never while impersonating); backfill migration marks existing restaurants done
- [x] Setup checklist card replaces the hardcoded PT welcome card; dismissal per restaurant in AppSetting
- [x] Seats / service hours / monthly target editable in Settings › Restaurante
- [x] Fixed costs: direct-debit tick per row; this month's non-direct-debit rows booked as paid
- [x] PageShell: centred column (wide 1200 / medium 3xl / narrow 2xl) for every dashboard tab
- [x] PT + EN, changelog, presentation point

## Review
- Found in QA and fixed: "1.200" was read as €1.20 (PT thousands); fixed costs showed as overdue on the first screen;
  `getRestaurant` passed Prisma Decimals to the client once seats/hours/target were set; site navbar over the wizard.
- Verified on PGlite + next dev: full flow (DB rows checked), skip on mobile, existing owner at 1920px, EN.
- Not done yet (Phase 0b remainder): shared page header / toolbar / EmptyState pattern, tab by tab.
- Open question: lib/tax-rules.ts has Madeira reduced VAT 5%; Tinz shows 4%. Verify the current rate.
