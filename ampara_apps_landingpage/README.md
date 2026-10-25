# Portal de download dos apps Ampara Kids

O domínio `baixar.amparakids.com` identifica Android ou iOS e encaminha para o
download do app selecionado. `/crianca` e `/responsavel` identificam a variante;
`/baixar/crianca` e `/baixar/responsavel` são aliases. O QR de download é
separado do código de pareamento de 8 dígitos.

## Variáveis do Railway (`landing page apps`)

| Variável | Valor |
| --- | --- |
| `CHILD_ANDROID_APK_URL` | URL HTTPS do APK assinado de Ampara Criança |
| `PARENT_ANDROID_APK_URL` | URL HTTPS do APK assinado de Ampara Responsáveis |
| `CHILD_IOS_DISTRIBUTION_URL` | URL HTTPS de instalação fornecida por marketplace alternativo autorizado pela Apple, quando disponível |
| `PARENT_IOS_DISTRIBUTION_URL` | URL HTTPS de instalação fornecida por marketplace alternativo autorizado pela Apple, quando disponível |

As URLs são opcionais. O servidor só aceita HTTPS. Se o APK Android não estiver
configurado, a página explica que o download ainda não foi liberado. Para iOS,
não configure um link direto para `.app` de simulador ou `.ipa`: no Brasil, o
download pelo site depende de um marketplace alternativo autorizado pela Apple.

## Instalação

No Android, o usuário baixa o APK assinado e autoriza a instalação para a origem
usada no aparelho. No iPhone, o endereço só deve ser ativado quando vier de uma
via autorizada de distribuição iOS compatível com o Brasil.
