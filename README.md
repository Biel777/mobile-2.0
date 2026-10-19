# Força de Vendas

App Expo/React Native com TypeScript para carteira, condições comerciais, digitação offline, fila e acompanhamento.

## Preparar o projeto

No Windows, mantenha o checkout, dependências e caches em `D:`:

```powershell
Set-Location 'D:\projetos\mobile 2.0\Mobile 2.0'
$env:npm_config_cache = 'D:\projetos\cache\npm'
$env:TEMP = 'D:\projetos\cache\tmp'
$env:TMP = $env:TEMP
$env:__UNSAFE_EXPO_HOME_DIRECTORY = 'D:\projetos\cache\expo'
$env:EXPO_NO_TELEMETRY = '1'
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
npm ci
npm run web
```

O override `__UNSAFE_EXPO_HOME_DIRECTORY` é o mecanismo disponível na versão instalada do Expo para guardar seu estado fora de `C:`. Reavalie ao atualizar o SDK. Não há credenciais reais embutidas no app.

## Três destinos diferentes

### Demonstração

Abra **Configurar conexão**, preencha um host válido e toque em **Entrar em demonstração com dados simulados**. A faixa de demonstração permanece visível. O login fictício aceita usuário não vazio e senha com pelo menos três caracteres. Não há HTTP nem pedidos reais nesse modo.

### Simulador HTTP

```powershell
npm run dev:integration
```

Aplicativo: `http://localhost:8081`. Laboratório: `http://127.0.0.1:4010`. Conta fictícia: `marina`, senha `demo`. O script configura o protocolo `legacy` com a base `http://localhost:4010/webol`. Os envelopes comerciais são de laboratório e não comprovam o contrato do Tradetools. O protocolo opcional `mobile-v1` também permanece disponível por variável de ambiente. Uma configuração anteriormente salva no painel tem prioridade sobre o env. Para repetir o laboratório em uma instalação já configurada, use um perfil novo do navegador ou limpe o armazenamento do aplicativo.

O [guia do simulador](tools/simulator/README.md) documenta os cenários de aceite, rejeição, nota e perda de confirmação. Esses testes não homologam o PHP real.

### Tradetools local ou produção

Abra **Configurar conexão**, disponível antes do login:

| Campo | Local | Produção |
| --- | --- | --- |
| Protocolo | `http` | `https` |
| Host | `10.11.0.11` | `trade.fidelize.com.br` |
| Indústria | vazio | código da empresa, por exemplo `sanofi` |
| URL resultante | `http://10.11.0.11/webol` | `https://trade.fidelize.com.br/sanofi/webol` |

**Testar conexão** solicita o endpoint de autenticação sem credenciais e verifica HTTP/JSON. Isso não prova que uma conta autentica ou sincroniza. Salve e use o login fornecido pela equipe. Host não aceita caminho: a montagem acrescenta `/webol` uma vez. A validação da URL absoluta rejeita a entrada do monólito sem esse caminho e sugere a correção.

No Expo Web de desenvolvimento, somente a base `http://10.11.0.11/webol` passa automaticamente pelo proxy Metro no mesmo domínio do navegador. No aparelho a chamada vai direto ao host. O proxy tem destino fixo e não altera CORS no monólito. Ele não existe no export web; hospedar a versão web exige uma solução de mesma origem da equipe.

Salvar outro destino encerra a sessão, recria o cliente e seleciona o cache correspondente. Rascunhos do destino anterior permanecem separados. Ao voltar, entre novamente. Na web, o token vive só em memória; no nativo, SecureStore guarda o token. Variáveis `EXPO_PUBLIC_*` são apenas configuração inicial de desenvolvimento, substituída pela configuração salva.

A primeira prova Legacy carrega detalhes de **um PDV**, explicitado na faixa de limites. O acompanhamento inicia nos últimos 30 dias e mantém cursor e resultados anteriores. Ainda faltam contratos reais para notas incrementais e carteira completa. Não interprete essa carga como substituição do Transfer Order.

## Validação e arquitetura

```powershell
npm run check
npm run format
```

`check` executa TypeScript, testes e lint/formato. A formatação é feita em commit próprio. Telas e componentes acessam os fluxos por `@bff/cases/*` e tipos por `@bff/contract`. O lint impede acesso direto a regras, adaptadores, cache e fila.

- `src/bff/rules`: motor offline puro; preserva preço, mínimo, fração, combo e gatilhos.
- `src/bff/tradetools`: transporte, formulários e mapeamento dos contratos HTTP.
- `src/bff/cases`: entrada dos fluxos de tela, sem serviço novo.
- `src/data`: store composto por sessão, catálogo, pedidos e visitas; persistência do aparelho.
- `src/components/order`: passos de condição, distribuidores e produtos.

Rotas e textos de tela em português; identificadores de código em inglês. Não renomear rotas existentes só por simetria.

O PHP revalida o pedido. A prévia offline usa os preços da combinação PDV × tabela × primeiro distribuidor selecionado. Trocar a prioridade recalcula a prévia. Cupons continuam bloqueados no Legacy até confirmação do campo. Nenhum código de faturamento é gerado a partir do ID do distribuidor.

## Primeiro build interno

Há perfis `development`, `preview` e `production` em `eas.json`, runtime pela versão do app, ícone/splash provisórios e dependências de dev client/updates. A equipe precisa vincular seu projeto EAS e configurar os identificadores reais antes de compilar ou distribuir updates.

Com o EAS da equipe configurado e seus caches em `D:`, gerar `eas build --profile development --platform android`. Só esse perfil inclui o plugin que permite HTTP para **10.11.0.11**. A configuração base continua proibindo cleartext para os demais destinos. Preview/production não incluem a exceção. Validar em aparelho na rede local; web export e testes unitários não provam o binário.

Não há APK/IPA homologado nesta entrega. Mac ou builder da equipe é necessário para iOS. Não publicar nas lojas junto com esta integração.

## Review e pendências do TL

Veja [o review original](docs/revisao-aplicacao.md) e [o status por item e TODOs do TL](docs/pendencias-tl.md). Os envelopes ainda usam amostras sintéticas onde não há captura real. O envelope de login documentado pelo PHP tem teste próprio; isso não é uma fixture real de sincronização.

Mix, histórico do mês, origem de faturamento, lojas adicionais e divisão efetiva do agendamento dependem dos contratos que o TL precisa fornecer/homologar. Código do pedido e justificativa já são coletados; a obrigatoriedade da justificativa depende da regra real. A prévia de agendamento divide quantidades pelo motor existente, sem inventar campos para o PHP.

Histórico de processo fica em `.squad/` e `docs/melhorias/`; esses arquivos não são guia operacional. O [mapa Legacy](docs/integracao-legacy.md) descreve as hipóteses do laboratório. Nenhum pedido real foi enviado.
