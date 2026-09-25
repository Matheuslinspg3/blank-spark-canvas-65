# Página Ponte com marca nos links rastreados

## O que muda para você

**Criar link (aba Links e atalho nos moldes)**
- Novo seletor: **Redirecionamento direto** (como hoje) ou **Página Ponte**.
- Na Página Ponte aparecem: Logo (colar endereço ou enviar imagem), Cor da marca, Título, Subtítulo, quais dados pedir (Nome, WhatsApp, Empresa — marcáveis), texto do botão e **destino final**.
- Para destino WhatsApp: campo de número + mensagem pronta, com variáveis `{nome}`, `{whatsapp}`, `{empresa}` que são preenchidas com o que a pessoa digitou.
- Prévia ao vivo da página ao lado do formulário.

**Página pública `/p/...`**
- Fundo neutro elegante, cartão central com logo no topo, botão na cor da marca, funciona bem no celular.
- Validação de WhatsApp (DDD + número, 10–11 dígitos, formatação automática).
- Rodapé discreto: "Seus dados são usados apenas para este contato e protegidos."
- Ao enviar: salva o lead e abre o WhatsApp na hora com a mensagem já preenchida.
- Os links de e-mail continuam rastreando quem clicou (a abertura da página conta como clique).

**Conversões**
- Na aba Links, cada link ponte mostra "X visitas · Y leads".
- Nova seção **Conversões** na aba Links: tabela com nome, WhatsApp, empresa, data/hora, link de origem, destinatário do e-mail e campanha; filtro por link e exportar CSV.
- No relatório do disparo, os leads aparecem junto aos cliques.

## Privacidade
Sem IP, localização ou fingerprint (mesma regra atual). Dados pessoais nunca vão na URL da página — só na mensagem do WhatsApp que a própria pessoa envia.

## Detalhes técnicos
- Migration:
  - `email_link_tracks`: `mode text default 'redirect'` ('redirect'|'bridge') e `bridge_config jsonb default '{}'` (logo_url, primary_color, title, subtitle, fields[], button_label, whatsapp_number, whatsapp_message).
  - Nova tabela `link_leads` (user_id, email_link_track_id, campaign_id, marketing_campaign_id, recipient_email, name, whatsapp, company, created_at) com GRANTs, RLS (dono lê/apaga; sem inserção pelo público — inserção só pelo servidor).
  - Bucket público `brand-logos` (criado pela ferramenta de storage) com política de upload apenas para o dono na pasta `user_id/`.
- `tracked-links.functions.ts`: schema aceita `mode` + `bridgeConfig` (zod: cor hex, URL https, título ≤120, número 10–13 dígitos); link gerado vira `/p/token` quando ponte; `listLinkLeadsFn` com `runUserScopedOperation`.
- `/r/$token`: se o link for ponte, conta o clique e redireciona para `/p/token` (links já enviados continuam válidos).
- `src/routes/p/$token.tsx`: página SSR com loader chamando server fn pública que devolve só a configuração visual (sem e-mail/IDs); `submitBridgeLeadFn` pública valida com zod, limita tamanho, grava via admin e retorna a URL `https://wa.me/<num>?text=...` montada no servidor; `head()` com noindex.
- `LinkCreatorDialog.tsx`: seletor de modo, campos, upload de logo, prévia.
- `links.tsx`: contadores + seção Conversões + CSV; `DeliverabilityReport.tsx`: bloco de leads.
