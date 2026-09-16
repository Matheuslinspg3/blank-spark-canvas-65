# Proteção contra corte do Gmail

## O que será adicionado

- Mostrar o peso de cada molde HTML com uma faixa de segurança: **Seguro**, **Atenção** ou **Muito pesado**.
- Adicionar o botão **Otimizar HTML**, que remove comentários e espaços desnecessários sem alterar o texto nem o visual do e-mail.
- Mostrar quanto espaço foi economizado após a otimização.
- Bloquear teste, envio imediato e agendamento quando algum e-mail ultrapassar o limite seguro, evitando disparos que o Gmail exibirá cortados.
- Continuar apontando imagens embutidas (`data:`), pois elas precisam ser substituídas por links públicos para reduzir o peso de verdade.

## Detalhes técnicos

- Criar funções reutilizáveis para medir bytes, classificar o tamanho e compactar HTML de e-mail com segurança, preservando comentários condicionais do Outlook.
- Validar o HTML final renderizado por destinatário antes de qualquer envio.
- Usar 90 KB como limite preventivo, deixando margem abaixo do corte aproximado de 102 KB do Gmail.
