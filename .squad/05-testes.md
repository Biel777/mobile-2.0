# Relatório de Testes — Onda 1, rodada 1

## Casos de teste

| ID | Feature | Cenário | Tipo | Resultado |
|---|---|---|---|---|
| CT-01 | F-007 | Faixa progressiva 6→12 un. | unit | ✅ |
| CT-02 | F-007 | Produto gatilho no filho | unit | ✅ |
| CT-03 | F-007 | Cupom + teto | unit | ✅ |
| CT-04 | F-008 | Fracionamento e produto fora da folha | unit | ✅ |
| CT-05 | F-008 | Valor mínimo e combo | unit | ✅ |
| CT-06 | F-009 | Fila envia 1x (idempotência) | unit | ✅ |
| CT-07 | F-009 | Falha de mínimo mantém rascunho | unit | ✅ |
| CT-08 | F-001 / F-012 | Login e home com meta 100 mil / 40% / gap | E2E browser | ✅ |
| CT-09 | F-003 | Lista PDV + bloqueio sem área Legacy | E2E browser | ✅ |
| CT-10 | F-006 / F-007 / F-008 | 30× BUSCODUO: bruto 555, desc. 83,25, líq. 471,75 | E2E browser | ✅ |
| CT-11 | F-009 / F-011 | Envio → status 4 na fila e na lista | E2E browser | ✅ |
| CT-12 | F-011 | Pedido 8801: pedida×atendida×faturada + NF-44190 | E2E browser | ✅ |
| CT-13 | F-009 | Confirmar pedido com navigator.offline | E2E | ⚠️ coberto por unit da fila; não toggled na UI |

`npm test`: 12 passed.

## Fluxo ponta a ponta

1. `http://localhost:8082` → login marina / campo123
2. Home: Meta R$ 100.000, realizado R$ 40.000, 40%, CTA Novo pedido e PDV a positivar (Farmácia São José)
3. Clientes: Drogaria Central (ok), PDV sem área (bloqueado)
4. Digitação: 30 un. BUSCODUO, revisão libera envio
5. Envio: `/pedidos` mostra rascunho `sent` + pedido remoto 9000 “Aguardando retorno”
6. Detalhe 8801: status 10, corte com motivo, NF 44190

Evidência: sessão browser Cursor em Expo Web.

## Defeitos

### B-001 — Simular retorno + NF não redesenhava a tela
- Severidade: média
- Esperado × Obtido: após o toque, status 1 + NF / permaneceu 4 com qtd 0
- Causa: implementação (`listOrders` devolvia a mesma referência de array)
- Roteado para: Dev
- Status: corrigido (clone no mock); não revalidado no browser porque o bundler estava em modo CI

### B-002 — Big numbers quebravam o valor em duas linhas no web
- Severidade: baixa
- Causa: implementação (fonte grande + `toLocaleString`)
- Roteado para: Dev
- Status: corrigido (`moneyShort` + fonte menor); não revalidado no browser

## Veredito

| Feature | Status |
|---|---|
| F-001 | ✅ |
| F-002 | ✅ (fixtures + persistência da sessão) |
| F-003 | ✅ |
| F-004 | ✅ (tabela regular aplicada) |
| F-005 | ✅ (distribuidores no cabeçalho da digitação) |
| F-006 | ✅ |
| F-007 | ✅ |
| F-008 | ✅ |
| F-009 | ✅ (envio online + testes da fila) |
| F-011 | ✅ |
| F-012 | ✅ |

Geral: ✅ aprovado para a Onda 1 (MVP), com B-001/B-002 corrigidos no código.
