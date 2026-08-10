# Verificador de spam, variações A/B e checklist de aprovação

Cinco melhorias no fluxo de disparo, mais um teste final com o CSV enviado (`Email,Segmento`, 3 contatos Gmail).

## 1. Verificador de risco de Promoções

Um analisador roda sobre o assunto e o HTML gerado e devolve uma nota (baixo / médio / alto) com sugestões objetivas:

- Palavras-gatilho no assunto e no corpo (oferta, grátis, desconto, promoção, exclusivo, imperdível, CAPS, excesso de emoji ou de "!").
- Estrutura: relação texto/HTML, presença de botão-CTA colorido, faixa/banner, rodapé de newsletter, "cancelar inscrição".
- Proporção de imagens e links: número de imagens vs. parágrafos, quantidade de links, links rastreados.
- Cada achado vem com o motivo e o ajuste sugerido; um botão "Corrigir com IA" reescreve só o que foi apontado.

Aparece no editor (passo 2) e novamente na prévia de aprovação.

## 2. Perguntas opcionais de objetivo e público

No bloco de geração com IA entram campos opcionais que mudam o texto de forma consistente:

- Objetivo: informativo, proposta comercial, follow-up, convite, reativação.
- Público-alvo: quem recebe (cargo, porte, setor) — pode usar a coluna de segmento do CSV.
- Tom: formal, próximo, direto.
- Nível de detalhe / tamanho do e-mail.

Tudo opcional; em branco, a IA mantém o comportamento atual.

## 3. Variações A/B

O gerador passa a produzir 2 ou 3 variações completas (assunto + corpo) com abordagens diferentes (ex.: direta ao ponto, contexto/insight, pergunta). Você compara lado a lado, escolhe uma como template da campanha ou marca duas para divisão A/B — nesse caso os destinatários são distribuídos entre as variações e o relatório final mostra o resultado por variação.

## 4. Prévia e aprovação com checklist

Antes de enviar ou baixar o template, uma etapa de prévia mostra o e-mail renderizado com um checklist de quatro itens:

- Tom coerente com o objetivo
- Clareza e tamanho
- Personalização (variáveis realmente preenchidas, sem placeholders vazios)
- Risco de spam/Promoções (nota do verificador)

Cada item é avaliado automaticamente e você confirma manualmente. Enviar e baixar ficam liberados só depois da confirmação.

## 5. Campos dinâmicos por destinatário

Nome, empresa e cargo passam a ser editáveis por destinatário na fila (passo 2), mesmo quando o CSV não traz essas colunas — preenchidos pela pesquisa quando existir, e ajustáveis à mão. Um seletor mostra as variáveis disponíveis (`{{nome}}`, `{{empresa}}`, `{{cargo}}`, `{{segmento}}`, `{{ia_conteudo}}`) para inserir no assunto e no corpo, e o mapeamento de colunas do CSV vira flexível (a coluna `Email` maiúscula do seu arquivo é reconhecida).

## 6. Teste com o CSV enviado

Ao final, faço um teste ponta a ponta com `teste_de_disparo.csv`: importação das 3 linhas, mapeamento de `Segmento` como público, geração das variações, verificador de spam, checklist e prévia dos 3 e-mails renderizados — sem disparo real, a menos que você peça.

Os três contatos são Gmail pessoal, então a pesquisa de empresa não terá site para consultar; os campos de empresa/cargo ficam manuais nesse caso.

## Detalhes técnicos

- Novo `src/lib/spam-check.ts` (puro, testável): regras de assunto, estrutura e proporção imagem/link, retorno `{ score, level, findings[] }`.
- Novo `src/components/bulk-email/SpamCheckPanel.tsx` usado no `EmailEditor` e na prévia.
- `TemplateGenerator.tsx`: novos campos (objetivo, público, tom, tamanho), prompt pedindo JSON com array `variants[{label, subject, html}]`, e UI de comparação/seleção.
- Novo `src/components/bulk-email/ApprovalChecklist.tsx` bloqueando o avanço até confirmação; integrado no `BulkEmailDashboard`.
- `RecipientQueue.tsx`: edição de `nome`, `empresa`, `cargo` por linha; persistência junto do conteúdo já salvo.
- `bulk-email.ts`: normalização case-insensitive de cabeçalhos do CSV e suporte à variável de variação no relatório.
- Distribuição A/B feita no cliente ao montar a lista de envio; coluna `variacao` no CSV de relatório.
