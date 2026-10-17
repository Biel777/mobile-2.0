# Pedido e nota fiscal — revisão de experiência (17/10/2026)

## Requisitos e decisões

- RN01 / UX01: detalhe da NF no mesmo design system. Cartões de produto reutilizam ProductFace, cores, fontes, raios e espaçamentos. Quantidade faturada, preço original, desconto e líquido separados; valor oficial da NF em destaque. Data de saída em dd/mm/aaaa e atalho ao pedido.
- RT01: itens faturados usam somente quantNot>0, sem substituir por quantidade pedida. Valor NF preservado, sem presumir igualdade com o cálculo comercial dos itens. Fotos restritas mantêm proteção existente.
- RN02 / UX02: seis etapas no detalhe do pedido, com etapas concluídas, atual destacada como Agora e próximas numeradas. Leitor de tela recebe a situação de cada etapa; nenhuma data de evento é inventada.
- RT02: função pura getOrderProgress considera status, subpedidos, notas e quantidades. Aceite não equivale a NF. Múltiplas tentativas, recusas, cancelamento, devolução e notas parciais têm tratamento explícito. Faturamento parcial encerrado recebe ressalva e rótulo próprio.
- Escopo: apresentação e derivação do estado existente; não altera contratos ou estados do backend.

## QA e aceite

- 90 testes aprovados (61 anteriores + 29 de progresso); TypeScript e exportação web aprovados.
- Revisão independente encontrou e ajudou a corrigir conclusão indevida quando outra OPL não tinha quantidades confirmadas e aviso indevido de falta quando toda a quantidade pedida já estava faturada.
- NF9002/90021 e pedido9002 faturado revisados no navegador. Pedido9001 exibe Aguardando nota como etapa atual. Nota verificada em320px sem overflow horizontal; tema preservado.
- Mensagens de nota ausente por subpedido respeitam tentativas recusadas/encerradas. Consulta não fica sugerida apenas porque uma tentativa histórica não tem NF.
- PM: requisitos de jornada e clareza atendidos. Arquiteto: estado derivado com testes, sem mudança de API, atendido. QA independente sem bloqueadores.
- Limite: dados são snapshots das APIs, não histórico auditável de eventos; validação visual feita na web, sem testes em dispositivos nativos nesta revisão.

## Ajuste de densidade

O indicador abre recolhido, em faixa de aproximadamente64px: etapa atual, fração e seis segmentos de progresso. Ver etapas expande o percurso completo; ocultar o recolhe. Status de exceção continuam visíveis no resumo. Assim, produtos, quantidades e subtotal aparecem na primeira visualização do detalhe.

Verificação: TypeScript aprovado; expansão/recolhimento e presença das informações do subpedido conferidos no navegador no pedido9002. Regras de progresso e integração não foram alteradas.

## Atalho de digitação para todas as lojas

Os cartões das duas abas de positivação e da lista inicial sempre exibem Digitar. O atalho mantém o ID e o nome do PDV selecionado no rascunho e abre sua condição comercial. Se cadastro, área ou condição não estiverem disponíveis, a própria digitação informa o motivo e permite sincronizar; não substitui a loja nem presume liberações comerciais. Ao chegar um cadastro válido na sincronização, o rascunho recebe sua condição inicial.

Verificação: 93 testes aprovados com2workers (incluindo3 testes do atalho), TypeScript aprovado. No navegador, confirmados os botões de todas as lojas nas duas abas, navegação de São José à condição202 e preservação de Drogaria do Largo no fluxo de cadastro pendente.
