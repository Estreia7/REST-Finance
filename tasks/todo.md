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
