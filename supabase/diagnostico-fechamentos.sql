-- =====================================================================
--  AUDITORIA — Fechamento de frete (quinzenal)
--  Projeto: vvnpkraipzytrshaaruo
--  Execute no SQL Editor. Seções 1–4, 6 e 7 são SOMENTE LEITURA.
--  A seção 5 CRIA a view public.vw_fechamentos_quinzena (diagnóstico:
--  reproduz em SQL a regra corrigida do app). Não altera dados.
-- =====================================================================
--  O app NÃO usa uma tabela "fechamentos_frete": os fechamentos quinzenais
--  ficam em public.app_kv, na chave 'fechamentos', como um ARRAY JSON:
--    [ { id, criadoEm, dataFech, por,
--        ref: {ano, mes, quinzena},   <- referência escolhida no fechamento
--        start, end,                  <- período fechado (datas de entrega)
--        grupos: [ { transp, codigo, abatimento, peso, faturado, apagar,
--                    cargas: [ {d, sec, id, placa, destino, ordem, peso, total...} ] } ] } ]
--
--  A grade "Fechamentos anteriores" é montada no FRONTEND (ARENA.html:
--  fechRefOf -> fhVistos -> renderFechHist) a partir desse array. A view
--  vw_fechamentos_quinzena (seção 5) reproduz a MESMA regra corrigida, para
--  diagnóstico/auditoria direto no banco.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Onde os fechamentos estão e quantos são
-- ---------------------------------------------------------------------
select key,
       jsonb_typeof(value::jsonb)                          as tipo,
       case when jsonb_typeof(value::jsonb) = 'array'
            then jsonb_array_length(value::jsonb) end      as qtd_fechamentos,
       pg_size_pretty(length(value::text))                 as tamanho
from public.app_kv
where key = 'fechamentos';

-- ---------------------------------------------------------------------
-- 2) Um linha por fechamento: referência GRAVADA x período fechado
--    (ordem cronológica pelo início do período)
-- ---------------------------------------------------------------------
select f->>'id'                                                        as fech_id,
       f->>'start'                                                     as inicio,
       f->>'end'                                                       as fim,
       f->>'dataFech'                                                  as data_fechamento,
       (f->'ref'->>'ano')::int                                         as ref_ano,
       (f->'ref'->>'mes')::int                                         as ref_mes,
       (f->'ref'->>'quinzena')::int                                    as ref_quinzena,
       (f->'ref' ? 'ano')                                              as tem_ref,
       jsonb_array_length(f->'grupos')                                 as grupos,
       (select count(*)::int
          from jsonb_array_elements(f->'grupos') g,
               jsonb_array_elements(g->'cargas') c)                    as cargas,
       (select coalesce(sum((c->>'total')::numeric), 0)
          from jsonb_array_elements(f->'grupos') g,
               jsonb_array_elements(g->'cargas') c)                    as valor_faturado
from public.app_kv k
cross join lateral jsonb_array_elements(k.value::jsonb) as f
where k.key = 'fechamentos'
order by (f->>'start') nulls last, (f->>'id');

-- ---------------------------------------------------------------------
-- 3) EXISTE fechamento com ano = 2026, mes = 9 (Setembro), quinzena = 2 ?
--    (a pergunta central da auditoria — rode antes e depois da correção)
-- ---------------------------------------------------------------------
select (f->'ref'->>'ano')::int      as ano,
       (f->'ref'->>'mes')::int      as mes,
       (f->'ref'->>'quinzena')::int as quinzena,
       count(*)                     as fechamentos,
       string_agg(f->>'id', ', ')   as ids
from public.app_kv k
cross join lateral jsonb_array_elements(k.value::jsonb) as f
where k.key = 'fechamentos'
group by 1, 2, 3
order by 1, 2, 3;

-- Quantos fechamentos existem SEM referência gravada (legados)?
-- (esses são os que o frontend precisa classificar pelo período)
select count(*) as sem_ref
from public.app_kv k
cross join lateral jsonb_array_elements(k.value::jsonb) as f
where k.key = 'fechamentos'
  and not (f->'ref' ? 'ano');

-- ---------------------------------------------------------------------
-- 4) Os fechamentos que CRUZAM para setembro (período termina em setembro)
--    — são exatamente os que apareciam errados em "Agosto — Quinzena 2"
-- ---------------------------------------------------------------------
select f->>'id'                        as fech_id,
       f->>'start'                     as inicio,
       f->>'end'                       as fim,
       (f->'end')::date - (f->>'start')::date + 1                 as dias_total,
       ((f->'end')::date - date_trunc('month', (f->'end')::date)::date + 1) as dias_no_mes_do_fim,
       (f->'ref'->>'ano')::int         as ref_ano,
       (f->'ref'->>'mes')::int         as ref_mes,
       (f->'ref'->>'quinzena')::int    as ref_quinzena
from public.app_kv k
cross join lateral jsonb_array_elements(k.value::jsonb) as f
where k.key = 'fechamentos'
  and (f->>'end') ~ '^\d{4}-\d{2}-\d{2}$'
  and to_char((f->>'end')::date, 'YYYY-MM') <> to_char((f->>'start')::date, 'YYYY-MM')
order by (f->>'start');

-- ---------------------------------------------------------------------
-- 5) Regra corrigida em SQL: view com a quinzena PREDOMINANTE
--    (mês com mais dias; se o fim do período está nesse mês, vale a
--     quinzena do fim — mesma regra do fechRefPredominante() do app)
-- ---------------------------------------------------------------------
create or replace view public.vw_fechamentos_quinzena as
with base as (
  select f->>'id'                                          as fech_id,
         (f->>'start')::date                               as inicio,
         case when f->>'end' ~ '^\d{4}-\d{2}-\d{2}$'
                   and (f->>'end')::date >= (f->>'start')::date
              then (f->>'end')::date
              else (f->>'start')::date end                 as fim,
         f->'ref'                                          as ref,
         (select count(*)::int
            from jsonb_array_elements(f->'grupos') g,
                 jsonb_array_elements(g->'cargas') c)      as cargas,
         (select coalesce(sum((c->>'total')::numeric), 0)
            from jsonb_array_elements(f->'grupos') g,
                 jsonb_array_elements(g->'cargas') c)      as valor
  from public.app_kv k
  cross join lateral jsonb_array_elements(k.value::jsonb) as f
  where k.key = 'fechamentos'
    and f->>'start' ~ '^\d{4}-\d{2}-\d{2}$'
),
dia as (
  select b.*, gs::date as d
  from base b
  cross join lateral generate_series(b.inicio, b.fim, interval '1 day') as gs
),
mes_pred as (           -- mês com mais dias do período (empate: mais recente)
  select distinct on (fech_id) fech_id, am
  from (select fech_id, to_char(d, 'YYYY-MM') as am, count(*) as n
          from dia group by 1, 2) t
  order by fech_id, n desc, am desc
),
q_pred as (             -- quinzena dentro do mês predominante
  select b.fech_id, m.am,
         case
           when to_char(b.fim, 'YYYY-MM') = m.am
             then (case when extract(day from b.fim) <= 15 then 1 else 2 end)
           else (select (case when extract(day from x.d) <= 15 then 1 else 2 end)
                   from dia x
                  where x.fech_id = b.fech_id
                    and to_char(x.d, 'YYYY-MM') = m.am
                  group by 1
                  order by count(*) desc, 1 desc
                  limit 1)
         end as quinzena
  from base b
  join mes_pred m using (fech_id)
)
select b.fech_id,
       b.inicio,
       b.fim,
       b.cargas,
       b.valor,
       (b.ref->>'ano')::int                                   as ref_ano,
       (b.ref->>'mes')::int                                   as ref_mes,
       (b.ref->>'quinzena')::int                              as ref_quinzena,
       split_part(q.am, '-', 1)::int                          as pred_ano,
       split_part(q.am, '-', 2)::int                          as pred_mes,
       q.quinzena                                             as pred_quinzena,
       case when b.ref ? 'ano' then 'gravada' else 'derivada' end as origem_ref,
       case when b.ref ? 'ano'
             and ((b.ref->>'ano')::int, (b.ref->>'mes')::int, (b.ref->>'quinzena')::int)
               <> (split_part(q.am, '-', 1)::int, split_part(q.am, '-', 2)::int, q.quinzena)
            then true else false end                          as divergente
from base b
join q_pred q using (fech_id);

-- 5.1) Consistido por quinzena (o que a grade DEVE mostrar, em ordem decrescente)
select coalesce(ref_ano, pred_ano)      as ano,
       coalesce(ref_mes, pred_mes)      as mes,
       coalesce(ref_quinzena, pred_quinzena) as quinzena,
       count(*)                         as fechamentos,
       sum(cargas)                      as cargas,
       sum(valor)                       as valor
from public.vw_fechamentos_quinzena
group by 1, 2, 3
order by ano desc, mes desc, quinzena desc;

-- 5.2) Fechamentos com referência gravada DIVERGENTE do período (candidatos a ↪ Mover)
select * from public.vw_fechamentos_quinzena
where divergente
order by inicio;

-- ---------------------------------------------------------------------
-- 6) Nada escondendo os registros: RLS, policies, soft-delete e views
--    (comparável ao supabase/diagnostico.sql já versionado)
-- ---------------------------------------------------------------------
select c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('app_kv', 'vw_fechamentos_quinzena')
order by c.relname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('app_kv', 'vw_fechamentos_quinzena')
order by tablename, policyname;

-- Colunas de app_kv (não existe deleted_at/soft-delete por construção)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'app_kv'
order by ordinal_position;

-- Views/materialized views que mencionem fechamento (não devem filtrar Setembro)
select schemaname, viewname
from pg_views
where schemaname = 'public'
union all
select schemaname, matviewname
from pg_matviews
where schemaname = 'public'
order by 1, 2;

-- ---------------------------------------------------------------------
-- 7) Conferência final: os fechamentos 28/08→17/09, 30/08→18/09 e 31/08→21/09
--    devem aparecer como Setembro/2026 — Quinzena 2
-- ---------------------------------------------------------------------
select ano, mes, quinzena, fechamentos, cargas, valor
from (
  select coalesce(ref_ano, pred_ano)      as ano,
         coalesce(ref_mes, pred_mes)      as mes,
         coalesce(ref_quinzena, pred_quinzena) as quinzena,
         count(*)                         as fechamentos,
         sum(cargas)                      as cargas,
         sum(valor)                       as valor
  from public.vw_fechamentos_quinzena
  group by 1, 2, 3
) t
where (ano, mes, quinzena) = (2026, 9, 2);
