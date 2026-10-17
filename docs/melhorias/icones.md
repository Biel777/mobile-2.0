# Revisão dos ícones — 17/10/2026

Problema: ícones feitos com bordas, blocos e caracteres de texto apresentavam pesos, proporções e alinhamentos diferentes.

Plano consolidado Arquiteto/PM/Designer: preservar cores, rotas, componentes e áreas de toque; usar uma família já instalada no projeto, com fonte pré-carregada e desenho consistente. Sem alteração das imagens de produtos ou regras comerciais.

| Requisito | Prioridade | Mudança e aceite | Evidência QA | PM | Arquiteto |
|---|---|---|---|---|---|
| UX-001 Navegação coerente | P0 | Feather: home, plus-square, clipboard, bar-chart-2, map-pin; canvas24px centralizado | Prévia home e navegação para pedidos; cinco botões48x64 em320px | Atendido | Atendido |
| UX-002 Ações e marcadores consistentes | P1 | Chevron, seta, check, plus/minus e placeholder package na mesma família | Cabeçalho e etapas expandidas inspecionados; demais usos revisados no código | Atendido | Atendido |
| RT-001 Fonte e acessibilidade | P0 | Feather.font pré-carregada; tamanho fixo decorativo; aria-hidden web e equivalentes nativos; rótulos nos botões | Árvore acessível sem glifos PUA após correção; TypeScript e build web passaram | Atendido | Atendido |

QA independente revisou glyphmap, importação/fontes, compatibilidade nativa declarada, semântica e áreas de toque. Sem bloqueios. Root validou visualmente home, cabeçalho e etapas concluídas, interação de navegação e expansão. Largura320: sem overflow (scrollWidth=innerWidth=320), navegação48px de altura por64px de largura por botão. Build exportou fonte Feather local de56,2kB; não requer rede de fontes em execução.

Verificações: npx tsc --noEmit, export web e git diff --check passaram. Sem testes unitários novos por se tratar de apresentação; execução em dispositivo Android/iOS não realizada.
