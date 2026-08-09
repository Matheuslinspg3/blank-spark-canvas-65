# Pesquisa real da empresa antes de escrever o e-mail

Hoje a IA só lê a home do domínio do e-mail. A ideia é transformar isso numa etapa de pesquisa de verdade: a partir de **nome + e-mail + categoria**, o app pesquisa a empresa na web, monta um dossiê e só então escreve o e-mail.

## Como vai funcionar

Para cada contato, em sequência:

```text
nome + email + categoria
        |
        v
1. dominio do email  ->  scrape do site (Firecrawl)
2. busca na web pelo nome/dominio (Firecrawl Search)
        |
        v
3. dossie: o que a empresa faz, servicos/produtos,
   publico, diferenciais, sinais recentes + fontes (URLs)
        |
        v
4. IA escreve o e-mail usando SO o que esta no dossie
```

Se a pesquisa não trouxer nada confiável (site fora do ar, domínio parkeado, conteúdo curto), o contato continua caindo no e-mail genérico e é marcado como **genérico**, como já acontece hoje.

## O que muda nas telas

**/contatos**
- O passo de geração passa a ter duas fases visíveis por linha: "pesquisando" e depois "escrevendo".
- O histórico por destinatário passa a registrar também o resultado da pesquisa (fontes encontradas, ou o motivo da falha).

**/revisao**
- Cada e-mail ganha um bloco "Dossiê da empresa" ao lado do texto: resumo do que foi descoberto (o que a empresa faz, serviços, diferenciais) e a lista de fontes usadas, com link.
- No modal de revisão, o dossiê aparece junto do editor, para você conferir se o e-mail bate com a pesquisa antes de aprovar.
- Badge continua diferenciando personalizado x genérico.

## Prompt melhorado

Dois passos de IA em vez de um:

1. **Pesquisa/estruturação** — recebe o conteúdo bruto coletado e devolve o dossiê em JSON (resumo, serviços, público, diferenciais, sinais recentes, fontes). Regra: campo vazio quando não há evidência, nunca inventar.
2. **Redação** — recebe nome, categoria e o dossiê, e escreve o e-mail em PT-BR, com abertura ancorada num fato concreto do dossiê e proibição explícita de citar qualquer coisa fora dele.

## Detalhes técnicos

- Conectar o **Firecrawl** (connector) e chamá-lo no servidor via gateway: `/v2/scrape` para o site do domínio e `/v2/search` para a busca por nome da empresa. Nada de chave no navegador.
- Nova server function `researchCompany` em `src/lib/company-research.functions.ts`, com helper server-only para montar o conteúdo coletado; substitui o uso direto de `fetchSiteText` no fluxo de geração.
- Prompts em `src/lib/csv-rows.ts`: `buildResearchPrompt` (JSON do dossiê) e `buildPersonalizedPrompt` reescrito para consumir o dossiê.
- Migração: adicionar em `csv_rows` as colunas `research` (jsonb) e `research_sources` (jsonb), e em `csv_row_events` registrar o resultado da pesquisa.
- As chamadas de IA continuam usando a sua configuração atual de base URL/API key em `/configuracoes`; nenhuma nova chave de IA.
- Concorrência mantida em 2 linhas por vez para respeitar limites do Firecrawl.

## Custo

O Firecrawl cobra créditos por página lida/pesquisa (cerca de 2–3 chamadas por contato). Numa lista de 51 contatos isso é da ordem de 100–150 créditos Firecrawl, além do consumo normal da sua IA.
