# Página de download dos apps Ampara

O domínio `baixar.amparakids.com` é a entrada de QR do app da criança. Em celulares, o servidor identifica Android ou iOS e redireciona para a loja correspondente quando a URL estiver configurada. `/responsavel` abre o fluxo do app dos responsáveis.

Configure estas variáveis no serviço Railway `landing page apps`:

| Variável | Destino esperado |
| --- | --- |
| `CHILD_ANDROID_STORE_URL` | Página do Ampara Criança no Google Play (`https://play.google.com/...`) |
| `CHILD_IOS_STORE_URL` | Página do Ampara Criança na App Store ou convite TestFlight |
| `PARENT_ANDROID_STORE_URL` | Página do Ampara Responsáveis no Google Play (`https://play.google.com/...`) |
| `PARENT_IOS_STORE_URL` | Página do Ampara Responsáveis na App Store ou convite TestFlight |

Enquanto a URL da loja do aparelho estiver ausente, a página informa que o app ainda não está publicado. URLs aceitas precisam usar HTTPS e o domínio oficial da loja. A aplicação não hospeda APKs.

## Rotas

- `/` e `/crianca`: download do app da criança (rota padrão para QR).
- `/responsavel`: download do app dos responsáveis.
- `/baixar/crianca` e `/baixar/responsavel`: aliases explícitos.
