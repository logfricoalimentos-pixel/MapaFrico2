# Auditoria — Fechamento de frete (quinzenal)

Data: **07/10/2026** · Selo de versão do app: **2026-10-07a** (`APP_V`)
Escopo: grade "📚 Fechamentos anteriores (por mês/quinzena)", classificação da
quinzena de referência e navegação do painel "🔒 Fechamento de frete (quinzenal)".

---

## 1. Diagnóstico — por que "Setembro/2026 — Quinzena 2" sumiu

### 1.1 Onde os fechamentos moram (não existe tabela `fechamentos_frete`)

O app é um arquivo único (`ARENA.html`) e os dados ficam no **Supabase
`public.app_kv`** (chave → valor JSON), e **não** em uma tabela relacional de
fechamentos. A chave é **`fechamentos`** e o valor é um **array JSON**:

```
[ { id, criadoEm, dataFech, por,
    ref: { ano, mes, quinzena },     <- referência escolhida no fechamento
    start, end,                      <- período fechado (datas de entrega)
    grupos: [ { transp, codigo, abatimento, peso, faturado, apagar,
                cargas: [ { d, sec, id, placa, destino, ordem, peso, total … } ] } ] } ]
```

A grade "Fechamentos anteriores" é **100% frontend**: `renderFechHist()` →
`fhVistos()` → `fechRefOf(f)` para cada fechamento do array. Não há RPC/view
envolvida, portanto **nenhum filtro de status, soft-delete, RLS ou materialized
view pode estar escondendo o registro** — o dado some (ou aparece) somente pela
**classificação da referência**.

### 1.2 A causa raiz: classificacao pelo 1º dia do período

`fechRefOf()` tinha duas situações:

1. **Fechamento com `ref` gravado** (criado pelo modal "📅 Referência do
   fechamento"): usa a referência escolhida pelo usuário — correto por design.
2. **Fechamento legado, sem `ref`**: derivava a referência de **`f.start`
   somente**:

```js
// ANTES (bug)
const d = f.start || f.dataFech || …;
const q = +d.slice(8, 10) <= 15 ? 1 : 2;      // quinzena pelo 1º dia
```

Os três fechamentos em questão têm períodos que **atravessam a virada do mês**:

| Período (start → end) | Dias em Agosto | Dias em Setembro | Classificação ANTES | Classificação correta |
|---|---|---|---|---|
| 31/08 → 21/09 | 1 | 21 | **Agosto — Quinzena 2** ❌ | **Setembro — Quinzena 2** ✅ |
| 30/08 → 18/09 | 2 | 19 | **Agosto — Quinzena 2** ❌ | **Setembro — Quinzena 2** ✅ |
| 28/08 → 17/09 | 4 | 17 | **Agosto — Quinzena 2** ❌ | **Setembro — Quinzena 2** ✅ |

Como `start` cai em 28–31/08 (dia > 15 ⇒ Quinzena 2), **todos os três caiam em
"Agosto/2026 — Quinzena 2"**. Consequência: **nenhum fechamento do banco possui
`ref`/derivação em Setembro/2026 — Quinzena 2**, e um grupo que não tem nenhum
fechamento simplesmente **não existe na grade** — daí o "sumiço".

> Nota: se algum desses fechamentos tiver `ref` gravado como Agosto Q2 (decisão
> do usuário no modal), ele continua em Agosto por design — a correção para esse
> caso é a ação **↪ Mover** (seção 3.4), que reclassifica e persiste.

### 1.3 Problemas secundários encontrados na mesma tela

- **Ordem crescente**: `fhVistos()` ordenava os grupos com `a.ord - b.ord`
  (mais antigo primeiro) — o painel de fechamento é usado "de trás para a
  frente" e a quinzena mais recente ficava no fim.
- **Sem scroll**: a lista de fechamentos crescia indefinidamente e estourava o
  modal.
- **Tudo empilhado**: "Resumo geral", "Fechamentos anteriores", "Cargas
  fechadas" e "Rotas abertas" conviviam dentro do mesmo modal.
- **Sugestão de referência por "hoje"**: `fechRefAsk()` sugeria a quinzena do
  dia da confirmação; um fechamento de período setembro confirmado em outubro
  sugeria **Outubro Q1** — erro de classificação já na criação.

---

## 2. Correção no banco / regra de agrupamento (SQL)

Como a regra vive no frontend, a correção canônica está em `ARENA.html`
(`fechRefPredominante`, seção 3.1). Para **diagnosticar e auditar direto no
Supabase**, foi criado `supabase/diagnostico-fechamentos.sql` (somente leitura,
exceto a view da seção 5):

- **Seção 1–2**: onde os fechamentos estão e um linha por fechamento
  (`ref` gravado × período).
- **Seção 3**: agrupamento por `ano/mes/quinzena` — confirma se existe
  **2026 / 9 / 2** — e quantos fechamentos estão **sem `ref`** (legados).
- **Seção 4**: lista os fechamentos que **cruzam o mês** (os suspeitos).
- **Seção 5**: view **`public.vw_fechamentos_quinzena`** com a regra corrigida
  em SQL — mês com mais dias; se o **fim** do período está nesse mês, vale a
  **quinzena do fim**; destaca `divergente = true` quando o `ref` gravado não
  bate com o período (candidatos a ↪ Mover).
- **Seção 6**: RLS/policies/views/colunas de `app_kv` (não há soft-delete).
- **Seção 7**: conferência final — os fechamentos devem aparecer como
  **Setembro/2026 — Quinzena 2**.

Trecho central da view (regra espelhando o JavaScript):

```sql
mes_pred as (           -- mês com mais dias do período (empate: mais recente)
  select distinct on (fech_id) fech_id, am
  from (select fech_id, to_char(d, 'YYYY-MM') as am, count(*) as n
          from dia group by 1, 2) t
  order by fech_id, n desc, am desc
),
q_pred as (             -- quinzena: a do fim, quando o fim está no mês predominante
  select b.fech_id,
         case when to_char(b.fim, 'YYYY-MM') = m.am
              then (case when extract(day from b.fim) <= 15 then 1 else 2 end)
              else (… quinzena com mais dias no mês predominante …)
         end as quinzena
  from base b join mes_pred m using (fech_id)
)
```

Nenhuma migração de dados é necessária: a classificação é calculada na leitura.

---

## 3. Código frontend atualizado (`ARENA.html`)

### 3.1 Classificação correta da quinzena

- **`fechRefPredominante(ini, fim)`** (nova): conta os dias do período por mês e
  por quinzena; devolve o **mês predominante** e, dentro dele, a **quinzena do
  fim** do período (é a quinzena que está sendo fechada); se o fim estiver fora
  do mês predominante, usa a quinzena com mais dias desse mês. Períodos
  invertidos são normalizados; período inválido ou > 400 dias não classifica.
- **`fechRefOf(f)`**: `ref` válido gravado continua vencendo (decisão do
  usuário); legados passam a usar `fechRefPredominante(start, end)` em vez de
  `start` — **é o fix que faz Setembro/2026 Q2 aparecer**.
- **`fechRefAsk()`**: as 4 opções passam a ser montadas em torno da **quinzena
  predominante do período** (e não de "hoje"), e o padrão já vem na quinzena
  certa — evita o erro na origem.

### 3.2 Navegação em telas individuais (à direita do filtro Status)

Dentro de `.fech-tools`, depois do filtro **Status**, um grupo `.fech-nav` com
4 botões, cada um abrindo uma **tela própria** (nada empilhado no painel):

| Botão | Destino |
|---|---|
| 📚 **Fechamentos anteriores** | drawer `#fech-antigos-mask` (filtros + grade com scroll) |
| 📚 **Cargas fechadas — abrir janela** | pop-up `openHistWin()`; se o navegador bloquear, **tela própria com iframe** (`#janela-mask`) |
| 📊 **Resumo geral** | drawer `#fech-rg-mask` com `#fech-resumo` — **atualiza conforme você marca** |
| 📋 **Rotas abertas — abrir janela** | pop-up `openRotasWin()`; mesmo fallback em iframe |

- Os `<details>` "Resumo geral" e "Fechamentos anteriores" e os dois botões
  soltos **saíram de dentro do modal** de fechamento (IDs e funções mantidos:
  `#fech-resumo`, `#fech-hist-rows`, `#fh-ano`, `#fh-resumo`, `#btn-hist-window`,
  `#btn-rotas-window`).
- Drawers: `role="dialog"`, `aria-modal`, fecham por ✕, botão **Fechar**, clique
  no fundo escurecido e **Esc** (cadeia: referência → resumo das quinzenas →
  mover → janela → fechamentos anteriores → resumo geral → painel). Fechar o
  painel principal (✕/Esc/fundo) também fecha as sub-telas abertas.
- Fallback sem pop-up: `abrirJanelaIframe()` grava o mesmo HTML da janela em um
  `Blob` e o exibe em iframe full-screen, com `window.opener`/`window.close()`
  adaptados (`winAdaptIframe`) — a janela continua funcional (reabrir, baixar de
  novo) apontando para a aba principal.

### 3.3 "📚 Fechamentos anteriores": ordem + scroll + ações

- **Grupos em data decrescente** (`b.ord - a.ord`): Setembro/2026 Q2 antes de
  Agosto/2026 Q2.
- **Fechamentos dentro do grupo em data decrescente** (`fechOrdemTs`: data de
  criação, desempate pela data de fechamento).
- **Scroll de altura controlada**: `.win-scroll{max-height:70vh;overflow-y:auto}`
  dentro do drawer (em telas ≤ 760 px vira tela cheia sem limite).
- Cada linha mantém **📥 Baixar de novo** e **↺ Reabrir cargas** e ganhou
  **↪ Mover** (seção 3.4) e o selo **⚠ referência divergente** quando o `ref`
  gravado não bate com o período predominante.
- Cabeçalho com contador: "N quinzena(s) · N fechamento(s) · N carga(s) · R$ …".
- Empty states com orientação ("📭 Nenhum fechamento feito ainda…", "🔍 Nenhuma
  quinzena nos filtros escolhidos — use 'limpar'").

### 3.4 ↪ Mover (reclassificar) — modal `#fech-move-mask`

Corrige a referência de um fechamento já fechado: escolhe **Ano / Mês /
Quinzena** (ou **"usar predominante"**, que preenche a quinzena calculada do
período), grava `f.ref`, persiste em `Stor.set('fechamentos', …)` com
`refreshSessionToken()`, registra auditoria (`fechamento-movido`) e
redesenha a grade na hora.

### 3.5 Performance e UX

- `fechBaixarDeNovo()` agora liga o overlay **⏳ Gerando…** (`setBusy`) antes da
  geração dos Excel (a UI pinta antes do trabalho pesado) e trata falhas com
  toast.
- `renderFechHist()` continua em O(n) sobre o array em memória; o scroll evita
  layout gigante com muitos fechamentos.
- `histWinRefresh()`/`rotasWinRefresh()` passaram a verificar a janela por
  `histAberto()`/`rotasAberta()` (pop-up **ou** iframe) — refresh e fechamento
  funcionam nos dois modos, inclusive no `logout()`.

---

## 4. Validação automatizada

- `python3 tests/validate.py` — parser HTML, **IDs únicos**, `node --check` dos
  scripts inline e a suíte `node --test tests/recovery.cjs`.
- Novos testes em `tests/recovery.cjs`:
  1. **Quinzena predominante**: 31/08→21/09, 30/08→18/09 e 28/08→17/09 ⇒
     **Setembro/2026 Q2**; Agosto inteiro continua Agosto Q2; dia único;
     intervalo invertido; inválidos; `fechRefOf` (legado, `ref` explícito,
     `ref` inválido, sem dados).
  2. **Grade decrescente**: grupos (Setembro Q2 → Q1 → Agosto Q2) e linhas
     dentro do grupo; ⚠ só no fechamento divergente; ações
     `fech-dl`/`fech-rs`/`fech-mv` presentes; contador do cabeçalho.
  3. **Opções de referência** montadas pelo período (Agosto + Setembro).
  4. **HTML**: botões de navegação, drawers, `win-scroll` com `max-height:70vh`
     e `overflow-y:auto`, `↪ Mover`, fallback em iframe e ausência dos
     `<details>` empilhados.
- Teste de integração com DOM real (jsdom, executado fora do repo): boot do app
  com "banco" simulado, grade com 5 fechamentos, ordem, ⚠, abertura/fechamento
  dos drawers, pop-up bloqueado → iframe, ↪ Mover persistindo Setembro Q2
  (Agosto Q2 desaparece da grade) e empty state. **Todos passaram.**

---

## 5. Checklist de testes manuais (produção, logado)

> Pré-requisito: sessão de nível 4 (Administrador) ou 5 (Roteirização) e deploy
> do `ARENA.html` versão **2026-10-07a** (o selo `APP_V` avisa sobre cache
> antigo — Ctrl+F5 se aparecer o aviso amarelo).

### A. Aparição de Setembro/2026 — Quinzena 2

- [ ] Abrir **📋 Fechamento de Fretes** → **🔒 Fechamento** → botão **📚 Fechamentos
      anteriores** (ao lado do filtro Status).
- [ ] Confirmar que existe o grupo **Setembro/2026 — Quinzena 2** com os
      fechamentos **31/08→21/09**, **30/08→18/09** e **28/08→17/09**
      (6 fechamentos · 110 cargas · 235.941,76 kg · R$ 176.027,10, conforme os
      dados atuais).
- [ ] Conferir no Supabase (SQL Editor, `supabase/diagnostico-fechamentos.sql`,
      seções 3 e 7): existe `2026 / 9 / 2` e os fechamentos acima estão lá.
- [ ] Se algum fechamento ainda estiver em **Agosto/2026 — Quinzena 2** com o
      selo **⚠ referência divergente**, usar **↪ Mover → usar predominante** e
      confirmar que ele passa para Setembro Q2 e some de Agosto.

### B. Ordenação decrescente

- [ ] O grupo mais recente é o **primeiro** da lista (Setembro/2026 Q2 acima de
      Agosto/2026 Q2; Q2 acima de Q1 dentro do mesmo mês).
- [ ] Dentro de cada grupo, o fechamento **mais novo** (data de fechamento)
      aparece primeiro.
- [ ] Filtrar por **Ano = 2026** e por **Mês = Setembro**: só as quinzenas de
      setembro, na mesma ordem decrescente.

### C. Scroll funcionando

- [ ] Com vários fechamentos, a lista **rola** dentro da janela e a janela
      **não estoura** a tela (altura máxima controlada, `max-height:70vh`).
- [ ] O cabeçalho (título/filtros) e o rodapé (**Fechar**) continuam visíveis
      enquanto a lista rola.
- [ ] Em celular (≤ 760 px), a janela ocupa a tela toda e a lista rola dentro
      dela.

### D. Botões abrindo as telas corretas

- [ ] **📚 Fechamentos anteriores** → tela própria com filtros (Ano/Mês/De-Até,
      limpar, 👁 Ver resumo) e a grade; fecha por ✕, **Fechar**, Esc ou clique no
      fundo.
- [ ] **📚 Cargas fechadas — abrir janela** → pop-up com as cargas fechadas
      (filtros, ↺ reabrir, 📥 baixar de novo). **Com pop-up bloqueado**: abre a
      tela própria com iframe e as ações continuam funcionando.
- [ ] **📊 Resumo geral** → tela própria com Interior/Capital por
      transportadora + TOTAL GERAL; **marcar/desmarcar cargas no painel
      atualiza o resumo na hora**; 🖨 Imprimir sai igual à tela.
- [ ] **📋 Rotas abertas (Concluídas & Pendentes) — abrir janela** → pop-up
      (ou iframe, se bloqueado) com o filtro por coluna e os downloads.
- [ ] Nenhuma dessas seções aparece mais empilhada dentro do modal de
      fechamento.

### E. Fechamento novo (regressão)

- [ ] Fechar uma quinzena com período começando em agosto e terminando em
      setembro: o modal de referência deve sugerir **Setembro — Quinzena 2** e
      oferecer Agosto Q1/Q2 + Setembro Q1/Q2.
- [ ] Após confirmar, o fechamento novo aparece no topo da grade (ordem
      decrescente).
- [ ] **👁 Ver resumo** (quinzenas marcadas) e **📥 Baixar de novo** continuam
      gerando os mesmos arquivos.

### F. Permissões e logout

- [ ] Com sessão de nível 1–3 (somente leitura), os botões de navegação não
      executam ação (toast "🔒 Ação restrita…").
- [ ] Ao fazer **logout**, as janelas abertas (pop-up ou iframe) são fechadas.
