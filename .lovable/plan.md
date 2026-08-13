# Modo Puro IA — criar o disparo conversando

Um quarto modo de disparo (`ia`), onde a tela é um chat. Você conversa com a IA em linguagem normal ("quero mandar pra 40 construtoras de Santos falando do convênio, assina Rebeca, rh@cafcm.org.br"), sobe o CSV dentro da própria conversa, e a IA vai montando o disparo enquanto responde. Nada de etapas numeradas.

## Como vai funcionar

Na tela "Meus disparos" entra um botão **Disparo por IA (chat)**.

A tela do disparo é dividida em duas partes:

- **Esquerda — o chat.** Você escreve o que quer. A IA pergunta o que falta (remetente, e-mail verificado, proposta do disparo, CSV) e confirma cada coisa entendida. Aceita comandos em texto: "muda o assunto pra algo mais curto", "regera o e-mail do carlos", "manda um teste pro meu e-mail", "pode enviar tudo".
- **Direita — o disparo montado.** Um painel vivo que mostra o estado atual: remetente, proposta, quantos destinatários, e a lista de e-mails já escritos (assunto + corpo, editáveis inline, com regerar individual). Tudo que a IA decide aparece aqui na hora.

Anexar o CSV é feito por um botão de clipe dentro do chat (mesma validação de hoje: coluna `email` obrigatória; `nome`, `empresa`, `cargo`, `segmento`, `categoria` aproveitados).

Ações de risco nunca acontecem sozinhas: quando a IA entende "enviar tudo", ela mostra um cartão de confirmação no chat com remetente, quantidade e limite diário restante — o envio só sai depois que você clica em **Confirmar envio**. O envio em si, a barra de progresso, a tabela de resultados e o relatório CSV são os mesmos do modo simples.

## Detalhes técnicos

- **Banco**: migration adicionando `'ia'` como valor aceito em `campaigns.mode` e uma coluna `chat jsonb not null default '[]'` para o histórico da conversa (papel + conteúdo + eventual ação). Assunto/corpo continuam em `recipients` (`ia_assunto` / `ia_conteudo`); remetente e proposta continuam em `sender_name`/`sender_email`/`brief`.
- **Rota**: `src/routes/_authenticated/disparos/$id.tsx` ganha o ramo `mode === "ia"` → novo `src/components/bulk-email/AiChatDispatch.tsx`.
- **Camada de conversa**: novo `src/lib/ai-chat-dispatch.ts` com o system prompt (ancorado em `CAFCM_PROPOSAL_CONTEXT`) e um contrato de tool-calling em JSON: `set_sender`, `set_brief`, `generate_emails`, `edit_email`, `regenerate_email`, `send_test`, `send_all`, `reply`. O componente executa a ação, atualiza o estado e devolve o resultado como próxima mensagem de contexto. Histórico completo é reenviado a cada turno, via o `callAi` já existente (configuração de IA do usuário, sem mudança).
- **Reaproveitado sem alterações**: `buildSimpleSystemPrompt`/`buildSimpleUserPrompt`/`parseSimpleEmail`/`simpleLetterHtml` de `simple-dispatch.ts` para escrever cada e-mail, `CSVUploader` (embutido no chat), `sendBulkEmailsFn`/`sendTestEmailFn`, `useSendGuard` (limite diário), `ResultsTable`, `spam-check` e o relatório CSV.
- **Persistência**: mesmo autosave com debounce (~1,5s) + backup em `localStorage` já usado no modo molde, cobrindo chat, destinatários e textos gerados.
- **Renderização**: mensagens da IA em markdown (`react-markdown`), instalado se ainda não estiver no projeto.
