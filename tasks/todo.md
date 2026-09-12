# Glossário e tooltips na tab Análises

## Objetivo
Qualquer dono de restaurante, sem formação financeira, deve perceber cada número
e cada sigla sem sair do ecrã. Decisões do utilizador (2026-09-12):
- Formato: ícone (i) + tooltip on hover/toque.
- Conteúdo: **só a definição** do termo, sem julgar o número.
- Âmbito: os 6 sub-painéis de Análises + séries/eixos dos gráficos + KPICards.

## Plano

- [x] 1. `lib/glossary.ts` — 38 termos, pt + en.
- [x] 2. `app/components/InfoHint.tsx` — o ícone (i) acessível.
- [x] 3. Generalizar `app/components/Tooltip.tsx` (contenção horizontal, Escape).
- [x] 4. Aplicar nos painéis (P&L mensal e anual, Comparação, Tickets, Metas,
      Preços, Relatório).
- [x] 5. Gráficos: subtítulo por baixo de cada título.
- [x] 6. KPICards no Dashboard.
- [x] 7. Traduções en/pt.
- [x] 8. Verificação: tsc, 190 testes, build, e screenshots reais.

## Review

### O que mudou
- **`lib/glossary.ts`** (novo) — a fonte única. 38 termos em pt e en, cada um
  com `term`, `expansion` (a sigla por extenso) e `plain` (a explicação). A
  regra de escrita: nomear coisas que o dono toca — facturas, ordenados, renda —
  e nunca definir um termo usando outro termo do mesmo ficheiro.
- **`app/components/InfoHint.tsx`** (novo) — o ícone (i). Botão focável por
  teclado, com aria-label, SVG desenhado à mão porque o ícone do lucide fica
  meio pixel descentrado a 13px.
- **`app/components/Tooltip.tsx`** — passou a conter-se na horizontal (antes
  cortava fora do ecrã nas colunas extremas), a fechar com Escape e a abrir
  com foco de teclado, não só com o rato.
- 9 componentes com hints + 5 subtítulos de gráfico em `lib/translations.ts`.
- **`tests/glossary.test.ts`** (novo) — 6 testes.

### Decisões que vale a pena registar
- **Um glossário central, não strings espalhadas.** COGS aparece em 4 sítios;
  com o dicionário central a definição é a mesma em todos e muda num só lugar.
- **`cogsPct` é uma entrada separada de `cogs`.** "COGS %" precisa que se diga
  qual é o denominador — a definição de COGS sozinha nunca diz "de cada 100 €
  que vendeu".
- **Sem julgamento do número.** Isso já vive em `lib/benchmarks.ts`, com as
  fontes portuguesas (NRA, AHRESP, Banco de Portugal). Duplicar era arriscar
  que os dois lados se contradissessem.
- **Só os totais de banda levam ícone na tabela anual.** As linhas de detalhe
  são as categorias que o próprio dono criou; um ícone em cada linha enterrava
  os números.

### Verificação feita
- `tsc --noEmit` limpo; `next build` limpo.
- 190 testes passam (184 antes + 6 novos).
- Screenshots reais com Playwright a 1440px e a 390px, com hover aplicado:
  os balões ficam dentro do ecrã nos dois extremos (no telemóvel o balão da
  direita desliza para x=122 em vez de cortar) e a seta continua a apontar
  para o ícone. Corrigido o alinhamento do ícone, que assentava abaixo da
  linha de base do texto.

### Fica por fazer
- Os `<option>` do seletor de limiar de preços continuam a ser "+5%", "+10%".
  O rótulo "Avisar a partir de" já os enquadra, mas se quiser algo mais
  explícito ("subidas acima de 5%") é uma alteração de uma linha.
