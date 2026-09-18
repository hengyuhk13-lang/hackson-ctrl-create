const {JSDOM}=require('jsdom');const fs=require('node:fs');const assert=require('node:assert/strict');
for(const attack of [0,1])for(const choice of [0,1,2]){
 const d=new JSDOM(fs.readFileSync('src/battle.html','utf8'),{runScripts:'outside-only'}),w=d.window;
 w.scrollTo=()=>{};w.Math.random=()=>attack===0?0:.9;w.eval(fs.readFileSync('src/battle.js','utf8'));
 const click=id=>w.document.getElementById(id).click();click('start');assert(w.document.getElementById('next').disabled);
 for(const el of w.document.querySelectorAll('details[data-path]')){el.open=true;el.dispatchEvent(new w.Event('toggle'));}
 click('next');assert(w.document.getElementById('confirm').disabled);click('observe');
 w.document.querySelector(`[data-choice="${choice}"]`).click();click('confirm');
 assert(w.document.body.textContent.includes(choice===2?'雙方 +0':choice===attack?'攻擊方 +1':'防守方 +1'));
 assert(w.document.body.textContent.includes('第二、三回合與四人連線尚未加入'));
 click('again');assert(w.document.getElementById('next').disabled);w.close();
}
console.log('BATTLE_PASS: 2 attack positions × 3 decisions, read gates, teammate observations, results and replay');
