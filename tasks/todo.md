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
