# Recuperação de sessões — 28/09/2026

## Evidências e escopo

Inventário baseado nas branches, commits e PRs do GitHub, não em acesso ao histórico privado das conversas. Nenhum PR ou issue aberto foi encontrado no início da revisão.

| Origem | Pendência encontrada | Encaminhamento |
|---|---|---|
| `e0dd73a`, branch `arena/01a0da04-mapafrico2` | Nível 5 — Roteirização | Front-end recuperado. Operação liberada; gestão de usuários, senhas, limpeza/restauração/exclusão de dias permanecem do admin. Backend ainda precisa de validação. |
| `09c5c62`, branch `arena/01a0c4e2-mapafrico2` | Previsão de rota com peso zero/vazio | Recuperada para Frotas/Capital/Interior, preservando prioridade dos valores negociados. |
| `4a32fc2` e `5ffa64c` | Histórico em janela própria, incluindo avulsas | Recuperado como botão adicional, **sem remover** resumo/filtros por mês e quinzena dos PRs posteriores. |
| `406b1fa` | Fechamento em lote de 21/09 | Lista recuperada; execução automática antiga deliberadamente não restaurada. Script novo faz simulação, backup e verificação de concorrência antes de gravar. **Não executado no Supabase.** |
| PR #1, fechado sem merge | Pages, placas fixas, tripulação e contagens | Incorporado pelo PR #2; não duplicar. |
| PRs #3, #4, #5 | Gerencial, Concluída, quinzenas, economia | Já integrados; preservados. |
| PR #6 | Etiquetas A4 retrato | Já integrado, deploy GitHub Pages com sucesso (`36436477090`). Preservado. |

Versão da recuperação: **2026-09-28b**.

## Supabase: bloqueio real, não conclusão presumida

Projeto principal: `vvnpkraipzytrshaaruo`. Integração externa FricoTrack usa outro projeto e não é alvo desta migração.

- Não há credencial administrativa nem CLI Supabase configurada nesta sessão.
- Tentativas HTTPS ao Auth/REST falharam no handshake TLS (`SSL_ERROR_SYSCALL`), antes de uma resposta HTTP. Isso **não prova indisponibilidade do serviço**; impede a validação a partir deste ambiente.
- A conexão direta ao domínio do Pages apresentou a mesma limitação. Estado do deploy consultado pela API autenticada do GitHub.
- Não foram alterados dados, schema, RLS ou Edge Functions no Supabase.
- Não há fonte da Edge Function `admin-users` nem migrações de schema na base do repositório. Não é seguro inventar ou substituir políticas sem inspecionar as existentes.

### Configurar acesso seguro (opção escolhida pelo usuário)

1. Disponibilizar uma conexão administrativa em ambiente autorizado, usando o mecanismo seguro de variáveis/segredos do ambiente — **nunca chat, HTML ou arquivo versionado**. Se Arena não disponibilizar esse mecanismo, usar estação administrativa confiável.
2. Liberar a saída HTTPS ao projeto Supabase. Confirmar conectividade antes de operações administrativas.
3. Para o script de dados, configurar `SUPABASE_SERVICE_ROLE_KEY` no ambiente (aceita JWT service-role ou chave `sb_secret_...`). A chave pública do site não substitui esse acesso.
4. Para gestão da função, usar a CLI oficial autenticada com acesso ao projeto; baixar e revisar a implementação existente de `admin-users` antes de editar/deployar. Não publicar fonte com segredos embutidos.
5. Executar `supabase/diagnostico.sql` (somente leitura). Confirmar constraints de `profiles.level`, RLS e proteções de `app_kv`.

### Backend necessário ao Nível 5

Antes de criar usuários Nível 5 em produção:

- Incluir 5 na constraint de nível, caso a atual permita somente 1–4, mantendo a proteção do administrador único.
- Em `admin-users`, aceitar níveis **1, 2, 3 e 5** em `create_user` e `set_level`, mas exigir nível **4** do autor para todas as ações administrativas. Não conceder nível 4 por promoção comum; não editar/excluir/resetar o admin protegido.
- Garantir por RLS/servidor: Nível 5 pode operar mapas, mas não administrar perfis nem excluir/limpar/restaurar dias. **Esconder botões não é controle de segurança do banco.** Como os mapas são JSON em `app_kv`, simples permissão de UPDATE por linha pode permitir esvaziar o dia; analisar validação via RPC/trigger ou função dedicada para assegurar a regra.
- Testar acessos com sessões dos níveis 1–5 e acesso anônimo. Não afrouxar RLS globalmente para fazer o novo perfil funcionar.

### Fechamento em lote — execução controlada

```sh
# Node 22; credencial já injetada pelo ambiente seguro
node scripts/fechar-cargas.cjs --plan backups/lote.local.json
# Conferir matches, alreadyClosed, updates e cada before/after do plano.
# Pausar edições no app, fechar abas antigas e confirmar o conjunto de ordens.
CONFIRMAR_LOTE=2026-09-21 node scripts/fechar-cargas.cjs --apply --plan backups/lote.local.json
```

- Sem `--apply`: nenhuma escrita remota; gera plano/backup local com permissão restrita.
- Plano contém dados operacionais: `backups/` é ignorado pelo Git. Não anexar a PRs ou mensagens públicas.
- Preserva cargas já fechadas, aceita pares invertidos/espaços/barra invertida e não executa no login.
- Se já existir flag do lote, interrompe para revisão; não há `--force`.
- A data de fechamento é a data da simulação (São Paulo), não uma data histórica inventada.
- Cada PATCH compara o JSON anterior no servidor; se houve edição concorrente, interrompe sem sobrescrever. Não é transação multi-dia: em falha, dias anteriores podem ter sido gravados. O script só grava flag final depois de todas as confirmações.
- A reexecução do mesmo plano aceita dias já iguais ao estado final. Se houver conflito, revisar manualmente e preservar backups. URLs muito grandes podem ser recusadas pelo servidor; nesse caso não remover a comparação: usar transação SQL revisada.
- Rollback exige revisão do `before` no backup contra o estado atual; não restaurar dias inteiros às cegas.

## Validação

`python tests/validate.py`: parser HTML, IDs estáticos únicos, sintaxe dos scripts inline, matriz de permissões, peso zero, matching de ordens, script da janela gerada, inclusão de avulsas e preservação das funcionalidades recentes.

Também: `node --check scripts/fechar-cargas.cjs` e `git diff --check`. A conexão GitHub desta sessão não tem permissão `workflows`; o workflow de CI não foi publicado. As verificações foram executadas localmente e os testes permanecem versionados. Não equivale a teste de login ou impressão física em produção.

## Atualização 29/09/2026 — KM Portaria com seleção por linha e filtros

Selo de versão: **2026-09-29a** (`APP_V`), mantida a recuperação 2026-09-28b acima.

- Prévia da planilha da portaria (`📥 KM Portaria`) passou a ter **✓ por linha**: o botão **"Aplicar KM real nas N marcada(s)"** grava `km`/`kmPortaria` **somente nas ordens selecionadas**. A prévia abre com todas as linhas que mudam marcadas; há *Marcar do filtro*, *Inverter* e *Desmarcar tudo* (a seleção sobrevive aos filtros).
- **KM já igual** ao da planilha ⇒ linha **travada (🔒), sem seleção** — nada a aplicar. Carga **FECHADA** continua nunca alterada: entra na prévia travada e só aparece com o filtro **Status = Fechada**.
- Filtros novos: **Tipo** (Capital / Interior / Frotas), **Status** (Pendente / Concluída / Em análise antigo / Fechada), **Data**, **Ordem** e **Destino / Rota**; colunas **Destino / Rota** e **Status** acrescentadas à tabela.
- `kmPortScanRec`/`kmPortScan` agora devolvem `destino`, `status` e a lista `locked` (fechadas encontradas); `KP_STATE` virou `var` (estado global, testável em sandbox).
- Validação: `python tests/validate.py` (parser HTML, IDs únicos, `node --check` dos scripts inline e `node --test tests/recovery.cjs`), com teste novo cobrindo scan/seleção/filtros/HTML da linha. Renderização e gravação conferidas também em DOM (jsdom) com `Stor` falso: apenas a linha marcada foi gravada.
- Pendente: conferência visual no navegador logado (a validação acima não equivale a teste de login/impressão em produção) e deploy no Pages.

## Atualização 29/09/2026 (b) — KM Portaria: filtro Situação, grupos fixos, só Pendente/Concluída e destaque laranja >10%

Selo de versão: **2026-09-29b** (`APP_V`), sobre a atualização 2026-09-29a acima.

- **Filtro novo: Situação** (`#kp-f-sit`) com os 3 grupos fixos da prévia: **1 · atualiza**, **2 · negociada · valor mantido**, **3 · KM já igual** (🔒, sem ✓). A classificação (`kpSituation`) vale KM já igual > negociada > atualiza: carga negociada com KM já igual entra no grupo 3 (nada a aplicar).
- **A prévia mostra SOMENTE status Pendente e Concluída.** Carga **FECHADA continua nunca alterada** e agora fica **fora da prévia** — continua contada no scan (`scan.locked`/`fechSkipped`) para o rodapé, o toast e a auditoria; `kpMatch` rejeita qualquer linha que não seja pendente/concluída (defesa em profundidade, inclusive se um dado antigo aparecer). O select de Status passou a ter só Todos / Pendente / Concluída.
- **Agrupamento SEMPRE por situação**, na ordem fixa 1 → 2 → 3 (`kpGroupRows`), com cabeçalho de grupo informando linhas, marcadas e laranjas do grupo; dentro do grupo mantém a ordenação por data, seção e ordem. Grupos vazios não aparecem.
- **Destaque laranja (`tr.kp-dif` + ⚠️ na coluna KM)** quando o **KM real é mais de 10% acima do KM atual** (`kpKmJump`: `novo > atual × 1,1`; KM atual vazio/0 com KM real válido também destaca). O `<td>` do KM ganha `title` com o percentual de salto. Contadores de laranjas no rodapé da barra e no cabeçalho do grupo.
- Negociada (Neg?=Sim ou Valor Frete manual) segue atualizando **só o KM** — o valor negociado permanece; badge âmbar "negociada · valor mantido" no grupo 2.
- Validação: `python tests/validate.py` (parser HTML, IDs únicos, `node --check` dos scripts inline) e `node --test tests/recovery.cjs` com teste ampliado cobrindo situação/grupos, exclusão de fechadas e análise, filtro Situação e a regra dos 10% (inclusive limites 100→110 não destaca, 100→111 destaca, vazio→5 destaca). Renderização agrupada conferida por HTML de linha/grupo em sandbox.
- Pendente: conferência visual no navegador logado (a validação acima não equivale a teste de login/impressão em produção) e deploy no Pages.

## Atualização 29/09/2026 (c) — Impressão do Resumo geral: quebras de página corretas e grupos por transportadora

Selo de versão: **2026-09-29c** (`APP_V`), sobre a atualização 2026-09-29b acima.

- `printResumoCss()` ganhou regras de quebra: `@page{size:A4 landscape;margin:10mm}` (a margem sai do `body`, que fica `margin:0`), `thead{display:table-header-group}` (cabeçalho repetido em cada folha), `tr{break-inside:avoid}` (nenhuma linha cortada ao meio) e `tbody.grp{break-inside:avoid}` (transportadora + subtotal nunca separados).
- `renderFechResumo()` agora embrulha cada transportadora (linhas Capital/Interior + subtotal `res-sub`) em um `<tbody class="grp">` próprio; o TOTAL GERAL (`res-total`) fecha o grupo anterior e abre o seu. O cabeçalho da tabela termina em `</tr></thead>` (o primeiro `<tbody>` abre dentro do loop) e o fechamento `</tbody></table>` final permanece.
- Na tela nada muda visualmente (o CSS de tela não zebrava por `tbody`); o efeito é só na impressão via `printResumo()`: o grupo inteiro salta para a folha seguinte quando não cabe.
- O Resumo das quinzenas (`fhResPrint`) usa outro HTML/CSS e não foi alterado.
- Validação: `python tests/validate.py` + `node --test tests/recovery.cjs` com teste novo renderizando `renderFechResumo()` em sandbox (3 grupos p/ 2 transportadoras + total, subtotais dentro do grupo certo) e conferindo as 5 regras novas do CSS de impressão.

## Atualização 29/09/2026 (d) — Impressão: transportadora + subtotal NUNCA em folhas separadas

Selo de versão: **2026-09-29d** (`APP_V`), sobre a atualização 2026-09-29c acima.

- Motivo: o Chrome **ignora** `break-inside:avoid`/`page-break-inside:avoid` em row-groups de tabela (`<tbody>`) — na prática o grupo da transportadora continuava separando (linha Capital numa folha, subtotal na seguinte), como visto no print de conferência.
- Solução: `printResumoGroupHtml(tbl)` — na **impressão** (iframe do `printResumo()`), cada `<tbody class="grp">` vira um `<div class="grp">` contendo uma `<table>` própria com o `<thead>` repetido; `div.grp{break-inside:avoid;page-break-inside:avoid}` é respeitado pelo Chrome/Firefox, então o grupo inteiro salta para a folha seguinte quando não cabe. `table-layout:fixed` + thead idêntico mantêm as larguras de coluna iguais entre as tabelas.
- Na **tela** nada muda: continua uma única tabela com `<tbody class="grp">` por transportadora.
- `printResumoCss()` também passou a incluir `div.grp{...}` e `table-layout:fixed` na regra `table`.
- Validação: teste do resumo ampliado — `printResumoGroupHtml()` com DOM stub gera 2 `div.grp` com thead repetido e ordem preservada; CSS confere as regras novas. `python tests/validate.py` + `node --test tests/recovery.cjs` verdes.

## Atualização 29/09/2026 (e) — 📋 Rotas abertas: janela baixável p/ Concluídas & Pendentes com filtro por coluna (estilo Excel)

Selo de versão: **2026-09-29e** (`APP_V`), sobre a atualização 2026-09-29d acima.

- Botão azul **📋 Rotas abertas (Concluídas & Pendentes) — abrir janela** ao lado do 📚 Cargas fechadas, no painel de Fechamento de Fretes. Abre janela própria (`openRotasWin`, mesmo espírito da 📚: `window.open` + `rotasSetRows`/`rotasSetStatus` alimentados pela aba principal).
- `rotasAbertasCollectRows()`: uma linha por carga **não fechada** de todos os dias salvos, somente status **Pendente** e **Concluída** (fechadas e "Em análise" ficam fora), com Status, Faturamento, Entrega, Tipo, Ordem, Placa, Destino/Rota, Motorista, Transportadora, KM, Peso, Total e Média; totais (peso/total/média e contagens por status) no rodapé.
- **Filtro por coluna estilo Excel**: ▼ no cabeçalho (Status, Tipo, Ordem, Placa, Destino, Motorista, Transportadora) abre dropdown com busca + checklist; colunas combinam em **E**, valores marcados somam em **OU**; ▼ amarelo indica coluna filtrada; barra tem períodos de Faturamento/Entrega e 🧹 limpa tudo.
- **⬇ Excel (filtrado)** gera o `.xlsx` na aba principal (`rotasAbertasDownload`, que tem o XLSX; aba "Rotas abertas", só as linhas filtradas, com auditoria e toast); **⬇ CSV (filtrado)** funciona standalone (`;` + BOM p/ Excel pt-BR).
- Validação: teste novo em `tests/recovery.cjs` (coleta exclui fechada/analise, JavaScript gerado da janela é válido, ids de filtro/download presentes, `rotasAbertasDownload` com XLSX stub gera aba e valores numéricos corretos); `python tests/validate.py` OK.
- Pendente: conferência visual no navegador logado (pop-up permitido) e deploy no Pages.

## Atualização 02/10/2026 — filtros, impressão do resumo (c/ PAGO e subtotal preto fosco) e cadastro de ajudantes

Selo de versão: **2026-10-02c** (`APP_V`).

- 📋 **Rotas abertas**: filtro por coluna incluído em **Média (R$/kg)**. O filtro lista os mesmos valores arredondados exibidos na tabela e também afeta os downloads filtrados (Excel e CSV).
- **Resumo Geral — Interior/Capital por transportadora**: impressão como tabela contínua (`fechResumoSelectedGroups` compartilhado entre tela e impressão), com título e cabeçalho repetidos em cada página; cada transportadora (regiões + subtotal, se houver) permanece inteira em uma página. Fundo branco no documento, sem as colunas **Entregou a NF** e **Boleto**; transportadora **PAGO** é impressa e incluída no **TOTAL GERAL** impresso para coincidir exatamente com o total exibido na tabela filtrada. Subtotal impresso somente quando o grupo tem Interior e Capital (`skipSingleSub`), com fundo preto fosco (`#1f1f1f`) e texto branco (`#fff`).
- 👷 **Cadastro de ajudantes & tripulação (Frotas)**: seção própria em `⚙️ Configurações` (`#sec-frota-trip`, persistida na chave `frota-tripulacao`) permitindo editar manualmente placa, motorista, 1º ajudante e 2º ajudante dos 5 veículos fixos padrão (`MFM8075`, `RBQ4C63`, `RSD1E71`, `NWN3975`, `NVP6191`) e adicionar/remover outras placas de Frotas, sincronizando imediatamente com o mapa aberto e preservando edições manuais do dia (`_ajudManual`).
- Validação: `python tests/validate.py` (12 testes, incluindo igualdade do total impresso c/ PAGO, subtotal preto fosco/branco, filtro de Média e edição manual do cadastro de ajudantes/tripulação).
