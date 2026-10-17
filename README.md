# Força de Vendas

App Expo/React Native + TypeScript para clientes, condições comerciais, pedidos offline, acompanhamento e metas.

## Testar com o simulador local

Na pasta deste projeto:

```powershell
npm install
npm run dev:integration
```

- Aplicativo: http://localhost:8081
- Laboratório de API: http://127.0.0.1:4010
- Usuário fictício: `marina`; senha: `demo` (o simulador aceita qualquer login não vazio e senha de pelo menos três caracteres, sempre na mesma carteira fictícia).

O comando inicia o simulador e o app em processos separados, com comunicação HTTP real. Encerre com Ctrl+C. Se já houver uma instância, encerre-a antes de iniciar novamente.

No app, crie um pedido para Drogaria Central, tabela Regular, Profarma, prazo 21 e 120 unidades de BUSCODUO. Envie. No painel, entre, atualize pedidos e clique em Faturar no pedido criado. Atualize no app e abra a nota. Nenhuma dessas ações envia pedidos a distribuidores reais.

O painel permite editar JSON, enviar e repetir chamadas, sincronizar carteira, consultar metas, simular aceite/parcial/rejeição/nota e provocar 500, 401, lentidão e confirmação perdida. A última chamada/retorno fica visível, com credenciais mascaradas.

## Configuração e modos

`npm run web` usa demonstração interna por padrão. Para HTTP, use `npm run dev:integration` ou copie `.env.example` para `.env.local` e execute o app com o simulador em outro terminal (`npm run simulator`). Reinicie o Expo ao alterar variáveis.

`EXPO_PUBLIC_API_BASE_URL` recebe a base do sistema legado, por exemplo `https://tenant/legacy`, sem a query `?r=`. `EXPO_PUBLIC_API_URL` é um alias. `EXPO_PUBLIC_API_PROTOCOL=legacy` seleciona as rotas Yii/formulários; `mobile-v1` mantém o laboratório normalizado opcional. Variáveis `EXPO_PUBLIC_*` são públicas; não use senhas ou tokens nelas. A configuração é separada por ambiente no cache local. O cache v4 da demonstração anterior não é migrado nem apagado; o novo cache v5 começa vazio e só recebe cadastros após login/sincronização.

Os rascunhos ficam no aparelho. Uma fila interrompida preserva a chave e o payload. No protocolo legado, confirmação incerta não é reenviada automaticamente: consulta-se o ID remoto conhecido ou o usuário confere antes de autorizar uma repetição. No protocolo de laboratório mobile-v1, o servidor simulado garante idempotência. Pedidos com confirmação incerta ficam bloqueados para edição até reconciliação ou confirmação do reenvio. Trocar de conta limpa a carteira ativa; sair preserva rascunhos para reautenticar a mesma conta. No navegador o token fica apenas em memória e é necessário entrar novamente após recarregar; o cache permanece disponível offline com a sessão local. Android/iOS usam SecureStore para token.

## Integração legada direta e limites

O adaptador `src/api/legacy.ts` chama diretamente `index.php?r=api/...`, com `application/x-www-form-urlencoded`. Cobre autenticação/sessão, carteira e condições, produtos, envio, consulta de status, subpedidos, notas e metas. Não exige um gateway ou alteração do monólito.

O [mapa fornecido pelo usuário](docs/integracao-legacy.md) define rotas e campos de envio. O adaptador traduz descontos, códigos de faturamento, data/hora do tenant e agendamentos; omite id_usuario no POST de pedido e consulta o status após obter id_pedido. Login usa id_usuario retornado ou configuração explícita; id_nivel nunca é interpretado como usuário.

Os envelopes detalhados de cadastros/metas não foram fornecidos integralmente. O simulador e os mappers usam **amostras sintéticas explícitas**, que precisam ser comparadas com respostas anonimizadas do tenant antes de produção. Configurar a URL sozinha não homologa esses mapeamentos. Preços que variam por PDV/OPL são recusados porque o modelo atual de tabela global não os representa com segurança. Cupons e metas de bandeira ficam indisponíveis até confirmação do contrato. PDF/DANFE e GraphQL por tenant permanecem fora deste incremento.

O protocolo opcional `/api/mobile/v1` é normalizado para laboratório; não corresponde a uma rota comprovadamente existente no Sales API. O app continua podendo usar o mock interno, sem exercitar HTTP.

- [Guia do laboratório, cenários e acesso por celular](tools/simulator/README.md).
- [Coleção Postman Legacy](tools/simulator/sales-api-legacy.postman_collection.json): formulários e rotas para importação, usando dados fictícios por padrão. Substitua códigos/perfis apenas depois de confirmar com o tenant.
- [OpenAPI do laboratório Mobile v1](tools/simulator/openapi.json): importável no Postman/Insomnia; não descreve o contrato Legacy legado.
- [Análise, plano, QA e pendências](docs/melhorias/integracao-sales-api.md).

## Verificação

```powershell
npm test
npx tsc --noEmit
npx expo export --platform web --max-workers 2
```

Os testes incluem domínio comercial, transporte HTTP, endpoints reais do simulador em portas temporárias, fila concorrente e troca de sessão. Builds e comportamento nativos precisam ser validados em Android/iOS. A simulação não prova paridade completa com regras comerciais do backend.

## Configuração neutra e dados locais

As variáveis públicas usam o prefixo `EXPO_PUBLIC_API_`; copie os nomes atuais de `.env.example` e reinicie o Expo. O transporte por formulário usa `EXPO_PUBLIC_API_PROTOCOL=legacy`. O simulador usa `SALES_SIM_PORT`.

Na mudança de namespace, o app recupera um cache anterior apenas quando existe um único candidato do mesmo ambiente e URL. Preserva carteira, rascunhos, histórico e visitas, sem apagar o cache de origem. A sessão recuperada exige autenticação novamente; nenhum token antigo é reutilizado por adivinhação. Se houver caches ambíguos, o app não escolhe entre eles.
