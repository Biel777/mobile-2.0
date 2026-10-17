# Central de atualizações dos pedidos

## Escopo e solução aprovada

Home com um único resumo, contagens de pedidos únicos e acesso à central. Central virtualizada em duas abas: Precisam de atenção e Atualizações. Abrir marca como lido; revisar dispensa a pendência observada. Nova mudança material reabre leitura e revisão. Quando o estado deixa de exigir atenção, o aviso sai automaticamente da aba. Revisar é uma ação local e não altera o pedido no Sales API.

| Requisito | Prioridade e motivo | Implementação | Critério e evidência QA | PM | Arquiteto |
|---|---|---|---|---|---|
| RN-001 / UX-001 Resumo compacto | P0: evitar volume na home | OrderUpdatesSummary | Uma entrada na home; contagens por pedido; inspeção visual web | Atendido | Atendido |
| RN-002 / UX-002 Central por pedido | P0: triagem | /atualizacoes, FlatList, duas abas | Navegação, revisão e leitura verificadas na prévia | Atendido | Atendido |
| RN-003 Leitura e revisão independentes | P0: preservar pendências | Fingerprints separados | Abrir remove Novo e mantém atenção; revisão remove atenção; recorrência reabre | Atendido | Atendido |
| RT-001 Deduplicação e volume | P0: polling confiável | reconcileOrderUpdates | Poll repetido, ordenação, aliases e 1.000 pedidos cobertos por testes | Atendido | Atendido |
| RT-002 Persistência e isolamento | P0: segurança e continuidade | Store persistente no namespace existente | Restauração, legado sem novo campo, troca de usuário e falha local com sync indisponível testados | Atendido | Atendido |
| RN-004 / UX-003 Histórico discreto | P1: rastreabilidade | Histórico recolhido em detalhe local e remoto | Expansão visual e limite de 20 eventos por pedido testado | Atendido | Atendido |

## Regras e limites

- Atenção: recusas, cancelamento, devoluções, cortes, pendências comerciais e falhas de envio. Simples espera de resposta não exige revisão.
- Não há um evento novo a cada sincronização: a identidade depende de campos materiais do pedido, subpedidos, itens e notas.
- Primeira carga trata estados informativos como já lidos e exibe pendências atuais. Horários indicam observação pelo app, não horário presumido do evento no distribuidor.
- Histórico limitado a 20 observações por pedido. Mantém os pedidos da carteira atual e todas as pendências não revisadas; arquivo de pedidos fora da carteira limitado a 200. Não é um log de auditoria do servidor.
- Persistência local por instalação; leitura e revisão não sincronizam entre aparelhos. Push fora deste incremento.
- Sem mudanças de endpoint, payload ou autenticação Sales API.

## Verificação em 17/10/2026

- QA independente: 108 testes em 16 arquivos passaram, incluindo 15 testes novos de domínio/store/QA.
- `npx tsc --noEmit`: passou.
- `node node_modules/expo/bin/cli export --platform web --max-workers 2`: passou.
- Prévia Legacy simulada: home → central → pedido → histórico; leitura manteve pendência; revisão removeu uma pendência; marcar novidades lidas preservou atenção.
- Layout inspecionado na largura padrão do app (430px) e em 320px; sem overflow horizontal em 320px (document.scrollWidth = innerWidth = 320).
- Testes de volume validam regras, sem benchmark de desempenho ou validação em dispositivo nativo. Integração de produção continua dependente de homologação com o tenant.

PM e Arquiteto: escopo aprovado atendido após QA e revisão visual. Não houve publicação deste incremento no GitHub.
