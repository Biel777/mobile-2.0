# Plano de Execução — v1

## Validação das features

| Feature | Decisão | Prioridade | Justificativa |
|---|---|---|---|
| F-001 Autenticação | manter | Must | Sem sessão não há carteira nem envio. |
| F-002 Sync de cadastros | manter | Must | Premissa offline. |
| F-003 Seleção de PDV | manter | Must | Primeiro passo da digitação. |
| F-004 Condição comercial | manter | Must | Feature pedida: todas as condições partem da tabela. |
| F-005 Ordem de envio | adaptar | Must | Auto-gerar pela regra; reordenar manual fica Should. |
| F-006 Catálogo e itens | manter | Must | Coração da digitação. |
| F-007 Motor comercial | manter | Must | Usuário exigiu todas as condições; motor local + revalidação no servidor. Dados acumulativos/cupom online = aviso (Q-004). |
| F-008 Revisão e validação | manter | Must | Impede envio inválido. |
| F-009 Offline + fila | manter | Must | Premissa explícita. |
| F-010 Agendamento/divisão | adaptar | Should | Envio imediato no MVP; agenda na Onda 2. |
| F-011 Acompanhamento até NF | manter | Must | Feature pedida; Onda 1 lista+detalhe+timeline; NF completa na mesma onda se mockar o espelho. |
| F-012 Metas / big numbers | manter | Must | Home do app. |
| F-013 Pedido negociado | adaptar | Could | Q-002: fora do MVP. |

Critério de aceite da entrega do Analista: **atendido** após Q-001 e Q-002. Toda Must tem AC testável, dependência e evidência no legado.

## Premissas de negócio

- Público: força de vendas em campo (Android + iOS), frequentemente sem sinal.
- Paridade comercial com a folha do Sales API; o servidor continua sendo a autoridade no despacho.
- Não reimplementar Canal Autorizador, EDI de arquivo, tradespend, quester, RFV nem pedidos retroativos.
- Stack e integração: Arquiteto decide (usuário).
- Checkpoint: `auto`.
- Destino do código: `C:\Users\glima\Mobile 2.0`.
- Sales API de origem permanece intacto.

## Ondas

### Onda 1 — MVP campo
- Objetivo: representante autentica (ou entra em modo demo), vê metas, escolhe PDV, aplica tabela, monta cesta com o motor comercial, valida, grava offline e dispara o envio ao reconectar; acompanha o pedido até um status de faturamento simulado/real.
- Features: F-001, F-002, F-003, F-004, F-005 (auto), F-006, F-007, F-008, F-009, F-011, F-012
- Definição de pronto:
  - Fluxo feliz ponta a ponta no app (home → pedido → fila → enviado → detalhe com pedida/atendida/faturada).
  - Offline: criar e confirmar sem rede; sync envia ao voltar.
  - Motor cobre os tipos 1–13 do F-007 sobre fixtures (progressivo, gatilho, combo, cupom local, mínimos, fracionamento, teto).
  - Testes unitários do motor e da fila passando.
  - UI clean com big numbers e CTAs claros.
- Riscos: Sales API fora do ar (mitiga Q-003); paridade 100% de flags de tenant (mitiga revalidação servidor).

### Onda 2 — Completar o fluxo legado
- Features: F-010 (agenda/divisão), F-005 reordenar, F-013 negociado, cupom Kupono online, dados acumulativos do mês, certificado real.
- Definição de pronto: paridade com `agendaPedido` / `divide_pedido` e bloqueio de negociado por grupo.

### Onda 3 — Campo conectado
- Features: aviso de mudança de status (o legado consulta `actionGetStatusPedidos`, não há push), nota fiscal com os dados da NF, positivação por família e PDV, cesta da bandeira (status 14).
- Adaptação: a API mobile não entrega PDF nem FCM. A nota abre os dados que a NF carrega. O aviso nasce quando o representante atualiza a lista.
- Definição de pronto: atualizar um pedido em aguardando retorno gera aviso; a nota do 8801 abre; positivação lista família e PDV sem faturamento; bandeira mostra mínimo, realizado e o pedido 8814.

## Fora de escopo

- Alterar o monólito Sales API (exceto se, numa onda futura, faltar endpoint — hoje o Legacy já recebe pedido mobile).
- Pedido retroativo, agregadora EDI, ressarcimento, tradespend, visitas Quester.
- REST `POST /api/v2/orders` (não implementado no origem).
