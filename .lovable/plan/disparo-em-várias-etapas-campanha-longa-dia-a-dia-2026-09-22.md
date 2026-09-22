# Disparo em várias etapas (campanha longa, dia a dia)

Objetivo: pegar uma lista grande (ex.: 1.500 contatos), criar um disparo e deixar o sistema enviar sozinho ao longo dos dias, no ritmo e nos horários que você escolher, sempre com link rastreável por pessoa — e mostrando claramente de onde parou.

## O que muda na prática

**1. Plano de envio (novo bloco na tela do disparo)**
- Dias da semana permitidos (marcar segunda a domingo).
- Até dois blocos de horário por dia, com pausa entre eles (ex.: 09:00–12:00, pausa, 14:00–17:00).
- Intervalo entre e-mails (ex.: 1 a cada 60s).
- Limite por dia, padrão **200**.
- Resumo automático: "1.508 e-mails, 200 por dia → termina em 8 dias úteis, previsão 30/09".

**2. Verificação obrigatória de link antes de agendar**
- Antes de salvar o plano, o sistema confere se o e-mail (texto ou HTML, variação A e B) tem pelo menos um link http/https e se o rastreio está configurado.
- Sem link → **agendamento bloqueado**, com mensagem dizendo exatamente o que falta e um atalho para criar o link rastreado.
- Cada envio continua gerando um código único por destinatário, ligado à campanha e ao disparo.

**3. Painel "De onde paramos"**
- Enviados hoje (45/200), total enviado (620/1.508), restantes na fila.
- Próximo envio, próximo dia de envio, previsão de término.
- Botões **Pausar** e **Retomar** o disparo a qualquer momento.
- Falhas do dia com motivo, e os e-mails suprimidos não ocupam cota.

**4. Mais seguro para a Brevo**
- Cota diária respeitada mesmo se você agendar vários disparos (o robô soma os envios do dia).
- Fora de dia/horário permitido, o robô apenas adia — nada é perdido.
- Erros temporários do provedor (503/429) já têm nova tentativa; e-mails que falham ficam registrados para reenvio.

## Detalhes técnicos

- Migration em `campaigns`: colunas `send_plan` (jsonb: dias, blocos, intervalo, limite diário), `daily_sent_count`, `daily_sent_date`, `paused` (bool). Sem quebrar as campanhas existentes (plano derivado do `schedule` atual quando ausente).
- `src/lib/send-schedule.ts`: novo tipo `SendPlan` com `weekdays: number[]`, `blocks: {start,end}[]`, `intervalSeconds`, `dailyLimit`; funções `isWithinPlanTz`, `nextSlotAt`, `estimateFinish`, `describePlan` (fuso America/Sao_Paulo).
- `src/routes/api/public/cron/dispatch.ts`: usa `send_plan`; zera o contador diário na virada do dia (BRT); respeita `paused`; quando fora de janela/dia ou cota atingida, grava `next_send_at` no próximo slot real em vez de +5/+30 min fixos.
- Nova validação `requireTrackableLink(html, text)` em `src/lib/email-link-tracking.server.ts` + checagem no cliente; `scheduleCampaignFn` recusa o agendamento sem link rastreável.
- UI: novo `src/components/bulk-email/SendPlanFields.tsx` (substitui/estende `ScheduleFields.tsx`) e `SendProgressCard.tsx` usado em `TemplateDispatch.tsx`, `SimpleDispatch.tsx` e na lista de disparos.
- Lint (`bunx eslint`) e typecheck (`bunx tsgo --noEmit`) ao final.
