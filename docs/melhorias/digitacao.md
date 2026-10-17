# Revisão da digitação — 17/10/2026

## Plano consolidado Arquiteto / PM / Designer

Escopo solicitado: ação explícita e cor consistente na escolha do PDV; ausência de lojas sem área; etapas alinhadas; condição com informações comerciais legíveis; reordenação por ícones e prazo discreto. Preservar contratos, cálculo, fila e jornadas existentes.

| Requisito | Prioridade / motivo | Mudança | Critério e QA | PM | Arquiteto |
|---|---|---|---|---|---|
| RN-001 Ação clara | P0 / navegação | Digitar pedido com PrimaryButton; Ver distribuidores e Escolher produtos no rodapé | Prévia percorreu PDV → condição → distribuidores → produtos | Atendido | Atendido |
| RN-002 Carteira por área | P0 / regra do usuário | isPortfolioCustomer exige flag e área válida; filtra clientes, referências conhecidas, visitas e resumo | Três testes de regra, inclusão no validateOrder; PDV sem área ausente na prévia | Atendido | Atendido |
| UX-001 Etapas alinhadas | P1 / legibilidade | Quatro células iguais, número/check centralizado, rótulo em linha única; estado atual visível | Em320px, quatro células de68,2px e sem overflow | Atendido | Atendido |
| UX-002 Condição legível | P1 / decisão comercial | Seleção por radio, mínimo bruto/líquido e faturado separados, data DD/MM/AAAA | Inspeção em430px; mesma condição não apaga quantidades | Atendido | Atendido |
| UX-003 Distribuidores compactos | P1 / hierarquia | Prioridade numerada; setas e remoção com rótulos; prazo em disclosure, alvos44px | Seleção de dois prazos, reordenação e bloqueio sem prazo validados | Atendido | Atendido |
| RT-001 Seleção comercial válida | P0 / confiabilidade | Revisão valida lista original, duplicatas, máximo6, IDs liberados e prazo por OPL | Cinco testes adicionais; revisão bloqueia configuração obsoleta | Atendido | Atendido |

## Regras preservadas e correções

- O servidor continua responsável por restringir a carteira ao representante. O app não compara texto da área com ID numérico.
- Referências ausentes do cache continuam disponíveis em metas/visitas; somente negações conhecidas são ocultadas. Totais recebidos de metas não foram recalculados.
- A validação defensiva de área permanece para rascunhos antigos e links diretos.
- Tocar na mesma condição não altera linhas. Escolher outra condição mantém o comportamento de limpar produtos da condição anterior.
- O prazo não é preenchido automaticamente; o usuário escolhe entre as opções liberadas. Reordenar preserva prazo por ID; remover apaga o prazo daquele distribuidor.
- Removido card inerte de Pedido negociado, que não possuía ação implementada neste fluxo.

## Evidências

- QA independente:129 testes em21 arquivos passaram. TypeScript, exportação web e diffcheck passaram.
- Prévia em8082, com dados simulados: lojas liberadas; botão primário; cards; prazo pendente bloqueia avanço; seleção21dias Profarma e14dias SantaCruz; seta coloca SantaCruz em primeiro e mantém ambos os prazos; avanço aos produtos.
- Regressão manual: quantidade6 de BUSCODUO preservada após voltar, tocar na condição atual e retornar aos produtos.
- Responsividade: screenshot320px e scrollWidth=innerWidth=320; cabeçalho/etapas, card de prazo e rodapé sem overflow. Layout padrão430px inspecionado.
- Android/iOS em dispositivo e homologação do tenant não executados; contratos HTTP preservados. Sem publicação no GitHub neste incremento.

PM e Arquiteto: escopo atendido após QA independente e revisão visual.
