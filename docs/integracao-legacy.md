# Mapa Legacy fornecido pelo usuário

Origem: mapa de integração do backend legado fornecido pelo usuário. Este documento registra o contrato informado e suas lacunas; os envelopes detalhados de leitura ainda exigem homologação.

## Transporte e sessão

Base `{LEGACY_HOST}/index.php?r=api/{controller}/{action}`, nomes case-sensitive conforme documentação (`subPedidos`, `condicoesFat`). `application/x-www-form-urlencoded` ou multipart, parâmetros em `$_POST`. GET quando especificado. Documento vivo: `api/documentacao/index` com autenticação master; nunca usar credenciais reais no simulador.

- POST `authentication/new`: `user[login]`, `user[senha]`, `user[imei]`, `user[versao]`, opcional `modulo` (default transferorder). Resposta `status`, `login`, `token`, `codigo_sincronizacao`, `id_nivel`. O ID real do usuário precisa vir de sync/campo adicional ou configuração validada; **id_nivel não é userId**.
- POST `session/new`: `user[login]`, `user[token]`, `user[versao]`, retorna `codigo_sincronizacao`.
- Sync: `user[login]`, `user[token]`, `user[codigo_sincronizacao]`. Validado em ApiTransferOrder::validarSessao. JWT é complementar, não substituir este login sem configuração do tenant.

## Envio

POST `pedidos/receberPedidoMobile` (EnvioDePedidoDoMobile), campos:

| Interno app | POST Legacy |
|---|---|
| id_cliente, id_tabela | mesmos campos |
| id_usuario | omitir: servidor deriva da sessão |
| datahora_criacao ISO | Y-m-d H:i:s |
| array_ordem_envio[i].id_distribuidor | ordem_envio[i][id_distribuidor] |
| array_ordem_envio[i].prioridade | ordem_envio[i][prioridade] |
| código de faturamento obtido da regra/PDV | ordem_envio[i][codigo_faturamento] obrigatório |
| array_produtos[i].ean/quantidade | produtos[i][ean/quantidade] |
| desconto calculado pelo motor local | produtos[i][desconto] numérico obrigatório |
| array_agendamento[i].data_envio | agendamento[i][data] e [periodo] H:i (configurar default) |
| order_client_id/codigo_pedido/justificativa | mesmos campos |
| cupom | assinatura não documentada; bloquear até confirmar canal |
| tipo_envio/prazo por OPL | não há campos equivalentes confirmados; exigir mapeamento explícito do prazo para codigo_faturamento |

Não gerar codigo_faturamento com o ID do distribuidor nem presumir que prazo em dias é um código. Preservar order_client_id nos retries; deduplicação precisa ser homologada no tenant. Flags rejeitaPedidoDuplicado/naoEnviaParaPrePedido/id_pre_pedido_web existem, mas comportamento deve ser validado antes de configurá-las.

Sucesso típico: `{status:"ok",login:"...",codigo_sincronizacao:51,id_pedido:882,mensagem:"..."}`. Sem id_status! Consultar status após envio.

Erro/pré-pedido: `{status:"erro",mensagem:"...",id_pre_pedido:123,errors:["..."]}`. Preservar motivo e ID pré-pedido na mensagem; não declarar enviado.

Duplicado pode retornar `status:ok,id_pedido` existente. O hash legado usa usuário+cliente+dia+produtos+distribuidores; não é comprovadamente idempotência forte por chave/payload.

## Bootstrap

| Endpoint | Verbo | Conteúdo |
|---|---|---|
| clientes/index | POST | carteira |
| negociacoes/index | GET | extras[somente_mobile]=1, condições + regra_envio.distribuidores[] |
| clientes/getClientesTabelasNegociacoes | POST | vínculos PDV×tabela, somente_mobile |
| produtos/index | POST | catálogo global |
| produtos/getProdutosDaTabela | POST | preço/desconto por PDV×tabela×OPL |
| clientes/getDistribuidores | GET | cnpj_cliente, distribuidores elegíveis e códigos |

Alternativas: clientes/getPaginated, clientes/getTabelasNegociacao, clientes/getTabelasDoPDV.
Campos comerciais conhecidos: valor_minimo, quantidade_minima_unidades, descontos_progressivos, obrigatoriedade, permitir_dividir_pedidos_agendados, utilizar_dados_acumulativos_mes_na_validacao, somente_mobile. **Envelopes exatos, campos de filtro de preços e classificações de regras não foram fornecidos**. Mapeamentos do laboratório são amostras explícitas a homologar; não preencher cadastro real incompleto com fixtures do app.

## Acompanhamento e notas

POST `subPedidos/index` com user e `time` datetime (epoch para carga completa). Retorna `subPedidos[]`: pedido_id, status_id, status_ds, cnpj_cliente, distribuidor, produtos[] com quantidade_pedida, quantidade_prevista, quantidade_confirmada, motivo, preços. Agregar por pedido_id; pedida→quantPed, prevista→quantEsp, confirmada→quantNot.

Alternativa POST `subPedidos/getPaginated` com enviar_itens_notas/enviar_aliquotas.

GET `pedidos/getStatusPedidos`, query `pedidos[]` IDs. Resposta `{pedidos:[{id,status,data_envio}]}`; status é descrição textual, precisa mapear sem inventar sucesso.

POST `nota/index` / `nota/summary` para notas/totais. Relacionar NF a SubPedido. PDF/DANFE não mapeado.

## Metas

- metas/desempenhoArea: familias[] meta, atingido, vendas MDTR/TO.
- metas/getMetasProdutoPdv: pdvs[] e produtos[] com meta/faturamento (paginado).
- clientes/pdvsUnicosPositivados: month_to_date e média trimestre.
- pedidos/resumoProdutosFamiliasPositivados, clientes/metasAcoesTrade: complementares.
- GraphQL salesGoals/customerSalesGoals/salesGoalsKPI depende de flags palma da mão/IMS/Metas.faturamento_ims. Endpoint tenant, queries e envelopes não fornecidos.
- Bandeira: condicoesFat/detalheProdutos, grupoCliente/index, relacionar_com=BANDEIRA; contrato pendente. Não simular meta desconhecida como real.

## Limites e homologação

Sem mudança no Sales API para consumir rotas existentes. Ainda precisam ser confirmados: G1 códigos faturamento×prazo, G2 cupom, G3 descontos calculados, G4 período de agendamento, G5 descrição status, G6 bandeiras, G7 base de metas. REST POST /api/v2/orders não implementado; pedidos/create e GraphQL createOrder pertencem a outros canais e ficam fora do app de representante.

O simulador deve testar transporte e traduções com amostras independentes, não provar igualdade com produção. Antes de apontar para tenant, usar respostas anonimizadas e validar regras/permissões/deduplicação com homologação.
