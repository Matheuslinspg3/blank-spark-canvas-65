# Quem clicou, por dia — lista, filtro e exportação

## Objetivo

Responder perguntas como "quais e-mails clicaram no link no dia 29" direto na aba **Links**: uma lista real de destinatários que clicaram, com filtro por dia/período e disparo, exportação em CSV e a opção de perguntar à IA sobre essa lista.

## O que será construído

### 1. Nova seção "Quem clicou" na aba Links
- Tabela com uma linha por destinatário que clicou: **e-mail, disparo, data/hora do primeiro clique, total de cliques, tipo de link** (redirecionamento ou Página Ponte).
- Filtros:
  - **Disparo** (seletor, incluindo "todos");
  - **Período** (data inicial e final — ex.: dia 29/09);
  - **Somente Página Ponte** (opcional).
- Ordenação por clique mais recente primeiro.

### 2. Exportar CSV da lista filtrada
- Botão **"Exportar CSV"** que baixa exatamente o que está filtrado na tela (ex.: só quem clicou no dia 29).
- Colunas: e-mail, disparo, primeiro clique, último clique, total de cliques, tipo de link, destino final.

### 3. Pergunta à IA sobre a lista filtrada
- Na mesma seção, campo de pergunta livre (ex.: "quais domínios mais clicaram no dia 29?") que envia o resumo da lista filtrada (e-mails mascarados) para a IA e devolve a resposta em português.

## Detalhes técnicos

- Nova função de servidor `listClickersFn` em `src/lib/tracked-links.functions.ts` (ou novo `clickers.functions.ts`): busca `email_link_tracks` com `click_count > 0`, filtrando por `campaign_id` e por `first_clicked_at` dentro do período (datas interpretadas no horário de Brasília), em lotes de 1.000 (sem o limite de 500).
- Join com `campaigns` para exibir o nome do disparo; dados restritos à conta autenticada (RLS + `user_id`).
- CSV gerado no cliente a partir dos dados já carregados (mesmo padrão da exportação de links existente).
- Análise da lista filtrada reutiliza `analyzeCampaignFn` com nova métrica opcional `cliques_periodo`, ou um prompt dedicado com o agregado da lista (totais por domínio, por hora, por dia) — e-mails sempre mascarados antes de ir para a IA.
- Componente novo `ClickersExplorer.tsx` em `src/components/bridge/`, incluído na página `/links` abaixo da seção de análise.

## Validação

- Typecheck (`tsgo`) e ESLint limpos.
- Teste manual: filtrar dia 29/09, conferir que a lista bate com os cliques registrados e que o CSV baixa com as mesmas linhas.
