# Auditoria, reprocessamento e filtros nos contatos

Quatro melhorias em `/contatos` e `/revisao`: histórico por destinatário, reprocessar só os erros, busca/filtros e um modal de leitura/edição rápida.

## 1. Histórico / log por linha e por execução

Nova tabela `csv_row_events` no banco, gravada automaticamente a cada mudança de status:

- destinatário, execução (lote), status anterior → novo status
- se foi personalizado ou genérico, se o site foi acessado (e o motivo da falha)
- mensagem de erro quando houver e data/hora

Cada lote de processamento ganha um identificador próprio, então dá para ver "o que aconteceu na execução das 14h" e também a linha do tempo completa de um destinatário específico.

Onde aparece:
- Em `/contatos`, cada linha tem um botão "Histórico" que abre um painel com a linha do tempo daquele e-mail.
- No topo, um bloco "Últimas execuções" com data, quantidade processada, gerados e erros.

## 2. Reprocessar somente os erros

Botão dedicado "Reprocessar erros (N)" ao lado de "Processar pendentes". Ele pega apenas as linhas com status `erro`, limpa a mensagem de erro, volta para `processando`, refaz a busca do site e regera o texto — registrando tudo no histórico. Fica desabilitado quando não há erros, e continua respeitando o botão "Parar".

Hoje o botão "Processar pendentes" já inclui erros junto; ele passa a processar só pendentes, para as duas ações ficarem separadas.

## 3. Busca e filtros

Em `/contatos` e `/revisao`, uma barra com:
- campo de busca (nome ou e-mail, com correspondência parcial)
- filtro por categoria (opções vindas dos próprios dados)
- filtro por status (pendente / processando / gerado / erro) — em `/revisao`, filtro por aprovado / não aprovado
- filtro personalizado vs genérico

Os filtros ficam na URL, então o link pode ser compartilhado ou recarregado sem perder a seleção. Contador "X de Y" e botão "Limpar filtros".

## 4. Modal de leitura/edição em `/revisao`

Cada card ganha um botão "Abrir". O modal mostra:
- nome, e-mail, categoria e badge personalizado/genérico
- o texto completo do e-mail em área editável e grande
- botões: Copiar texto, Salvar edição, Aprovar (ou desfazer), Fechar
- navegação Anterior / Próximo para revisar em sequência sem fechar

A edição inline nos cards continua funcionando; o modal é o caminho rápido para textos longos.

## Detalhes técnicos

- Migração: tabela `csv_row_events` (`user_id`, `csv_row_id`, `run_id`, `from_status`, `to_status`, `is_personalized`, `site_ok`, `site_reason`, `error_message`, `created_at`), com GRANTs, RLS por `auth.uid()` e índices em `csv_row_id` e `run_id`.
- `src/lib/csv-rows.functions.ts`: nova server fn `logCsvRowEvent`, `listCsvRowEvents` (por linha) e `listRuns` (agregado por `run_id`); `updateCsvRow` continua igual.
- `src/routes/_authenticated/contatos.tsx`: `runId` gerado por lote (`crypto.randomUUID()`), `processRow` passa a receber o `runId` e registrar eventos nos pontos de transição; nova função `handleReprocessErrors`.
- Filtros com `validateSearch` + `zodValidator`/`fallback` e `Route.useSearch()`, seguindo o padrão de search params do TanStack Router.
- Novos componentes: `src/components/contatos/RowFilters.tsx`, `src/components/contatos/RowHistoryDialog.tsx`, `src/components/revisao/EmailReviewDialog.tsx`, usando `Dialog`/`Sheet` do shadcn já disponíveis.
- Cópia via `navigator.clipboard.writeText` com feedback `sonner`.
