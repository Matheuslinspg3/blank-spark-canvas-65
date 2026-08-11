# Disparo com molde (por categoria)

Um terceiro modo, sem IA: você escreve seus próprios e-mails — um molde por categoria — e o sistema envia o molde certo para cada empresa do CSV.

## Como vai funcionar

Na tela "Meus disparos" passa a existir um terceiro botão: **Disparo com molde**, ao lado de Simples e Completo.

A página do disparo é uma única tela com quatro blocos:

1. **Remetente** — nome e e-mail verificado na Brevo (mesma lista de Configurações).
2. **CSV** — mesmo upload de hoje. Se existir uma coluna `categoria` (ou `segmento`), as empresas já vêm agrupadas por ela.
3. **Moldes** — uma aba/cartão por categoria encontrada. Em cada uma você escreve **assunto** e **corpo** do e-mail, com variáveis clicáveis (`{{nome}}`, `{{empresa}}`, `{{categoria}}` e qualquer outra coluna do CSV). Prévia ao lado mostrando o texto já preenchido com a primeira empresa daquela categoria. Também dá para criar um molde novo do zero e um molde "Padrão" para quem ficar sem categoria.
4. **Empresas e envio** — lista com todas as empresas, cada uma mostrando qual molde vai receber; um seletor por linha permite trocar o molde manualmente. Aviso se alguma empresa estiver sem molde. Depois: "Enviar teste para…" (usa o molde da empresa escolhida), "Enviar tudo" com barra de progresso, tabela de resultados e relatório CSV — igual aos outros modos.

Sem geração por IA, sem variações A/B, sem checklist: o texto é seu.

## Detalhes técnicos

- **Banco**: sem migration. O modo `molde` entra como novo valor de `campaigns.mode`; os moldes e o mapeamento empresa→molde são salvos em `campaigns.brief` (JSON) e nas colunas `molde_id` de cada item de `recipients`. Assunto/corpo finais são resolvidos no envio.
- **Novo arquivo** `src/lib/template-dispatch.ts`: tipos `MoldeTemplate` (id, nome, assunto, corpo), parse/serialização do JSON salvo, agrupamento automático por categoria, resolução de molde por destinatário e conversão do corpo em texto para o HTML de carta (reaproveitando `simpleLetterHtml` e `interpolate`/`tidyInterpolated` de `bulk-email.ts`).
- **Novo componente** `src/components/bulk-email/TemplateDispatch.tsx`, reaproveitando `CSVUploader`, `SenderFields`, `ResultsTable`, `spam-check` (aviso de risco no assunto) e `resultsToCsv`/`buildReportCsv`.
- **Rota**: `src/routes/_authenticated/disparos/$id.tsx` passa a escolher entre os três componentes pelo `mode`; `createCampaign` aceita `mode: "molde"`; `CampaignMode` em `campaigns.ts` ganha o valor novo.
- **Envio**: reaproveita `sendSimpleEmailsFn` (assunto + HTML por destinatário, 1 e-mail/s na Brevo) — nenhuma mudança no servidor.
