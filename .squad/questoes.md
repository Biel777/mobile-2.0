# Registro de Questões

| ID | De | Para | Fase | Pergunta | Impacto | Resposta | Status |
|---|---|---|---|---|---|---|---|
| Q-001 | PM | Analista | 2 | Quais KPIs de meta o representante vê no app (TO, MDTR, positivação, palma da mão)? | Define cards da home e contrato de sync | Home usa meta valor + realizado faturado (`quant_not`) + % + gap + PDVs a positivar. Fonte: `salesGoalsKPI` quando flag palma da mão; senão Legacy `desempenhoArea` / `getMetasProdutoPdv` e `Metas` tipo A/P/S. MDTR só se `faturamento_ims=true`. RFV/demanda ficam fora. | respondida |
| Q-002 | PM | Analista | 2 | Pedido negociado (sem tabela) entra no MVP? | Escopo da Onda 1 | Não. Legado permite, mas `BLOQ_PEDIDO_NEGOCIADO` é comum. F-013 = Could / Onda 2+. Onda 1 só com condição comercial. | respondida |
| Q-003 | Arquiteto | PM | 3 | Sem Sales API no ar, como a Onda 1 prova envio e offline? | Arquitetura do adapter | Adapter com contrato de `EnvioDePedidoDoMobile` + modo mock (fixtures) para E2E. Troca para API real por env. Fila e idempotência são iguais nos dois modos. | respondida |
| Q-004 | Arquiteto | Analista | 3 | O motor local deve recusar envio se dados acumulativos/cupom online estiverem ausentes? | Validação offline | Não recusar. Calcular com o pedido atual, marcar aviso “revalidado no envio” e deixar o servidor decidir. | respondida |
| Q-005 | Usuário | Analista | 2 | O prazo pertence à condição comercial ou ao distribuidor? | Passo da digitação | Ao distribuidor. A condição só escolhe a tabela. Cada OPL da ordem tem a própria lista de prazos. | respondida |
