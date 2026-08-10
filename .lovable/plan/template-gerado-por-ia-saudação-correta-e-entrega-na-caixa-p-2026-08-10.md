# Template gerado por IA, saudação correta e entrega na caixa principal

Três problemas no e-mail que chegou: o cabeçalho disse "Olá, Imprensa" (nome tirado do começo do endereço) e "Uma novidade para a Gmail", o layout roxo genérico parece feito por IA, e a mensagem caiu em Promoções.

## 1. Template criado pela IA a partir de um e-mail base

Na etapa do template (passo 2 do disparo) entra um bloco "Gerar template com IA":

- Você cola um **e-mail base** (um e-mail real seu, do jeito que você escreveria) e opcionalmente descreve tom/marca/cor.
- A IA devolve um **HTML de template único** para a campanha, no seu estilo, já com as variáveis certas (`{{nome}}`, `{{empresa}}`, `{{ia_conteudo}}`).
- O HTML volta para o editor, com preview lado a lado, e pode ser ajustado à mão ou regerado. Nada é aplicado sem você ver.
- O template continua sendo um só para a campanha; o que muda por contato é o texto pesquisado (`{{ia_conteudo}}`).

## 2. Saudação e nome da empresa corretos

Hoje, quando o CSV não traz `nome`/`empresa`, o app inventa a partir do endereço: `imprensa@quintoandar...` vira "Imprensa" e o domínio do contato vira "Gmail".

Muda para:

- `{{empresa}}` passa a usar o nome real da empresa do dossiê da pesquisa (ex.: QuintoAndar); só cai para o domínio se a pesquisa não achou nada.
- `{{nome}}`: se o valor derivado do e-mail for um endereço genérico (imprensa, contato, comercial, sac, financeiro, atendimento, marketing, rh, faleconosco, no-reply...), a saudação vira neutra — "Olá!" ou "Olá, equipe QuintoAndar!" — em vez de "Olá, Imprensa".
- Mesma regra vale no preview, na revisão e no envio, para o que você vê ser igual ao que chega.

## 3. Template menos "cara de IA"

O template padrão é reescrito para o formato que costuma cair melhor na caixa principal:

- Sem faixa colorida gigante no topo, sem botão CTA chamativo, sem bloco de rodapé promocional.
- Carta simples: texto em fonte de sistema, largura de leitura, assinatura com nome/cargo/empresa, um único link discreto em texto.
- Continua com fallback: se a IA gerar um template, esse vira o padrão da campanha.

## 4. Cair na caixa principal em vez de Promoções

Promoções é decisão do Gmail com base em sinais do e-mail. O que dá para fazer no app:

- Enviar também a **versão em texto puro** junto do HTML (hoje vai só HTML) — é um dos sinais mais fortes.
- Remover do padrão os elementos que marcam "promoção": botão-imagem grande, cores fortes de campanha, "Cancelar inscrição" com visual de newsletter, múltiplos links de rastreio.
- Assunto sem gatilhos promocionais (sem "novidade", "oferta", "desconto", CAPS, emoji) — aviso no editor quando o assunto tiver esses termos.
- Desligar, quando possível, o rastreamento de abertura/clique da Brevo nesses disparos, porque link reescrito e pixel puxam para Promoções.

Mesmo assim não há garantia: domínio autenticado (SPF/DKIM/DMARC, que a Brevo configura) e histórico de engajamento pesam mais que o HTML.

## Detalhes técnicos

- Novo prompt `buildTemplatePrompt` em `src/lib/csv-rows.ts` e server function para gerar o HTML do template a partir do e-mail base; sanitização do HTML devolvido (sem `<script>`, sem CSS externo).
- Novo componente `src/components/bulk-email/TemplateGenerator.tsx` acoplado ao `EmailEditor`.
- `fallbackValue`/`interpolate` em `src/lib/bulk-email.ts` ganham lista de locais genéricos e recebem o nome da empresa vindo do dossiê (`csv_rows.research.empresa`).
- `DEFAULT_TEMPLATE` reescrito no estilo carta.
- `src/lib/brevo.server.ts`: enviar `textContent` derivado do HTML e desativar tracking na chamada.
- A campanha guarda o template gerado como qualquer outro template (coluna já existente), sem migração nova.
