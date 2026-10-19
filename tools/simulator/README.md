# Simulador local Sales API

Este laboratório oferece o transporte **Legacy form** `/index.php?r=api/...` conforme o mapa fornecido e, opcionalmente, o contrato normalizado proposto `/api/mobile/v1`. Rotas e parâmetros Legacy foram documentados pelo usuário; os envelopes detalhados de leitura e códigos CF são **amostras sintéticas**, ainda sem homologação. O simulador não acessa o Sales API e não comprova compatibilidade operacional com o backend real. Use somente dados fictícios; o estado é mantido em memória e descartado ao reiniciar.

## Executar

```powershell
npm install
npm run simulator
```

Abra http://127.0.0.1:4010. Entre com `marina` e senha fictícia `demo`. Qualquer login não vazio e senha de três ou mais caracteres funciona neste simulador.

Para abrir o aplicativo web já apontando para o simulador, use em vez do comando anterior:

```powershell
npm run dev:integration
```

O comando inicia os dois processos com `EXPO_PUBLIC_API_PROTOCOL=legacy` por padrão. O painel também começa em Legacy; o seletor permite usar Mobile v1. A URL do app aparece no terminal do Expo. Se a porta 4010 já estiver ocupada por outro simulador, encerre essa instância antes.

Para iniciar o app manualmente, mantenha o simulador em outro terminal:

```powershell
$env:EXPO_PUBLIC_API_MODE = 'http'
$env:EXPO_PUBLIC_API_PROTOCOL = 'legacy'
$env:EXPO_PUBLIC_API_BASE_URL = 'http://localhost:4010'
npm run web
```

## Jornada de teste

1. Entre no painel e sincronize cadastros.
2. Envie o JSON de exemplo. Ele contém um pedido comercialmente válido.
3. Reenvie o mesmo JSON: o ID remoto deve permanecer igual. “Nova chave” prepara outro pedido.
4. Acompanhe pedidos e use aceitar, aceitar parcialmente, rejeitar ou faturar. Consulte novamente pelo aplicativo para atualizar o retorno.
5. Para agendar, inclua `array_agendamento: [{"data_envio":"2030-12-01"}]` no payload.
6. Aplique os cenários HTTP 500, 401, latência ou confirmação perdida. Os controles administrativos continuam funcionando para restaurar o cenário normal.
7. Na confirmação perdida, o primeiro envio é persistido e retorna HTTP 503. Reenvie o payload e a chave originais: haverá apenas um pedido. Esse cenário usa uma resposta explícita 503 para representar a confirmação indisponível, em vez de derrubar a conexão TCP.
8. Confira a última chamada, resposta e histórico. A visualização mascara senha/token; o histórico contém apenas método, caminho, status e duração.
9. Restaurar dados remove pedidos desta execução e repõe os exemplos iniciais; a sessão atual é preservada.

## Protocolo Legacy

Autenticação em POST authentication/new usa user[login], user[senha], user[imei], user[versao]; renovação session/new usa login/token/versão. Sync usa login/token/codigo_sincronizacao no formulário ou query GET. O laboratório inclui id_usuario=77 na resposta de login como campo adicional sintético; id_nivel=1 é nível de acesso, não ID do representante.

Endpoints implementados: clientes/index, negociacoes/index, clientes/getClientesTabelasNegociacoes, produtos/index, produtos/getProdutosDaTabela, clientes/getDistribuidores, pedidos/receberPedidoMobile, pedidos/getStatusPedidos, subPedidos/index, nota/index e metas/desempenhoArea. Consulte [o mapa recebido](../../docs/integracao-legacy.md) para os campos e lacunas.

Envio usa ordem_envio, produtos e agendamento com índices de formulário PHP. Omite id_usuario, prazo e tipo_envio; o código de faturamento conhecido resolve prazo/distribuidor. Códigos CF-501-21, por exemplo, são deliberadamente fabricados para este laboratório e nunca devem ser usados no tenant real. O desconto numérico é obrigatório em cada produto. Datahora é SQL no fuso de São Paulo; o período de agendamento é obrigatório. Cupons são bloqueados por ausência de canal confirmado.

Sucesso de envio retorna status ok e id_pedido, sem id_status; o adaptador consulta pedidos/getStatusPedidos, cujo status é textual. Acompanhamento agrega subPedidos e relaciona notas. O painel inspeciona chamadas form reais e mascara tokens/senhas inclusive nas URLs GET. Os controles administrativos usam Bearer, aceitando também o token emitido pelo login Legacy. O estado de pedidos é compartilhado entre os protocolos.

O laboratório comprova deduplicação forte por chave/payload; o backend legado ainda exige homologação dessa propriedade. As amostras de preço são iguais entre PDVs/distribuidores elegíveis; o adaptador recusa divergências até o modelo do app suportar preços por combinação. Metas e seus envelopes são sintéticos; bandeiras e cupons permanecem indisponíveis no adaptador Legacy.

## Contrato Mobile v1 opcional

| Método | Caminho                     | Resposta                                        |
| ------ | --------------------------- | ----------------------------------------------- |
| POST   | `/api/mobile/v1/auth/login` | `{token,userId,name}`; corpo `{login,password}` |
| GET    | `/api/mobile/v1/bootstrap`  | `{user,customers,tables,coupons,goals,flags}`   |
| POST   | `/api/mobile/v1/orders`     | `SubmitOrderResult`; corpo `SubmitOrderPayload` |
| GET    | `/api/mobile/v1/orders`     | `TrackedOrder[]`                                |
| GET    | `/api/mobile/v1/goals`      | `Goals`                                         |

No protocolo Mobile v1, todas as rotas de dados e controle exigem `Authorization: Bearer <token>`. Login, painel e `/health` são públicos. Envio de pedido exige `Idempotency-Key` igual a `order_client_id`; repetir a chave com conteúdo diferente retorna 409. Pedidos bloqueados pelas regras comerciais retornam HTTP 200 e `id_pedido_gerado: 0`, com `erros_envio`.

Controles exclusivos deste simulador: `GET /__sim/logs`, `POST /__sim/scenario {scenario}`, `POST /__sim/reset {}`, `POST /__sim/orders/transition {orderClientId,action}`. Os cenários são `normal`, `latency`, `server-error`, `unauthorized`, `lost-response`; ações são `accept`, `partial`, `reject`, `invoice`.

Limites: corpo até 256 KiB, 1000 produtos por pedido, seis distribuidores, doze agendamentos; histórico limitado a 100 entradas. Os dados não têm isolamento entre os usuários fictícios, todos representam a mesma carteira de demonstração.

## Celular / emulador

Por padrão o servidor escuta somente `127.0.0.1`. Para outro aparelho na mesma rede, configure explicitamente o host e use o IP de sua máquina na configuração do app:

```powershell
$env:SALES_SIM_HOST = '0.0.0.0'
$env:SALES_SIM_ALLOWED_ORIGINS = 'http://192.168.0.10:8081'
npm run simulator
```

Em outro terminal:

```powershell
$env:EXPO_PUBLIC_API_MODE = 'http'
$env:EXPO_PUBLIC_API_URL = 'http://192.168.0.10:4010'
npm start
```

Substitua o IP pelo do computador. No emulador Android, a origem normalmente é `http://10.0.2.2:4010`. Ajuste o firewall local se necessário. `localhost` no celular representa o próprio aparelho. O painel pode ser aberto em `http://IP:4010`. Somente abra o simulador em uma rede de desenvolvimento de confiança: autenticação e dados são fictícios.

`SALES_SIM_PORT` altera a porta (4010 por padrão). `SALES_SIM_ALLOWED_ORIGINS` aceita origens separadas por vírgula; por padrão apenas localhost/127.0.0.1 em 8081 e 4010 e a própria origem do servidor são permitidos. Apps nativos não enviam Origin. Para usar outra porta Expo ou outro host no navegador, adicione a origem exata.

## Verificação

```powershell
npm test -- tools/simulator
npx tsc --noEmit
```

Os testes usam instâncias e portas temporárias isoladas, com limpeza ao terminar. Incluem integração real do adaptador HTTP, idempotência, falhas, autenticação, CORS, limites e recuperação de timeout. Nenhum Sales API real é necessário.
