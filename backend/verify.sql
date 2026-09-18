-- Transactional integration tests: no test players or rooms persist.
begin;
do $$
declare ids uuid[]:=array[]::uuid[]; j int; s jsonb; c text; outsider uuid:=gen_random_uuid(); hs int[]; v int; failed boolean; phase text;
begin
 for j in 1..7 loop ids:=array_append(ids,gen_random_uuid()); end loop;
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 s:=public.cc_game('create','',jsonb_build_object('nickname','測試 1')); c:=s->>'code';
 for j in 2..7 loop
  perform set_config('request.jwt.claim.sub',ids[j]::text,true);
  perform public.cc_game('join',c,jsonb_build_object('nickname','測試 '||j));
 end loop;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 failed:=false;
 begin perform public.cc_game('state',c); exception when others then failed:=true; end;
 if not failed then raise exception 'FAIL outsider room read'; end if;
 for j in 1..7 loop
  perform set_config('request.jwt.claim.sub',ids[j]::text,true); perform public.cc_game('ready',c);
 end loop;
 perform set_config('request.jwt.claim.sub',ids[2]::text,true); failed:=false;
 begin perform public.cc_game('advance',c,'{"version":0}'); exception when others then failed:=true; end;
 if not failed then raise exception 'FAIL non-host start'; end if;
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 s:=public.cc_game('advance',c,'{"version":0}');
 if s->>'phase'<>'reveal' then raise exception 'FAIL start'; end if;
 for j in 1..7 loop
  perform set_config('request.jwt.claim.sub',ids[j]::text,true);
  s:=public.cc_game('state',c);
  if exists(select 1 from jsonb_array_elements(s->'players') z where z->>'role' is not null) then raise exception 'FAIL leaked roles'; end if;
  if s#>>'{me,role}' is null then raise exception 'FAIL missing own role'; end if;
  perform public.cc_game('ready',c);
 end loop;
 perform set_config('request.jwt.claim.sub',ids[1]::text,true);
 s:=public.cc_game('advance',c,jsonb_build_object('version',s->'version'));
 -- Drive rounds through to a real ending; two hackers coordinate against non-hackers.
 for v in 1..40 loop
  phase:=s->>'phase'; exit when phase='ending';
  for j in 1..7 loop
   perform set_config('request.jwt.claim.sub',ids[j]::text,true);
   s:=public.cc_game('state',c);
   if phase='event' then perform public.cc_game('answer',c,'{"value":1}');
   elsif (s#>>'{me,alive}')::boolean then
    if phase='discussion' then perform public.cc_game('measure',c,'{"value":0}');
    elsif phase='vote' then perform public.cc_game('vote',c,'{"value":-1}');
    elsif phase='night' then
     if s#>>'{me,role}'='駭客' then
      perform public.cc_game('act',c,jsonb_build_object('value',(select min(seat) from cc_private.players where room=c and alive and role<>'駭客')));
     else perform public.cc_game('ready',c); end if;
    end if;
   end if;
  end loop;
  perform set_config('request.jwt.claim.sub',ids[1]::text,true);
  s:=public.cc_game('advance',c,jsonb_build_object('version',s->'version'));
 end loop;
 if s->>'phase'<>'ending' or s->>'winner'<>'駭客陣營' then raise exception 'FAIL ending'; end if;
 if has_function_privilege('anon','public.cc_game(text,text,jsonb)','EXECUTE') then raise exception 'FAIL unauthenticated execute'; end if;
 if has_table_privilege('authenticated','cc_private.players','SELECT') then raise exception 'FAIL raw player access'; end if;
 if has_table_privilege('authenticated','cc_private.players','UPDATE') then raise exception 'FAIL direct role modification'; end if;
end $$;
rollback;
select 'PASS: seven players, outsider denied, host checks, role isolation, complete rounds, ending, no test data retained' as verification;
