# Agenda de visitas do dia — 17/10/2026

## Plano consolidado

Usuário confirmou seleção manual sem regras adicionais de roteiro. Incremento: agenda por dia local e usuário; resumo do cliente com pedidos disponíveis, pendências comerciais e famílias a positivar; atalho para digitação; concluir/reabrir/remover visita.

Arquitetura: Zustand persist existente, sem novo serviço ou endpoint. Identidade de pedido por customerId, CNPJ normalizado ou referência local exata, nunca nome. Identificadores opcionais acrescidos ao contrato de acompanhamento e mapeados no Legacy/mock/simulador; clientes antigos continuam válidos. Metas vêm da sincronização existente; não se inferem metas ou faturamento a partir de visita concluída.

Designer: card compacto Visitas de hoje na home; lista virtualizada com seleção/pesquisa, detalhes e conclusão; resumo com período/fonte de dados, ações e histórico com carregamento incremental. Tokens, ícones, fontes e componentes existentes preservados.

| Requisito | Prioridade / motivo | Implementação e critério | Evidência QA | PM | Arquiteto |
|---|---|---|---|---|---|
| RN-001 Agenda manual hoje | P0 / planejamento diário | Home → agenda → adicionar/remover; uma loja por dia | Testes duplicidade/dias e fluxo visual com duas lojas | Atendido | Atendido |
| RN-002 Preparar visita | P0 / contexto comercial | Resumo de famílias pendentes, histórico e avisos do cliente | Inspeção da Drogaria Central: Vitaminas, três pedidos remotos, rascunho local e duas pendências | Atendido | Atendido |
| RT-001 Identidade confiável | P0 / isolamento de dados | Nenhum join por nome; ID prevalece, CNPJ/alias quando disponíveis | Testes de nomes iguais, conflito de ID, CNPJ normalizado e deduplicação | Atendido | Atendido |
| RN-003 Execução da visita | P0 / jornada | Digitar cliente selecionado, concluir e reabrir sem alterar faturamento | Fluxos de conclusão/reabertura e criação de rascunho do cliente11 validados | Atendido | Atendido |
| RT-002 Persistência e offline | P0 / operação de campo | Mesmo namespace, dados legados, troca de conta; data local e foreground | Testes do store e relógio; lojas que saem da carteira podem ser removidas da agenda | Atendido | Atendido |
| UX-001 Clareza e responsividade | P1 / usabilidade | Dados salvos/sem histórico, período da meta e sincronização visíveis | Prévia em430px e320px; scrollWidth=innerWidth=320 | Atendido | Atendido |

## Verificações

QA independente: 120 testes em19 arquivos passaram. TypeScript, exportação web e git diff --check passaram. Sem novo teste que apenas replique layout.

Prévia isolada de demonstração em http://localhost:8082: home, agenda vazia, adicionar duas lojas, preparar cliente, famílias, pedidos, concluir/reabrir e digitar validados. Simulador Legacy existente não foi reiniciado. O Metro anterior em8081 não reconheceu novas rotas durante hot reload; prévia isolada foi usada para QA, e a sessão de desenvolvimento anterior requer reinicialização para reconhecê-las. Build de distribuição inclui as novas telas.

Limites: agenda local neste aparelho, sem compartilhamento entre dispositivos ou publicação no Sales API; sem mapa/otimização/aprovação. Histórico e positivação restritos aos dados disponíveis na sincronização. Pedidos sem identidade confiável não entram no resumo do cliente. Execução nativa Android/iOS e homologação com tenant não realizadas. Visitas antigas permanecem salvas, mas esta interface apresenta apenas hoje. Nenhuma alteração foi publicada no GitHub neste incremento.

Validação final PM/Arquiteto após QA: escopo atendido; integração de agenda com servidor permanece fora deste incremento acordado.
