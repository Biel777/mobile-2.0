# Análise e execução — integração Sales API

## Diagnóstico e escopo

Projeto Força de Vendas: React Native 0.76, Expo SDK52, React18, TypeScript, Expo Router, Zustand/AsyncStorage, Vitest. O domínio comercial é separado das telas. Antes desta alteração, store/telas consumiam fixtures e mock diretamente; não havia chamadas HTTP. O mock avançava status durante consulta. A fila não isolava requests por geração de sessão e substituía a lista completa após await.

Baseline: 15 testes aprovados; TypeScript falhava por propriedades duplicadas de estilo em positivacao.tsx. Export web falhou por versões expo-asset/font incompatíveis com SDK52. Esses impedimentos foram corrigidos para executar a validação.

Escopo autorizado: integração de API no aplicativo e laboratório para testar sem instalar o monólito. Após o primeiro incremento normalizado, o usuário forneceu o mapa Legacy registrado em [integracao-legacy.md](../integracao-legacy.md), viabilizando adaptador direto form/rotas Yii sem exigir novo backend.

## Arquiteto

- Manter stack e domínio. Porta SalesApiClient separa mock interno, HTTP normalizado e HTTP Legacy.
- Validar transporte, respostas e sucesso semântico. Timeout e erros preservam rascunho; credenciais não vão em EXPO_PUBLIC nem logs.
- Congelar payload antes de enviar, preservar order_client_id, serializar flush e interromper lotes quando sessão/conexão mudar.
- Reconciliar confirmação incerta pelo ID cliente; impedir edição enquanto não houver confirmação.
- Separar cache por ambiente/protocolo e dono. Token nativo SecureStore; web somente memória. Escritas persistidas serializadas.
- O simulador é um processo separado; testes usam sockets HTTP e instâncias isoladas. Corpo/histórico têm limites e CORS restrito. Isso mede comportamento, não throughput de produção.
- Não inferir codigo_faturamento nem aplicar cupom por campo não documentado. Descontos enviados vêm do motor. Não confundir id_nivel com ID usuário. Envelopes sem dados suficientes falham explicitamente.

## PM — prioridades e jornadas

P0: login → sincronizar carteira/condições → escolher PDV/tabela/OPL/prazo → itens/revisão → envio HTTP → consultar retorno/nota.

P0: painel → login fictício → chamada manual inspecionável → erro controlado → recuperação/reenvio sem duplicação.

P0: offline → persistir → reconectar → enviar com a mesma identidade; logout durante request não envia os itens seguintes em outra sessão.

P1: metas e avisos de cobertura de integração. Gaps de contrato não podem aparecer como metas verdadeiras zeradas sem explicação.

Fora deste incremento: migração SQLite, atualização completa SDK, publicação, backend PHP instalado, homologação real, PDF/DANFE, contrato cupom e metas bandeira não fornecidos, GraphQL por tenant sem queries/endpoint, garantias de execução com app encerrado pelo sistema.

## Designer

Preservados tema, componentes e fluxos existentes. Barra de integração informa protocolo/origem, rede, sincronização, saída e erro. Login tem carregamento e bloqueio de toque repetido. Pedidos distinguem fila/falha/envio confirmado. Confirmação incerta abre orientação e tentativa de consulta/reenvio em vez de edição silenciosa. O painel usa etapas conectar → enviar → acompanhar, formulário JSON editável e chamadas/respostas mascaradas.

## Matriz de aceite

| Requisito | Prioridade/motivo | Mudança | Critério | Evidência |
|---|---|---|---|---|
| RN001 / RT001 | P0 dados via rede | adapters + bootstrap store/telas | autenticar e carregar API sem fixtures diretas em telas | testes HTTP/store; jornada web |
| RN002 / UX001 | P0 testar sem monólito | laboratório HTTP/painel | chamadas editáveis e respostas/status visíveis, retornos controlados | sockets HTTP + inspeção navegador |
| RN003 / RT002 | P0 evitar perdas/duplicatas | fila com freeze e single flight | reconexão e retry preservam payload, novo draft não some | testes store/fila/simulador |
| RT003 | P0 isolamento | geração sessão, dono, guard rotas | logout interrompe lote, outro usuário não recebe cache ativo anterior | testes de sessão |
| RT004 | P0 contrato confiável | schemas + status/ID | erro/HTML/JSON/ID0 não vira enviado, 401 pede login | testes adapter/QA |
| RT005 | P0 Legacy fornecido | form e tradução de wire | user bloco, descontos/códigos, status pós-envio | testes Legacy a registrar no fechamento |
| UX002 | P1 informação coerente | status real e warnings | atualizar não inventa aceite; gaps visíveis | teste store + revisão visual |

## QA e validação final

O QA independente encontrou quatro defeitos corrigidos: envio do restante de lote após logout; payload editável depois de confirmação perdida; aceite de ID0 sem erro; perda de status401 na fila. Regressões cobrem cada caso. Baseline do domínio preservado.

Verificações do primeiro incremento: 39 testes, TypeScript e export web aprovados. Jornada no navegador: login → novo pedido 120 BUSCODUO → retorno remoto9000 → painel faturar → app atualiza → NF9000-1 R$1665, 120 pedidas/atendidas/faturadas. A extensão Legacy será incluída no fechamento abaixo.

PM e Arquiteto validam separadamente ao final: laboratório e fluxo HTTP podem ser aceitos sem alegar homologação com tenant real. Builds e comportamento nativos não verificados neste ambiente.

## Riscos e próximos dados necessários

O mapa de endpoints do usuário substitui a necessidade de inventar um gateway, mas não contém todos os envelopes JSON de cadastro/metas. Fixtures Legacy do laboratório devem ser tratadas como amostras sintéticas. Validar com respostas anonimizadas da documentação viva antes de produção. Confirmar G1 códigos×prazo, G2 cupom, G5 status, G6 bandeiras, G7 base metas e deduplicação real.

A árvore atual possui avisos de dependências: `npm audit --omit=dev` reportou 58 entradas (21 moderadas,36 altas,1 crítica). Não foi aplicado audit fix forçado por envolver mudanças de stack fora da integração. A modernização do SDK/dependências requer um incremento próprio antes da publicação. Cache comercial continua AsyncStorage, sem migração para SQLite neste escopo.


## Fechamento da extensão Legacy

61 testes passaram em 11 arquivos; TypeScript aprovado. O QA independente revalidou Legacy/form, códigos/descontos, timezone, status textual, subpedidos/NF, recusas editáveis e proteção conservadora contra reenvio incerto.

O código oferece ligação direta às rotas existentes. Os perfis de resposta completos de leitura permanecem sintéticos e declarados; a operação no tenant não está homologada. O código não altera o Sales API. A coleção Postman e o painel permitem exercitar as chamadas sem o monólito.

**PM:** atendidas as jornadas do laboratório e transporte Legacy; operação real parcialmente atendida até validação G1–G7.

**Arquiteto:** atendido o incremento com validações, isolamento e reconciliação. Preços diferentes por PDV×OPL falham explicitamente, sem misturar condições. Nenhuma alegação de throughput, builds nativos ou segurança de produção foi validada nesta rodada.


### Verificação final após revisão visual

Reexecução final: 61/61 testes, TypeScript e export web aprovados. Na inspeção visual, a navegação de recarga profunda sem sessão apresentou erro de montagem do navegador; corrigido com guard por tela dentro do Stack e retestado em `/pedidos`, com redirecionamento para login e preservação do pedido local após reautenticação. Simulador também passou a preservar todos os status conhecidos (inclusive bandeira14); aliases do legado rejeitam propriedades herdadas como constructor/__proto__.

Cupons/bandeiras indisponíveis são sinalizados por metadados e pela interface, sem apresentar zero como uma meta verdadeira. A barra permite expandir limitações. O QA independente revisou esses ajustes e manteve o aceite de PM/Arquiteto para o laboratório.

Jornada Legacy visual: login, bootstrap, criação de pedido120 BUSCODUO com desconto25%, OPL501/prazo21, envio form, pedido remoto9000, faturamento pelo painel, retorno ao app com NF9000-1. Perfis e dados de laboratório; nenhum distribuidor ou tenant real foi acionado.
