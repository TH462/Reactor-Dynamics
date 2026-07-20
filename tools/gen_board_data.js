const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/grok_build/Reactor_Dynamics/inbox/PWR_learning_diagram.json', 'utf8'));
let stripped = 0;
d.items.forEach(i => { if (typeof i.name === 'string' && i.name.length > 500) { i.name = ''; stripped++; } });
const header = [
  '/* pwr_board_data.js — GENERATED from inbox/PWR_learning_diagram.json (final PWR learning',
  " * diagram authored in the Claude Design 'PWR Reactor' project, Diagram Building Tools).",
  ' * Three accidental 28.7KB clipboard pastes in text-item name fields were stripped; geometry',
  ' * and all other fields are verbatim. Do not hand-edit coordinates here — edit in the diagram',
  ' * builder, re-export, and regenerate with tools/gen_board_data.js.',
  ' */'
].join('\n');
const out = header + '\nwindow.RD_PWR_BOARD_DOC = ' + JSON.stringify(d) + ';\n';
fs.writeFileSync('C:/grok_build/Reactor_Dynamics/ui/diagram/board/pwr_board_data.js', out);
console.log('stripped', stripped, 'blobs; wrote', out.length, 'bytes; items', d.items.length, 'pipes', d.pipes.length);
