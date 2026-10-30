-- PNU HALLOWEEN NIGHT 2026 : growth hacking queries
-- Supabase SQL Editor에서 실행하세요.

-- 1. 오늘의 핵심 퍼널 (세션 기준)
select *
from public.v_funnel_conversion
where day = (now() at time zone 'Asia/Seoul')::date
order by ord;

-- 2. 일별 KPI : 방문 → 결제 → 구매전환율
select *
from public.v_daily_kpi
order by day desc;

-- 3. 버튼별 클릭 수 / 순 클릭 세션 수
select *
from public.v_button_clicks
order by day desc, clicks desc;

-- 4. 어떤 단계에서 가장 많이 이탈하는가
select
  step,
  sum(sessions)                                        as sessions,
  sum(dropoff_sessions)                                as dropoff_sessions,
  round(avg(step_conversion_pct), 2)                   as avg_step_conversion_pct
from public.v_funnel_conversion
group by step
order by min(ord);

-- 5. 세션별 실제 이동 경로 (이탈 지점 디버깅)
select
  session_id,
  started_at,
  steps,
  converted
from public.v_session_paths
order by started_at desc
limit 100;

-- 6. UTM / 유입 채널별 구매전환
with landing as (
  select
    session_id,
    coalesce(nullif(metadata->>'utm_source', ''), 'direct') as source,
    coalesce(nullif(metadata->>'utm_medium', ''), 'none')   as medium,
    coalesce(nullif(metadata->>'utm_campaign', ''), 'none') as campaign
  from public.events
  where funnel_step = 'landing_view'
),
buyers as (
  select distinct session_id
  from public.events
  where funnel_step = 'purchase_complete'
)
select
  l.source,
  l.medium,
  l.campaign,
  count(distinct l.session_id)                                        as sessions,
  count(distinct b.session_id)                                        as purchases,
  round(100.0 * count(distinct b.session_id) / nullif(count(distinct l.session_id), 0), 2) as conversion_pct
from landing l
left join buyers b on b.session_id = l.session_id
group by l.source, l.medium, l.campaign
order by sessions desc;

-- 7. 매출 / 판매량
select * from public.v_sales_daily order by day desc;

-- 8. 티켓 타입별 판매 비중
select
  ticket_type,
  count(*)              as orders,
  sum(quantity)         as tickets,
  sum(amount)           as revenue_krw,
  round(avg(amount), 0) as avg_order_value_krw
from public.registrations
where status = 'completed'
group by ticket_type
order by revenue_krw desc;

-- 9. 시간대별 방문 / 구매
select
  extract(hour from (created_at at time zone 'Asia/Seoul'))::int as hour_kst,
  count(distinct session_id) filter (where funnel_step = 'landing_view') as visits,
  count(distinct session_id) filter (where funnel_step = 'purchase_complete') as purchases
from public.events
group by 1
order by 1;

-- 10. 디바이스별 구매전환
with d as (
  select
    session_id,
    max(device) as device,
    bool_or(funnel_step = 'landing_view') as landed,
    bool_or(funnel_step = 'purchase_complete') as purchased
  from public.events
  group by session_id
)
select
  device,
  count(*) filter (where landed)     as sessions,
  count(*) filter (where purchased)  as purchases,
  round(100.0 * count(*) filter (where purchased) / nullif(count(*) filter (where landed), 0), 2) as conversion_pct
from d
group by device;
