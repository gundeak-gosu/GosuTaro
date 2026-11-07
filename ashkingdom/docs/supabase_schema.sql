-- =====================================================================
-- 잿빛 왕국 — Supabase 스키마 (랭킹 '결과 한 줄'만 저장하는 최소 서버)
-- 원칙: 게임은 기기에서 돌고, 서버는 기록만 받는다. 검증은 별도 서버 없이
--       DB 보안 규칙(RLS + CHECK + 트리거)이 '문지기'처럼 공짜로 걸러 낸다.
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여 넣고 실행.
--       Authentication → Providers → Anonymous Sign-ins 켜기.
--       클라이언트 설정: index.html 에 window.ASHK_CONFIG = { supabaseUrl, anonKey } (anon 키는 공개용 키)
-- =====================================================================

-- ---------- 설정: 옛 버전 클라이언트 차단 ----------
create table if not exists ashk_config (
  id int primary key default 1 check (id = 1),
  min_client_ver int not null default 110
);
insert into ashk_config (id) values (1) on conflict do nothing;
alter table ashk_config enable row level security;
create policy "config read" on ashk_config for select using (true);

-- ---------- 플레이어 이름 (하루 1회 변경) ----------
create table if not exists ashk_players (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 10 and name ~ '^[[:alnum:]가-힣 _-]+$'),
  renamed_at timestamptz not null default now()
);
alter table ashk_players enable row level security;
create policy "players read" on ashk_players for select using (true);
create policy "players insert own" on ashk_players for insert with check (user_id = auth.uid());
create policy "players update own" on ashk_players for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function ashk_players_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.name is distinct from old.name and old.renamed_at > now() - interval '1 day' then
      raise exception 'rename limited to once per day';
    end if;
    if new.name is distinct from old.name then new.renamed_at := now(); else new.renamed_at := old.renamed_at; end if;
  end if;
  new.user_id := auth.uid();
  return new;
end $$;
drop trigger if exists ashk_players_guard on ashk_players;
create trigger ashk_players_guard before insert or update on ashk_players for each row execute function ashk_players_guard();

-- ---------- 공유 지구: 구역 예약(새 생애당 1회 쓰기) ----------
-- cell = '행:열:구역행:구역열' (0.5° 격자 × 64×64). 같은 구역에 두 왕국이 생기지 않게 유니크.
create table if not exists ashk_regions (
  cell text primary key check (cell ~ '^[0-9]{1,3}:[0-9]{1,3}:[0-9]{1,2}:[0-9]{1,2}$'),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  biome text not null check (biome in ('temperate','rainforest','savanna','desert','steppe','taiga','tundra')),
  client_ver int not null,
  claimed_at timestamptz not null default now()
);
alter table ashk_regions enable row level security;
create policy "regions read" on ashk_regions for select using (true);
create policy "regions insert own" on ashk_regions for insert with check (user_id = auth.uid());
-- 하루 3번 넘게 새 구역을 잡는 계정은 거부(새 생애 남발·구역 선점 방지)
create or replace function ashk_regions_guard() returns trigger language plpgsql as $$
begin
  if (select min_client_ver from ashk_config where id = 1) > new.client_ver then raise exception 'client too old'; end if;
  if (select count(*) from ashk_regions where user_id = auth.uid() and claimed_at > now() - interval '1 day') >= 3 then raise exception 'too many claims'; end if;
  new.user_id := auth.uid(); new.claimed_at := now();
  return new;
end $$;
drop trigger if exists ashk_regions_guard on ashk_regions;
create trigger ashk_regions_guard before insert on ashk_regions for each row execute function ashk_regions_guard();

-- ---------- 랭킹 기록: (유저, 시즌, 종목)당 한 줄 ----------
-- kind: 올림픽 종목 id(shooting/sprint/…) 또는 'war'(영토 점수)
create table if not exists ashk_records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  season text not null check (season ~ '^S[0-9]{3,6}$'),
  kind text not null check (kind in ('shooting','sprint','wrestling','cooking','horse','build','quiz','war')),
  bracket int not null check (bracket between 4 and 8),
  score int not null check (score >= 0),
  client_ver int not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, season, kind)
);
create index if not exists ashk_records_board on ashk_records (season, kind, bracket, score desc);
alter table ashk_records enable row level security;
create policy "records read" on ashk_records for select using (true);
create policy "records insert own" on ashk_records for insert with check (user_id = auth.uid());
create policy "records update own" on ashk_records for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- delete 정책 없음 = 삭제 불가

-- 문지기: 옛 버전 / 말이 안 되는 숫자 / 너무 잦은 갱신 / 현재 시즌이 아닌 기록 거부
create or replace function ashk_records_guard() returns trigger language plpgsql as $$
declare
  minv int;
  cur text := 'S' || floor(extract(epoch from now()) / 86400 / 14)::int;
  cap int;
begin
  select min_client_ver into minv from ashk_config where id = 1;
  if new.client_ver < minv then raise exception 'client too old'; end if;
  if new.season <> cur then raise exception 'not current season'; end if;
  -- 점수 상한: 게임 공식(능력치×10 + 레벨×2 + 말 보너스) × 최대 1.3배를 브래킷별로 넉넉히
  cap := case when new.kind = 'war' then 14 * 30 else 600 + new.bracket * 250 end;
  if new.score > cap then raise exception 'score out of range'; end if;
  if tg_op = 'UPDATE' then
    if old.updated_at > now() - interval '55 minutes' then raise exception 'too frequent'; end if;
    if new.score < old.score then new.score := old.score; end if; -- 최고 기록만 유지
    if new.kind <> 'war' and new.score > old.score * 3 + 200 then raise exception 'implausible jump'; end if;
  end if;
  new.user_id := auth.uid();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ashk_records_guard on ashk_records;
create trigger ashk_records_guard before insert or update on ashk_records for each row execute function ashk_records_guard();

-- 보드 뷰: 이름 붙여서 읽기 전용 제공 (클라이언트는 limit=100 으로만 조회)
create or replace view ashk_board with (security_invoker = true) as
  select r.season, r.kind, r.bracket, r.score, coalesce(p.name, '생존자') as name
  from ashk_records r left join ashk_players p on p.user_id = r.user_id;

-- ---------- 공지 (최근 10개만 조회) ----------
create table if not exists ashk_notices (
  id bigserial primary key,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);
alter table ashk_notices enable row level security;
create policy "notices read" on ashk_notices for select using (true);
-- 쓰기는 대시보드(서비스 키)에서만

-- ---------- 명예의 전당: 주간 1위 영구 기록 ----------
create table if not exists ashk_hall_of_fame (
  week int not null,          -- 1970-01-05(월) 기준 주 번호
  kind text not null,
  name text not null,
  score int not null,
  primary key (week, kind)
);
alter table ashk_hall_of_fame enable row level security;
create policy "hof read" on ashk_hall_of_fame for select using (true);

-- 매주 월요일 00:05(UTC) 지난주 1위를 기록 (Supabase: Database → Extensions → pg_cron 켜기)
create or replace function ashk_close_week() returns void language sql security definer as $$
  insert into ashk_hall_of_fame (week, kind, name, score)
  select floor((extract(epoch from now()) - 345600) / 604800)::int - 1, b.kind, b.name, b.score
  from (select distinct on (kind) kind, name, score from ashk_board
        where season = 'S' || floor(extract(epoch from now()) / 86400 / 14)::int
        order by kind, score desc) b
  on conflict do nothing;
$$;
-- select cron.schedule('ashk-week', '5 0 * * 1', 'select ashk_close_week()');

-- ---------- 매일 직접 확인용: 의심 기록 ----------
-- 규칙이 다 잡지는 못하므로 하루 한두 번 이 뷰를 보고 수동으로 정리한다(비용 0, 시간만 든다).
create or replace view ashk_suspicious as
  with s as (
    select kind, bracket, percentile_cont(0.99) within group (order by score) as p99
    from ashk_records group by kind, bracket
  )
  select r.*, s.p99 from ashk_records r join s using (kind, bracket)
  where r.score > s.p99 * 1.3
  order by r.updated_at desc;
-- 정리 예: delete from ashk_records where user_id = '...';  (대시보드에서 서비스 권한으로)
