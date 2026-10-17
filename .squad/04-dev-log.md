# Dev Log

## T-001 — Scaffold Expo — ✅ concluída
- Arquivos: `package.json`, `app.json`, configs Expo/Vitest

## T-002 — Motor comercial — ✅ concluída
- Arquivos: `src/domain/*`
- Testes: `npm test` → 12 passed

## T-003 — Fixtures — ✅ concluída
- Arquivos: `src/data/fixtures.ts`

## T-004 / T-007 — Auth, store, fila — ✅ concluída
- Arquivos: `src/data/store.ts`, `src/api/mock.ts`, `src/sync/queue.ts`
- Decisões locais: idempotência por `order_client_id`; flush automático ao voltar online.

## T-005 / T-006 — UI — ✅ concluída
- Arquivos: `app/*`, `src/components/ui.tsx`

## T-008 — Testes — ✅ concluída
- Comando: `npm test` → 12 passed
- Ajuste: cesta de teste da fila elevada para 30 un. (mínimo líquido R$ 400)

## Onda 2 e 3 — ✅ concluída
- Prazo saiu da condição e passou para cada distribuidor da ordem (`prazos` no OPL, escolha obrigatória).
- Rodapé fixo com Voltar e Continuar; ações Subir/Descer/Remover e steppers com área de toque maior.
- Agendar (status 3) e dividir em duas datas quando a condição permite. Resto do fracionamento fica no primeiro envio.
- Mínimo considera o faturado do mês. Cupom desconhecido bloqueia no envio.
- Pedido negociado permanece bloqueado para o grupo da Marina.
- Acompanhamento ganhou pedido agendado (8803) e aguardando mínimo de bandeira (8814). Data vencida promove status 3 → 4 ao atualizar.
- `npm test` → 14 passed. Persistência da store foi para `forca-vendas-store-v3`.

## Onda 3 — campo conectado — ✅ concluída
- Atualizar consulta o status (polling, como o legado). O pedido 8804 sai de aguardando retorno e vira um aviso na home.
- Nota fiscal abre os dados da NF (número, distribuidor, itens, valor). O monólito não expõe PDF na API mobile.
- Positivação mostra cobertura da carteira, família e PDV sem faturamento, com atalho para digitar.
- Bandeira mostra o mínimo da Rede Farma Sul e o pedido 8814 parado na cesta.
- `npm test` → 15 passed. Store `forca-vendas-store-v4`.
