# Nomes neutros e compatibilidade

Configuração, interface, classes, arquivos, documentação e simulador usam nomes genéricos. As variáveis públicas usam EXPO_PUBLIC_API_ e o transporte por formulário é identificado por legacy.

A compatibilidade do vínculo de área usa tem_area e aceita um único alias legado tem_area_*; flags ambíguas ou inválidas são rejeitadas. Endpoints e demais campos do formulário foram preservados.

O armazenamento recupera apenas um cache anterior compatível com ambiente/URL, mantendo rascunhos, pedidos e visitas e exigindo nova autenticação. Caches ambíguos e dados do laboratório normalizado não são escolhidos automaticamente.

QA: 136 testes passaram em21 arquivos, incluindo transporte HTTP do simulador, aliases de área, cache, isolamento e tokens nativos. TypeScript e exportação web passaram. Sem validação em dispositivo nativo ou homologação de tenant.

O usuário autorizou remover as referências também dos commits antigos. A publicação utiliza reescrita do histórico e atualização remota com proteção contra alterações concorrentes.
