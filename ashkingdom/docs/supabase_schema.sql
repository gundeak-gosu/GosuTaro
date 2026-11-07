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

create or replace function ashk_players_guard() returns trigger language plpgsql set search_path = public as $$
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
create or replace function ashk_regions_guard() returns trigger language plpgsql set search_path = public as $$
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
  bracket int not null check (bracket between 1 and 8), -- 국가 급수(1~7)
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
create or replace function ashk_records_guard() returns trigger language plpgsql set search_path = public as $$
declare
  minv int;
  cur text := 'S' || floor(extract(epoch from now()) / 86400 / 14)::int;
  cap int;
begin
  select min_client_ver into minv from ashk_config where id = 1;
  if new.client_ver < minv then raise exception 'client too old'; end if;
  if new.season <> cur then raise exception 'not current season'; end if;
  -- 점수 상한: 게임 공식(능력치×10 + 레벨×2 + 말 보너스) × 최대 1.3배를 브래킷별로 넉넉히
  cap := case when new.kind = 'war' then 14 * 30 else 800 + new.bracket * 300 end;
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

-- ---------- 국가 카드: 나라급이 된 왕국의 '한 줄' (전쟁 매칭·급별 순위) ----------
-- 위치는 0.5° 칸 중심(약 50km)으로 뭉갠 값만 저장 → 정확한 위치는 서버도 모른다
create table if not exists ashk_kingdoms (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 12),
  lat numeric(5,1) not null check (lat between -90 and 90 and mod(lat * 2, 1) = 0),
  lon numeric(5,1) not null check (lon between -180 and 180 and mod(lon * 2, 1) = 0),
  continent text not null check (continent in ('asia','europe','africa','namerica','samerica','oceania')),
  grade int not null check (grade between 1 and 7),
  power int not null check (power between 0 and 20000),
  level int not null check (level between 1 and 60),
  client_ver int not null,
  updated_at timestamptz not null default now()
);
create index if not exists ashk_kingdoms_match on ashk_kingdoms (grade, lat, lon);
create index if not exists ashk_kingdoms_rank on ashk_kingdoms (grade, power desc);
alter table ashk_kingdoms enable row level security;
create policy "kingdoms read" on ashk_kingdoms for select using (true);
create policy "kingdoms insert own" on ashk_kingdoms for insert with check (user_id = auth.uid());
create policy "kingdoms update own" on ashk_kingdoms for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 급수 = 국력 구간(클라이언트 GRADES 와 동일). 급수·국력이 안 맞거나 급격히 뛰면 거부
create or replace function ashk_grade_of(p int) returns int language sql immutable set search_path = public as $$
  select case when p >= 5600 then 7 when p >= 4000 then 6 when p >= 2800 then 5 when p >= 1900 then 4 when p >= 1200 then 3 when p >= 700 then 2 else 1 end;
$$;
create or replace function ashk_kingdoms_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if (select min_client_ver from ashk_config where id = 1) > new.client_ver then raise exception 'client too old'; end if;
  if new.grade <> ashk_grade_of(new.power) then raise exception 'grade mismatch'; end if;
  if tg_op = 'UPDATE' then
    if old.updated_at > now() - interval '55 minutes' then raise exception 'too frequent'; end if;
    if new.power > old.power * 2 + 500 then raise exception 'implausible jump'; end if;
  end if;
  new.user_id := auth.uid(); new.updated_at := now();
  return new;
end $$;
drop trigger if exists ashk_kingdoms_guard on ashk_kingdoms;
create trigger ashk_kingdoms_guard before insert or update on ashk_kingdoms for each row execute function ashk_kingdoms_guard();

-- ---------- 올림픽 조 편성: 64개국, 대륙 할당(아시아20·유럽12·아프리카10·북미10·남미7·오세아니아5) ----------
create table if not exists ashk_olympic_groups (
  id bigserial primary key,
  season text not null,
  grade int not null,
  created_at timestamptz not null default now()
);
create table if not exists ashk_olympic_members (
  season text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id bigint not null references ashk_olympic_groups(id) on delete cascade,
  continent text not null,
  grade int not null,
  primary key (season, user_id)
);
create index if not exists ashk_olympic_members_group on ashk_olympic_members (group_id);
alter table ashk_olympic_groups enable row level security;
alter table ashk_olympic_members enable row level security;
create policy "groups read" on ashk_olympic_groups for select using (true);
create policy "members read" on ashk_olympic_members for select using (true);
-- 쓰기는 아래 RPC(security definer)로만

create or replace function ashk_quota(c text) returns int language sql immutable set search_path = public as $$
  select case c when 'asia' then 20 when 'europe' then 12 when 'africa' then 10 when 'namerica' then 10 when 'samerica' then 7 else 5 end;
$$;

-- 시즌당 1번 호출: 같은 급 → ±1급 → ±2급 순으로 '내 대륙 자리가 남은 조'에 배정, 없으면 새 조. (빈자리는 클라이언트가 봇으로 채움)
create or replace function ashk_join_olympics(p_season text) returns bigint language plpgsql security definer set search_path = public as $$
declare
  me ashk_kingdoms;
  gid bigint;
  dg int;
begin
  if p_season <> 'S' || floor(extract(epoch from now()) / 86400 / 14)::int then raise exception 'not current season'; end if;
  select * into me from ashk_kingdoms where user_id = auth.uid();
  if me is null then raise exception 'not a nation yet'; end if;
  select group_id into gid from ashk_olympic_members where season = p_season and user_id = auth.uid();
  if gid is not null then return gid; end if;
  for dg in 0..2 loop
    select g.id into gid from ashk_olympic_groups g
      where g.season = p_season and abs(g.grade - me.grade) = dg
        and (select count(*) from ashk_olympic_members m where m.group_id = g.id) < 64
        and (select count(*) from ashk_olympic_members m where m.group_id = g.id and m.continent = me.continent) < ashk_quota(me.continent)
      order by g.id limit 1 for update skip locked;
    exit when gid is not null;
  end loop;
  if gid is null then insert into ashk_olympic_groups (season, grade) values (p_season, me.grade) returning id into gid; end if;
  insert into ashk_olympic_members (season, user_id, group_id, continent, grade) values (p_season, auth.uid(), gid, me.continent, me.grade);
  return gid;
end $$;
revoke all on function ashk_join_olympics(text) from public;
grant execute on function ashk_join_olympics(text) to authenticated;

-- 조원 목록(이름·대륙·급수) — 최대 64행
create or replace view ashk_group_view with (security_invoker = true) as
  select m.season, m.group_id, m.user_id, m.continent, m.grade, coalesce(k.name, '생존자') as name, k.power, k.level
  from ashk_olympic_members m left join ashk_kingdoms k on k.user_id = m.user_id;

-- ---------- 기기 간 이어하기: 계정당 세이브 1행(gzip 압축, 200KB 이하) ----------
-- 이메일 로그인(Authentication → Email OTP 켜기). 시작 시 메타만 받고, 본문은 필요할 때만.
create table if not exists ashk_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rev int not null,
  data text not null check (octet_length(data) <= 204800),
  device text not null default '',
  day int not null default 1,
  chapter int not null default 0,
  level int not null default 1,
  updated_at timestamptz not null default now()
);
alter table ashk_saves enable row level security;
create policy "saves read own" on ashk_saves for select using (user_id = auth.uid());
-- 쓰기는 RPC 로만: 리비전이 정확히 +1 일 때만 받아서 두 기기가 서로 덮어쓰지 못하게(낙관적 잠금)
create or replace function ashk_save_push(p_rev int, p_data text, p_device text, p_day int, p_chapter int, p_level int)
returns int language plpgsql security definer set search_path = public as $$
declare cur ashk_saves;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into cur from ashk_saves where user_id = auth.uid() for update;
  if cur is null then
    if p_rev < 1 then raise exception 'bad rev'; end if;
    insert into ashk_saves (user_id, rev, data, device, day, chapter, level) values (auth.uid(), p_rev, p_data, left(p_device, 40), p_day, p_chapter, p_level);
    return p_rev;
  end if;
  if p_rev <> cur.rev + 1 then raise exception 'conflict'; end if;
  if cur.updated_at > now() - interval '50 seconds' then raise exception 'too frequent'; end if;
  update ashk_saves set rev = p_rev, data = p_data, device = left(p_device, 40), day = p_day, chapter = p_chapter, level = p_level, updated_at = now() where user_id = auth.uid();
  return p_rev;
end $$;
revoke all on function ashk_save_push(int, text, text, int, int, int) from public;
grant execute on function ashk_save_push(int, text, text, int, int, int) to authenticated;

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
create or replace function ashk_close_week() returns void language sql security definer set search_path = public as $$
  insert into ashk_hall_of_fame (week, kind, name, score)
  select floor((extract(epoch from now()) - 345600) / 604800)::int - 1, b.kind, b.name, b.score
  from (select distinct on (kind) kind, name, score from ashk_board
        where season = 'S' || floor(extract(epoch from now()) / 86400 / 14)::int
        order by kind, score desc) b
  on conflict do nothing;
$$;
revoke all on function ashk_close_week() from public, anon, authenticated;
-- select cron.schedule('ashk-week', '5 0 * * 1', 'select ashk_close_week()');

-- ---------- 매일 직접 확인용: 의심 기록 ----------
-- 규칙이 다 잡지는 못하므로 하루 한두 번 이 뷰를 보고 수동으로 정리한다(비용 0, 시간만 든다).
create or replace view ashk_suspicious with (security_invoker = true) as
  with s as (
    select kind, bracket, percentile_cont(0.99) within group (order by score) as p99
    from ashk_records group by kind, bracket
  )
  select r.*, s.p99 from ashk_records r join s using (kind, bracket)
  where r.score > s.p99 * 1.3
  order by r.updated_at desc;
revoke all on ashk_suspicious from anon, authenticated; -- 관리자(대시보드)만
-- 정리 예: delete from ashk_records where user_id = '...';  (대시보드에서 서비스 권한으로)

-- Supabase 는 새 함수에 anon 실행 권한을 따로 주므로, 로그인한 사용자만 쓰도록 명시적으로 회수
revoke execute on function ashk_join_olympics(text) from anon;
revoke execute on function ashk_save_push(int, text, text, int, int, int) from anon;
revoke execute on function ashk_close_week() from anon;
