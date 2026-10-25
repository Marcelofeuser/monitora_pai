# Ampara Kids — requisitos da versão 3.0

Este documento registra os pedidos de produto para a V3.0. A equipe deve iniciar
essas mudanças somente depois de concluir e validar a versão atual. Não publicar
promessas comerciais para recursos que ainda não estejam implementados.

## Planos e preços solicitados

Valores em reais. Os totais trimestrais aplicam 25% de desconto sobre três meses;
os anuais aplicam 4% sobre doze meses. Totais arredondados para centavos.

| Plano | Limite familiar | Mensal | Trimestral (total) | Anual (total) |
| --- | --- | ---: | ---: | ---: |
| Kids Solo | 1 criança, 2 responsáveis | R$ 24,90 | R$ 56,03 | R$ 286,85 |
| Kids Duo | 2 crianças, 3 responsáveis | R$ 34,90 | R$ 78,53 | R$ 402,05 |
| Kids Family | 3 ou mais crianças, até 4 responsáveis | R$ 44,90 | R$ 101,03 | R$ 517,25 |

Ao cadastrar no Stripe, criar um preço recorrente por período e plano (nove
preços no total), com intervalos mensal, trimestral e anual. Confirmar a regra de
arredondamento antes de ativar cobranças, pois o cálculo exato pode resultar em
meio centavo para os preços trimestrais.

### Texto comercial a preparar

As descrições devem explicar os limites do plano e separar com clareza o valor
para responsáveis e crianças. Base inicial, a revisar contra os recursos
realmente disponíveis na versão publicada:

- **Para responsáveis:** conectar os perfis da família, acompanhar a experiência
  da criança e conversar em um espaço familiar com contatos autorizados.
- **Para crianças:** conversar com familiares e colegas autorizados, enviar
  mensagens e mídias e participar de chamadas quando disponíveis no dispositivo.
- **Limites:** usar somente os números de crianças e responsáveis definidos em
  cada plano acima.

Não anunciar como benefício incluído chamadas em segundo plano, jogos, efeitos
de realidade aumentada, ferramentas criativas ou qualquer outro recurso futuro
até que estejam implementados, testados e disponíveis no plano correspondente.

## Pedidos de produto para V3.0

1. **Temas de conversa:** oferecer várias opções visuais para chats.
2. **Figurinhas e emojis:** ampliar a variedade de figurinhas e emojis nos chats.
3. **Criação de figurinhas:** permitir criar figurinhas a partir de fotos, com
   controles apropriados para crianças e revisão do responsável quando fizer
   sentido.
4. **Edição criativa:** adicionar ferramentas para a criança personalizar fotos
   e interagir criativamente com integrantes autorizados dos grupos.
5. **Chamadas de vídeo com realidade aumentada:** disponibilizar efeitos visuais
   opcionais durante as chamadas, considerando desempenho, privacidade e suporte
   dos aparelhos.
6. **Jogos infantis no chat:** permitir jogos adequados à idade entre integrantes
   autorizados da conversa ou do grupo.

## Critérios para planejar a V3.0

- Definir escopo, regras de idade/privacidade e disponibilidade por plataforma
  antes da implementação.
- Manter os recursos opcionais e fáceis de desligar, especialmente efeitos de
  câmera e criação/compartilhamento de imagens.
- Revisar descrições dos planos e preços no app, landing page, API e Stripe em
  conjunto, para evitar divergência entre o que é cobrado e o que é oferecido.
- O pedido de preços foi registrado, mas ainda não foi aplicado à conta Stripe.
  Esta sessão não disponibiliza uma ferramenta de administração Stripe; não
  inserir chaves secretas no repositório nem em mensagens.
