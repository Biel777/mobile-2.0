# Code review — Força de Vendas (mobile-2.0)

Documento único de adequação. O time implementa a partir daqui: integração com o Tradetools, esqueleto, o que falta para substituir o Transfer Order, a fronteira entre tela e regra, e o build nativo.

Data da leitura: 19/10/2026. Código em `mobile-2.0`, contrato real em `tradetools` (`webol/protected/modules/api` e `protected/models/ApiTransferOrder.php`) e montagem de URL em `transfer-order` (`www/js/App.js`, `www/config/const.js`, `www/view/configuracao/index.html`).

Severidade:

| Nível | Significado |
|---|---|
| Bloqueante | Impede login ou sincronização contra o Tradetools que já está no ar |
| Alto | O app sobe, mas a operação real quebra, mente ou não escala |
| Médio | Atrito de manutenção, build ou teste |
| Baixo | Convenção |

## Veredito

O transporte Legacy existe e fala `application/x-www-form-urlencoded` em `index.php?r=api/...`. Isso é o canal certo. Ele não está pronto para o Tradetools local nem para `trade.fidelize.com.br/{industria}`.

Três motivos, nesta ordem:

1. A URL nasce de variável de build (`EXPO_PUBLIC_API_BASE_URL`). Não há painel. O cliente HTTP e a chave do cache são criados uma vez, com essa URL. Trocar de indústria exige rebuild.
2. O caminho real é `{host}/{industria}/webol/index.php`. No ambiente local o segmento da indústria não existe: a API responde em `http://10.11.0.11/webol/index.php`. O adaptador só concatena `{base}/index.php`.
3. Os nomes de campo do adaptador são o perfil do simulador. O login do Tradetools devolve `id`, não `id_usuario`. A listagem de condições devolve `tabelas`, não `negociacoes`. O primeiro login real cai em `INCOMPLETE_CONTRACT` antes de qualquer pedido.

O esqueleto de camadas deve permanecer, com uma fronteira explícita: tela não calcula condição comercial e não conhece campo do PHP. Essa fronteira é o BFF, por enquanto dentro deste processo, sem serviço novo. Faltam lint, alias, pasta por fluxo e um store que não seja o único dono do app. Para substituir o Transfer Order ainda faltam preço por distribuidor, mix, demanda do mês, lojas adicionais e justificativa na tela. Build de loja ainda não tem ícone, EAS, cleartext HTTP nem prova em aparelho.

A ordem de implementação é a seção final. Integração e fronteira vêm antes do binário.

---

# 1. Integração real com o Tradetools

## 1.1 Como a URL é montada hoje

O Transfer Order guarda host e código da empresa no aparelho e monta a base em tempo de execução.

```555:580:transfer-order/www/js/App.js
getWebolUrl: function () {
    // https ou http + host + "/" + empresa
    url += this.getConfig('host') + '/';
    url += this.getConfig('empresa').toLowerCase().trim();
    return url;
},
```

Cada chamada soma essa base com um caminho que já inclui `/webol`:

```
{scheme}://{host}/{empresa}/webol/index.php?r=api/{rota}
```

Exemplo de produção, empresa `sanofi`:

```
https://trade.fidelize.com.br/sanofi/webol/index.php?r=api/authentication/new
```

Host vazio cai em `trade.fidelize.com.br`. A empresa vem do campo "Código da empresa" em `www/view/configuracao/index.html`, junto com ambiente, host MS Bit, SSL e versão. Nada disso é compilado no binário.

No Tradetools local não há o segmento da indústria. O mesmo `authentication/new` responde em:

```
http://10.11.0.11/webol/index.php?r=api/authentication/new
```

`http://10.11.0.11/index.php` é outra entrada do monólito. A API mobile do WebOL não está nela.

O mobile-2.0 faz isto:

```101:101:src/api/legacy.ts
const url = `${base.endsWith('/index.php') ? base : `${base}/index.php`}?r=api/${route}${method === 'GET' ? `&${form.toString()}` : ''}`;
```

`base` vem de `EXPO_PUBLIC_API_BASE_URL`, lida em `src/api/config.ts` na carga do bundle. Sem a variável, `mode` vira `mock` e o app nem tenta HTTP (`readMode` em `config.ts`).

Consequência prática:

| Base configurada | URL gerada | Resultado |
|---|---|---|
| vazio | nenhuma | Demonstração local. Parece funcionar. |
| `http://10.11.0.11` | `http://10.11.0.11/index.php?r=api/...` | Entrada errada do monólito |
| `http://10.11.0.11/webol` | `http://10.11.0.11/webol/index.php?r=api/...` | Caminho local correto, só se o env for recompilado |
| `https://trade.fidelize.com.br/sanofi/webol` | `.../sanofi/webol/index.php?r=api/...` | Caminho de produção correto, também só via rebuild |

O formato `{base}/index.php` até alcança o Yii se alguém escrever a base inteira, inclusive `/webol`. Isso não é um painel, não distingue local de produção e não impede o erro de apontar para `10.11.0.11` sem `webol`.

## 1.2 A configuração não pode ser só variável de ambiente

`EXPO_PUBLIC_*` é substituída no bundle. Mudou o host, reinicia o Expo. No binário de loja, mudar de indústria é um build novo.

O cliente e o cache nascem dessa config e não são trocados depois:

- `src/data/store.ts` cria o client uma vez no closure (`createSalesApiClient({ ...apiConfig })`) e o `persist` usa o nome `forca-vendas-v5-${mode}-${protocol}-${baseUrl}`.
- `src/data/storage.ts` grava o token numa chave que também embute `config.baseUrl` lido na carga do módulo.
- `src/components/integration-status.tsx` só exibe `apiConfig.baseUrl`. Não edita.

Um campo de URL na tela, se apenas gravar texto, não altera o client que já está fechado na store. A troca de host tem de recriar o client e separar o cache por base. O isolamento por URL que já existe em `storage.ts` serve para isso, desde que a base deixe de ser constante de build.

## 1.3 Painel mínimo

Um campo de URL absoluta já cobre local e produção, se a pessoa souber digitar `/webol`. O padrão do Transfer Order é host + indústria, e é o que o representante e o suporte já usam. O painel deve oferecer os dois, com a URL completa como resultado visível.

Campos:

| Campo | Local | Produção |
|---|---|---|
| Protocolo | `http` | `https` |
| Host | `10.11.0.11` | `trade.fidelize.com.br` |
| Indústria | vazio | código da empresa, em minúsculas, como `empresa` no Transfer Order |
| URL resultante, somente leitura | `http://10.11.0.11/webol` | `https://trade.fidelize.com.br/{industria}/webol` |

Regra de montagem, equivalente a `getWebolUrl` + o prefixo `/webol` que hoje está nas constantes do Transfer Order:

```
{scheme}://{host}/{industria}/webol     quando indústria preenchida
{scheme}://{host}/webol                  quando indústria vazia
```

O adaptador continua recebendo essa base e acrescentando `/index.php?r=api/{rota}`. Não espalhar `webol` dentro de cada rota.

Comportamento:

- Tela acessível antes do login, como `configuracao/index.html`.
- Persistir em AsyncStorage, fora do `EXPO_PUBLIC_*`. O env pode ser só o valor inicial de desenvolvimento.
- Ao salvar uma base diferente, descartar a sessão e apontar o cache para a chave nova. Não reaproveitar token de outro host.
- Botão "Testar conexão" chama `authentication/new` com as credenciais da própria tela de login, ou, antes delas, só verifica se a URL responde JSON. Não usar credencial gravada no app.
- Mostrar a URL final e o erro cru (`HTTP`, `NETWORK`, `INCOMPLETE_CONTRACT`) em vez da faixa "Demonstração local".
- `http://10.11.0.11` sem `/webol` deve ser rejeitado na validação, com o caminho sugerido ao lado.

Fora deste painel: host MS Bit, beta, ambiente production/dev/test e OneTrust. O Transfer Order tem esses campos. Eles não destravam o Tradetools local.

## 1.4 O mapeamento não lê a resposta real

Mesmo com a URL certa, o login contra o código atual do Tradetools falha.

`ApiTransferOrder::autenticarUsuario` devolve:

```197:205:tradetools/protected/models/ApiTransferOrder.php
$this->_retorno = [
    'status' => 'ok',
    'login' => $usuario->usu_login,
    'token' => $usuario->token,
    'id' => $usuario->id,
    'id_nivel' => $usuario->id_nivel,
    'codigo_sincronizacao' => $sincronizacao->id,
    'timezone' => $usuario->timezone
];
```

O adaptador exige `id_usuario` e, na falta, `EXPO_PUBLIC_API_USER_ID`:

```142:143:src/api/legacy.ts
const userId = Number(result.id_usuario ?? options.userId);
if (!Number.isInteger(userId) || userId <= 0) return incomplete('login não fornece id_usuario; ...');
```

O campo que identifica o representante na resposta real é `id`. `id_nivel` continua sendo nível de acesso e não pode ser usado como usuário. A proteção contra `id_nivel` está correta. A leitura de `id` é que falta. Sem isso, o único jeito de entrar no Tradetools local é cravar o id num env, o que é o atalho errado.

A sincronização seguinte também não passa. Exemplos confirmados no PHP, não no simulador:

| Rota | O Tradetools devolve | O adaptador exige |
|---|---|---|
| `negociacoes/index` | `tabelas` (`NegociacoesController::actionIndex`) | `negociacoes`, com `id_tabela`, `nome`, `valor_minimo`, `gatilhos` |
| `clientes/index` | `id`, `razao_social`, `nome_fantasia`, `cnpj`, `cidade` (`ClientesController::getAssinatura` e `getDadosClientes`) | `id_cliente`, `nome`, `id_area`, `tem_area` |
| `authentication/new` | `id` | `id_usuario` |

`getBootstrap` ainda espera, em cada PDV, `prazos` e `codigo_faturamento_por_prazo`, e em cada produto `preco_lista`, `desconto_base`, `faixas`, `multiplo`. Esses nomes são o laboratório descrito em `docs/integracao-legacy.md`. Se o campo falta, `incomplete()` aborta a carga inteira. Não há modo de tolerar um envelope real e listar o que faltou.

Há um segundo bloqueio de modelo, independente do nome do campo. Se o preço do mesmo EAN muda entre PDV ou distribuidor, `getBootstrap` lança `INCOMPLETE_CONTRACT` e recusa a carteira (`legacy.ts`, comparação `JSON.stringify` dos produtos). No Transfer Order o preço é por distribuidor (`distribuidores/getPrecosProdutosPorDistribuidor`). Num tenant real essa divergência é o caso comum, não o excepcional.

## 1.5 Volume e teste no navegador

`getBootstrap` chama `clientes/getDistribuidores` por PDV e `produtos/getProdutosDaTabela` por PDV × tabela × distribuidor, em série. O timeout padrão é 15 segundos (`legacy.ts`). Uma carteira pequena de laboratório cabe. Uma carteira de representante não cabe.

`listOrders` pede `subPedidos/index` com `time=1970-01-01 00:00:00` e em seguida `nota/index` sem filtro. No Transfer Order a sync é incremental, com `codigo_sincronizacao` e ids já baixados. Trazer o histórico inteiro a cada atualização vai falhar ou travar o aparelho.

O módulo `webol/protected/modules/api` não envia `Access-Control-Allow-Origin`. O app Cordova não precisava. O Expo Web em `http://localhost:8081` chamando `http://10.11.0.11` é bloqueado pelo navegador antes do JSON. Isso não é defeito do mapeamento. Para ver a integração no browser faz falta um proxy de desenvolvimento no Metro, encaminhando `/webol` para `10.11.0.11`. No aparelho e no emulador não há esse bloqueio. Android em HTTP claro (`10.11.0.11`) ainda exige `usesCleartextTraffic` no build de desenvolvimento. O item 3 detalha isso.

O simulador em `tools/simulator` continua válido para o motor e para a fila. Ele não substitui um login contra `10.11.0.11`. Os testes de `src/api/legacy.test.ts` hoje protegem o perfil sintético. Quando o mapeamento passar a aceitar `id` e `tabelas`, esses testes precisam de um caso com o envelope do PHP, senão o laboratório volta a ser a única verdade.

## 1.6 Achados

### CR-01 — Bloqueante — URL só existe em tempo de build

`src/api/config.ts` lê `EXPO_PUBLIC_API_BASE_URL`. `src/data/store.ts` fecha o client e o nome do `persist` com esse valor. Não há tela de host.

Impacto: com o Tradetools em `10.11.0.11`, o app aberto por `npm run web` continua na demonstração. Apontar o `.env` exige reiniciar o bundle e não serve para o binário.

Fazer: persistir host, protocolo e indústria; montar a base; recriar o client ao salvar; incluir a base na chave de cache que `storage.ts` já sabe separar.

### CR-02 — Bloqueante — O segmento `/webol` e a indústria opcional não fazem parte da regra

O Transfer Order produz `{scheme}://{host}/{empresa}/webol/index.php?r=api/...`. Localmente `{empresa}` some. O adaptador só conhece `{base}/index.php`.

Impacto: `http://10.11.0.11` acerta o `index.php` errado. `https://trade.fidelize.com.br/industria` sem `/webol` também.

Fazer: uma função pura, testada, com os dois exemplos acima como casos. Indústria vazia é o modo local. Indústria preenchida é o modo `trade.fidelize.com.br`.

### CR-03 — Bloqueante — Login ignora o `id` que o Tradetools envia

Evidência: `ApiTransferOrder.php` linhas 197–205 contra `legacy.ts` `login`. A assinatura documentada em `AuthenticationController::getAssinatura` ainda mostra só `id_nivel`; o método real já grava `id`. Confiar no método, não no exemplo antigo da assinatura.

Impacto: login real termina em `INCOMPLETE_CONTRACT`. Configurar `EXPO_PUBLIC_API_USER_ID` mascara o problema e pode gravar pedido no usuário errado.

Fazer: aceitar `id` como id do representante. Continuar recusando usar `id_nivel` no lugar. Manter `id_usuario` como alias, se algum tenant antigo o enviar. Teste com o JSON real, sem o campo `id_usuario`.

### CR-04 — Bloqueante — Bootstrap exige o envelope do simulador

`negociacoes/index` devolve `tabelas`. `clientes/index` devolve `id`, `razao_social` ou `nome_fantasia`, `cnpj`, `cidade`. O adaptador exige `negociacoes`, `id_cliente`, `nome`, `id_area`, `tem_area`, e ainda `gatilhos` e `faixas` como listas obrigatórias.

Impacto: depois de um login consertado, a sync morre no primeiro objeto incompleto e a carteira fica vazia.

Fazer: mapear os aliases conhecidos (`tabelas`/`negociacoes`, `id`/`id_cliente`, `razao_social`/`nome`). Campo opcional ausente vira ausência no domínio, não `INCOMPLETE_CONTRACT`. Campo obrigatório ausente entra numa lista de lacunas mostrada na barra de integração, com a rota e o nome do campo. Gravar uma resposta anonimizada de `10.11.0.11` como fixture de teste antes de alargar o mapper. Não inventar `id_area` se o cliente não trouxer área: o domínio já bloqueia pedido sem área (`NO_AREA`).

### CR-05 — Bloqueante — Preço diferente por PDV ou distribuidor aborta a carga

`getBootstrap` compara o catálogo da tabela entre combinações e recusa a diferença.

Impacto: o tenant real não sincroniza. O simulador passa porque as amostras são iguais de propósito (`docs/integracao-legacy.md`).

Fazer: o preço da linha pertence à combinação PDV × tabela × distribuidor, como no Transfer Order. Enquanto o modelo global existir, a sync pode carregar o preço do primeiro distribuidor escolhido na digitação, e buscar de novo ao trocar o distribuidor. Recusar a carteira inteira impede o teste local.

### CR-06 — Alto — Modo padrão é mock

`readMode` sem variável retorna `mock`. A faixa diz "Demonstração local".

Impacto: quem sobe o app para ver o Tradetools acredita que a integração respondeu.

Fazer: com painel salvo apontando para um host, o modo é HTTP Legacy. Mock só com ação explícita de demonstração, visível o tempo todo.

### CR-07 — Alto — Sync em série, timeout de 15s, histórico desde 1970

`getBootstrap` e `listOrders` em `legacy.ts`.

Impacto: contra `10.11.0.11` com carteira real, a primeira sync estoura tempo ou memória. O representante não distingue timeout de contrato inválido, porque os dois caem na mesma faixa de erro.

Fazer: paginar ou limitar a primeira prova a um PDV. Sync incremental com `codigo_sincronizacao` e `ids_clientes`, que `clientes/index` já documenta. `subPedidos` com `time` da última sync, não da época Unix. Subir o timeout só não resolve.

### CR-08 — Alto — Expo Web não atravessa o Tradetools local

Não há `Access-Control-Allow-Origin` no módulo `webol/protected/modules/api`. O Cordova não dependia disso.

Impacto: `npm run dev:integration` prova o simulador. O navegador em `:8081` não prova `10.11.0.11`.

Fazer: proxy de desenvolvimento no Metro para `/webol` → `http://10.11.0.11`. Documento de teste com os dois destinos: simulador e Tradetools via proxy. Não abrir CORS no monólito para acomodar o browser.

### CR-09 — Médio — `codigo_faturamento` obrigatório no envio

`submitOrder` recusa a ordem se faltar `codigo_faturamento`. O prazo em dias não vai no formulário. O mapa em `docs/integracao-legacy.md` marca esse código como obrigatório e não confirmado.

Impacto: um pedido digitado contra dados reais pode não sair, mesmo com PDV, tabela e quantidade válidos.

Fazer: na primeira integração, descobrir de qual campo de `getDistribuidores` ou `getFiliaisDeClientes` o Transfer Order tira esse código (`www/controller/BlocoPedidosDistribuidorController.js`) e mapear esse campo. Não gerar o código a partir do id do distribuidor.

### CR-10 — Baixo — Avisos de laboratório permanecem corretos

Cupom, bandeira, PDF e deduplicação por `order_client_id` seguem sem contrato. O adaptador já recusa cupom e avisa. Manter assim até uma resposta real provar o campo. Não faz parte do painel de URL.

## 1.7 Ordem para fechar o item 1

1. Função de URL com testes: local sem indústria, produção com indústria, rejeição de host sem `/webol`.
2. Painel antes do login, persistência, troca de client e de chave de cache.
3. Proxy de desenvolvimento para o browser falar com `10.11.0.11`.
4. Login lendo `id`. Teste com o JSON de `autenticarUsuario`.
5. Uma sync real, gravando a resposta anonimizada, e só então alargar o mapper (CR-04 e CR-05).
6. Envio de um pedido de homologação quando o código de faturamento tiver campo de origem confirmado (CR-09).

O passo 5 não deve ser escrito no escuro. O primeiro login bem-sucedido contra `10.11.0.11` é a fixture.

---

# 2. Padrões, lint e esqueleto

## 2.1 O que já é padrão e deve ficar

A divisão atual é a parte sadia do repositório. Não reorganizar para imitar a árvore do order-website.

| Camada | Pasta | Regra que já vale |
|---|---|---|
| Rotas | `app/` | Tela Expo Router. Não calcula preço. |
| Regra | `src/domain/` | TypeScript puro. Sem React, sem `fetch`. Teste ao lado. |
| Porta HTTP | `src/api/` | `SalesApiClient` mais adaptadores `legacy`, `http` e `mock`. |
| Estado | `src/data/` | Zustand persistido. Token nativo no SecureStore. |
| Fila | `src/sync/` | Envio, retry e confirmação incerta. |
| UI | `src/components/`, `src/theme.ts` | Um único conjunto de tokens. Sem segunda biblioteca visual. |

`src/domain/pricing.ts` e `src/domain/validation.ts` são o modelo a repetir: função pura, teste com o número da regra, tela só chama. A seção 5 dá a essas pastas o papel de BFF interno. O comportamento puro permanece; o que muda é quem a tela tem permissão de importar.

O que faz o projeto parecer mal estruturado é outro conjunto de fatos: import relativo longo, arquivo de tela com centenas de linhas, um store que conhece visita, meta, pedido e login, e nenhum lint. Isso se corrige em cima das camadas, sem fundir regra e GraphQL num `hooks/`.

## 2.2 Achados

### CR-11 — Alto — Não há ESLint nem Prettier

Não existe configuração de lint no repositório. `package.json` tem `test` e `dev:integration`. O TypeScript (`strict` via Expo) pega tipo, não formato, import morto ou convenção de nome.

Impacto: o estilo de `legacy.ts` (várias declarações na mesma linha, arquivo de 262 linhas sem folga) e o de `app/index.tsx` divergem sem ninguém ser avisado. Review humano vira discussão de vírgula.

Fazer: ESLint com `eslint-config-expo` e Prettier, os dois no `npm test` ou num `npm run lint` chamado pelo mesmo fluxo. Regras iniciais, só o que o Expo já recomenda mais `no-unused-vars` ligado. Não desligar variável não usada, como o `.eslintrc.json` do order-website faz. Formatar numa mudança separada do restante do review, para o diff de regra não se misturar com o diff de aspas.

### CR-12 — Alto — Não há alias de import

`tsconfig` e `babel.config.js` não declaram paths. `app/index.tsx` importa `../src/domain/portfolio`. Uma tela em `app/pedido/[id]/revisao.tsx` sobe três níveis.

Impacto: mover um arquivo quebra uma lista de relativos. O alias também documenta a camada: `@domain`, `@api`, `@data`, `@sync`, `@components`.

Fazer: paths no `tsconfig` e `babel-plugin-module-resolver` coerentes. Prefixo por camada, não por pasta solta (`@hooks` no order-website virou gaveta). Incluir o alias no ESLint `import/no-relative-packages` ou equivalente, para caminho relativo entre camadas não voltar.

### CR-13 — Alto — `store.ts` é o aplicativo inteiro

`src/data/store.ts` (237 linhas) cria o client, faz login, sync, rascunho, fila, visitas, avisos e o nome do persist. `app/pedido/[id].tsx` tem 532 linhas e concentra condição, distribuidor e produto.

Impacto: qualquer ajuste de integração (recriar o client quando a URL muda) mexe no mesmo arquivo das visitas. Teste de store vira teste de tudo.

Fazer: cortar por fluxo, sem criar um hook por modal.

```
src/data/session.ts      login, logout, sessão
src/data/catalog.ts      bootstrap e carteira (o arquivo já existe e pode absorver a sync)
src/data/orders.ts       rascunho, enqueue, flush
src/data/visits.ts       o que hoje está no mesmo store
src/connection/endpoint.ts   URL montada e client atual
app/pedido/[id]/condicao.tsx
app/pedido/[id]/distribuidores.tsx
app/pedido/[id]/produtos.tsx
app/configuracao.tsx
```

Um store Zustand pode continuar, composto por essas fatias, para não reintroduzir Context e ContextOld. A tela de pedido deixa de ser um único arquivo. A configuração do item 1 nasce em `app/configuracao.tsx` e `src/connection/endpoint.ts`, não dentro de `store.ts`.

### CR-14 — Médio — Nomes em duas línguas sem critério

Rotas em português (`app/pedidos`, `app/positivacao`) e domínio em inglês (`quoteOrder`, `TrackedOrder`). Os dois são aceitáveis. O que falta é a regra: rota e texto de tela em português, identificador de código em inglês. Hoje um leitor não sabe se o próximo arquivo deve se chamar `nota` ou `invoice`.

Fazer: uma frase no README técnico. Não renomear rotas já em uso só por simetria.

### CR-15 — Médio — Documentos de processo misturados ao produto

`.squad/` e `docs/melhorias/` contam ondas e QA do simulador. Quem procura "como apontar para o Tradetools" cai no README, que ensina `dev:integration` e o usuário `marina`.

Fazer: o README de subida distingue três destinos: demonstração, simulador, Tradetools em `10.11.0.11`. Este review fica em `docs/`. `.squad/` não é guia de operação.

### CR-16 — Baixo — `legacy.ts` concentra transporte, mapeamento e regra de payload

262 linhas com `request`, `mapLegacyGoals`, `mapProduct` e `submitOrder`. O teste existe e é o lugar certo. O arquivo vai crescer quando os aliases do CR-04 entrarem.

Fazer: separar `legacy-transport.ts` (URL, form, timeout) de `legacy-map.ts` (JSON do PHP → tipos do domínio) quando o mapeamento real começar. Não antes: separar o perfil sintético só muda o diff de lugar.

## 2.3 Esqueleto alvo

O desenho abaixo é o mesmo app. A seção 5 explica por que as regras saem de debaixo da tela e por que o PHP fica atrás de uma pasta só. Não é uma reescrita e não é outro repositório.

```
app/                          o que o usuário faz: login, configuração, passos do pedido
src/components/               peças de tela
src/theme.ts

src/bff/                      única entrada das telas
  cases/                      login, sincronizar, cotar, validar, enviar, acompanhar
  rules/                      o que hoje é src/domain: puro, testável, usado offline
  tradetools/                 o que hoje é src/api/legacy.ts: form, URL, nomes do PHP
  contract.ts                 tipos que a tela pode ver

src/data/                     cache do aparelho
src/sync/                     fila; as telas chamam o caso de uso, não a fila
```

`src/domain` e `src/api` continuam valendo até o lint impedir o import cruzado. A mudança de pasta é o momento dessa trava, não um objetivo separado.

Ferramentas, na mesma leva do CR-11 e CR-12:

- `eslint-config-expo`, Prettier, script `lint`
- paths `@bff/*`, `@rules/*`, `@tradetools/*`, `@data/*`, `@components/*`
- regra de import: `app/` e `src/components/` só importam `@bff/cases` e o contrato. Não importam `@rules` nem `@tradetools`
- `npm test` segue dono da regra; `npm run lint` dono do formato e dessa fronteira

O que não trazer do order-website: um arquivo de tipo por conceito, hook que embute `gql`, três kits visuais, Context numerado (`ShoppingCartContext2`) e View/Model aplicado em três telas e ignorado nas outras.

## 2.4 Ordem para fechar o item 2

1. ESLint, Prettier e alias, sem mover regra de negócio.
2. `endpoint.ts` + `app/configuracao.tsx`, porque o item 1 depende disso.
3. Fatiar `store.ts` e `app/pedido/[id].tsx` quando a URL nova estiver testada. Fazer os dois ao mesmo tempo mistura regressão de pedido com regressão de host.

---

# 3. Build Android e iOS — primeira passagem

O app é Expo SDK 52, React Native 0.76, `newArchEnabled: true`, pacotes `br.fidelize.forcavendas` e o mesmo bundle id no iOS (`app.json`). Scripts `android` e `ios` existem e apenas chamam `expo start`. Não há `eas.json`, pasta `ios/`, pasta `android/`, ícone, splash, nem `assets/` referenciado pelo manifest. As fontes pedidas em `app/_layout.tsx` precisam existir no bundle; o manifest nativo ainda não declara ícone.

Isso significa: o mesmo código pode gerar os dois binários, e hoje ninguém provou. O Transfer Order publica com Cordova e Fastlane (`config.xml`, `fastlane/`). Este app não herda esse pipeline. A troca de tecnologia de build é esperada (EAS ou `expo prebuild` + Fastlane). O que não pode acontecer é considerar o `npm run web` como prova de loja.

Achados desta passagem, para detalhar numa etapa seguinte:

| ID | Nível | Fato | Efeito |
|---|---|---|---|
| CR-17 | Bloqueante para loja | Sem ícone, splash e `eas.json` | `eas build` não tem o que empacotar como app de marca |
| CR-18 | Bloqueante para o teste local em Android | API em `http://10.11.0.11` | Android 9+ bloqueia HTTP claro. O build de desenvolvimento precisa de cleartext só para esse host. Produção em `https://trade.fidelize.com.br` não usa essa exceção |
| CR-19 | Alto | `newArchEnabled: true` sem um build nativo executado | A primeira compilação iOS/Android é o momento em que módulos sem suporte à nova arquitetura quebram. SecureStore e NetInfo estão no `package.json` e não foram exercitados em aparelho, como o próprio README diz |
| CR-20 | Alto | Token no browser fica só em memória (`storage.ts`) | Correto para web. No nativo o SecureStore já está previsto. Falta o build que prova a leitura depois de matar o processo |
| CR-21 | Médio | Versão `0.1.0`, sem `runtimeVersion` nem canal de update | Publicação ainda não tem como distinguir homologação e produção |
| CR-22 | Médio | `npm audit` citado em `docs/melhorias/integracao-sales-api.md` (58 avisos na época) | Tratar antes de ir à loja, em incremento próprio, sem `audit fix` forçado no meio da integração |

Para um primeiro binário interno, a sequência é: `eas.json` com perfil `development` (cleartext permitido), ícone e splash provisórios, `expo prebuild` ou EAS Build de desenvolvimento, instalar num aparelho na mesma rede que `10.11.0.11`, e repetir o login do item 1. iOS de release continua exigindo Mac ou o builder na nuvem. Esse passo vem depois do painel e do mapper. Um APK apontando para o mock não informa nada sobre o Tradetools.

---

# 4. O que falta para substituir o Transfer Order

Inventário do que o representante faz no app Cordova e do que este repositório cobre. A fonte do legado é `transfer-order/www`: wizard em `controller/BlocoPedidos*`, regras em `model/ProdutoPedido.js` e `TabelaNegociacao*.js`, rotas em `config/const.js`. Visitas locais deste app não substituem o Quester e não entram nesta lista.

| Capacidade | Situação | Onde a regra deve morar | Trabalho |
|---|---|---|---|
| Login e sessão | Fluxo pronto, contrato errado | caso de uso; mapa em `tradetools` | CR-03 |
| Painel host e indústria | Ausente | tela; montagem em `tradetools` | CR-01, CR-02 |
| Carteira e PDV | Pronto depois do mapper | `rules` decide área; tela só lista | CR-04 |
| Condição comercial | Pronta para tabela vigente | `rules` | CR-04 |
| Itens, fração, mínimo e máximo | Prontos | `rules` (`validation`) | manter |
| Desconto-base e faixa por quantidade | Prontos | `rules` (`pricing`) | manter como prévia offline; o PHP revalida no envio |
| Preço por distribuidor | Ausente; a sync recusa a diferença | `rules`, preço da combinação PDV × tabela × distribuidor | CR-05 |
| Desconto por classificação e por família | Ausente | `rules`. No legado está em `ProdutoPedido.js` | não calcular na tela |
| Demanda e faturado no mês | Campo `monthBilledNet` existe; as rotas de histórico não são chamadas | `tradetools` busca `historicoProdutosPedidosNoMesAtual` e `historicoProdutosFaturadosPorTabelaNoMesAtual`; `rules` soma | CR-07 |
| Combo e item obrigatório | Participação e `required` prontos; cesta (`basket`) não bloqueia | `rules` | completar a cesta na validação |
| Segmentação de mix | Ausente | `tradetools` lê `segmentacaoMix`; `rules` filtra o sortimento | sem isso o catálogo do PDV fica largo demais |
| Código do pedido e justificativa | Campos no payload; a tela não coleta | tela coleta; `rules` decide se a justificativa é obrigatória | não deixar a obrigatoriedade num `if` da revisão |
| Lojas adicionais | Ausente. O legado envia um pedido por loja | caso de uso repete o envio; tela escolhe as lojas | `PedidoLojaAdicional.js` |
| Ordem, prazo e código de faturamento | Prazo vira código; a origem do código não está confirmada | `tradetools` | CR-09 |
| Agendamento com divisão | A tela aceita datas; só o mock divide quantidades | `rules` divide; `tradetools` manda `agendamento` | `domain/schedule.ts` já tem `splitLines` |
| Fila offline | Pronta na estrutura | `sync`, chamada pelo caso de uso | AsyncStorage basta até a carteira não caber |
| Envio `receberPedidoMobile` | Rota pronta | caso de uso | depende de CR-03 a CR-05 e CR-09 |
| Acompanhamento e nota | Status, subpedido e dados da nota. Sem PDF | tela exibe o contrato; PDF só quando o PHP tiver rota | não desenhar DANFE no client |
| Metas e positivação | `metas/desempenhoArea` e telas. Sem KPI GraphQL nem MDTR | caso de uso | MDTR está com o menu desligado no legado; não é bloqueio |
| Bloqueio de horário e OneTrust | Ausentes | tela de bloqueio; consentimento chama `oneTrust` | depois do primeiro pedido real |
| Sugestão MS Bit | Ausente | outro host (`bit.fidelize.com.br`), outro caso de uso | não misturar com o WebOL |

Gatilho, teto e cupom já existem em `src/domain/pricing.ts` e o Transfer Order não os calcula. Cupom continua bloqueado no envio até o PHP confirmar o campo. Não apagar o cálculo. Não mostrar cupom como disponível.

Nada disso se implementa importando `ProdutoPedido.js` na tela. Cada linha da tabela acima ou já está em `rules`, ou entra em `rules` / `tradetools` / `cases`. A tela só chama o caso de uso.

# 5. Funcionalidade e regra, no mesmo processo

A regra comercial no Transfer Order está nos controllers, ao lado do HTML. No Tradetools a mesma família de regra está no PHP, e o app móvel recalcula uma cópia. Esse é o incômodo: duas implementações, e a da tela é a que o representante vê antes do servidor concordar.

Um BFF separado resolveria o lugar único. Não vamos abrir esse serviço agora. A fronteira, sim, fica criada neste repositório, para o dia em que o processo existir a tela não mudar.

Três papéis:

| Papel | Pode | Não pode |
|---|---|---|
| Funcionalidade (`app/`, `src/components/`) | Listar, coletar quantidade, mostrar bloqueio, navegar | Saber `preco_lista`, `id_nivel`, fórmula de faixa, nome de rota Yii |
| Casos de uso (`src/bff/cases/`) | Ordenar sync, fila e cotação; devolver um resultado que a tela entende | Montar `application/x-www-form-urlencoded` |
| Regras (`src/bff/rules/`) | Preço, desconto, mínimo, fração, combo, mix, divisão de agenda | Importar React ou `fetch` |
| Tradetools (`src/bff/tradetools/`) | URL, formulário, alias `id`/`id_usuario`, `tabelas`/`negociacoes` | Decidir se o pedido pode ser enviado |

A tela pede `cotar(pedido)` e recebe totais, selos e a lista de bloqueios. Pede `enviar(pedido)` e recebe enviado, rejeitado ou confirmação incerta. O nome `negociacoes` não atravessa essa chamada.

Offline continua exigindo regra no aparelho. Sem isso não há digitação sem rede, que é o comportamento do Transfer Order. A cópia local é prévia: o Tradetools revalida no `receberPedidoMobile`, como o adaptador já faz ao tratar `LEGACY_REJECTED`. Quando o BFF virar processo, `rules` muda de endereço e o aparelho guarda o snapshot para o offline. `cases` e as telas ficam.

O que não fazer nesta etapa: extrair um Node ou um PHP novo, duplicar o motor de `ProdutoPedido` inteiro antes de ter resposta real de `10.11.0.11`, nem mover cálculo para dentro de `app/pedido`. O motor que já está em `src/domain` é a primeira versão de `rules`. Ele muda de pasta quando a regra de import do ESLint entrar. Até lá, tela nova não importa `src/domain` nem `src/api` direto; importa uma função de caso de uso, mesmo que essa função ainda more ao lado do store.

# Ordem de trabalho

1. URL, painel e proxy (CR-01, CR-02, CR-08).
2. Login com `id` e uma sync real gravada como fixture (CR-03, CR-04).
3. ESLint, Prettier, alias e a trava de import da seção 5 (CR-11, CR-12).
4. Preço por distribuidor, sem abortar a carteira (CR-05).
5. Mix, histórico do mês, justificativa e código do pedido na tela (seção 4).
6. Lojas adicionais e divisão de agendamento.
7. Binário de desenvolvimento contra `10.11.0.11` (seção 3). Horário, OneTrust, MS Bit e PDF ficam para depois desse binário.

Não reescrever o motor de preço. Não publicar nas lojas na mesma leva do painel.
