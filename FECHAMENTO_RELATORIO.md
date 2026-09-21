# Fechamento em lote — 2026-09-21

**Solicitação:** alterar o status de ~171 ordens para **Fechado** (`row.stFech='fechado'`), quando são duas ordens separadas por "/" pode estar invertido primeira com segunda (inclui variações com espaços).

**Lista completa:** `FECHAMENTO_LOTE_RAW` em `ARENA.html` (171 itens brutos, 178 tokens únicos quando expande os 7 pares com "/"). Sete pares com barra:
- `10835000/133223`
- `10855000/10854000`
- `10890000/10906000`
- `10974000/10973000`
- `10988000/10994000`
- `10797000/10809000`
- `10877000/10873000`

## Regra de matching (idempotente, sem duplicar)

Normalização: remove **todos** os espaços e converte para maiúsculas.

- Se `cargaStr` normalizada está no set `PAIRS` (= `a/b` e `b/a` para cada par), casa.
- Senão, quebra por `/` e casa se **qualquer token** estiver no set `SINGLES` (todos os números individuais).
- Isso cobre: `"10835000/133223"`, `"133223/10835000"`, `"10835000 / 133223"`, `"10835000/ 133223"`, cargas simples `"10835000"` etc., e também cargas que contenham "/" com essas ordens em qualquer ordem.

Exemplos da função `cargaEhAlvo`:
```
cargaEhAlvo("10835000/133223")  → true
cargaEhAlvo("133223/10835000")  → true
cargaEhAlvo("10835000 / 133223")→ true
cargaEhAlvo("10835000")         → true
cargaEhAlvo("133223")           → true
cargaEhAlvo("10835000/99999")   → true  (contém token alvo)
cargaEhAlvo("99999")            → false
```

## O que foi alterado

### 1) Migração embutida em `ARENA.html` (solução principal — funciona sem rede no sandbox)

Inserido antes de `const APP_V = '2026-09-21a'`:

- `FECHAMENTO_LOTE_RAW` (185), `FECHAMENTO_LOTE_FLAG = 'migra-fechamento-2026-09-21'`
- `SINGLES` / `PAIRS` pré-calculados
- `_normCarga` / `cargaEhAlvo` (mesma regra usada pelo fechamento quinzenal `relIsFech`)
- `migrarFechamentoLotes({silent, force})` — itera `Stor.list()` → `Stor.get('map:YYYY-MM-DD')` → para cada `row` em `frotas/capital/interior` com `cargaEhAlvo(row.carga)` e `row.stFech !== 'fechado'`, seta `row.stFech='fechado'`, `row.fechId=migId`, `row.fechDt=hojeIso()`, `rec.savedAt` e `Stor.set`. Também cobre o dia atual em memória se ainda não salvo. Grava flag `FECHAMENTO_LOTE_FLAG` para não reexecutar.
- Auto-execução idempotente via `tryAutoMigrarLote()` chamada em `init()` (após `setSaveState('synced')`) e no handler de login bem-sucedido, condicionada a ter sessão (`SESSION.access_token`) ou dados locais e flag ainda não setada.
- Exposta em `window.migrarFechamentoLotes`, `window.cargaEhAlvo`, `window.FECHAMENTO_LOTE_RAW`.
- Versão bump para `APP_V='2026-09-21a'` (badge).

### 2) Script standalone `scripts/fechar-cargas.js`

Mesma lógica, mas acessa o Supabase via REST (`app_kv?key=eq.map:YYYY-MM-DD`) usando `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` (se houver; senão anon publishable). Suporta `--dry-run` e `--force`. Em sandbox Arena a rede para Supabase está bloqueada (TLS `ECONNRESET` mesmo com `-k`), então o script loga o fallback.

### 3) Relatório (este arquivo)

## Por que não há alteração direta de dados no histórico da conversa

Tentativas de acesso direto ao Supabase (`curl -k`, `NODE_TLS_REJECT_UNAUTHORIZED=0 node fetch`, `wget`) todas falharam com `SSL_ERROR_SYSCALL` / `ECONNRESET` — sandbox Arena sem egress para `vvnpkraipzytrshaaruo.supabase.co` (confirmado também via `example.com`). `gh` só proxya `api.github.com`. Não há dump local no repo (`/home/user`, `/tmp`, git history). Solução: **migração em código** que roda quando o app tiver rede + sessão autenticada (RLS `authenticated`). RLS agora exige usuário logado — token do login vai no `Authorization: Bearer`.

## Como executar / validar na produção

### No navegador (produção / github.io)

1. Abrir `https://logfricoalimentos-pixel.github.io/MapaFrico2/ARENA.html` (ou o domínio configurado)
2. Logar como admin (nível 4)
3. Abrir DevTools → Console → `await migrarFechamentoLotes()` — retorna `{migId, hoje, totalDias, totalEncontradas, jaFechadas, alteradas, detalhes}`
   - Segunda execução retorna `{skipped:true}` (flag). Para reexecutar: `await migrarFechamentoLotes({force:true})`
4. Verificar em **Fechamento de Fretes** (filtro "Exibir fechadas") ou em **Painel → filtro "Fechadas"** — as cargas da lista devem aparecer com `stFech='fechado'`.
5. Verificar `Stor.get('migra-fechamento-2026-09-21')` — detalhes das alterações.

### Via Node (máquina com acesso à internet)

```sh
# opcional: use service_role para burlar RLS (anon falha sem sessão)
export SUPABASE_SERVICE_KEY=sb_secret_...   # ou SUPABASE_SERVICE_ROLE_KEY
node scripts/fechar-cargas.js --dry-run   # só conta
node scripts/fechar-cargas.js             # grava
node scripts/fechar-cargas.js --force     # reprocessa
```

## Rollback

No painel **Fechamento de Fretes → ↺ Retornar fechadas** ou no relatório via `fechReopenSel(migId)` — devolver para `pendente`/`analise` por `fechId`. Ou via console:

```js
await migrarFechamentoLotes({force:true}) // não desfaz — re-marca; para desfazer use a UI de retorno
// ou manualmente:
for(const d of await Stor.list().then(a=>a.filter(k=>k.startsWith('map:')).map(k=>k.slice(4)))){
  const rec = await Stor.get('map:'+d);
  let ch=false;
  for(const s of ['frotas','capital','interior']) for(const r of rec.data[s]||[]) if(r.fechId==='mig-lote-...'){ delete r.stFech; delete r.fechId; delete r.fechDt; ch=true; }
  if(ch) await Stor.set('map:'+d, rec);
}
await Stor.del('migra-fechamento-2026-09-21');
```

## Auditoria

- Função pura `cargaEhAlvo` testável sem I/O.
- Flag `FECHAMENTO_LOTE_FLAG` impede reexecução acidental.
- `audit('migracao-fechamento-lote', ...)` registra no log de auditoria do app.
- `details` limita a 500 linhas na flag para não estourar storage.
