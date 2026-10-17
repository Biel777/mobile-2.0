# Requisitos — v1
Origem: `C:\Users\glima\projetos\sales-api` (PHP 7.4 / Yii 1.x / Postgres) | Destino: app mobile força de vendas (Android + iOS), pasta `C:\Users\glima\Mobile 2.0`
Origem: backend legado (PHP 7.4 / Yii 1.x / Postgres) | Destino: app mobile de força de vendas (Android + iOS).
## Visão geral do sistema

Sales API é o sistema de gestão de pedidos e cargas para a indústria farmacêutica. A entidade central é o **Pedido**, ligado a um **PDV/Cliente**, a uma **Condição comercial** (`condicoes_fat`) e a um ou mais **Operadores logísticos** (filiais/distribuidores). O pedido vira **Sub-pedido** na hora do envio (um por tentativa de distribuidor) e segue até o **espelho** (retorno) e a **nota fiscal**.

O usuário-alvo do app é o **representante / força de vendas** em campo. Hoje ele digita na folha web (`folha_ped_novo*`) ou no canal mobile legado (`EnvioDePedidoDoMobile` → `PedidosController::actionReceberPedidoMobile`). `mobile/index.php` só redireciona; não há app nativo.

Escopo deste produto: **digitação com todas as condições comerciais**, **acompanhamento até o faturamento**, **metas/objetivos em tela limpa** e **operação offline com envio automático ao reconectar**.

## Features

### F-001 — Autenticação e sessão do representante
- Descrição: login do usuário Sales API, persistência de sessão e identificação do nível (representante/área).
- Fluxo do usuário: 1. Informa login e senha. 2. Recebe sessão. 3. Vê home com seus PDVs e metas.
- Regras de negócio:
  - APIs GraphQL usam JWT (`createToken`).
  - Canal Legacy mobile usa `login` + `token` / `UserIdentity` temporário.
  - Hierarquia (`UsuarioNivel`) restringe PDVs, pedidos e metas visíveis.
  - Grupo com `BLOQ_PEDIDO_NEGOCIADO` não envia pedido sem tabela.
- Dados: usuário, nível, área, sub-região, token, expiração.
- Integrações: GraphQL `createToken`; sessão Legacy.
- Evidência no código: `docs/api/authentication.md`; `legacy/protected/modules/api/controllers/PedidosController.php` (`enviarUmPedido`); `func_check_user_privs.php`.
- Dependências: —
- Critérios de aceite:
  - [ ] Dado credenciais válidas, quando o usuário autentica, então a sessão persiste e a home carrega no contexto da área dele.
  - [ ] Dado credenciais inválidas, quando tenta autenticar, então o app recusa e não sincroniza dados.
  - [ ] Dado token expirado e o aparelho offline, quando abre o app, então permanece na sessão local até haver rede para renovar.

### F-002 — Sincronização de cadastros para operação offline
- Descrição: baixar e cachear PDVs, condições, folhas, preços, distribuidores e metas do representante.
- Fluxo do usuário: 1. Após login (ou pull-to-refresh), sincroniza. 2. Vê data da última sync. 3. Sem rede, usa o cache.
- Regras de negócio:
  - Tabelas elegíveis: vigência, `st_folha`, associação cliente/grupo/área, `somente_mobile`, bloqueio de área, teto/liberação.
  - Produtos da folha: `desc_prod`, mínimos/máximos, obrigatoriedade, faixas, gatilho, combo.
  - Ordem de envio derivada de `regra_envio` + PDV liberado na filial.
- Dados: `clientes`, `clientes_area`, `condicoes_fat`, `folhas_pedidos`, `folhas_pedidos_desconto_adicional`, `folhas_pedidos_produtos_gatilho`, `ordem_envio` potencial, `produtos_op_logisticos.fracionamento`, metas.
- Integrações: Legacy `NegociacoesController`, `ProdutosController::getProdutosDaTabela`, `ClientesController`; GraphQL `billingConditions` / `billingConditionPrices`; `MetasController`.
- Evidência no código: `fn_tabelas_disponiveis.php`; `TabelaDisponivelService.php`; `BillingConditionOperations.php`; `legacy/.../NegociacoesController.php`.
- Dependências: F-001
- Critérios de aceite:
  - [ ] Dado representante com PDVs e tabelas, quando a sync conclui, então o cache local contém somente as tabelas vigentes e liberadas para esses PDVs.
  - [ ] Dado cache preenchido e sem internet, quando o usuário abre o catálogo, então os dados da última sync são exibidos com o horário da sync.

### F-003 — Seleção de PDV e abertura do pedido
- Descrição: escolher o cliente/PDV e criar um rascunho local (`status` 7 — aberto para digitação).
- Fluxo do usuário: 1. Busca PDV (nome/CNPJ). 2. Confirma. 3. App cria rascunho vinculado ao usuário e à área do PDV.
- Regras de negócio:
  - PDV precisa ter área Legacy (`clientes_area`); senão bloqueia.
  - Área/sub-região vêm do PDV e do nível do usuário.
  - Vários rascunhos abertos por cliente/tabela são listáveis (`buscaPedidosAbertos`).
- Dados: `pedidos.id_cliente`, `id_status=7`, `id_usu_resp`, área/sub-região, `order_client_id` local.
- Integrações: criação local; no envio vira `Pedido::criarPedido`.
- Evidência no código: `Manipula_pedido::__construct`; `folha_ped.php` `adicionaPedidos`; `EnvioDePedidoDoMobile` (`id_cliente` obrigatório).
- Dependências: F-002
- Critérios de aceite:
  - [ ] Dado PDV sem área Legacy, quando o usuário tenta abrir pedido, então o app bloqueia com mensagem clara.
  - [ ] Dado PDV válido, quando confirma, então um rascunho local com status 7 é criado e pode ser retomado offline.

### F-004 — Seleção da condição comercial
- Descrição: listar e aplicar a tabela (`condicoes_fat`) elegível para o PDV, ou recusar negociado se o usuário for bloqueado.
- Fluxo do usuário: 1. Vê tabelas vigentes do PDV (nome, prazo, vigência, valor mínimo). 2. Escolhe uma. 3. Pedido recebe `id_cond_fat`, prazo e regra de envio.
- Regras de negócio:
  - Elegibilidade: vigência, status da folha, cliente/grupo/sub-região, `disponibilidade`, `somente_mobile`, áreas permitidas/bloqueadas, teto com `liberacoes_cliente_condicao`.
  - Tabela vencida bloqueia envio (erro de vencimento em `FolhaPedido::validaPedidoParaEnvio`).
  - `id_cond_fat` nulo = pedido negociado (certificado / fluxo de aprovação).
- Dados: `pedidos.id_cond_fat`, `prazo_negociado`, flags da tabela (combo, gatilho, teto, desconto adicional, mínimos).
- Integrações: `CondicoesFat::getValidasPorUsuario`; `TabelaDisponivelService`.
- Evidência no código: `Pedido::atualizarPedidoComDadosDaCondicaoFat`; `folha_ped.php` `adicionaPedidos`; `EnvioDePedidoDoMobile::clientInTrading`.
- Dependências: F-003
- Critérios de aceite:
  - [ ] Dado PDV com três tabelas, sendo uma vencida, quando abre a lista, então só as vigentes e liberadas aparecem.
  - [ ] Dado tabela escolhida, quando o pedido é gravado, então prazo e valor mínimo da tabela passam a valer nas validações.

### F-005 — Ordem de envio (distribuidores / filiais)
- Descrição: definir a prioridade de operadores logísticos que tentarão faturar o pedido.
- Fluxo do usuário: 1. App sugere ordem pela `regra_envio` da tabela. 2. Usuário confirma ou reordena se a folha permitir. 3. Pedido só envia com ao menos um OPL.
- Regras de negócio:
  - Sem `ordem_envio` o envio é recusado.
  - Prioridade 1 vira `pedidos.id_op_logistico`.
  - Se todos os SKUs estiverem bloqueados no OPL, o legado tenta o próximo (`EnviaProximoPedidoLegado`).
  - `tipo_envio`: 1 e-mail, 2 eletrônico.
- Dados: `ordem_envio` (`id_op_logistico`, prioridade, `tipo_envio`, faturamento).
- Integrações: `FolhaPedido::geraOrdemEnvio`; payload mobile `array_ordem_envio`.
- Evidência no código: `folha_ped_novo_dist.php`; `FolhaPedido::geraOrdemEnvio`; `EnvioDePedidoDoMobile` (required).
- Dependências: F-004
- Critérios de aceite:
  - [ ] Dado tabela com regra de envio e PDV liberado em duas filiais, quando a ordem é gerada, então as duas entram priorizadas.
  - [ ] Dado pedido sem nenhum distribuidor, quando o usuário tenta enviar, então o app bloqueia.

### F-006 — Catálogo, itens e quantidades
- Descrição: buscar produtos da folha, informar quantidade (respeitando fracionamento e min/max) e montar a cesta.
- Fluxo do usuário: 1. Busca por EAN/nome. 2. Informa qtd. 3. Vê preço/desconto atualizados. 4. Remove/edita linhas.
- Regras de negócio:
  - Produto precisa estar em `folhas_pedidos` da condição.
  - Quantidade múltipla de `fracionamento` do primeiro OPL quando `_CONTROLE_DE_PRODUTOS_FRACIONADOS_`.
  - `quant_min` (× demanda se `minimo_por_demanda`); `quant_max` / `max_por_produto`.
  - Produto monitorado pode ser bloqueado por `operador_master.bloqueia_produtos`.
  - Sem preço na filial: bloqueio (motivo 998 no legado).
- Dados: `produtos_pedidos` (`ean`, `quant_ped`, `pr_prod_ped`, descontos, `qtd_bonificada`, `fracionamento_padrao`).
- Integrações: `FolhaPedido::adicionaProduto`; `Pedido::adicionarProduto`.
- Evidência no código: `folha_ped_novo.php` `adicionaProduto`; `Manipula_pedido::verifica_produto`; `ProdutoPedido`.
- Dependências: F-004, F-005
- Critérios de aceite:
  - [ ] Dado produto com fracionamento 6, quando o usuário informa 10, então o app recusa e sugere múltiplo válido.
  - [ ] Dado produto fora da folha, quando busca incluir, então não entra na cesta.

### F-007 — Motor de condições comerciais e preço
- Descrição: calcular preço e desconto de cada item e do pedido aplicando **todas** as condições comerciais do legado que dá para resolver com dados em cache.
- Fluxo do usuário: 1. A cada alteração de qtd/item, o resumo (bruto, desconto, líquido, mínimos) atualiza. 2. Selos visíveis: gatilho, faixa, combo, cupom, teto.
- Regras de negócio (catálogo de tipos):
  1. **Preço-base**: `preco_folha` se `considerar_preco_tabela`; senão PF/estado (`preco_estado` / `preco_produto`); ICMS/ST **não** entram no preço comercial.
  2. **Desconto-base** `folhas_pedidos.desc_prod` (+ classificação PDV).
  3. **Desconto progressivo por qtd** (`desconto_adicional` + faixas).
  4. **Desconto progressivo por família**.
  5. **Mínimo por demanda** (faixas × IMS).
  6. **Produto gatilho** (faixa do gatilho gera extra nos filhos).
  7. **Acelerador dias de estoque**.
  8. **Desconto representante/gestor**.
  9. **Tabela teto** (desconto-teto do PDV).
  10. **Tabela combo** (cesta fixa + `participacao_combo`).
  11. **Cupom** (extra em `produto_pedido_descontos_extras`, soma em `desconto_prod`, teto 99,99%).
  12. **Prazo** da tabela/linha (afeta preço do distribuidor).
  13. **Mínimos** de valor (líquido/bruto), unidades, cesta, família, SKU obrigatório.
  14. **Dados acumulativos do mês** (pedido ou faturamento) somam nas faixas — no offline usa cache do mês; se ausente, calcula só o pedido atual e avisa.
  15. **Pedido bandeira** (regras próprias de mínimo).
- Dados: campos de `ProdutoPedido` (`desconto_prod`, `desconto_base`, `desconto_adicional`, `desconto_folha`) e extras.
- Integrações: recálculo local; no servidor `ProdutoPedido::validaEAtualizaDadosDaCondicao` revalida no envio.
- Evidência no código: `ProdutoPedido.php`; `CondicaoPdv.php`; `ProdutoPedidoDescontoGatilhoForm.php`; `PedidoTabelaComboForm.php`; `CupomDescontoForm.php`; `model/Manipula_pedido.php`.
- Dependências: F-006
- Critérios de aceite:
  - [ ] Dado item com base 10% e faixa +5% a partir de 12 un., quando a qtd vai de 6 para 12, então o desconto passa a 15% e o líquido é recalculado.
  - [ ] Dado gatilho com faixa 10 un. e filho com +3%, quando o gatilho atinge 10, então o filho recebe o extra e o selo “gatilho” aparece.
  - [ ] Dado tabela combo com participação 40% e a cesta em 20% do líquido, quando tenta enviar, então bloqueia.
  - [ ] Dado cupom de 2% acumulativo, quando aplicado, então soma no desconto sem ultrapassar 99,99%.

### F-008 — Validação e revisão antes do envio
- Descrição: tela de revisão com totais, alertas e bloqueios (mínimos, margem, certificado, justificativa).
- Fluxo do usuário: 1. Revisa itens e totais. 2. Corrige o que o motor apontar. 3. Informa justificativa se obrigatória. 4. Confirma envio ou agenda.
- Regras de negócio:
  - `validaPedidoParaEnvio`: tabela vigente, ordem de envio, mínimos, obrigatórios/semi-obrigatórios, participação combo, margem.
  - Certificado inválido → status **9** (pendente), não envia ao distribuidor.
  - Envio exige status **7**.
  - Justificativa pode ser obrigatória (`_JUSTIFICATIVA_PARA_ENVIO_DE_PEDIDO_OBRIGATORIA_`).
- Dados: totais, lista de erros/avisos, justificativa, certificado.
- Integrações: `FolhaPedido::validaPedidoParaEnvio`; `Pedido::validaPedidoParaEnvio`.
- Evidência no código: `folha_ped_novo_final.phtml`; `folha_ped_novo.php` `validaPedido` / `enviaPedido`.
- Dependências: F-007, F-005
- Critérios de aceite:
  - [ ] Dado pedido abaixo do valor mínimo da tabela, quando revisa, então o CTA de enviar fica bloqueado e o gap é exibido em reais.
  - [ ] Dado certificado exigido e ausente, quando confirma, então o rascunho vai para pendente (9) e não entra na fila de envio ao distribuidor.

### F-009 — Digitação offline e fila de sincronização
- Descrição: gravar o pedido no aparelho sem rede e enviá-lo automaticamente ao reconectar, sem duplicar.
- Fluxo do usuário: 1. Digita e confirma sem sinal. 2. Vê o pedido como “na fila”. 3. Ao voltar a rede, o app envia. 4. Pedido passa a “enviado / aguardando retorno”.
- Regras de negócio:
  - Payload alinhado a `EnvioDePedidoDoMobile`: `id_cliente`, `id_tabela`, `id_usuario`, `datahora_criacao`, `array_ordem_envio`, `array_produtos` (ean + quantidade), `array_agendamento`, `justificativa`, `order_client_id`, `codigo_pedido`.
  - Idempotência: hash local + `order_client_id`; no servidor `hash` (usuário+cliente+produtos+OPLs) e, no CA, `md5(cnpj#filial#codigo_pedido_cliente)` ignorando status 12 / `excluido`.
  - Falha de negócio pode gerar **pré-pedido** (`enviarParaPrePedido`) — o app deve exibir o erro e manter o rascunho editável.
  - Conflito de preço/estoque: servidor é a fonte da verdade no envio; se recusar, o app mostra o motivo e não apaga o rascunho.
- Dados: fila (`pending` / `sending` / `sent` / `failed`), `order_client_id` UUID, timestamp de criação.
- Integrações: `PedidosController::actionReceberPedidoMobile`; GraphQL `createOrder` (CA, não é o fluxo do representante).
- Evidência no código: `EnvioDePedidoDoMobile.php`; `docs/business/rules/trava-pedidos-duplicados.md`.
- Dependências: F-008
- Critérios de aceite:
  - [ ] Dado aparelho offline, quando o usuário confirma o pedido válido, então ele é persistido localmente e marcado “na fila”.
  - [ ] Dado item na fila e rede restaurada, quando o sync roda, então o pedido é enviado uma única vez e o status local vira o status retornado pelo servidor.
  - [ ] Dado o mesmo `order_client_id` reenviado, quando o servidor já tem o pedido, então o app não cria duplicata.

### F-010 — Envio, agendamento e justificativa
- Descrição: despachar agora ou agendar datas (divide o pedido se a tabela permitir).
- Fluxo do usuário: 1. Escolhe “enviar agora” ou informa datas. 2. Opcionalmente justifica. 3. Acompanha o status.
- Regras de negócio:
  - Agendado = status **3**; cron `envia_pedidos_agendados.php` envia quando `data_envio <= now`.
  - Divisão por datas só se `condicoes_fat.divide_pedido = t`; qtd em múltiplos de `fracionamento_padrao`.
  - Canal de envio: Wholesaler EDI, arquivo `.PED` ou e-mail (`tipo_envio`).
- Dados: `data_envio`, `pedido_dividido`, `array_agendamento`.
- Integrações: `FolhaPedido::agendaPedido`; `fn_divide_pedido.php`; `fn_envia_pedido_eletronico.php`.
- Evidência no código: `envia_pedidos_agendados.php`; `Pedido::dividirPedidoParaAgendamento`.
- Dependências: F-009
- Critérios de aceite:
  - [ ] Dado tabela que permite dividir e duas datas futuras, quando agenda, então surgem dois pedidos ligados pelo mesmo `pedido_dividido` com qtds fracionadas.
  - [ ] Dado envio imediato aceito, quando o servidor responde OK, então o status local fica 4 (sem resposta / aguardando retorno).

### F-011 — Acompanhamento até o faturamento
- Descrição: listar os pedidos do representante e mostrar o ciclo até a nota (pedido × atendido × faturado).
- Fluxo do usuário: 1. Filtra por período, PDV, status, distribuidor. 2. Abre o detalhe. 3. Vê itens, sub-pedidos, motivos de corte, valores e NF quando existir.
- Regras de negócio — máquina de estados (`StatusPedido`):

| ID | Nome | Significado para o app |
|----|------|------------------------|
| 7 | Aberto para digitação | Rascunho |
| 9 | Pendente | Certificado / aprovação |
| 3 | Agendado | Aguarda data |
| 4 | Sem resposta | Enviado, aguarda espelho |
| 1 | Aceito com sucesso | Atendido integral |
| 10 | Parcialmente aceito | Corte parcial |
| 6 | Não aceito pelo distribuidor | Recusa do OPL |
| 5 | Confirmado | Confirmado / tratado como faturado na integração |
| 11 | Rejeitado | Rejeição interna |
| 12 | Cancelado | Encerrado |
| 13 | Pendente margem diferenciada | Aguarda margem |
| 14 | Aguardando mínimo bandeira | Aguarda cesta bandeira |
| 15 / 16 | Devolvido parcial / integral | Pós-faturamento |

  - Transições relevantes: 7→envio→4; espelho 4→1/10/6; nota importa sobre 1/10; 7→9 se certificado; 9→7 ou 11 no fluxo.
  - Quantidades: pedida `quant_ped`, atendida/espelho `quant_esp`, faturada `quant_not`. Motivos em `motivos_fat`.
  - Faturado para o representante: status em `PEDIDOS_CONSIDERADOS_FATURADOS_PARA_OPERADOR` **e/ou** presença de `quant_not` / `datahora_not`.
- Dados: pedido, sub-pedidos, produtos, NF (`nr_nota`, `vl_nota`, `data_saida_nota`).
- Integrações: GraphQL `ordersDetailsByUser`, `orderDetails`; REST GET `/api/v2/orders`; legado `detalhes_ped.php`.
- Evidência no código: `StatusPedido.php`; `class/Espelho.php`; `docs/api/graphql/order-status-and-reasons.md`; `detalhes_ped.php`; `ImportaNotaWholesalerEdiJob.php`.
- Dependências: F-009, F-010
- Critérios de aceite:
  - [ ] Dado pedido enviado (4), quando o espelho parcial chega, então o detalhe mostra cada item com pedida × atendida e o status 10.
  - [ ] Dado sub-pedido com nota, quando o usuário abre o detalhe, então número, valor e data de saída da NF são exibidos.
  - [ ] Dado lista com filtros de período e status, quando aplica “sem nota”, então só pedidos sem `datahora_not` aparecem.

### F-012 — Metas e objetivos (dashboard clean + big numbers)
- Descrição: home com objetivos do ciclo, realizado, gap e ações claras (digitar pedido, ver atrasados, positivar PDV).
- Fluxo do usuário: 1. Abre o app e vê os big numbers do período. 2. Toca um card para ver breakdown (PDV/produto/família). 3. Toca a ação (“Novo pedido”, “PDVs sem pedido”).
- Regras de negócio:
  - Meta (`Metas`): tipo A área / P PDV / S positivação; dado V valor / Q qtd / A ambos; base TO (`quant_not` dos pedidos) ou MDTR (`faturamento_ims`).
  - Realizado PDV: `unidades_faturadas`/`valor_faturado` ← `quant_not`; previsto ← `quant_esp` (`Metas::atualizaMetasDePDV`).
  - % atingido = realizado / meta × 100.
  - Positivação: faturado > 0 **ou** mix mínimo (`SegmentacaoMix`).
  - KPI palma da mão: GraphQL `salesGoalsKPI` (`goal`, `billedTotal`, `billedAmount`) se representante e `_ATIVA_GESTAO_PALMA_MAO_`.
  - Hierarquia: representante vê a própria área; níveis acima agregam.
- Dados: meta valor, meta qtd, realizado, previsto, % , PDVs a positivar, cobertura.
- Integrações: `salesGoals`, `customerSalesGoals`, `salesGoalsKPI`; Legacy `metas/desempenhoArea`, `metas/getMetasProdutoPdv`.
- Evidência no código: `protected/models/Metas.php`; `SalesGoalsKPIQuery.php`; `legacy/.../MetasController.php`; `relatorio_positivacao.php`.
- Dependências: F-001, F-002
- Critérios de aceite:
  - [ ] Dado meta de R$ 100.000 e faturado R$ 40.000, quando abre a home, então os big numbers mostram meta, realizado, 40% e gap de R$ 60.000.
  - [ ] Dado PDVs da carteira sem faturamento no período, quando toca “Positivar”, então lista esses PDVs com CTA de novo pedido.
  - [ ] Dado aparelho offline, quando abre a home, então exibe as metas da última sync com selo “offline”.

### F-013 — Pedido negociado e fluxo de aprovação (adaptado)
- Descrição: permitir pedido sem tabela só se o usuário não estiver bloqueado; caso contrário, só tabelas.
- Fluxo do usuário: 1. Escolhe “Nova negociação” se liberado. 2. Digita preços/descontos dentro do certificado. 3. Pode cair em pendente (9).
- Regras de negócio: `BLOQ_PEDIDO_NEGOCIADO`; certificado; `FolhaPedido::enviaParaFluxoDeAprovacao`.
- Dados: `id_cond_fat` nulo, certificado, fluxo.
- Integrações: `EnvioDePedidoDoMobile::validarUsuario`; `PedidoFluxo`.
- Evidência no código: `EnvioDePedidoDoMobile.php` (`validarUsuario`); `FolhaPedido::enviaPedido`.
- Dependências: F-003, F-008
- Critérios de aceite:
  - [ ] Dado usuário com bloqueio de negociado, quando tenta criar sem tabela, então o app impede e pede uma condição comercial.

## Requisitos não funcionais

- **Offline-first**: cadastro, digitação, revisão e confirmação funcionam sem rede; só o despacho ao distribuidor exige conectividade (fila).
- **Plataformas**: Android e iOS (mesmo código).
- **Idempotência**: nenhum toque duplo ou retry cria dois pedidos no Sales API.
- **Paridade comercial**: o motor local não inventa regra; o servidor revalida no envio.
- **UX**: home limpa, ações primárias evidentes, números grandes, estados vazios/erro/offline explícitos.
- **Segurança**: token só em storage seguro; cache de PDV/preço fica no aparelho do representante autenticado.
- **Observabilidade**: cada item da fila registra tentativas, último erro e correlation id.

## Pontos em aberto

- REST `POST /api/v2/orders` está documentado, mas o `OrdersController` do repo **não** implementa create — o envio do representante é Legacy `actionReceberPedidoMobile` (e GraphQL `createOrder` é Canal Autorizador).
- Docs `pedidos.md` / `descontos.md` / `flows.md` estão incompletos; a fonte da verdade é o código.
- Status 2 (em processamento) e 13 (margem) têm pouco rastro de gravação em produção.
- Dados acumulativos do mês e cupom Kupono **não** fecham 100% offline — o app calcula o pedido atual e revalida no servidor.
- Qual base de meta o tenant usa (TO vs MDTR) é configuração de `Metas.faturamento_ims` / flag palma da mão.
- Pedidos retroativos e agregadora EDI são exclusivos do Canal Autorizador — fora do app da força de vendas.
