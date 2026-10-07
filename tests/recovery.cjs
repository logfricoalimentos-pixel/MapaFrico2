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
test('resumo do fechamento: grupos na tela e tabela contínua/branca na impressão',()=>{
  const wrap={innerHTML:'', dataset:{}, addEventListener(){}};
  const c=context({relEl:id=> id==='fech-resumo'?wrap:null, TRANSP_CODES:{}, numVal:x=>Number(x)||0,
    fechGroups:()=>[{nome:'T1',key:'t1'},{nome:'T2',key:'t2'}],
    fechGroupSel:g=>({s:{codigo:'7'+g.key, nf:'NF'+g.key, boleto:'B'+g.key, abat:0},
      itens:[{sec:'capital',calc:{peso:10,total:100}},{sec:'interior',calc:{peso:5,total:60}}]}),
    fechResumoRows:grupos=>{
      assert.equal(grupos[0].nf,'NFt1'); assert.equal(grupos[0].boleto,'Bt1'); // as colunas seguem visíveis no resumo da tela
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
    '.print-table thead{display:table-header-group}','.print-table tr.carrier-pack{break-inside:avoid !important;page-break-inside:avoid !important}',
    'td{white-space:nowrap}','.print-table{border-collapse:collapse;width:100%;font-size:11px;table-layout:fixed;background:#fff !important}',
    '.carrier-data tr.res-sub td{background:#1f1f1f !important;color:#fff !important']) assert.ok(css.includes(x),x);
  const printHtml=c.printResumoRowsHtml([
    {t:'reg',regiao:'Interior',transp:'T1',codigo:'7',peso:5,abat:null,fat:60,pagar:60},
    {t:'sub',transp:'T1',codigo:'7',peso:15,abat:0,fat:160,pagar:160},
    {t:'tot',peso:15,abat:0,fat:160,pagar:160}
  ],'01/09/2026 a 15/09/2026','02/10/2026');
  assert.equal(cnt(printHtml,'class="print-table"'),1);                     // uma tabela externa contínua
  assert.equal(cnt(printHtml,'class="carrier-data"'),2);                   // cada transportadora fica em um bloco indivisível
  assert.equal(cnt(printHtml,'<thead>'),1);                                  // título + cabeçalho repetidos em cada página via CSS
  assert.equal(cnt(printHtml,'class="print-carrier"'),2);
  assert.ok(printHtml.includes('Subtotal — T1') && printHtml.includes('Período: 01/09/2026 a 15/09/2026'));
});
test('impressão do resumo: iguala total filtrado da tabela, inclui PAGO, subtotal preto fosco só com Int+Cap e omite NF/Boleto',()=>{
  let printed='';
  const wrap={innerHTML:'', dataset:{}, addEventListener(){}};
  const iframe={style:{},contentDocument:{open(){},write:s=>{printed=s;},close(){}},contentWindow:{focus(){},print(){}},remove(){}};
  const mix={key:'mix',nome:'Transportadora Mix'}, solo={key:'solo',nome:'Transportadora Solo'}, pago={key:'pago',nome:'PAGO'};
  const data={
    mix:[{sec:'interior',row:{stFech:'concluida'},calc:{peso:500,total:300000}},{sec:'capital',row:{stFech:'concluida'},calc:{peso:70,total:70000}},{sec:'capital',row:{},calc:{peso:999,total:99999}}],
    solo:[{sec:'interior',row:{stFech:'concluida'},calc:{peso:30,total:2601.90}}],
    pago:[{sec:'capital',row:{stFech:'concluida'},calc:{peso:12,total:1163.96}}]
  };
  const c=context({relEl:id=>id==='fech-resumo'?wrap:null,TRANSP_CODES:{},REL:{start:'2026-09-01',end:'2026-09-15'},
    FECH_ST:'concluida',relIsConcluida:r=>!!(r&&r.stFech==='concluida'),
    fechStMatch:r=>!!(r&&r.stFech==='concluida'),
    fechPeriodoTxt:()=> '01/09/2026 a 15/09/2026',fechGroups:()=>[mix,solo,pago],
    fechGroupSel:g=>{
      const itens=data[g.key].filter(it=>it.row.stFech==='concluida');
      return {s:{codigo:'COD-'+g.key,nf:'Sim',boleto:'Sim',abat:0},itens};
    },
    numVal:x=>Number(x)||0,fmtPeso2:v=>String(Number(v)||0),fmtBRL:v=>'R$ '+(Number(v)||0).toFixed(2),
    esc:s=>String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
    document:{createElement:()=>iframe,body:{appendChild(){}}},setTimeout:()=>{},toast(){}});
  vm.runInContext(block('function fechResumoRows(', 'function renderFechFoot(){'),c);
  c.renderFechResumo();
  c.printResumo();
  const cnt=(s,sub)=>s.split(sub).length-1;
  assert.ok(printed.includes('Transportadora Mix') && printed.includes('Transportadora Solo') && printed.includes('>PAGO</td>'));
  assert.ok(printed.includes('R$ 1163.96') && printed.includes('R$ 373765.86')); // inclui PAGO e bate com o total da tabela
  assert.ok(wrap.innerHTML.includes('R$ 373765.86'));                            // mesmo total na tela e na impressão
  assert.ok(!printed.includes('99999'));                                         // respeita o filtro de status (Concluída)
  assert.ok(!printed.includes('Entregou a NF') && !printed.includes('Boleto'));
  assert.equal(cnt(printed,'class="res-sub"'),1);                                // subtotal só p/ transportadora com Interior e Capital
  assert.equal(cnt(printed,'Subtotal —'),1);
  assert.equal(cnt(printed,'class="print-table"'),1);                            // uma tabela externa contínua
  assert.equal(cnt(printed,'class="carrier-data"'),4);                           // MIX, SOLO, PAGO e TOTAL GERAL em blocos inteiros
  assert.equal(cnt(printed,'<thead>'),1);                                        // título + colunas repetidos em cada página
  assert.ok(printed.includes('<strong>RESUMO GERAL — INTERIOR/CAPITAL POR TRANSPORTADORA + TOTAL GERAL</strong>'));
  assert.ok(printed.includes('<tr class="print-columns">'));
  assert.equal(cnt(printed,'class="carrier-pack"'),4);
  assert.equal((printed.match(/<th(?:\s|>)/g)||[]).length,8);                   // título + as 7 colunas (sem NF/Boleto)
  assert.ok(printed.includes('Período: 01/09/2026 a 15/09/2026'));
  assert.ok(printed.includes('<td class="num">612</td>'));                       // 500 + 70 + 30 + 12 (inclui PAGO)
  assert.ok(printed.includes('.carrier-data tr.res-sub td{background:#1f1f1f !important;color:#fff !important'));
  assert.ok(printed.includes('html,body{background:#fff !important}'));
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
    for(const x of ['id="r-xls"','id="r-csv"','id="r-clear"','data-col="status"','data-col="transp"','data-col="destino"','data-col="media"']) assert.ok(page.includes(x),x);
    assert.ok(js.includes('FILTERS') && js.includes('rotasSetRows') && js.includes('valOf'));
    const filterLogic=js.slice(js.indexOf('let ROWS ='),js.indexOf('function render(){'));
    const dlCsvCode=js.slice(js.indexOf('function dlCsv(){'),js.indexOf("document.getElementById('r-xls')"));
    let csvBlob=null;
    const fc=context({
      document:{querySelector:()=>null,createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},
      Blob:function(parts,opts){csvBlob={text:parts.join(''),opts};},
      URL:{createObjectURL:()=>'blob:test',revokeObjectURL(){}},
      setTimeout:()=>{}
    });
    vm.runInContext(filterLogic+'\n'+dlCsvCode,fc);
    vm.runInContext("ROWS=[{id:'a',d:'2026-09-21',entrega:'2026-09-22',status:'pendente',sec:'capital',ordem:'10',placa:'AAA1',destino:'GOIANIA',motorista:'M1',transp:'T1',km:40,peso:10,total:80.04,media:8.004},{id:'b',d:'2026-09-22',entrega:'2026-09-23',status:'concluida',sec:'interior',ordem:'20',placa:'BBB2',destino:'JATAI',motorista:'M2',transp:'T2',km:10,peso:5,total:40.05,media:8.01}]; FILTERS.media=new Set(['R$ 8,00/kg']);",fc);
    const filtRows=vm.runInContext('filtered()',fc);
    assert.equal(filtRows.length,1);                                           // filtro usa o mesmo arredondamento da coluna
    assert.equal(filtRows[0].id,'a');
    vm.runInContext('dlCsv()',fc);
    assert.ok(csvBlob && csvBlob.text.includes('"10"') && !csvBlob.text.includes('"20"') && csvBlob.text.includes('"8.00"')); // CSV filtrado
    assert.ok(c.rotasAbertasDownload(Array.from(filtRows))===true);
    assert.equal(captured.wb.S[0][1].aoa.length,2);                            // Excel filtrado (cabeçalho + 1 linha)
    assert.ok(c.rotasAbertasDownload(rows)===true);
    assert.ok(captured && captured.n.startsWith('rotas-abertas-') && captured.n.endsWith('.xlsx'));
    const aoa=captured.wb.S[0][1].aoa;
    assert.equal(aoa.length,3);                                    // cabeçalho + 2 linhas
    assert.equal(aoa[0][0],'Status'); assert.equal(aoa[0][12],'Média (R$/kg)');
    assert.equal(aoa[1][0],'Pendente'); assert.equal(aoa[1][3],'Capital'); assert.equal(aoa[1][9],40); assert.equal(aoa[1][11],80); assert.equal(aoa[1][12],8);
    assert.equal(aoa[2][0],'Concluída'); assert.equal(aoa[2][3],'Interior');
  });
});
test('cadastro de ajudantes e tripulação de Frotas: edição manual, sincronização e preservação no mapa',()=>{
  const tripWrap={innerHTML:''};
  const c=context({
    DEFAULT_FROTA_TRIPULACAO:{MFM8075:{motorista:'ALEX LOPES DA SILVA',ajudante:'ISRAEL',ajudante2:''}},
    FROTA_TRIPULACAO:{MFM8075:{motorista:'ALEX LOPES DA SILVA',ajudante:'ISRAEL',ajudante2:''}},
    DATA:{frotas:[{id:'f1',placa:'MFM8075',motorista:'ALEX LOPES DA SILVA',ajudantes:'ISRAEL',ajudante2:''}]},
    normPlaca:p=>String(p||'').toUpperCase().replace(/[^A-Z0-9]/g,''),
    plateSegs:p=>String(p||'').split('/').map(x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'')).filter(Boolean),
    clampMotorista:s=>String(s||'').slice(0,32),
    $:sel=>sel==='#trip-rows'?tripWrap:null,
    esc:s=>String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
  });
  vm.runInContext(block('function frotaTripulacaoOf(', 'function applyRegistry('),c);
  vm.runInContext(block('function renderFrotaTripulacao(){', 'function renderRotas(){'),c);
  // Edição manual do cadastro de ajudante atualiza a linha aberta em Frotas
  const prev=Object.assign({},c.FROTA_TRIPULACAO.MFM8075);
  c.FROTA_TRIPULACAO.MFM8075.ajudante='CARLOS';
  c.FROTA_TRIPULACAO.MFM8075.ajudante2='LUCAS';
  c.syncFrotaTripulacaoToMap('MFM8075',prev);
  assert.equal(c.DATA.frotas[0].ajudantes,'CARLOS');
  assert.equal(c.DATA.frotas[0].ajudante2,'LUCAS');
  // Nova linha de Frotas recebe os ajudantes editados do cadastro
  const nova={placa:'MFM8075',motorista:'',ajudantes:'',ajudante2:''};
  c.applyFrotaTripulacao(nova);
  assert.equal(nova.ajudantes,'CARLOS');
  assert.equal(nova.ajudante2,'LUCAS');
  // Edição manual na linha do dia (_ajudManual) não é sobrescrita ao recarregar o dia
  const manual={placa:'MFM8075',motorista:'ALEX LOPES DA SILVA',ajudantes:'',ajudante2:'',_ajudManual:true};
  c.applyFrotaTripulacao(manual);
  assert.equal(manual.ajudantes,'');
  c.renderFrotaTripulacao();
  assert.ok(tripWrap.innerHTML.includes('data-trip="ajudante"') && tripWrap.innerHTML.includes('value="CARLOS"') && tripWrap.innerHTML.includes('value="LUCAS"'));
});
test('regressões: resumo por quinzena e impressão isolada permanecem',()=>{
  for(const x of ['id="fh-resumo"','function fechRefOptions','function renderFechHist','A4 portrait','2026-10-06a','id="kp-f-sit"','function kpGroupRows','function kpKmJump','function kpSituation','@page{size:A4 landscape;margin:10mm}','tbody class="grp"','function printResumoRowsHtml','td{white-space:nowrap}','id="btn-rotas-window"','function rotasWinHtml','function rotasAbertasCollectRows','id="sec-frota-trip"','function renderFrotaTripulacao','function syncFrotaTripulacaoToMap']) assert.ok(html.includes(x),x);
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

test('fechamentos anteriores: referências numéricas, labels/legados e fechamentos múltiplos são agrupados e somados',()=>{
  const nodes={};
  const relEl=id=>nodes[id]||(nodes[id]={value:''});
  const c=context({FECHAMENTOS:[],FECH_STORAGE_PREFIX:'fechamento:',FECH_LOCAL_PENDING:[],FECH_TOMBSTONES:new Set(),
    FECH_RECOVERY_PROMISE:null,FECH_CONFIRM_BUSY:false,norm:s=>String(s==null?'':s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(),
    normKw:s=>String(s==null?'':s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\./g,' ').replace(/\s+/g,' ').trim(),
    numVal:x=>Number(x)||0,relEl});
  vm.runInContext(block('const MESES_NOME =','function closeFechRef()'),c);
  vm.runInContext(block('function fhVistos(){','function renderFechHist(){'),c);
  const make=(id,ref,start,apagar)=>({id,ref,start,end:start,dataFech:'2026-10-02',grupos:[{transp:'T',peso:100,apagar,cargas:[{d:start,sec:'capital',id:'c-'+id,peso:100,total:apagar}]}]});
  c.FECHAMENTOS=[
    make('q1',{ano:2026,mes:9,quinzena:1},'2026-09-10',100),
    make('q2-a',{ano:2026,label:'Setembro — Quinzena 2'},'2026-09-20',200),
    make('q2-b',null,'2026-09-25',300)
  ];
  const groups=c.fhVistos();
  assert.deepEqual(Array.from(groups.map(g=>g.key)),['2026-09-Q1','2026-09-Q2']);
  assert.equal(groups[0].list.length,1); assert.equal(groups[0].cargas,1); assert.equal(groups[0].valor,100);
  assert.equal(groups[1].list.length,2); assert.equal(groups[1].cargas,2); assert.equal(groups[1].valor,500);
  assert.equal(c.fechRefOf(c.FECHAMENTOS[2]).quinzena,2); // start vem antes de dataFech
  assert.equal(c.fechRefOf({dataFech:'2026-10-02',grupos:[{cargas:[{d:'2026-09-21'}]}]}).mes,9); // sem start, usa carga antes da data de confirmação
  relEl('fh-ano').value='2026'; relEl('fh-mes').value='9';
  assert.deepEqual(Array.from(c.fhVistos().map(g=>g.key)),['2026-09-Q1','2026-09-Q2']);
  relEl('fh-mes').value='8'; assert.equal(c.fhVistos().length,0);
});

test('fechamentos: carrega snapshot legado, captura cache local antes da sobrescrita remota e migra sem perder referências',async()=>{
  const saved=[]; const records=new Map();
  const q1={id:'q1',ref:{ano:2026,mes:9,quinzena:1},start:'2026-09-01',grupos:[]};
  const q2={id:'q2',ref:{ano:2026,mes:9,quinzena:2},start:'2026-09-16',grupos:[]};
  const c=context({FECHAMENTOS:[],FECH_STORAGE_PREFIX:'fechamento:',FECH_LOCAL_PENDING:[],FECH_TOMBSTONES:new Set(),FECH_RECOVERY_PROMISE:null,
    norm:s=>String(s==null?'':s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(),
    Stor:{list:async()=>Array.from(records.keys()),get:async k=>records.get(k)||null,set:async(k,v)=>{saved.push(k);records.set(k,v);},del:async()=>{}}});
  vm.runInContext(block('const MESES_NOME =','function closeFechRef()'),c);
  const got=await c.fechLoadAll({remoteFound:true,remoteValue:[q1],localFound:true,localValue:[q1,q2]});
  assert.deepEqual(Array.from(got.map(f=>f.id)),['q1']); // local-only snapshot aguarda confirmação no mapa
  assert.deepEqual(Array.from(c.FECH_LOCAL_PENDING.map(f=>f.id)),['q2']);
  assert.ok(saved.includes('fechamento:q1')); // cópia idempotente do legado
  assert.equal(records.get('fechamento:q1').ref.quinzena,1);
});

function makeFechAuditContext(mapRecord, localCandidate){
  const saved=new Map(), maps={'map:2026-09-21':mapRecord};
  const q1={id:'q1',ref:{ano:2026,mes:9,quinzena:1},start:'2026-09-01',end:'2026-09-15',grupos:[]};
  const q2=localCandidate||null;
  const keys=()=>[...Object.keys(maps),...saved.keys()];
  const Stor={list:async()=>keys(),get:async k=>k.startsWith('map:')?maps[k]:(saved.get(k)||null),
    getPair:async k=>k.startsWith('map:')
      ? {remoteFound:false,remoteValue:null,localFound:Object.prototype.hasOwnProperty.call(maps,k),localValue:maps[k]||null}
      : {remoteFound:false,remoteValue:null,localFound:saved.has(k),localValue:saved.get(k)||null},
    set:async(k,v)=>{if(k.startsWith('map:'))maps[k]=v;else saved.set(k,v);},del:async k=>{saved.delete(k);}};
  const nodes={};const relEl=id=>nodes[id]||(nodes[id]={value:''});
  const c=context({FECHAMENTOS:[],FECH_STORAGE_PREFIX:'fechamento:',FECH_LOCAL_PENDING:[],FECH_TOMBSTONES:new Set(),FECH_RECOVERY_PROMISE:null,FECH_RECOVERY_SCANNED:false,
    currentMapDate:'',DATA:{},SECTIONS:['frotas','capital','interior'],TRANSP_CODES:{},AUDIT:[{action:'fechamento-criado',ts:Date.UTC(2026,9,2,12),detail:'f-q2 · Setembro — Quinzena 2 · 21/09/2026 a 30/09/2026 · 1 transportadora(s)'}],
    norm:s=>String(s==null?'':s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(),
    normKw:s=>String(s==null?'':s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\./g,' ').replace(/\s+/g,' ').trim(),
    numVal:x=>Number(x)||0,calcularFrete:()=>({total:120,frota:'HR'}),relCalc:(sec,row,d)=>({dataFinal:d}),
    snapshotMap:()=>({data:c.DATA}),fmtBR:d=>String(d),fmtPeso2:n=>String(n),fmtBRL:n=>'R$ '+n,
    Stor,relEl,window:{__fechAudit:{}}});
  vm.runInContext(block('const MESES_NOME =','function closeFechRef()'),c);
  vm.runInContext(block('function fhVistos(){','function renderFechHist(){'),c);
  c._maps=maps;c._saved=saved;c._q1=q1;c._q2=q2;
  return c;
}

test('fechamentos: recupera fechamento órfão do mapa e usa referência do log de auditoria',async()=>{
  const row={id:'r-q2',stFech:'fechado',fechId:'f-q2',fechDt:'2026-10-02',transportadora:'T1',carga:'123',peso:100,km:12};
  const rec={savedAt:'2026-10-02T12:00:00.000Z',data:{frotas:[],capital:[row],interior:[]}};
  const c=makeFechAuditContext(rec,null);
  await c.fechLoadAll({remoteFound:true,remoteValue:[c._q1],localFound:true,localValue:[c._q1]});
  const recovered=await c.fechRecoverFromMaps();
  assert.equal(recovered,1);
  assert.equal(await c.fechRecoverFromMaps(),0); // guarda evita varrer todos os mapas em cada reabertura
  const f=c.FECHAMENTOS.find(x=>x.id==='f-q2');
  assert.ok(f);assert.equal(f.ref.ano,2026);assert.equal(f.ref.mes,9);assert.equal(f.ref.quinzena,2);
  assert.equal(f.recuperado,true);assert.equal(f.grupos[0].cargas.length,1);
  assert.ok(c._saved.has('fechamento:f-q2'));
  assert.equal(c._maps['map:2026-09-21'].data.capital[0].fechRef.quinzena,2);
  const groups=c.fhVistos();assert.ok(groups.some(g=>g.key==='2026-09-Q2'));
});

test('fechamentos: confirma candidato local somente quando as cargas seguem fechadas no mapa',async()=>{
  const row={id:'r-local-q2',stFech:'fechado',fechId:'f-local-q2',fechDt:'2026-10-02',transportadora:'T1',carga:'124',peso:100,km:12};
  const rec={savedAt:'2026-10-02T12:00:00.000Z',data:{frotas:[],capital:[row],interior:[]}};
  const q2={id:'f-local-q2',ref:{ano:2026,mes:9,quinzena:2},start:'2026-09-16',end:'2026-09-30',grupos:[{transp:'T1',key:'T1',abatimento:0,apagar:150,faturado:150,peso:100,cargas:[{d:'2026-09-21',sec:'capital',id:'r-local-q2',peso:100,total:150}]}]};
  const c=makeFechAuditContext(rec,q2);
  await c.fechLoadAll({remoteFound:true,remoteValue:[c._q1],localFound:true,localValue:[c._q1,q2]});
  assert.deepEqual(Array.from(c.FECH_LOCAL_PENDING.map(f=>f.id)),['f-local-q2']);
  await c.fechRecoverFromMaps();
  const matches=c.FECHAMENTOS.filter(f=>f.id==='f-local-q2');
  assert.equal(matches.length,1);assert.equal(matches[0].ref.quinzena,2);
  assert.equal(matches[0].grupos[0].cargas[0].total,150); // mantém o retrato local, sem recalcular
});

test('Stor.getPair: cache local é capturado antes de espelhar snapshot remoto; list une chaves remotas e locais',async()=>{
  const q1={id:'q1'},q2={id:'q2'};
  const localStorage={
    'mapa:fechamentos':JSON.stringify([q1,q2]),
    'mapa:fechamento:q-local':JSON.stringify({id:'q-local'}),
    getItem(k){return Object.prototype.hasOwnProperty.call(this,k)?this[k]:null;},
    setItem(k,v){this[k]=String(v);},removeItem(k){delete this[k];}
  };
  const c=context({SUPA_REST:'https://mock.invalid/rest/v1/app_kv',supaHeaders:()=>({}),localStorage,
    fetch:async url=>{
      const u=new URL(url);
      if(u.searchParams.get('select')==='value')return {ok:true,json:async()=>[{value:[q1]}]};
      if(u.searchParams.get('select')==='key')return {ok:true,json:async()=>[{key:'fechamentos'},{key:'fechamento:q1'}]};
      throw new Error('consulta inesperada');
    }});
  vm.runInContext(block('const Stor = {','/* ================= Placas fixas / classificação'),c);
  const pair=await vm.runInContext('Stor.getPair("fechamentos")',c);
  assert.equal(pair.remoteFound,true);assert.deepEqual(Array.from(pair.remoteValue.map(x=>x.id)),['q1']);
  assert.deepEqual(Array.from(pair.localValue.map(x=>x.id)),['q1','q2']);
  assert.deepEqual(JSON.parse(localStorage['mapa:fechamentos']).map(x=>x.id),['q1']); // local havia sido espelhado, mas o par preservou o candidato
  const keys=await vm.runInContext('Stor.list()',c);
  assert.ok(keys.includes('fechamentos')&&keys.includes('fechamento:q1')&&keys.includes('fechamento:q-local'));
});

test('fechamentos: reconciliação adiciona cargas fechadas ausentes de um snapshot já existente',async()=>{
  const row1={id:'r1',stFech:'fechado',fechId:'f-existing',fechDt:'2026-10-02',transportadora:'T1',carga:'1',peso:100,km:10};
  const row2={id:'r2',stFech:'fechado',fechId:'f-existing',fechDt:'2026-10-02',transportadora:'T1',carga:'2',peso:200,km:20};
  const rec={savedAt:'2026-10-02T12:00:00.000Z',data:{frotas:[],capital:[row1,row2],interior:[]}};
  const c=makeFechAuditContext(rec,null);
  const f={id:'f-existing',ref:{ano:2026,mes:9,quinzena:2},start:'2026-09-16',end:'2026-09-30',
    grupos:[{transp:'T1',key:'T1',abatimento:0,apagar:100,faturado:100,peso:100,cargas:[{d:'2026-09-21',sec:'capital',id:'r1',peso:100,total:100}]}]};
  c._q1=f;
  await c.fechLoadAll({remoteFound:true,remoteValue:[f],localFound:true,localValue:[f]});
  const fixed=await c.fechRecoverFromMaps();
  assert.equal(fixed,1);
  const loaded=c.FECHAMENTOS.find(x=>x.id==='f-existing');
  assert.equal(loaded.grupos[0].cargas.length,2);
  assert.equal(loaded.grupos[0].faturado,220);
  assert.equal(loaded.ref.quinzena,2); // referência explícita válida permanece intacta
});

test('loadAudit: une eventos locais ainda não sincronizados com o log remoto',async()=>{
  const remote=[{ts:1,action:'antigo',detail:'A',user:'u'}];
  const local=[{ts:1,action:'antigo',detail:'A',user:'u'},{ts:2,action:'fechamento-criado',detail:'f-q2 · Setembro — Quinzena 2',user:'u'}];
  const c=context({AUDIT:[],Stor:{getPair:async()=>({remoteFound:true,remoteValue:remote,localFound:true,localValue:local})}});
  vm.runInContext(block('async function loadAudit(){','function audit('),c);
  await c.loadAudit();
  assert.equal(c.AUDIT.length,2);
  assert.equal(c.AUDIT[1].action,'fechamento-criado');
});

test('fechamentos: reabrir último lote limpa metadados da carga e grava tombstone individual',async()=>{
  const row={id:'r-reopen',stFech:'fechado',fechId:'f-reopen',fechDt:'2026-10-02',fechRef:{ano:2026,mes:9,quinzena:2}};
  const map={data:{frotas:[],capital:[row],interior:[]}};
  const f={id:'f-reopen',grupos:[{transp:'T1',abatimento:0,peso:100,faturado:100,apagar:100,cargas:[{d:'2026-09-21',sec:'capital',id:'r-reopen',peso:100,total:100}]}]};
  const writes=[];
  const c=context({FECHAMENTOS:[f],FECH_TOMBSTONES:new Set(),FECH_STORAGE_PREFIX:'fechamento:',fechRecordKey:id=>'fechamento:'+id,REL:{recs:{'2026-09-21':map},loaded:false,mapDirty:false},
    currentMapDate:'',requireOperational:()=>true,relPersistDate:async()=>{},numVal:x=>Number(x)||0,Stor:{get:async()=>null,set:async(k,v)=>writes.push([k,v])},
    audit:()=>{},renderFechHist:()=>{},relApplyFilters:()=>{},renderRelTable:()=>{},renderAll:()=>{},toast:()=>{}});
  vm.runInContext(block('async function fechReopenSel(id, st, keys){','/* ---- cadastro de códigos'),c);
  await c.fechReopenSel('f-reopen','pendente',new Set(['2026-09-21|capital|r-reopen']));
  assert.equal(c.FECHAMENTOS.length,0);
  assert.equal(c.FECH_TOMBSTONES.has('f-reopen'),true);
  assert.equal('stFech' in row,false);assert.equal('fechId' in row,false);assert.equal('fechDt' in row,false);assert.equal('fechRef' in row,false);
  assert.equal(writes[0][0],'fechamento:f-reopen');
  assert.equal(writes[0][1].id,'f-reopen');assert.equal(writes[0][1].deleted,true);
});

test('fechamentos legados sem ID: separa metadados de Q1/Q2 e restaura ambas as referências',async()=>{
  const row1={id:'legacy-q1',stFech:'fechado',fechDt:'2026-10-02',fechRef:{ano:2026,mes:9,quinzena:1},transportadora:'T1',carga:'1',peso:100};
  const row2={id:'legacy-q2',stFech:'fechado',fechDt:'2026-10-02',fechRef:{ano:2026,mes:9,quinzena:2},transportadora:'T1',carga:'2',peso:200};
  const rec={savedAt:'2026-10-02T12:00:00.000Z',data:{frotas:[],capital:[row1,row2],interior:[]}};
  const c=makeFechAuditContext(rec,null);
  await c.fechLoadAll({remoteFound:false,localFound:false});
  const count=await c.fechRecoverFromMaps();
  assert.equal(count,2);
  assert.deepEqual(Array.from(c.FECHAMENTOS.map(f=>f.ref.quinzena).sort()),[1,2]);
  assert.notEqual(row1.fechId,row2.fechId);
  assert.ok(c.fhVistos().some(g=>g.key==='2026-09-Q1'));
  assert.ok(c.fhVistos().some(g=>g.key==='2026-09-Q2'));
});

test('fechamentos: confirmação grava registro individual com ref na carga e não substitui array legado',async()=>{
  const writes=[];const row={id:'new-load',stFech:'pendente'};
  const item={d:'2026-09-21',sec:'capital',row,calc:{peso:100,total:250,km:10,media:2.5,dataFinal:'2026-09-21'}};
  const group={nome:'T1',key:'T1'};
  const selected={g:group,s:{abat:0,nf:'Não',boleto:'Não',codigo:''},itens:[item],fat:250,peso:100};
  const c=context({FECH_CONFIRM_BUSY:false,FECHAMENTOS:[],FECH_STORAGE_PREFIX:'fechamento:',REL:{start:'2026-09-16',end:'2026-09-30'},
    SESSION:{name:'Teste'},TRANSP_CODES:{},requireOperational:()=>true,fechGroups:()=>[group],fechGroupSel:()=>selected,
    fechRefAsk:async()=>({ano:2026,mes:9,quinzena:2,label:'Setembro/2026 — Quinzena 2'}),
    fechTipoFrota:()=> 'HR',fechPeriodoTxt:()=> '16/09/2026 a 30/09/2026',hojeIso:()=> '2026-10-02',
    numVal:x=>Number(x)||0,fmtBRL:x=>'R$ '+x,refreshSessionToken:async()=>true,relPersistDate:async()=>{},
    fechRecordKey:id=>'fechamento:'+id,Stor:{set:async(k,v)=>writes.push([k,v]),del:async()=>{}},
    relEl:id=>id==='fech-ok'?{disabled:false}:null,relApplyFilters:()=>{},renderRelTable:()=>{},renderFechTable:()=>{},
    renderFechHist:()=>{},closeFech:()=>{},audit:()=>{},toast:()=>{}});
  vm.runInContext(block('async function fechConfirm(){','/* ---- Excel: resumo do financeiro ---- */'),c);
  await c.fechConfirm();
  assert.equal(c.FECHAMENTOS.length,1);
  assert.equal(row.stFech,'fechado');assert.equal(row.fechRef.quinzena,2);
  assert.equal(writes.length,1);assert.ok(writes[0][0].startsWith('fechamento:f'));
  assert.equal(writes[0][1].ref.quinzena,2);assert.equal(writes[0][1].grupos[0].cargas[0].total,250);
  assert.equal(writes.some(([k])=>k==='fechamentos'),false);
  assert.equal(c.FECH_CONFIRM_BUSY,false);
});

test('fechamentos: per-record no localStorage é validado após snapshot remoto mais novo',async()=>{
  const row={id:'r-per-record',stFech:'fechado',fechId:'f-per-record',fechDt:'2026-10-02',fechRef:{ano:2026,mes:9,quinzena:2},transportadora:'T1',carga:'9',peso:100,km:12};
  const rec={savedAt:'2026-10-02T12:00:00.000Z',data:{frotas:[],capital:[row],interior:[]}};
  const c=makeFechAuditContext(rec,null);
  const localQ2={id:'f-per-record',ref:{ano:2026,mes:9,quinzena:2},start:'2026-09-16',end:'2026-09-30',
    grupos:[{transp:'T1',key:'T1',abatimento:0,apagar:175,faturado:175,peso:100,cargas:[{d:'2026-09-21',sec:'capital',id:'r-per-record',peso:100,total:175}]}]};
  await c.fechLoadAll({remoteFound:false,localFound:true,localValue:[c._q1,localQ2]}); // leitura offline e migração p/ chave individual local
  assert.ok(c._saved.has('fechamento:f-per-record'));
  await c.fechLoadAll({remoteFound:true,remoteValue:[c._q1],localFound:true,localValue:[c._q1]}); // remoto antigo espelha o array, não o registro individual
  assert.deepEqual(Array.from(c.FECH_LOCAL_PENDING.map(f=>f.id)),['f-per-record']);
  await c.fechRecoverFromMaps();
  const recovered=c.FECHAMENTOS.find(f=>f.id==='f-per-record');
  assert.ok(recovered);assert.equal(recovered.grupos[0].cargas[0].total,175);
  await c.fechLoadAll({remoteFound:true,remoteValue:[c._q1],localFound:true,localValue:[c._q1]});
  assert.deepEqual(Array.from(c.FECH_LOCAL_PENDING.map(f=>f.id)),['f-per-record']);
  await c.fechRecoverFromMaps(); // vuelve a conciliar candidato local aun después del primer escaneo
  assert.ok(c.FECHAMENTOS.some(f=>f.id==='f-per-record'));
});

test('fechamentos: tombstone local de reabertura vence snapshot remoto antigo e permanece no cache',async()=>{
  const f={id:'f-reopened',ref:{ano:2026,mes:9,quinzena:2},grupos:[]};
  const tombstone={id:'f-reopened',deleted:true,deletedAt:'2026-10-02T12:00:00.000Z'};
  const writes=[];
  const c=context({FECHAMENTOS:[],FECH_STORAGE_PREFIX:'fechamento:',FECH_LOCAL_PENDING:[],FECH_TOMBSTONES:new Set(),
    Stor:{list:async()=>['fechamento:f-reopened'],getPair:async()=>({remoteFound:true,remoteValue:f,localFound:true,localValue:tombstone}),
      set:async(k,v)=>writes.push([k,v])},norm:s=>String(s||'').toUpperCase()});
  vm.runInContext(block('const MESES_NOME =','function closeFechRef()'),c);
  await c.fechLoadAll({remoteFound:true,remoteValue:[f],localFound:true,localValue:[f]});
  assert.equal(c.FECHAMENTOS.length,0);assert.equal(c.FECH_TOMBSTONES.has('f-reopened'),true);
  assert.equal(writes.length,1);assert.equal(writes[0][1].deleted,true);
});

test('fechamentos: atualização local mais nova de reabertura supera o registro remoto antigo',async()=>{
  const old={id:'f-partial',criadoEm:'2026-10-02T10:00:00.000Z',ref:{ano:2026,mes:9,quinzena:2},
    grupos:[{transp:'T1',cargas:[{id:'a'},{id:'b'}]}]};
  const updated={id:'f-partial',criadoEm:old.criadoEm,atualizadoEm:'2026-10-02T11:00:00.000Z',ref:old.ref,
    grupos:[{transp:'T1',cargas:[{id:'b'}]}]};
  const writes=[];
  const c=context({FECHAMENTOS:[],FECH_STORAGE_PREFIX:'fechamento:',FECH_LOCAL_PENDING:[],FECH_TOMBSTONES:new Set(),
    Stor:{list:async()=>['fechamento:f-partial'],getPair:async()=>({remoteFound:true,remoteValue:old,localFound:true,localValue:updated}),set:async(k,v)=>writes.push([k,v])},
    norm:s=>String(s||'').toUpperCase()});
  vm.runInContext(block('const MESES_NOME =','function closeFechRef()'),c);
  await c.fechLoadAll({remoteFound:true,remoteValue:[old],localFound:true,localValue:[old]});
  assert.equal(c.FECHAMENTOS[0].grupos[0].cargas.length,1);
  assert.equal(c.FECHAMENTOS[0].grupos[0].cargas[0].id,'b');
  assert.equal(writes[0][0],'fechamento:f-partial');assert.equal(writes[0][1].atualizadoEm,updated.atualizadoEm);
});

test('fechamentos legados: referência do log de auditoria prevalece sobre start incorreto',()=>{
  const audit=[{action:'fechamento-criado',ts:Date.UTC(2026,9,2,12),detail:'f-legacy · Setembro — Quinzena 2'}];
  const c=context({FECHAMENTOS:[],FECH_STORAGE_PREFIX:'fechamento:',FECH_LOCAL_PENDING:[],AUDIT:audit,
    norm:s=>String(s==null?'':s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()});
  vm.runInContext(block('const MESES_NOME =','function closeFechRef()'),c);
  const f={id:'f-legacy',start:'2026-09-01',end:'2026-09-15',dataFech:'2026-10-02',grupos:[]};
  assert.equal(c.fechRefOf(f).ano,2026);assert.equal(c.fechRefOf(f).mes,9);assert.equal(c.fechRefOf(f).quinzena,2);
});

test('fechamentos: mapa local mais novo é reconciliado antes do espelhamento remoto',async()=>{
  const localRow={id:'r-map-local',stFech:'fechado',fechId:'f-map-local',fechDt:'2026-10-02',fechRef:{ano:2026,mes:9,quinzena:2},transportadora:'T1',peso:100};
  const remoteMap={savedAt:'2026-10-02T10:00:00.000Z',data:{frotas:[],capital:[{id:'r-map-local',stFech:'pendente'}],interior:[]}};
  const localMap={savedAt:'2026-10-02T11:00:00.000Z',data:{frotas:[],capital:[localRow],interior:[]}};
  const c=makeFechAuditContext(remoteMap,null);
  c._maps['map:2026-09-21']=localMap;c._remoteMap=remoteMap;
  vm.runInContext("Stor.getPair=async k=>k.startsWith('map:')?{remoteFound:true,remoteValue:_remoteMap,localFound:true,localValue:_maps[k]}:{remoteFound:false,remoteValue:null,localFound:false,localValue:null};",c);
  await c.fechLoadAll({remoteFound:true,remoteValue:[c._q1],localFound:true,localValue:[c._q1]});
  await c.fechRecoverFromMaps();
  const recovered=c.FECHAMENTOS.find(f=>f.id==='f-map-local');
  assert.ok(recovered);assert.equal(recovered.ref.quinzena,2);
  assert.equal(c._maps['map:2026-09-21'].data.capital[0].stFech,'fechado');
});
