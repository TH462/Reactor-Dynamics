/* gen_board_data.js — regenerate ui/diagram/board/pwr_board_data.js from a diagram
 * export produced by the Claude Design 'PWR Reactor' project (Diagram Building Tools,
 * "-> PRODUCTION" snapshot).
 *
 *   node tools/gen_board_data.js [path/to/export.json]
 *
 * Default input is the V2 export. Do NOT hand-edit coordinates in the generated file —
 * edit in the diagram builder, re-export, and re-run this.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IN = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'inbox', 'diagram_v2.json');
const OUT = path.join(ROOT, 'ui', 'diagram', 'board', 'pwr_board_data.js');

const d = JSON.parse(fs.readFileSync(IN, 'utf8'));

// The builder has exported items whose `name` field carried an accidental multi-KB
// clipboard paste of a whole diagram JSON. Harmless but enormous — strip any name that
// is obviously not a name.
let stripped = 0;
d.items.forEach((i) => {
  if (typeof i.name === 'string' && i.name.length > 500) { i.name = ''; stripped++; }
});

// The Turbine and Generator component has no "tcv-drain" port (a real turbine casing
// drain isn't modeled) and the owner confirmed the drain is unnecessary, so an authored
// pipe to it is dropped rather than inventing a port. Kept as a guard: the V1 export
// carried one, and re-authoring could reintroduce it.
const pipesBefore = d.pipes.length;
d.pipes = d.pipes.filter((p) => p.from !== 'turbineGenerator/tcv-drain' && p.to !== 'turbineGenerator/tcv-drain');
const droppedPipes = pipesBefore - d.pipes.length;

const header = [
  '/* pwr_board_data.js — GENERATED. Do not hand-edit.',
  ' *',
  ' * Source: ' + path.relative(ROOT, IN).replace(/\\/g, '/') + ' — the "-> PRODUCTION" snapshot exported',
  " * from the Claude Design 'PWR Reactor' project (Diagram Building Tools). Geometry and",
  ' * every field are verbatim apart from two documented filters in tools/gen_board_data.js:',
  ' * oversized clipboard pastes in item `name` fields, and any pipe to the nonexistent',
  ' * turbineGenerator/tcv-drain port.',
  ' *',
  ' * To change the board: edit in the diagram builder, re-export, and re-run',
  ' *   node tools/gen_board_data.js [export.json]',
  ' * then re-point any new/changed item ids in ui/diagram/board/pwr_board_wiring.js',
  ' * (its selfTest asserts every value/readout/button/number item is wired).',
  ' */'
].join('\n');

const out = header + '\nwindow.RD_PWR_BOARD_DOC = ' + JSON.stringify(d) + ';\n';
fs.writeFileSync(OUT, out);

const kinds = {};
d.items.forEach((i) => { kinds[i.kind] = (kinds[i.kind] || 0) + 1; });
console.log('in :', path.relative(ROOT, IN));
console.log('out:', path.relative(ROOT, OUT), '—', out.length, 'bytes');
console.log('items', d.items.length, '| pipes', d.pipes.length);
console.log('kinds:', Object.keys(kinds).sort().map((k) => k + '=' + kinds[k]).join(' '));
if (stripped) console.log('stripped', stripped, 'oversized name blob(s)');
if (droppedPipes) console.log('dropped', droppedPipes, 'tcv-drain pipe(s)');
