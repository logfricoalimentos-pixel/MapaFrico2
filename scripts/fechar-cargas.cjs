#!/usr/bin/env node
// Dry-run por padrão. Nunca executado pelo site ou automaticamente no login.
const fs = require('node:fs');
const { isAlvo } = require('./lote-2026-09-21.cjs');
const FLAG = 'migra-fechamento-2026-09-21';
const PROJECT = 'https://vvnpkraipzytrshaaruo.supabase.co';
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const at = args.indexOf('--plan');
  const path = at >= 0 ? args[at + 1] : '';
  if (!path || !path.startsWith('backups/') || path.includes('..')) throw Error('Use --plan backups/lote.local.json (diretório ignorado pelo Git).');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw Error('Configure SUPABASE_SERVICE_ROLE_KEY no ambiente seguro, nunca no código/chat.');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  async function api(query, method = 'GET', body) {
    const res = await fetch(PROJECT + '/rest/v1/app_kv?' + query, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) throw Error('Supabase HTTP ' + res.status + '; operação interrompida.');
    return res.json();
  }
  const flag = await api(new URLSearchParams({key: 'eq.' + FLAG, select: 'value'}));
  if (flag.length) throw Error('Já existe registro do lote. Conferir antes de qualquer reexecução.');
  if (!apply) {
    if (fs.existsSync(path)) throw Error('Plano já existe: use outro nome para preservar o backup.');
    const updates = []; let matches = 0, alreadyClosed = 0;
    const date = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(new Date());
    const migrationId = 'mig-lote-2026-09-21-' + Date.now();
    for (let offset = 0; ; offset += 500) {
      const rows = await api(new URLSearchParams({select:'key,value', key:'like.map:*', order:'key.asc', limit:'500', offset:String(offset)}));
      for (const item of rows) {
        if (!/^map:\d{4}-\d{2}-\d{2}$/.test(item.key) || !item.value?.data) continue;
        const after = structuredClone(item.value); let count = 0;
        for (const section of ['frotas','capital','interior']) for (const row of after.data[section] || []) {
          if (!isAlvo(row.carga)) continue;
          matches++;
          if (row.stFech === 'fechado') { alreadyClosed++; continue; }
          row.stFech = 'fechado'; row.fechId = migrationId; row.fechDt = date; count++;
        }
        if (count) { after.savedAt = new Date().toISOString(); updates.push({key:item.key, before:item.value, after, count}); }
      }
      if (rows.length < 500) break;
    }
    const plan = {project:PROJECT, flag:FLAG, migrationId, date, matches, alreadyClosed, updates};
    fs.mkdirSync('backups', {recursive:true, mode:0o700});
    fs.writeFileSync(path, JSON.stringify(plan, null, 2), {flag:'wx', mode:0o600});
    console.log(`SIMULAÇÃO: ${matches} correspondências; ${alreadyClosed} já fechadas; ${updates.reduce((n,x)=>n+x.count,0)} alterações em ${updates.length} dias. Nenhuma gravação no Supabase.`);
    return;
  }
  if (process.env.CONFIRMAR_LOTE !== '2026-09-21') throw Error('Revise o plano e configure CONFIRMAR_LOTE=2026-09-21 para aplicar.');
  const plan = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (plan.project !== PROJECT || plan.flag !== FLAG || !Array.isArray(plan.updates)) throw Error('Plano inválido.');
  if (!plan.updates.length) throw Error('Plano sem alterações; nada a aplicar.');
  let done = 0;
  for (const item of plan.updates) {
    // Compare-and-swap: não sobrescreve mudanças ocorridas após a simulação.
    const query = new URLSearchParams({key:'eq.' + item.key, value:'eq.' + JSON.stringify(item.before)});
    const rows = await api(query, 'PATCH', {value:item.after});
    if (rows.length !== 1) {
      const current = await api(new URLSearchParams({key:'eq.' + item.key, select:'value'}));
      if (JSON.stringify(sortObject(current[0]?.value)) === JSON.stringify(sortObject(item.after))) { done++; continue; }
      throw Error(`Conflito após ${done} dias confirmados. Pare e revise o backup; não foi gravada flag de conclusão.`);
    }
    done++;
  }
  await api('', 'POST', {key:FLAG, value:{done:true, at:new Date().toISOString(), migId:plan.migrationId, totalDias:done, alteradas:plan.updates.reduce((n,x)=>n+x.count,0)}});
  console.log(`Concluído: ${done} dias confirmados. Preserve o plano como backup restrito.`);
}
function sortObject(x) { return Array.isArray(x) ? x.map(sortObject) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,sortObject(x[k])])) : x; }
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { main, sortObject };
