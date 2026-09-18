-- Ctrl+Create friend-room beta. Run as one transaction in Supabase SQL Editor.
-- Private tables: no direct client SELECT/INSERT/UPDATE permissions.
begin;
create schema if not exists cc_private;
revoke all on schema cc_private from public, anon;
grant usage on schema cc_private to authenticated;
create table cc_private.rooms (
 code text primary key, host uuid not null, created_at timestamptz not null default now(),
 phase text not null default 'lobby', day int not null default 1,
 version int not null default 0, runoff int[], last_protected int,
 winner text, logs jsonb not null default '[]'
);
create index cc_rooms_host_created on cc_private.rooms(host,created_at);
create table cc_private.players (
 room text not null references cc_private.rooms(code), uid uuid not null,
 seat int not null check(seat between 0 and 6), nickname text not null check(length(nickname) between 1 and 20),
 role text, alive boolean not null default true, ready boolean not null default false,
 answer int, measure int, vote int, action int, checks jsonb not null default '[]',
 score int not null default 0, answered int not null default 0,
 primary key(room,uid), unique(room,seat)
);
create table cc_private.messages (
 id bigint generated always as identity primary key, room text not null references cc_private.rooms(code),
 uid uuid not null, seat int not null, body text not null check(length(body) between 1 and 300),
 created_at timestamptz not null default now()
);
create index cc_messages_room_time on cc_private.messages(room,created_at);
alter table cc_private.rooms enable row level security;
alter table cc_private.players enable row level security;
alter table cc_private.messages enable row level security;
revoke all on all tables in schema cc_private from public,anon,authenticated;
revoke all on all sequences in schema cc_private from public,anon,authenticated;

-- Privileged code is confined to this non-exposed schema. Every call authenticates,
-- checks room membership, and locks the room before changes. Public wrapper is invoker.
create function cc_private.game(a text, c text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 u uuid := auth.uid(); r cc_private.rooms%rowtype; me cc_private.players%rowtype;
 t cc_private.players%rowtype; x record; n int; v int; h int; total int; k int;
 tops int[]; mx int; abst int; target int; protected int; deck text[];
 ps jsonb; msgs jsonb; mydata jsonb; choices jsonb; nextphase text;
begin
 if u is null then raise exception '請先登入'; end if;
 if a is null or p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text)>4096 then raise exception '無效請求'; end if;
 c := upper(trim(c));
 if a='create' then
  if (select count(*) from cc_private.rooms where host=u and created_at>now()-interval '24 hours')>=5 then raise exception '今日開房上限為 5 間'; end if;
  c:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into cc_private.rooms(code,host) values(c,u);
 end if;
 select * into r from cc_private.rooms where code=c for update;
 if not found or r.created_at<now()-interval '24 hours' then raise exception '房間不存在或已到期'; end if;
 select * into me from cc_private.players where room=c and uid=u;
 if a in ('create','join') and me.uid is null then
  if r.phase<>'lobby' then raise exception '對局已開始'; end if;
  n:=(select count(*) from cc_private.players where room=c);
  if n>=7 then raise exception '房間已滿'; end if;
  if length(trim(coalesce(p->>'nickname',''))) not between 1 and 20 then raise exception '暱稱需為 1–20 字'; end if;
  insert into cc_private.players(room,uid,seat,nickname) values(c,u,n,trim(p->>'nickname')) returning * into me;
 elsif me.uid is null then raise exception '你不是此房間的成員';
 end if;
 if a='ready' then
  if r.phase not in ('lobby','reveal','night') then raise exception '此階段不能準備'; end if;
  update cc_private.players set ready=true where room=c and uid=u;
 elsif a='chat' then
  if r.phase not in ('lobby','discussion','ending') or (not me.alive and r.phase<>'ending') then raise exception '目前不能發言'; end if;
  if length(trim(coalesce(p->>'body',''))) not between 1 and 300 then raise exception '發言需為 1–300 字'; end if;
  if exists(select 1 from cc_private.messages where room=c and uid=u and created_at>now()-interval '2 seconds') then raise exception '請稍候再發言'; end if;
  if (select count(*) from cc_private.messages where room=c)>=500 then raise exception '此房間已達 500 則訊息上限'; end if;
  insert into cc_private.messages(room,uid,seat,body) values(c,u,me.seat,trim(p->>'body'));
 elsif a in ('answer','measure','vote','act') then
  if not me.alive and a<>'answer' then raise exception '已出局玩家不能執行此操作'; end if;
  v:=(p->>'value')::int;
  if v is null then raise exception '請選擇目標'; end if;
  if a='answer' then
   if r.phase<>'event' or v not between 0 and 2 then raise exception '無效答案'; end if;
   update cc_private.players set answer=v where room=c and uid=u;
  elsif a='measure' then
   if r.phase<>'discussion' or v not between 0 and 2 then raise exception '無效防護選擇'; end if;
   update cc_private.players set measure=v where room=c and uid=u;
  elsif a='vote' then
   if r.phase<>'vote' or v=me.seat then raise exception '無效投票'; end if;
   if v<>-1 and (not exists(select 1 from cc_private.players where room=c and seat=v and alive) or (r.runoff is not null and not v=any(r.runoff))) then raise exception '無效投票對象'; end if;
   update cc_private.players set vote=v where room=c and uid=u;
  else
   select * into t from cc_private.players where room=c and seat=v and alive;
   if r.phase<>'night' or t.uid is null or me.role='民眾' then raise exception '無效夜間行動'; end if;
   if me.role='駭客' and t.role='駭客' then raise exception '不能攻擊駭客'; end if;
   if me.role='網路警察' and me.seat=v then raise exception '不能查驗自己'; end if;
   if me.role='政府人員' and r.last_protected=v then raise exception '不能連續保護同一人'; end if;
   update cc_private.players set action=v,ready=true where room=c and uid=u;
  end if;
 elsif a='advance' then
  if r.host<>u then raise exception '只有房主可推進階段'; end if;
  if (p->>'version')::int is distinct from r.version then raise exception '畫面已更新，請重新確認'; end if;
  if r.phase='lobby' then
   if (select count(*) from cc_private.players where room=c and ready)<>7 then raise exception '需 7 位玩家全部準備'; end if;
   deck:=array['駭客','駭客','政府人員','網路警察','民眾','民眾','民眾']; k:=1;
   for x in select uid from cc_private.players where room=c order by gen_random_uuid() loop
    update cc_private.players set role=deck[k],ready=false where room=c and uid=x.uid; k:=k+1;
   end loop;
   r.phase:='reveal';
  elsif r.phase='reveal' then
   if exists(select 1 from cc_private.players where room=c and not ready) then raise exception '等待所有玩家確認身分'; end if;
   r.phase:='event';
  elsif r.phase='event' then
   if exists(select 1 from cc_private.players where room=c and alive and answer is null) then raise exception '等待存活玩家作答'; end if;
   v:=(array[1,2,0,1,2,0])[((r.day-1)%6)+1];
   update cc_private.players set score=score+case when answer=v then 1 else 0 end,answered=answered+case when answer is null then 0 else 1 end where room=c;
   r.phase:='discussion';
  elsif r.phase='discussion' then
   if exists(select 1 from cc_private.players where room=c and alive and measure is null) then raise exception '等待防護措施選擇'; end if;
   select max(cnt) into mx from (select count(*) cnt from cc_private.players where room=c and alive group by measure) z;
   select array_agg(z.measure) into tops from (select measure,count(*) cnt from cc_private.players where room=c and alive group by measure) z where cnt=mx;
   r.logs:=r.logs||jsonb_build_array(jsonb_build_object('day',r.day,'type','defense','choice',case when array_length(tops,1)=1 then tops[1] else null end));
   r.phase:=case when r.day=1 then 'night' else 'vote' end;
   update cc_private.players set ready=false,vote=null,action=null where room=c;
  elsif r.phase='vote' then
   if exists(select 1 from cc_private.players where room=c and alive and vote is null) then raise exception '等待投票'; end if;
   select count(*) into abst from cc_private.players where room=c and alive and vote=-1;
   select max(cnt) into mx from (select count(*) cnt from cc_private.players where room=c and alive and vote<>-1 group by vote) z;
   select array_agg(z.vote) into tops from (select vote,count(*) cnt from cc_private.players where room=c and alive and vote<>-1 group by vote) z where cnt=mx;
   select jsonb_agg(jsonb_build_object('seat',seat,'target',vote) order by seat) into choices from cc_private.players where room=c and alive;
   r.logs:=r.logs||jsonb_build_array(jsonb_build_object('day',r.day,'type','vote','votes',choices));
   if mx>abst and array_length(tops,1)>1 and r.runoff is null then
    r.runoff:=tops; update cc_private.players set vote=null where room=c;
   else
    target:=case when mx>abst and array_length(tops,1)=1 then tops[1] else null end;
    update cc_private.players set alive=false where room=c and seat=target;
    r.logs:=r.logs||jsonb_build_array(jsonb_build_object('day',r.day,'type','eliminated','target',target));
    r.runoff:=null; r.phase:='night';
    update cc_private.players set ready=false,action=null where room=c;
   end if;
  elsif r.phase='night' then
   if exists(select 1 from cc_private.players where room=c and alive and not ready) then raise exception '等待夜間行動，無技能者也請按準備'; end if;
   for x in select seat,action from cc_private.players where room=c and alive and role='網路警察' and action is not null loop
    update cc_private.players set checks=checks||jsonb_build_array(jsonb_build_object('day',r.day,'target',x.action,'hacker',(select role='駭客' from cc_private.players where room=c and seat=x.action))) where room=c and seat=x.seat;
   end loop;
   select action into protected from cc_private.players where room=c and alive and role='政府人員';
   select case when count(distinct action)=1 and count(action)=count(*) then min(action) else null end into target from cc_private.players where room=c and alive and role='駭客';
   if target is not null and target is distinct from protected then update cc_private.players set alive=false where room=c and seat=target; else target:=null; end if;
   r.logs:=r.logs||jsonb_build_array(jsonb_build_object('day',r.day,'type','night','target',target));
   r.last_protected:=protected; r.day:=r.day+1; r.phase:='event';
   update cc_private.players set answer=null,measure=null,vote=null,action=null,ready=false where room=c;
  else raise exception '對局已結束';
  end if;
  if r.phase not in ('lobby','reveal') then
   select count(*) filter(where role='駭客'),count(*) into h,total from cc_private.players where room=c and alive;
   if h=0 then r.winner:='守護陣營'; elsif h>=total-h then r.winner:='駭客陣營'; end if;
   if r.winner is not null then r.phase:='ending'; end if;
  end if;
  r.version:=r.version+1;
  update cc_private.rooms set phase=r.phase,day=r.day,version=r.version,runoff=r.runoff,last_protected=r.last_protected,winner=r.winner,logs=r.logs where code=c;
 elsif a not in ('create','join','state') then raise exception '不支援的操作';
 end if;
 select * into me from cc_private.players where room=c and uid=u;
 select coalesce(jsonb_agg(jsonb_build_object('seat',seat,'nickname',nickname,'alive',alive,'ready',ready,
 'answered',answer is not null,'measured',measure is not null,'voted',vote is not null,
 'role',case when r.phase='ending' then role else null end) order by seat),'[]') into ps from cc_private.players where room=c;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'seat',seat,'body',body,'at',created_at) order by id),'[]') into msgs from (select * from cc_private.messages where room=c order by id desc limit 100) m;
 mydata:=jsonb_build_object('seat',me.seat,'role',me.role,'alive',me.alive,'ready',me.ready,'answer',me.answer,'measure',me.measure,'vote',me.vote,'action',me.action,'checks',me.checks,'score',me.score,'answered',me.answered,'host',r.host=u,
 'teammates',case when me.role='駭客' then (select jsonb_agg(seat) from cc_private.players where room=c and role='駭客' and uid<>u) else '[]'::jsonb end,
 'lastProtected',case when me.role='政府人員' then r.last_protected else null end);
 return jsonb_build_object('code',c,'phase',r.phase,'day',r.day,'event',(r.day-1)%6,'version',r.version,'runoff',r.runoff,'winner',r.winner,'players',ps,'me',mydata,'messages',msgs,'logs',r.logs);
end $$;
revoke all on function cc_private.game(text,text,jsonb) from public,anon;
grant execute on function cc_private.game(text,text,jsonb) to authenticated;
create function public.cc_game(a text,c text default '',p jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select cc_private.game(a,c,p); $$;
revoke all on function public.cc_game(text,text,jsonb) from public,anon;
grant execute on function public.cc_game(text,text,jsonb) to authenticated;
commit;
