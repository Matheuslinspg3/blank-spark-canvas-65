# Entregabilidade: relatório, limites, supressão e bounces

Cinco recursos que se apoiam numa base comum: um registro de cada e-mail enviado e uma lista de contatos bloqueados, alimentada automaticamente pelos eventos da Brevo.

## 1. Base de dados

Duas tabelas novas (com RLS por usuário):

- `email_events` — um registro por e-mail enviado: campanha, destinatário, `message_id`, status (`enviado`, `entregue`, `bounce_hard`, `bounce_soft`, `spam`, `erro`), motivo e datas. É a fonte do relatório e do limite diário.
- `suppressions` — endereços bloqueados: e-mail, motivo (`bounce`, `spam`, `invalido`, `manual`), origem, data. Único por usuário + e-mail.

## 2. Tracking de bounces e reclamações (webhook Brevo)

Rota pública `/api/public/hooks/brevo` recebe os eventos da Brevo (`hard_bounce`, `soft_bounce`, `spam`, `blocked`, `invalid_email`, `delivered`) e:

- atualiza o `email_events` correspondente pelo `message_id`;
- em hard bounce, spam, blocked ou e-mail inválido, insere automaticamente o contato em `suppressions`;
- valida um segredo enviado na URL para ninguém falsificar eventos.

Na tela de Configurações aparece a URL exata para colar no painel da Brevo, com botão de copiar e instruções curtas.

## 3. Supressão automática

Antes de qualquer disparo (simples, com molde e completo), a lista é filtrada contra `suppressions`:

- contatos bloqueados são removidos e mostrados numa faixa "X contatos ignorados (bounce/spam)" com a lista;
- na fila e na revisão final, esses contatos ganham selo vermelho e não podem ser aprovados;
- página de gerenciamento em Configurações para ver, buscar e remover manualmente um bloqueio.

## 4. Limite diário com alerta

- Campo de limite diário por remetente em Configurações (padrão sugerido: 200/dia, com aquecimento gradual sugerido para domínio novo).
- Antes e durante o disparo, o app conta os envios das últimas 24h em `email_events`:
  - acima de 80% do limite: aviso amarelo;
  - atingido o limite: o disparo pausa sozinho e avisa que continua no dia seguinte;
- o intervalo mínimo entre e-mails continua valendo junto com a janela de horário já existente.

## 5. Detecção de reclamações de spam

- A cada lote, o app calcula a taxa de spam e de bounce da campanha.
- Bounce acima de 5% ou spam acima de 0,3%: alerta em tela e a campanha é **parada automaticamente**, com explicação do que corrigir.
- O alerta também aparece na lista de disparos.

## 6. Relatório de entregabilidade por campanha

Nova aba/painel na página do disparo:

- cartões: enviados, entregues, bounces (hard/soft), spam, erros, com percentuais;
- gráfico simples de barras e tabela por destinatário com status e motivo;
- exportação CSV;
- bloco de **recomendações automáticas** geradas a partir dos números: por exemplo, muitos hard bounces → limpar lista e reduzir volume; muitos spam → revisar assunto e frequência; baixa entrega → conferir SPF/DKIM/DMARC do domínio; picos → usar janela e intervalo maiores.

## Detalhes técnicos

- Migração SQL com `CREATE TABLE` + `GRANT` + RLS (`auth.uid() = user_id`) para `email_events` e `suppressions`.
- `src/lib/deliverability.ts`: cálculo de métricas, limites e geração das recomendações (puro, testável).
- `src/lib/suppressions.functions.ts` e `src/lib/email-events.functions.ts`: server functions com `requireSupabaseAuth` para ler/gravar.
- `src/lib/brevo.server.ts`: passa a gravar um `email_events` por envio (com `message_id`) e a consultar supressão/limite antes de enviar.
- `src/routes/api/public/hooks/brevo.ts`: webhook com verificação de segredo (`BREVO_WEBHOOK_SECRET`, criado como secret).
- Novo componente `src/components/bulk-email/DeliverabilityReport.tsx` usado nos três modos de disparo.
