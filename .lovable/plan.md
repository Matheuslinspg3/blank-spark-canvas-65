# Disparo simples (modo CAFCM)

Um segundo modo de disparo, bem mais curto que o atual. Você só informa três coisas — quem envia, o e-mail/nome do remetente e qual a proposta do disparo — sobe o CSV, e a IA escreve assunto e corpo de cada e-mail sozinha, já ancorada na proposta comercial da CAFCM.

## Como vai funcionar

Na tela "Meus disparos" passam a existir dois botões: **Novo disparo completo** (o fluxo atual, 5 etapas) e **Novo disparo simples**.

O disparo simples é uma única página com quatro blocos, um embaixo do outro:

1. **Remetente** — nome (ex.: Rebeca) e e-mail verificado na Brevo (ex.: rh@cafcm.org.br), escolhido da lista salva em Configurações.
2. **Proposta do disparo** — um campo de texto onde você escreve o objetivo em uma ou duas frases (ex.: "apresentar o convênio de socioaprendizagem para construtoras da região e agendar uma conversa"). Opcionalmente, cargo do remetente para a assinatura.
3. **CSV** — mesmo upload de hoje (coluna `email` obrigatória; `nome`, `empresa`, `cargo`, `segmento` usados se existirem).
4. **Gerar e enviar** — um botão "Gerar textos com IA" produz, para cada destinatário, um **assunto** e um **corpo** completos e humanos (usando o contexto da CAFCM + a proposta que você escreveu + os dados da linha). A lista mostra cada e-mail com seu assunto e texto, editáveis inline, com botão de regerar individual. Depois disso: "Enviar teste para…" e "Enviar tudo", com barra de progresso e a mesma tabela de resultados/relatório CSV do fluxo atual.

Sem etapas de template HTML, variações A/B, checklist ou revisão em massa — tudo isso continua existindo no disparo completo.

## Detalhes técnicos

- **Banco**: migration adicionando `mode text not null default 'completo'` em `campaigns` (valores `completo` | `simples`) e `brief text` para guardar a proposta digitada. Assunto e corpo por destinatário são salvos dentro do array `recipients` (colunas `ia_assunto` e `ia_conteudo`), sem tabela nova.
- **Rota**: `src/routes/_authenticated/disparos/$id.tsx` passa a escolher o componente pelo `mode` do registro; novo componente `src/components/bulk-email/SimpleDispatch.tsx`.
- **IA**: nova função em `src/lib/ai-config.ts` (`buildSimpleEmailPrompt`) que sempre injeta `CAFCM_PROPOSAL_CONTEXT` + `RESEARCH_PROMPT_ENFORCEMENT` + o brief, e pede resposta em JSON `{ assunto, corpo }`. Geração concorrente (3 por vez) com parar/retomar, igual ao `RecipientQueue`.
- **Envio**: reaproveita `sendBulkEmailsFn` / `sendTestEmailFn`. Como cada linha tem assunto próprio, o envio é feito em lotes por assunto (o corpo já vem pronto por destinatário, envolvido num HTML mínimo de carta, sem imagens nem botões, com versão texto puro).
- **Reaproveitado sem mudanças**: `CSVUploader`, `SenderFields`, `ResultsTable`, `spam-check` (aviso de risco no assunto), `resultsToCsv`/`buildReportCsv`.
