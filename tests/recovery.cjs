const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('ARENA.html','utf8');
function block(start,end) {
  const a=html.indexOf(start), b=html.indexOf(end,a+start.length);
  assert.ok(a>=0 && b>a, start); return html.slice(a,b);
}
function context(extra={}) { return vm.createContext({console, ...extra}); }
const permissions=block('function canEditOperational(){','/* --- Aplica a sessão');
test('matriz de permissões: nível 5 operacional, sem admin/exclusão/usuários',()=>{
  const c=context({SESSION:null, TOPBAR_BTN_MIN:{}, audit(){},toast(){}});vm.runInContext(permissions,c);
  for (const level of [null,1,2,3,4,5]) {
    c.SESSION=level?{level}:null;
    assert.equal(c.canEditOperational(),level===4||level===5);
    assert.equal(c.canDeleteDay(),level===4);
    assert.equal(c.canManageUsers(),level===4);
    assert.equal(c.canViewTopbarButton('btn-clear'),level===4);
    assert.equal(c.canViewTopbarButton('btn-restore'),level===4);
    assert.equal(c.canViewTopbarButton('btn-import'),level===4||level===5);
  }
});
test('peso vazio/zero zera previsão em todas as seções',()=>{
  const c=context({selecionarFrota:()=> 'FIORINO', numVal:x=>Number(x)||0, normalizarTipo:()=> 'NORMAL',PRICE_TABLE:{NORMAL:{capital:{FIORINO:{diaria:410}},interior:{FIORINO:{diaria:418,km:2,pernoite:160}}}}});
  vm.runInContext(block('function tableForecast(', '/* Previsão COM negociação'),c);
  for (const section of ['frotas','capital','interior']) for (const peso of ['',0,null,undefined,-1]) assert.equal(c.tableForecast(section,{peso}).total,0);
  assert.equal(c.tableForecast('capital',{peso:100}).total,410);
  assert.equal(c.tableForecast('interior',{peso:100,km:10,dias:2}).total,1016);
});
test('matching do lote: pares invertidos, espaços, barras e ordens fora da lista',()=>{
  const {isAlvo,RAW}=require('../scripts/lote-2026-09-21.cjs');
  for(const x of RAW) assert.equal(isAlvo(x),true);
  for(const x of ['133223 / 10835000','10854000\\10855000',' 10835000 ']) assert.equal(isAlvo(x),true);
  for(const x of ['99999','110835000',null,'']) assert.equal(isAlvo(x),false);
});
test('janela de histórico: JavaScript gerado válido, dados escapados e filtros presentes',()=>{
  const c=context();vm.runInContext(block('const HIST_ENT =','/* ---- histórico: baixar de novo'),c);
  const page=c.histWinHtml();
  const js=page.slice(page.indexOf('<script>')+8,page.lastIndexOf('</script>'));
  new vm.Script(js);
  for(const id of ['f-ordem','f-transp','f-f1','f-e1','f-d1','h-reopen-all']) assert.ok(page.includes(id));
  assert.ok(js.includes('esc('));
});
test('histórico inclui avulsas sem duplicar cargas dos fechamentos',async()=>{
  const c=context({canEditOperational:()=>true,FECHAMENTOS:[{id:'f1',grupos:[{cargas:[{id:'r1',d:'2026-09-01',sec:'capital',ordem:'10'}]}]}],fechPeriodoTxt:()=>'',numVal:x=>Number(x)||0,
    Stor:{list:async()=>['map:2026-09-01'],get:async()=>({data:{capital:[{id:'r1',stFech:'fechado',fechId:'f1'},{id:'r2',stFech:'fechado',peso:10,carga:'20'}]}})},currentMapDate:'',SECTIONS:['frotas','capital','interior'],relIsFech:r=>r.stFech==='fechado',calcularFrete:()=>({total:20})});
  vm.runInContext(block('const HIST_ENT =','/* ---- histórico: baixar de novo'),c);
  const rows=await c.histCollectRows();assert.equal(rows.length,2);assert.equal(rows[1].avulsa,true);assert.equal(rows[1].total,20);
});
test('regressões: resumo por quinzena e impressão isolada permanecem',()=>{
  for(const x of ['id="fh-resumo"','function fechRefOptions','function renderFechHist','A4 portrait','2026-09-28b']) assert.ok(html.includes(x),x);
  assert.ok(!html.includes('tryAutoMigrarLote'));
});
test('migração: simulação não grava e aplicação usa comparação/flag após confirmação', async()=>{
  const os=require('node:os'), path=require('node:path');
  const {main}=require('../scripts/fechar-cargas.cjs');
  const old={cwd:process.cwd(),argv:process.argv,fetch:global.fetch,key:process.env.SUPABASE_SERVICE_ROLE_KEY,confirm:process.env.CONFIRMAR_LOTE};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lote-test-'));let writes=[];
  try {
    process.chdir(dir);process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_TEST_NOT_REAL';
    const before={data:{capital:[{carga:'10835000',id:'r1',stFech:'pendente'},{carga:'10854000',id:'r2',stFech:'fechado'}]}};
    global.fetch=async(url,opts)=>{
      const u=new URL(url),method=opts.method;assert.equal(opts.headers.apikey,'sb_secret_TEST_NOT_REAL');
      if(method==='GET') return {ok:true,json:async()=> u.searchParams.get('key')==='like.map:*'?[{key:'map:2026-09-01',value:before}]:[]};
      writes.push({u,opts});return {ok:true,json:async()=>[{key:'ok'}]};
    };
    process.argv=['node','script','--plan','backups/test.local.json'];await main();assert.equal(writes.length,0);
    const plan=JSON.parse(fs.readFileSync('backups/test.local.json'));assert.equal(plan.updates[0].count,1);assert.equal(plan.alreadyClosed,1);
    process.argv.push('--apply');process.env.CONFIRMAR_LOTE='2026-09-21';await main();
    assert.equal(writes.length,2);assert.equal(writes[0].opts.method,'PATCH');
    assert.equal(writes[0].u.searchParams.get('value'),'eq.'+JSON.stringify(before));
    assert.equal(JSON.parse(writes[1].opts.body).key,'migra-fechamento-2026-09-21');
    writes=[];global.fetch=async(url,opts)=>({ok:false,status:403});
    await assert.rejects(main(),/HTTP 403/);assert.equal(writes.length,0);
  } finally {
    process.chdir(old.cwd);process.argv=old.argv;global.fetch=old.fetch;
    for(const [k,v] of [['SUPABASE_SERVICE_ROLE_KEY',old.key],['CONFIRMAR_LOTE',old.confirm]]) if(v===undefined) delete process.env[k];else process.env[k]=v;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
