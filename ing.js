const fs=require('fs');
const p='C:/Users/TIMH~1/AppData/Local/Temp/claude/C--grok-build-Reactor-Dynamics/61e7e8a7-1eaf-4dce-910b-80f0c1489a45/scratchpad/STYLE_GUIDE_v1.md';
const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);
const exempt=new Set(['heating','cooling','placekeeping','during','something','anything','nothing','string','strings','thing','things','engineering','labeling','according']);
const hits={};
lines.forEach((l,i)=>{
  (l.match(/\b[a-z]{4,}ing\b/gi)||[]).forEach(w=>{
    const k=w.toLowerCase();
    (hits[k]=hits[k]||[]).push(i+1);
  });
});
Object.keys(hits).sort().forEach(k=>console.log(k.padEnd(16), hits[k].join(',')));
console.log('\n--- unless/except/however in the guide ---');
lines.forEach((l,i)=>{ if(/\bunless\b|\bexcept\b|\bhowever\b/i.test(l)) console.log(`L${i+1}: ${l.trim().slice(0,150)}`);});
