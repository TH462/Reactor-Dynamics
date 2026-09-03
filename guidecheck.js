const fs=require('fs');
const p='C:/Users/TIMH~1/AppData/Local/Temp/claude/C--grok-build-Reactor-Dynamics/61e7e8a7-1eaf-4dce-910b-80f0c1489a45/scratchpad/STYLE_GUIDE_v1.md';
const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);
console.log('=== sentences >25 words (W2 reference cap) ===');
let n=0;
lines.forEach((l,i)=>{
  if(/^\s*[|`┌│└]/.test(l)) return;
  const txt=l.replace(/^[-*#\s>]+/,'').replace(/\*\*/g,'');
  const sents=txt.split(/(?<=[.!?])\s+/);
  sents.forEach(s=>{ const w=s.trim().split(/\s+/).filter(Boolean).length;
    if(w>25){n++;console.log(`L${i+1} ${w}w: ${s.trim()}`);} });
});
console.log('count>25:',n);
console.log('\n=== "must" occurrences ===');
lines.forEach((l,i)=>{ if(/\bmust\b/i.test(l)) console.log(`L${i+1}: ${l.trim()}`); });
console.log('\n=== "should"/"shall" ===');
lines.forEach((l,i)=>{ if(/\bshould\b|\bshall\b/i.test(l)) console.log(`L${i+1}: ${l.trim()}`); });
