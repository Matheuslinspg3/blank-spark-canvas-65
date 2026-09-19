# DisparoTracker

blank canvas page

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7b73e4df-5b75-434e-ab8b-74c2e10c0428).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
## Rastreamento de links por e-mail

O Disparo Tracker substitui automaticamente cada link HTTP/HTTPS presente no HTML de uma entrega por um token aleatório exclusivo daquele destinatário. O clique fica vinculado ao evento de envio e à campanha, sem expor e-mail, CPF, telefone ou IDs internos na URL.

Configure o segredo de ambiente `TRACKING_ORIGIN` com a origem HTTPS pública desta aplicação, por exemplo `https://disparos.cafcm.org.br`. Sem essa configuração, o e-mail é enviado normalmente e os links originais não são modificados.

O sistema registra somente data/hora, origem do referenciador quando disponível e user-agent resumido. Não coleta IP, localização precisa ou fingerprint.
