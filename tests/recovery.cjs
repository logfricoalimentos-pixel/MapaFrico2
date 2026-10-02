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
test('KM Portaria 2026-09-29b: situação/grupos, só Pendente+Concluída, laranja >10% e seleção por linha',()=>{
  const stubs={}; const el=id=>stubs[id]||(stubs[id]={id:id, innerHTML:'', value:'', scrollTop:0, checked:false, indeterminate:false, disabled:false, textContent:'', title:''});
  const c=context({SECTIONS:['frotas','capital','interior'],numVal:x=>Number(x)||0,norm:s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
    relIsFech:r=>r.stFech==='fechado',relStatusOf:r=>r.stFech==='fechado'?'fechada':r.stFech==='concluida'?'concluida':r.stFech==='analise'?'analise':'pendente',
    calcularFrete:(sec,r)=>({total:(Number(r.km)||0)*2}),isNegSim:r=>String(r.neg||'').toLowerCase()==='sim',
    relNormalizeRec:rec=>rec,Stor:{get:async()=>null,list:async()=>[]},
    $:s=> s==='#kp-mask' ? {querySelector:sel=>el(sel)} : null,                              // DOM stub p/ kpRenderTable
    esc:s=>String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
    fmtBR:d=>String(d),fmtNum:v=>String(Number(v)||0),fmtBRL:v=>'R$ '+(Number(v)||0).toFixed(2)});
  vm.runInContext(block('/* carga negociada (Valor Frete manual ou Neg?=Sim)','/* ================= Exportação Excel (SheetJS)'),c);
  const rec={data:{
    interior:[{id:'r1',carga:'10',km:100,stFech:'pendente',destino:'RIO VERDE'},
              {id:'r2',carga:'20',km:50,stFech:'concluida',destino:'JATAI'},
              {id:'r3',carga:'30',km:80,stFech:'fechado',destino:'MINEIROS'}],
    capital:[{id:'r4',carga:'40',km:12,stFech:'pendente',destino:'GOIANIA',neg:'sim'}],
    frotas:[{id:'r5',carga:'50',km:150,stFech:'pendente',destino:'FROTA FIXA'}]}};
  const rs=c.kmPortScanRec(rec,'2026-09-21',new Map([['10',100],['20',120],['30',90],['40',10],['50',200]]));
  assert.equal(rs.changes.length,4); assert.equal(rs.locked.length,1);
  assert.equal(rs.changes.find(x=>x.id==='r1').same,true);            // KM já igual
  assert.equal(rs.changes.find(x=>x.id==='r2').same,false);
  assert.equal(rs.changes.find(x=>x.id==='r2').status,'concluida');
  assert.equal(rs.locked[0].status,'fechada'); assert.equal(rs.locked[0].id,'r3');
  c.KP_STATE={map:new Map(),stats:{valid:5,invalid:0,dup:0},fileName:'p.xlsx',sel:new Set(),
    scan:{changes:rs.changes,locked:rs.locked,fechSkipped:1,notFound:[],days:1}};
  c.KP_STATE.rows=c.kpBuildRows();
  // 2026-09-29b: prévia mostra SÓ Pendente/Concluída — a fechada (r3) fica FORA das linhas
  assert.equal(c.KP_STATE.rows.length,4);
  const row=id=>c.KP_STATE.rows.find(x=>x.id===id);
  assert.ok(!row('r3'));                                                     // fechada fora da prévia
  assert.equal(c.KP_STATE.scan.locked.length,1);                             // mas continua contada p/ auditoria
  assert.equal(row('r1').locked,true);                                       // KM já igual: sem ✓
  assert.equal(row('r2').locked,false); assert.equal(row('r4').locked,false);
  c.kpSelectable(c.KP_STATE.rows).forEach(x=>c.KP_STATE.sel.add(x.k));        // padrão: tudo que muda, marcado
  assert.deepStrictEqual(Array.from(c.kpSelectedRows().map(x=>x.id)).sort(),['r2','r4','r5']);
  // situação: 1 · atualiza | 2 · negociada · valor mantido | 3 · KM já igual
  assert.equal(c.kpSituation(row('r2')),'atualiza');
  assert.equal(c.kpSituation(row('r4')),'negociada');
  assert.equal(c.kpSituation(row('r1')),'igual');
  // defesa: fechada/analise NUNCA passam no kpMatch, nem com filtro Status=Fechada
  const F=o=>Object.assign({tipo:'',status:'',sit:'',ordem:'',destino:'',data:''},o);
  assert.equal(c.kpMatch({status:'fechada'},F({status:'fechada'})),false);
  assert.equal(c.kpMatch({status:'analise'},F()),false);
  // filtro Situação seleciona os grupos 1/2/3
  assert.deepStrictEqual(Array.from(c.KP_STATE.rows.filter(x=>c.kpMatch(x,F({sit:'atualiza'}))).map(x=>x.id)).sort(),['r2','r5']);
  assert.deepStrictEqual(Array.from(c.KP_STATE.rows.filter(x=>c.kpMatch(x,F({sit:'negociada'}))).map(x=>x.id)),['r4']);
  assert.deepStrictEqual(Array.from(c.KP_STATE.rows.filter(x=>c.kpMatch(x,F({sit:'igual'}))).map(x=>x.id)),['r1']);
  // tipo/status/destino/data continuam funcionando (agora com sit no estado do filtro)
  assert.deepStrictEqual(Array.from(c.KP_STATE.rows.filter(x=>c.kpMatch(x,F({tipo:'frotas'}))).map(x=>x.id)),['r5']);
  assert.deepStrictEqual(Array.from(c.KP_STATE.rows.filter(x=>c.kpMatch(x,F({status:'concluida'}))).map(x=>x.id)),['r2']);
  assert.deepStrictEqual(Array.from(c.KP_STATE.rows.filter(x=>c.kpMatch(x,F({destino:'rio verde'}))).map(x=>x.id)),['r1']);
  assert.deepStrictEqual(Array.from(c.KP_STATE.rows.filter(x=>c.kpMatch(x,F({data:'2026-09-21'}))).map(x=>x.id)).sort(),['r1','r2','r4','r5']);
  // laranja: KM real MAIS DE 10% acima do atual (100→110 não; 100→111 sim; vazio→5 sim)
  assert.equal(c.kpKmJump(row('r5')),true);          // 150 → 200 (+33%)
  assert.equal(c.kpKmJump(row('r2')),true);          // 50 → 120
  assert.equal(c.kpKmJump(row('r4')),false);         // 12 → 10 (queda)
  assert.equal(c.kpKmJump(row('r1')),false);         // KM já igual
  assert.equal(c.kpKmJump({kmOld:100,kmNew:110}),false);
  assert.equal(c.kpKmJump({kmOld:100,kmNew:111}),true);
  assert.equal(c.kpKmJump({kmOld:'',kmNew:5}),true);
  assert.equal(c.kpKmJump({kmOld:0,kmNew:0}),false);
  // grupos FIXOS por situação, ordem 1 → 2 → 3, vazios descartados
  const gr=c.kpGroupRows(c.KP_STATE.rows);
  assert.deepStrictEqual(Array.from(gr.map(g=>g.g)),['atualiza','negociada','igual']);
  assert.deepStrictEqual(Array.from(gr[0].rows.map(x=>x.id)).sort(),['r2','r5']);
  assert.deepStrictEqual(Array.from(gr[1].rows.map(x=>x.id)),['r4']);
  assert.deepStrictEqual(Array.from(gr[2].rows.map(x=>x.id)),['r1']);
  assert.ok(gr[0].label.startsWith('1 ·') && gr[1].label.startsWith('2 ·') && gr[2].label.startsWith('3 ·'));
  assert.deepStrictEqual(Array.from(c.kpGroupRows([])),[]);
  // renderização agrupada (DOM stub): cabeçalhos 1→2→3 com linhas/marcadas/laranjas e rodapé
  c.kpRenderTable();
  const bodyHtml=el('#kp-body').innerHTML;
  const i1=bodyHtml.indexOf('1 · atualiza'), i2=bodyHtml.indexOf('2 · negociada'), i3=bodyHtml.indexOf('3 · KM já igual');
  assert.ok(i1>=0 && i2>i1 && i3>i2);                                   // ordem fixa dos grupos
  assert.ok(bodyHtml.indexOf('class="kp-group"')<i1);
  assert.ok(bodyHtml.includes('1 · atualiza — <b>2</b> linha(s) · <b>2</b> marcada(s) · <b>2</b> em laranja (&gt;10%)'));
  assert.ok(bodyHtml.includes('2 · negociada · valor mantido — <b>1</b> linha(s) · <b>1</b> marcada(s)'));
  assert.ok(bodyHtml.includes('3 · KM já igual — <b>1</b> linha(s)</td>'));   // grupo 3: sem marcadas
  assert.ok(bodyHtml.indexOf('data-k="2026-09-21|r2"')>i1 && bodyHtml.indexOf('data-k="2026-09-21|r4"')>i2 && bodyHtml.indexOf('data-k="2026-09-21|r1"')>i3);
  assert.ok(el('#kp-sel-sum').innerHTML.includes('<b>2</b> em laranja'));
  assert.ok(el('#kp-sel-sum').innerHTML.includes('<b>1</b> fechada(s) fora da prévia'));
  // selAll só age sobre linhas com ✓ (travadas nunca entram)
  c.KP_STATE.sel.clear(); c.kpSelAll(true);
  assert.deepStrictEqual(Array.from(c.kpSelectedRows().map(x=>x.id)).sort(),['r2','r4','r5']);
  c.kpSelAll('invert');
  assert.deepStrictEqual(Array.from(c.kpSelectedRows().map(x=>x.id)),[]);
  // HTML da linha: travada mostra 🔒 e NÃO tem checkbox; salto >10% ganha kp-dif + ⚠️
  const htmlLock=c.kpRowHtml(row('r1')), htmlSel=c.kpRowHtml(row('r2'));
  const htmlJump=c.kpRowHtml(row('r5')), htmlNeg=c.kpRowHtml(row('r4'));
  assert.ok(htmlLock.includes('🔒') && !htmlLock.includes('type="checkbox"') && htmlLock.includes('KM já igual'));
  assert.ok(htmlSel.includes('class="kp-sel"') && htmlSel.includes('data-k="2026-09-21|r2"') && htmlSel.includes('>atualiza</span>'));
  assert.ok(htmlJump.includes('kp-dif') && htmlJump.includes('⚠️') && htmlJump.includes('title="⚠️ KM real +33%'));
  assert.ok(htmlNeg.includes('negociada · valor mantido') && !htmlNeg.includes('kp-dif'));
  assert.ok(html.includes('Aplicar KM real nas marcadas') && html.includes('id="kp-f-tipo"') && html.includes('id="kp-f-status"') && html.includes('id="kp-f-sit"') && html.includes('kp-group'));
});
test('resumo do fechamento: tbody.grp por transportadora e CSS de quebra p/ impressão',()=>{
  const wrap={innerHTML:'', dataset:{}, addEventListener(){}};
  const c=context({relEl:id=> id==='fech-resumo'?wrap:null, TRANSP_CODES:{}, numVal:x=>Number(x)||0,
    fechGroups:()=>[{nome:'T1',key:'t1'},{nome:'T2',key:'t2'}],
    fechGroupSel:g=>({s:{codigo:'7'+g.key, nf:'NF'+g.key, boleto:'B'+g.key, abat:0},
      itens:[{sec:'capital',calc:{peso:10,total:100}},{sec:'interior',calc:{peso:5,total:60}}]}),
    fechResumoRows:grupos=>{
      const rows=[];
      for(const g of grupos){
        rows.push({t:'reg',regiao:'Capital',transp:g.transp,codigo:g.codigo,peso:10,abat:0,fat:100,pagar:100,nf:'',boleto:''});
        rows.push({t:'reg',regiao:'Interior',transp:g.transp,codigo:g.codigo,peso:5,abat:0,fat:60,pagar:60,nf:'',boleto:''});
        rows.push({t:'sub',transp:g.transp,codigo:g.codigo,peso:15,abat:0,fat:160,pagar:160,nf:'NF',boleto:'B'});
      }
      rows.push({t:'tot',peso:30,abat:0,fat:320,pagar:320});
      return rows;
    },
    esc:s=>String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
    fmtPeso2:v=>String(Number(v)||0), fmtBRL:v=>'R$ '+(Number(v)||0).toFixed(2)});
  vm.runInContext(block('function renderFechResumo(){','function printResumo(){'),c);
  c.renderFechResumo();
  const cnt=(s,sub)=>s.split(sub).length-1;
  const out=wrap.innerHTML;
  assert.ok(out.includes('</tr></thead><tbody class="grp">'));      // sem <tbody> solto no cabeçalho
  assert.ok(!out.includes('</tr></thead><tbody>'));
  assert.equal(cnt(out,'<tbody class="grp">'),3);                   // T1, T2 e TOTAL GERAL
  assert.equal(cnt(out,'</tbody>'),3);
  const iSub1=out.indexOf('Subtotal — T1'), iClose1=out.indexOf('</tbody>');
  assert.ok(iSub1>0 && iSub1<iClose1);                               // subtotal DENTRO do grupo da transportadora
  const iLastGrp=out.lastIndexOf('<tbody class="grp">');
  assert.ok(out.indexOf('<td>TOTAL GERAL</td>')>iLastGrp);           // total em grupo próprio
  const iGrp2=out.indexOf('<tbody class="grp">',iClose1+1), iClose2=out.indexOf('</tbody>',iClose1+1), iSub2=out.indexOf('Subtotal — T2');
  assert.ok(iSub2>iGrp2 && iSub2<iClose2);                           // T2 + subtotal no 2º grupo
  const css=c.printResumoCss();
  for(const x of ['@page{size:A4 landscape;margin:10mm}','body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#0f172a}',
    'thead{display:table-header-group}','tr{break-inside:avoid;page-break-inside:avoid}','tbody.grp{break-inside:avoid;page-break-inside:avoid}',
    'div.grp{break-inside:avoid;page-break-inside:avoid}','table{border-collapse:collapse;width:100%;font-size:12px;table-layout:fixed}']) assert.ok(css.includes(x),x);
  // impressão: cada tbody.grp vira div.grp com table própria + thead repetido (Chrome ignora break-inside em tbody)
  const stubTbl={querySelector:()=>({outerHTML:'<thead><tr><th>Região</th></tr></thead>'}),
    querySelectorAll:()=>[{outerHTML:'<tbody class="grp"><tr><td>T1</td></tr></tbody>'},{outerHTML:'<tbody class="grp"><tr class="res-total"><td>TOT</td></tr></tbody>'}]};
  const pg=c.printResumoGroupHtml(stubTbl);
  assert.equal(cnt(pg,'<div class="grp">'),2);
  assert.equal(cnt(pg,'<thead><tr><th>Região</th></tr></thead>'),2);          // cabeçalho em cada grupo
  assert.ok(pg.indexOf('<div class="grp"><table>')===0 && pg.endsWith('</table></div>'));
  assert.ok(pg.indexOf('<tbody class="grp"><tr><td>T1</td></tr></tbody>')<pg.indexOf('<tbody class="grp"><tr class="res-total">'));
});
test('rotas abertas: coleta só Pendente/Concluída, janela c/ filtro por coluna e download Excel filtrado',()=>{
  let captured=null;
  const rec={dtEntrega:'2026-09-22',data:{
    capital:[{id:'r1',carga:'10',stFech:'pendente',peso:10,km:40,destino:'GOIANIA',placa:'AAA1',motorista:'M1',transportadora:'T1'}],
    interior:[{id:'r2',carga:'20',stFech:'concluida',peso:5,km:10,destino:'JATAI',placa:'BBB2',motorista:'M2',transportadora:'T2'}],
    frotas:[{id:'r3',carga:'30',stFech:'fechado',peso:1,km:1},{id:'r4',carga:'40',stFech:'analise',peso:1,km:1}]}};
  const c=context({canEditOperational:()=>true,requireOperational:()=>true,SECTIONS:['frotas','capital','interior'],
    numVal:x=>Number(x)||0,isNegSim:r=>String(r.neg||'').toLowerCase()==='sim',
    relIsFech:r=>r.stFech==='fechado',relStatusOf:r=>r.stFech==='fechado'?'fechada':r.stFech==='concluida'?'concluida':r.stFech==='analise'?'analise':'pendente',
    relNormalizeRec:r=>r,calcularFrete:(sec,r)=>({total:(Number(r.km)||0)*2}),
    Stor:{list:async()=>['map:2026-09-21'],get:async()=>rec},currentMapDate:'',DATA:rec.data,dtEntrega:'',
    fmtBR:d=>{const p=String(d||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(d||'');},
    toast:()=>{},audit:()=>{},
    XLSX:{utils:{book_new:()=>({S:[]}),aoa_to_sheet:a=>({aoa:a}),book_append_sheet:(wb,ws,n)=>{wb.S.push([n,ws]);}},
      writeFile:(wb,n)=>{captured={n,wb};}}});
  vm.runInContext(block('/* ===== Rotas abertas','/* ---- histórico: baixar de novo'),c);
  return c.rotasAbertasCollectRows().then(rows=>{
    assert.equal(rows.length,2);                                   // fechada e "em análise" ficam fora
    assert.equal(rows.find(r=>r.id==='r1').status,'pendente');
    assert.equal(rows.find(r=>r.id==='r2').status,'concluida');
    assert.equal(rows.find(r=>r.id==='r1').total,80);
    assert.equal(rows.find(r=>r.id==='r1').media,8);
    assert.equal(rows.find(r=>r.id==='r1').entrega,'2026-09-22');
    const page=c.rotasWinHtml();
    const js=page.slice(page.indexOf('<script>')+8,page.lastIndexOf('</script>'));
    new vm.Script(js);                                             // JavaScript gerado é válido
    for(const x of ['id="r-xls"','id="r-csv"','id="r-clear"','data-col="status"','data-col="transp"','data-col="destino"']) assert.ok(page.includes(x),x);
    assert.ok(js.includes('FILTERS') && js.includes('rotasSetRows') && js.includes('valOf'));
    assert.ok(c.rotasAbertasDownload(rows)===true);
    assert.ok(captured && captured.n.startsWith('rotas-abertas-') && captured.n.endsWith('.xlsx'));
    const aoa=captured.wb.S[0][1].aoa;
    assert.equal(aoa.length,3);                                    // cabeçalho + 2 linhas
    assert.equal(aoa[0][0],'Status'); assert.equal(aoa[0][12],'Média (R$/kg)');
    assert.equal(aoa[1][0],'Pendente'); assert.equal(aoa[1][3],'Capital'); assert.equal(aoa[1][9],40); assert.equal(aoa[1][11],80); assert.equal(aoa[1][12],8);
    assert.equal(aoa[2][0],'Concluída'); assert.equal(aoa[2][3],'Interior');
  });
});
test('regressões: resumo por quinzena e impressão isolada permanecem',()=>{
  for(const x of ['id="fh-resumo"','function fechRefOptions','function renderFechHist','A4 portrait','2026-09-29e','id="kp-f-sit"','function kpGroupRows','function kpKmJump','function kpSituation','@page{size:A4 landscape;margin:10mm}','tbody class="grp"','function printResumoGroupHtml','div.grp{break-inside:avoid','id="btn-rotas-window"','function rotasWinHtml','function rotasAbertasCollectRows']) assert.ok(html.includes(x),x);
  assert.ok(!html.includes("const APP_V = '2026-09-29d'"));
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
