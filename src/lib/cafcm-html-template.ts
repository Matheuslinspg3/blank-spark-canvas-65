/**
 * Layout de e-mail HTML da CAFCM (cota de aprendizagem), importado de um
 * arquivo do usuário. Variáveis: {{NOME_RESPONSAVEL}}, {{LINK_WHATSAPP}},
 * {{LINK_DESCADASTRO}} — resolvidas a partir das colunas do CSV.
 */
export const CAFCM_HTML_EMAIL = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sua empresa está preparada para a cota de aprendizagem?</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f5f7; font-family:Arial, Helvetica, sans-serif; color:#1f2933;">
  <!--
    REMETENTE VISÍVEL: Empresas | CAFCM
    CONTA RECOMENDADA: empresas@cafcm.org.br
    ASSUNTO: Sua empresa está preparada para a cota de aprendizagem?
    PRÉ-CABEÇALHO: A CAFCM ajuda a organizar a cota, a contratação e o acompanhamento dos aprendizes.
    SUBSTITUIR ANTES DO ENVIO: {{NOME_RESPONSAVEL}}, {{LINK_WHATSAPP}}, {{LINK_DESCADASTRO}}
  -->
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
    A CAFCM ajuda a organizar a cota, a contratação e o acompanhamento dos aprendizes.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; background-color:#f3f5f7;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%; max-width:600px; background-color:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 24px rgba(16,42,67,0.08);">
          <tr>
            <td style="background-color:#102a43; padding:24px 34px; border-top:6px solid #e3262e;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-size:24px; line-height:30px; font-weight:700; color:#ffffff; letter-spacing:0.3px;">CAFCM</td>
                  <td align="right" style="font-size:12px; line-height:18px; color:#d9e2ec;">Aprendizagem profissional<br>com acompanhamento</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:40px 40px 18px 40px;">
              <p style="margin:0 0 14px 0; font-size:16px; line-height:25px; color:#52606d;">Olá, {{NOME_RESPONSAVEL}}.</p>
              <h1 style="margin:0; font-size:30px; line-height:38px; color:#102a43; font-weight:700;">Quando a notificação chega, o prazo já começou.</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 8px 40px;">
              <p style="margin:0 0 18px 0; font-size:16px; line-height:26px; color:#334e68;">
                O RH procura o cálculo atualizado. O DP confere admissões e documentos. As vagas ainda precisam ser preenchidas. Enquanto cada área busca uma resposta, a empresa perde tempo para organizar a cota de aprendizagem.
              </p>
              <p style="margin:0 0 18px 0; font-size:18px; line-height:28px; color:#102a43; font-weight:700;">
                Esse cenário pode ser evitado antes de virar urgência.
              </p>
              <p style="margin:0 0 8px 0; font-size:16px; line-height:26px; color:#334e68;">
                A CAFCM apoia a empresa em toda a jornada da aprendizagem profissional:
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:6px 40px 10px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="top" width="28" style="padding:8px 0; font-size:18px; line-height:22px; color:#e3262e; font-weight:700;">✓</td>
                  <td style="padding:8px 0; font-size:15px; line-height:23px; color:#334e68;"><strong>Diagnóstico inicial</strong> para entender o cenário e orientar os próximos passos.</td>
                </tr>
                <tr>
                  <td valign="top" width="28" style="padding:8px 0; font-size:18px; line-height:22px; color:#e3262e; font-weight:700;">✓</td>
                  <td style="padding:8px 0; font-size:15px; line-height:23px; color:#334e68;"><strong>Recrutamento e encaminhamento</strong> de jovens compatíveis com a realidade da empresa.</td>
                </tr>
                <tr>
                  <td valign="top" width="28" style="padding:8px 0; font-size:18px; line-height:22px; color:#e3262e; font-weight:700;">✓</td>
                  <td style="padding:8px 0; font-size:15px; line-height:23px; color:#334e68;"><strong>Organização documental</strong> e apoio durante o contrato de aprendizagem.</td>
                </tr>
                <tr>
                  <td valign="top" width="28" style="padding:8px 0; font-size:18px; line-height:22px; color:#e3262e; font-weight:700;">✓</td>
                  <td style="padding:8px 0; font-size:15px; line-height:23px; color:#334e68;"><strong>Acompanhamento pedagógico</strong> com comunicação entre a CAFCM, a empresa e o aprendiz.</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 40px 8px 40px;">
              <p style="margin:0; font-size:16px; line-height:26px; color:#334e68;">
                A fiscalização da cota é permanente, e o DET é o canal oficial de comunicação entre a Inspeção do Trabalho e os empregadores. Por isso, o melhor momento para conferir a situação da empresa é antes de uma solicitação chegar.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:26px 40px 12px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" bgcolor="#e3262e" style="border-radius:8px;">
                    <a href="{{LINK_WHATSAPP}}" target="_blank" style="display:inline-block; padding:15px 24px; font-size:16px; line-height:20px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:8px;">Quero revisar minha cota</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0; font-size:13px; line-height:20px; color:#7b8794;">Uma conversa de 10 minutos, por videochamada ou presencialmente.</p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px 34px 40px;">
              <p style="margin:0; font-size:15px; line-height:24px; color:#334e68;">Atenciosamente,<br><strong>Empresas | CAFCM</strong><br>Centro de Aprendizagem, Formação e Convivência Metropolitana</p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#eaf0f5; padding:20px 34px; text-align:center;">
              <p style="margin:0 0 6px 0; font-size:12px; line-height:18px; color:#627d98;">CAFCM • Praia Grande e região</p>
              <p style="margin:0; font-size:11px; line-height:17px; color:#829ab1;">Se não quiser receber novas mensagens institucionais, <a href="{{LINK_DESCADASTRO}}" style="color:#526d82; text-decoration:underline;">clique aqui</a>.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
