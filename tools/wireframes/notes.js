/** Prints every frame's FUNCTION notes as Markdown: node notes.js [path/to.fig] */
const path = require('path');
const { load } = require('./fig');

const { m, K, id } = load(process.argv[2] || path.join(__dirname, '../../design/wireframes/ALLI_App_Wireframe.fig'));
const text = (n) => [n.textData ? n.textData.characters : '', ...(K[id(n.guid)] || []).map(text)].filter(Boolean).join('\n');

console.log('# ALLI App wireframes — FUNCTION notes\n');
console.log('Extracted from `ALLI_App_Wireframe.fig` by `tools/wireframes/notes.js`. One block per screen.\n');
for (const n of m.nodeChanges) {
  if (n.type === 'FRAME' && /^Notes/.test(n.name)) {
    console.log(`## ${n.name.replace('Notes · ', '')}\n\n${text(n).replace(/^FUNCTION\n/, '')}\n`);
  }
}
