#!/usr/bin/env node
/**
 * fechar-cargas.js — marca como "Fechado" as ~180 ordens do lote 2026-09-21
 * tratando pares com "/" em qualquer ordem (ex.: "10835000/133223" ↔ "133223/10835000"
 * e variações com espaços).
 *
 * Uso (quando a rede permitir Supabase):
 *   node scripts/fechar-cargas.js
 *   node scripts/fechar-cargas.js --dry-run        # só conta sem gravar
 *   node scripts/fechar-cargas.js --force          # reexecuta mesmo se flag já existe
 *   SUPABASE_SERVICE_KEY=... node scripts/fechar-cargas.js
 *
 * Também funciona dentro do navegador via:
 *   await migrarFechamentoLotes()           // ARENA.html expõe window.migrarFechamentoLotes
 *   await migrarFechamentoLotes({force:true})
 *
 * Sandbox Arena sem egress para Supabase vai falhar com ECONNRESET — neste caso
 * a migração embutida em ARENA.html roda automaticamente no próximo login/refresh
 * (ver FECHAMENTO_RELATORIO.md).
 */
'use strict';

const RAW = [
  "10732000","10734000","10742000","10747000","10756000","10753000","10755000","10754000",
  "10794000","10791000","10800000","10804000","10801000","10798000","10805000","10808000","10802000","10803000",
  "10829000","10815000","10817000","10825000","10826000","10837000","10838000","10835000/133223","10833000","10842000",
  "10845000","10834000","10836000","10846000","10855000/10854000","10847000","10844000","10848000","10840000","10859000",
  "10863000","10864000","10849000","10865000","10862000","10861000","10876000","10871000","10860000","10885000","10891000",
  "10879000","10887000","10884000","10880000","10882000","10888000","10881000","10878000","10883000","10886000","10905000",
  "10903000","10890000/10906000","10910000","10927000","10908000","10909000","10925000","10922000","10921000","10934000",
  "10933000","10935000","10943000","10936000","10932000","10945000","10946000","10949000","10952000","10947000","10950000",
  "10953000","10966000","10974000/10973000","10971000","10970000","10987000","10986000","10975000","10982000","10988000/10994000",
  "10996000","10972000","10814000","10781000","10786000","10783000","10795000","10789000","10788000","10785000","10782000",
  "10790000","10784000","10787000","10810000","10807000","10813000","10797000/10809000","10811000","10818000","10824000","10822000",
  "10820000","10827000","10830000","10823000","10853000","10851000","10850000","10856000","10852000","10874000","10870000",
  "10872000","10875000","10869000","10867000","10877000/10873000","10868000","10900000","10898000","10897000","10894000","10892000",
  "10904000","10899000","10895000","10893000","10911000","10916000","10912000","10917000","10920000","10915000","10919000",
  "10913000","10914000","10924000","10937000","10942000","10940000","10939000","10938000","10961000","10957000","10959000",
  "10956000","10954000","10962000","10958000","10963000","10960000","10955000","10978000","10983000","10977000","10980000",
  "10984000","10976000","10981000"
];
const FLAG = 'migra-fechamento-2026-09-21';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vvnpkraipzytrshaaruo.supabase.co';
const SUPA_REST = SUPABASE_URL + '/rest/v1/app_kv';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_KxWUmmb4l2ahicW5n78tvg_23cd9CDY';
// RLS do banco exige sessão de usuário; service_role (service key) burla RLS — sem ela
// o fetch anon falha em sandbox bloqueado; em prod, configure SUPABASE_SERVICE_KEY no env.
const TOKEN = SERVICE_KEY || ANON;

function supaHeaders(extra){
  return Object.assign({apikey: ANON, Authorization: 'Bearer ' + TOKEN, 'Content-Type':'application/json'}, extra||{});
}
const SINGLES = new Set();
const PAIRS = new Set();
for(const raw of RAW){
  const parts = raw.split('/').map(s=> s.trim()).filter(Boolean);
  for(const p of parts) SINGLES.add(p.replace(/\s+/g,'').toUpperCase());
  if(parts.length===2){
    const a=parts[0].replace(/\s+/g,'').toUpperCase(), b=parts[1].replace(/\s+/g,'').toUpperCase();
    PAIRS.add(a+'/'+b); PAIRS.add(b+'/'+a);
  }
}
function normCarga(c){ return String(c==null?'':c).replace(/\s+/g,'').toUpperCase(); }
function isAlvo(cargaStr){
  const n = normCarga(cargaStr); if(!n) return false;
  if(PAIRS.has(n)) return true;
  const parts = n.split('/').filter(Boolean);
  if(parts.length===1) return SINGLES.has(parts[0]);
  return parts.some(p=> SINGLES.has(p)) || (parts.length===2 && PAIRS.has(parts[0]+'/'+parts[1]));
}

async function storList(){
  const res = await fetch(SUPA_REST + '?select=key', {headers: supaHeaders()});
  if(!res.ok) throw new Error('Stor.list HTTP ' + res.status + ' ' + await res.text().catch(()=> ''));
  const rows = await res.json();
  return rows.map(r=> r.key);
}
async function storGet(k){
  const res = await fetch(SUPA_REST + '?key=eq.' + encodeURIComponent(k) + '&select=value', {headers: supaHeaders()});
  if(!res.ok) throw new Error('Stor.get '+k+' HTTP '+res.status);
  const rows = await res.json();
  return rows[0] ? rows[0].value : null;
}
async function storSet(k, v){
  const res = await fetch(SUPA_REST + '?on_conflict=key', {
    method: 'POST', headers: supaHeaders({Prefer:'resolution=merge-duplicates,return=minimal'}),
    body: JSON.stringify({key:k, value:v})
  });
  if(!res.ok) throw new Error('Stor.set '+k+' HTTP '+res.status+' ' + await res.text().catch(()=> ''));
}

async function main(){
  const args = new Set(process.argv.slice(2));
  const dry = args.has('--dry-run');
  const force = args.has('--force');
  console.log('═ fechar-cargas — lote 2026-09-21 ═');
  console.log('Alvos:', RAW.length, 'ordens |', SINGLES.size, 'tokens únicos |', (PAIRS.size/2), 'pares com "/"');
  console.log('Supabase:', SUPABASE_URL, '| token:', SERVICE_KEY ? 'service_role' : 'anon', '| modo:', dry ? 'DRY-RUN' : 'GRAVAÇÃO');

  if(!force){
    try{
      const flag = await storGet(FLAG);
      if(flag && flag.done){ console.log('Flag já existe —', flag.at, '| id', flag.migId, '| use --force para reexecutar'); if(!dry) return; }
    }catch(e){ console.warn('Aviso flag:', e.message); }
  }

  let keys;
  try{ keys = await storList(); }catch(e){
    console.error('Falha ao listar app_kv — rede bloqueada ou chave inválida:', e.message);
    console.error('No sandbox Arena o egress para Supabase está bloqueado (ECONNRESET TLS).');
    console.error('A migração embutida em ARENA.html roda sozinha no próximo acesso do app (login).');
    process.exitCode = 2; return;
  }
  const mapDates = keys.filter(k=> k.startsWith('map:')).map(k=> k.slice(4)).filter(d=> /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  console.log('Dias com mapa:', mapDates.length);
  const hoje = new Date().toISOString().slice(0,10);
  const migId = 'mig-lote-' + Date.now().toString(36);
  let totalDias=0, encontradas=0, jaFech=0, alteradas=0;
  const detalhes=[];

  for(const d of mapDates){
    let rec; try{ rec = await storGet('map:'+d); }catch(e){ console.warn('skip', d, e.message); continue; }
    if(!rec || !rec.data) continue;
    let mudou=false;
    for(const sec of ['frotas','capital','interior']){
      for(const row of (rec.data[sec]||[])){
        if(!row) continue;
        const cv = row.carga==null?'':String(row.carga);
        if(!isAlvo(cv)) continue;
        encontradas++;
        if(row.stFech==='fechado'){ jaFech++; continue; }
        if(!dry){ row.stFech='fechado'; row.fechId=migId; row.fechDt=hoje; }
        alteradas++; mudou=true;
        detalhes.push({data:d, sec, carga:cv, destino:row.destino||'', placa:row.placa||''});
      }
    }
    if(mudou && !dry){
      rec.savedAt = new Date().toISOString();
      try{ await storSet('map:'+d, rec); totalDias++; console.log('✔', d, 'atualizado'); }catch(e){ console.error('✘ falha salvar', d, e.message); }
    } else if(mudou) { totalDias++; }
  }

  console.log('— Resumo —');
  console.log('Encontradas:', encontradas, '| já fechadas:', jaFech, '| a fechar:', alteradas, '| dias afetados:', totalDias);
  if(detalhes.length){ console.log(detalhes.slice(0,100).map(x=> `${x.data} ${x.sec} carga=${x.carga} placa=${x.placa}`).join('\n')); if(detalhes.length>100) console.log('… +', detalhes.length-100, 'linhas'); }

  if(dry){
    console.log('DRY-RUN: nada foi gravado.');
    return;
  }
  // grava flag idempotente
  try{
    await storSet(FLAG, {done:true, at:new Date().toISOString(), migId, totalDias, encontradas, jaFech, alteradas, detalhes: detalhes.slice(0,500)});
    console.log('Flag', FLAG, 'gravada.');
  }catch(e){ console.warn('Flag não gravada:', e.message); }
  console.log('Migração', migId, 'concluída em', hoje);
}

if(require.main === module){
  main().catch(e=>{ console.error(e); process.exitCode=1; });
}
module.exports = {RAW, SINGLES, PAIRS, isAlvo};
