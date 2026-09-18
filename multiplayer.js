/* Friend-room beta: never receives other players' roles before the ending. */
(() => {
 'use strict';
 const client=window.supabase.createClient('https://mrqosvjftqiukzfgfyrd.supabase.co','sb_publishable_Hc1EaVZ2sxDvaA6EjAYOkg_fJnDhWNt');
 const app=document.getElementById('app'),notice=document.getElementById('notice'),events=window.SimGame.events,people=window.SimGame.people;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state=null,room=localStorage.getItem('cc-room')||'',busy=false,hidden=true,last='',failures=0;
 const name=seat=>state.players.find(p=>p.seat===seat)?.nickname||'無人';
 const btn=(label,a,value)=>`<button data-a="${a}" ${value===undefined?'':`data-v="${value}"`}>${esc(label)}</button>`;
 async function auth(){const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session){const r=await client.auth.signInAnonymously();if(r.error)throw r.error;}}
 async function rpc(a,p={}){const {data,error}=await client.rpc('cc_game',{a,c:room,p});if(error)throw error;return data;}
 function draw(){
  const s=state,m=s.me,e=events[s.event],phase={lobby:'朋友大廳',reveal:'秘密身分',event:'資安事件',discussion:'討論與防護',vote:s.runoff?'平票決選':'停權投票',night:'夜間行動',ending:'結局'}[s.phase];
  const cards=s.players.map(p=>`<div class="person ${p.alive?'':'out'}"><div class="avatar">${people[p.seat][1]}</div><b>${esc(p.nickname)}</b><div>${esc(people[p.seat][2])}</div><small>${p.alive?'存活':'已出局'}${p.seat===m.seat?' · 你':''}</small>${s.phase==='ending'?`<div>${esc(p.role)}</div>`:''}</div>`).join('');
  let body='';
  if(s.phase==='lobby')body=`<p>${s.players.length}/7 人。分享本頁網址與房號給朋友，全部準備後開始。</p>${m.ready?'<p>你已準備</p>':btn('我準備好了','ready')}`;
  else if(s.phase==='reveal')body=`<p>先私下查看身分，再按確認。</p>${m.ready?'<p>已確認，等待其他人</p>':btn('確認身分並準備','ready')}`;
  else if(s.phase==='event')body=`<h2>${esc(e.title)}</h2><pre>${esc(e.text)}</pre>${e.options.map((v,i)=>btn(`${m.answer===i?'✓ ':''}${v}`,'answer',i)).join('')}<p>存活玩家已作答：${s.players.filter(p=>p.alive&&p.answered).length}/${s.players.filter(p=>p.alive).length}</p>`;
  else if(s.phase==='discussion')body=`<h2>${esc(e.title)}</h2><p>${esc(e.why)}</p><h3>一起決定防護措施</h3>${m.alive?e.measures.map((v,i)=>btn(`${m.measure===i?'✓ ':''}${v}`,'measure',i)).join(''):'<p>你已出局，可觀看解析。</p>'}<p>防護選擇與陣營勝負分開計算。討論誰可疑，但失誤不代表駭客。</p>`;
  else if(s.phase==='vote')body=`<h2>${s.runoff?'平票決選':'投出你認為可疑的人'}</h2>${m.alive?s.players.filter(p=>p.alive&&p.seat!==m.seat&&(!s.runoff||s.runoff.includes(p.seat))).map(p=>btn(`${m.vote===p.seat?'✓ ':''}${p.nickname}`,'vote',p.seat)).join('')+btn(`${m.vote===-1?'✓ ':''}棄票`,'vote',-1):'<p>出局玩家不能投票。</p>'}<p>票向結算前不公開。</p>`;
  else if(s.phase==='night'){
   body='<h2>天黑了，請私下行動</h2><p>請不要展示自己的螢幕。</p>';
   if(m.alive&&m.role!=='民眾')body+=s.players.filter(p=>p.alive&&(m.role!=='網路警察'||p.seat!==m.seat)&&(m.role!=='政府人員'||p.seat!==m.lastProtected)&&(m.role!=='駭客'||(!m.teammates.includes(p.seat)&&p.seat!==m.seat))).map(p=>btn(`${m.action===p.seat?'✓ ':''}${p.nickname}`,'act',p.seat)).join('');
   if(m.alive)body+=btn(m.ready?'✓ 已完成（可修改技能目標）':'完成夜晚／略過技能','ready');
   body+='<p>所有存活玩家完成後，房主結算；略過技能也能完成。</p>';
  }else body=`<h2>${esc(s.winner)}獲勝</h2><p>你的資安判斷：${m.score}/${m.answered} 次正確。這是遊戲作答紀錄，不是經驗證的素養評量。</p><p>全部身分已公開。可以回大廳建立新房間。</p>`;
  const secret=hidden?'<p>身分已隱藏</p>':`<h3>${esc(m.role||'尚未分配')}</h3><p>${esc(people[m.seat][4])}</p>${m.role==='駭客'?`<p>隊友：${m.teammates.map(name).map(esc).join('、')}</p>`:''}${m.checks.map(x=>`<p>第 ${x.day} 夜 ${esc(name(x.target))}：${x.hacker?'駭客':'非駭客'}</p>`).join('')}`;
  const logs=s.logs.map(x=>x.type==='defense'?`第 ${x.day} 日防護：${x.choice===null?'平票，未形成共識':events[(x.day-1)%6].measures[x.choice]}`:x.type==='vote'?`第 ${x.day} 日票向：${x.votes.map(v=>name(v.seat)+'→'+(v.target===-1?'棄票':name(v.target))).join('、')}`:`第 ${x.day} ${x.type==='night'?'夜帳號失守':'日停權'}：${name(x.target)}`).map(v=>`<p>${esc(v)}</p>`).join('');
  app.innerHTML=`<section><h2>房號 ${esc(s.code)}</h2><p>第 ${s.day} 日 · ${phase} · 3 秒同步</p><div class="players">${cards}</div><p class="small">準備 ${s.players.filter(p=>p.alive&&p.ready).length} · 作答 ${s.players.filter(p=>p.alive&&p.answered).length} · 防護 ${s.players.filter(p=>p.alive&&p.measured).length} · 投票 ${s.players.filter(p=>p.alive&&p.voted).length}</p>${btn('回入口（不刪除房間）','home')}</section><section class="secret">${btn(hidden?'私下查看身分':'隱藏身分','secret')}${secret}</section><section>${body}${m.host&&s.phase!=='ending'?btn(s.phase==='lobby'?'全員準備後開始':'全部完成後推進階段','advance'):''}</section><section><h3>房間討論</h3><div class="chat">${s.messages.map(x=>`<p><b>${esc(name(x.seat))}</b>：${esc(x.body)}</p>`).join('')}</div>${['lobby','discussion','ending'].includes(s.phase)&&(m.alive||s.phase==='ending')?'<input id="message" aria-label="發言" maxlength="300" placeholder="討論線索，不要貼敏感資料">'+btn('送出','chat'):'<p>此階段暫停發言</p>'}</section><details><summary>公開紀錄</summary>${logs||'<p>尚無紀錄</p>'}</details>`;
 }
 async function action(a,p={}){
  if(busy)return;busy=true;notice.textContent='同步中…';
  try{await auth();state=await rpc(a,p);room=state.code;localStorage.setItem('cc-room',room);last=JSON.stringify(state);draw();notice.textContent='已同步';failures=0;}
  catch(e){notice.textContent=e.message||'連線失敗，請重試';}finally{busy=false;}
 }
 app.addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;
  if(b.id==='create'||b.id==='join'){room=b.id==='join'?document.getElementById('code').value.trim().toUpperCase():'';return action(b.id==='create'?'create':'join',{nickname:document.getElementById('nick').value.trim()});}
  const a=b.dataset.a;if(!a)return;
  if(a==='secret'){hidden=!hidden;draw();return;}
  if(a==='home'){localStorage.removeItem('cc-room');location.reload();return;}
  if(a==='chat')return action(a,{body:document.getElementById('message').value});
  action(a,a==='advance'?{version:state.version}:b.dataset.v===undefined?{}:{value:Number(b.dataset.v)});
 });
 setInterval(async()=>{if(!state||busy||document.hidden)return;busy=true;
  try{const next=await rpc('state');const stamp=JSON.stringify(next);if(stamp!==last){const draft=document.getElementById('message')?.value;state=next;last=stamp;draw();if(draft&&document.getElementById('message'))document.getElementById('message').value=draft;}if(failures)notice.textContent='已重新連線';failures=0;}
  catch(e){failures++;notice.textContent='暫時無法同步：'+e.message;}finally{busy=false;}
 },3000);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&state){hidden=true;draw();}});
 if(room)action('state');
})();
