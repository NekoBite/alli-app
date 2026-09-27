/**
 * Renders every screen frame (and each section) of the wireframe to PNG by translating nodes to
 * absolutely positioned HTML and screenshotting it in Chromium. Frames, rectangles, ellipses,
 * text, strokes, gradients and vector paths are drawn; images and effects are approximated.
 *
 *   node render.js [path/to.fig] [outDir] [namePrefix...]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { load } = require('./fig');

const FIG = process.argv[2] || path.join(__dirname, '../../design/wireframes/ALLI_App_Wireframe.fig');
const OUT = process.argv[3] || path.join(__dirname, 'out');
const WANT = process.argv.slice(4);
const FONT_ROOT = path.join(__dirname, '../../node_modules/@expo-google-fonts');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const { m, K, id } = load(FIG);
const rgba=(c,op=1)=>`rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${((c.a??1)*op).toFixed(3)})`;
function geomPath(blobIdx){const d=m.blobs[blobIdx].bytes;const dv=new DataView(d.buffer,d.byteOffset,d.byteLength);let i=0,s='';const f=()=>{const v=dv.getFloat32(i,true);i+=4;return v.toFixed(2)};
 while(i<d.length){const c=d[i++];if(c===0)s+='Z';else if(c===1)s+=`M${f()} ${f()}`;else if(c===2)s+=`L${f()} ${f()}`;else if(c===3)s+=`Q${f()} ${f()} ${f()} ${f()}`;else if(c===4)s+=`C${f()} ${f()} ${f()} ${f()} ${f()} ${f()}`;else break;}return s;}
function paintCss(p,w,h){if(p.visible===false)return null;const op=p.opacity??1;
 if(p.type==='SOLID')return rgba(p.color,op);
 const stops=p.stops.map(s=>`${rgba(s.color,op)} ${(s.position*100).toFixed(1)}%`).join(',');
 if(p.type==='GRADIENT_LINEAR'){const t=p.transform;// gradient space -> invert approx: direction from matrix
  const a=Math.atan2(-t.m01, t.m00)*180/Math.PI; return `linear-gradient(${(90+a).toFixed(0)}deg,${stops})`;}
 if(p.type==='GRADIENT_RADIAL')return `radial-gradient(closest-side,${stops})`;
 if(p.type==='IMAGE')return '#333';return null;}
function svgPaint(p){if(!p||p.visible===false)return 'none';if(p.type==='SOLID')return rgba(p.color,p.opacity??1);if(p.stops)return rgba(p.stops[0].color,p.opacity??1);return 'none';}
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const fam=f=>({'Space Grotesk':"'Space Grotesk'",'Inter':"'Inter'",'JetBrains Mono':"'JetBrains Mono'"}[f]||f);
function node(n){if(n.visible===false)return '';const t=n.transform||{m02:0,m12:0,m00:1,m01:0,m10:0,m11:1};
 const w=n.size?.x||0,h=n.size?.y||0;let st=`position:absolute;left:0;top:0;width:${w}px;height:${h}px;transform:matrix(${t.m00},${t.m10},${t.m01},${t.m11},${t.m02},${t.m12});transform-origin:0 0;`;
 if(n.opacity!=null&&n.opacity<1)st+=`opacity:${n.opacity};`;
 const fills=(n.fillPaints||[]).map(p=>paintCss(p,w,h)).filter(Boolean);
 const strokes=(n.strokePaints||[]).filter(p=>p.visible!==false);
 let inner='';
 if(n.type==='TEXT'){const c=fills[0]||'#fff';const lh=n.lineHeight?.units==='PERCENT'?n.lineHeight.value/100:n.lineHeight?.units==='PIXELS'?n.lineHeight.value+'px':'normal';
  const ls=n.letterSpacing?.units==='PERCENT'?(n.letterSpacing.value/100)+'em':(n.letterSpacing?.value||0)+'px';
  const wt=/Bold/.test(n.fontName?.style)?700:/Semi/.test(n.fontName?.style)?600:/Medium/.test(n.fontName?.style)?500:400;
  const ta=(n.textAlignHorizontal||'LEFT').toLowerCase();
  st+=`color:${c};font-family:${fam(n.fontName?.family)};font-size:${n.fontSize}px;font-weight:${wt};line-height:${lh};letter-spacing:${ls};text-align:${ta==='justified'?'justify':ta};white-space:pre-wrap;${n.textAutoResize==='WIDTH_AND_HEIGHT'?'white-space:pre;':''}`;
  if(n.textCase==='UPPER')st+='text-transform:uppercase;';
  return `<div style="${st}">${esc(n.textData?.characters||'')}</div>`;}
 const geo=(n.type==='VECTOR'||n.type==='ELLIPSE'&&n.arcData&&(n.arcData.endingAngle-n.arcData.startingAngle<6.28||n.arcData.innerRadius>0));
 if(geo){let s=`<svg width="${w}" height="${h}" style="position:absolute;overflow:visible">`;
  for(const g of n.fillGeometry||[])s+=`<path d="${geomPath(g.commandsBlob)}" fill="${svgPaint((n.fillPaints||[])[0])}" fill-rule="${g.windingRule==='ODD'?'evenodd':'nonzero'}"/>`;
  for(const g of n.strokeGeometry||[])s+=`<path d="${geomPath(g.commandsBlob)}" fill="${svgPaint(strokes[0])}"/>`;
  return `<div style="${st}">${s}</svg></div>`;}
 if(fills.length)st+=`background:${fills.reverse().join(',')};`;
 const r=n.type==='ELLIPSE'?'50%':(n.rectangleCornerRadiiIndependent?`${n.rectangleTopLeftCornerRadius||0}px ${n.rectangleTopRightCornerRadius||0}px ${n.rectangleBottomRightCornerRadius||0}px ${n.rectangleBottomLeftCornerRadius||0}px`:(n.cornerRadius||0)+'px');
 st+=`border-radius:${r};`;
 if(strokes.length&&n.strokeWeight){const sw=n.strokeWeight;const col=svgPaint(strokes[0]);
  if(n.borderStrokeWeightsIndependent)st+=`box-shadow:${[['borderTopWeight',`0 ${-0}px`],].map(()=>'').join('')}none;border-top:${n.borderTopWeight||0}px solid ${col};border-bottom:${n.borderBottomWeight||0}px solid ${col};border-left:${n.borderLeftWeight||0}px solid ${col};border-right:${n.borderRightWeight||0}px solid ${col};box-sizing:border-box;`;
  else st+=`outline:${sw}px ${n.dashPattern?.length?'dashed':'solid'} ${col};outline-offset:${n.strokeAlign==='OUTSIDE'?0:n.strokeAlign==='CENTER'?-sw/2:-sw}px;`;}
 for(const e of n.effects||[]){if(e.visible===false)continue;if(e.type==='DROP_SHADOW')st+=`box-shadow:${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread||0}px ${rgba(e.color)};`;if(e.type==='LAYER_BLUR'||e.type==='FOREGROUND_BLUR')st+=`filter:blur(${e.radius/2}px);`;if(e.type==='BACKGROUND_BLUR')st+=`backdrop-filter:blur(${e.radius/2}px);`}
 if(n.type==='FRAME'&&!n.frameMaskDisabled)st+='overflow:hidden;';
 for(const c of K[id(n.guid)]||[])inner+=node(c);
 return `<div style="${st}">${inner}</div>`;}
const FACES = [
  ['Inter', 'inter', [[400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold']]],
  ['Space Grotesk', 'space-grotesk', [[500, 'Medium'], [600, 'SemiBold'], [700, 'Bold']]],
  ['JetBrains Mono', 'jetbrains-mono', [[400, 'Regular'], [500, 'Medium'], [700, 'Bold']]],
];
const fonts = `<style>${FACES.flatMap(([family, dir, weights]) =>
  weights.map(([w, name]) => {
    const file = `${family.replace(/ /g, '')}_${w}${name}`;
    return `@font-face{font-family:'${family}';font-weight:${w};src:url(file://${FONT_ROOT}/${dir}/${w}${name}/${file}.ttf)}`;
  }),
).join('')}</style>`;

function html(n) {
  const w = n.size.x, h = n.size.y;
  const t = { ...n, transform: { m00: 1, m01: 0, m10: 0, m11: 1, m02: 0, m12: 0 } };
  return `<html><head>${fonts}</head><body style="margin:0;background:#120a08;width:${w}px;height:${h}px;position:relative">${node(t)}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const tmp = path.join(OUT, '.frame.html');
  for (const n of m.nodeChanges) {
    if (n.type !== 'SECTION' && !(n.type === 'FRAME' && /^\d/.test(n.name))) continue;
    if (WANT.length && !WANT.some((w) => n.name.startsWith(w))) continue;
    await page.setViewportSize({ width: Math.ceil(n.size.x), height: Math.ceil(n.size.y) });
    fs.writeFileSync(tmp, html(n));
    await page.goto('file://' + tmp);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, n.name.replace(/[^\w.·-]+/g, '_') + '.png') });
  }
  fs.rmSync(tmp, { force: true });
  await browser.close();
})();
