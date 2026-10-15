import fs from 'fs';
import zlib from 'zlib';

/* Minimal CID-PDF text extractor: inflate streams, decode <hex> strings through the
   font's ToUnicode CMap, then rebuild lines from the Tm coordinates. */
const buf = fs.readFileSync(process.argv[2]);
const s = buf.toString('latin1');

function allStreams() {
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    if (end < 0) continue;
    let txt = null;
    try { txt = zlib.inflateSync(buf.slice(start, end)).toString('latin1'); } catch { continue; }
    out.push(txt);
  }
  return out;
}

const fromUtf16Be = (hex) => {
  const b = Buffer.from(hex, 'hex');
  return (b.length % 2 ? b.slice(0, b.length - 1) : b).swap16().toString('utf16le');
};
function parseCMap(txt) {
  const map = new Map();
  for (const blk of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const e of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))
      map.set(parseInt(e[1], 16), fromUtf16Be(e[2]));
  for (const blk of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const e of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(e[1], 16), hi = parseInt(e[2], 16), dst = parseInt(e[3], 16);
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCodePoint(dst + (c - lo)));
    }
  return map;
}

const streams = allStreams();

/* font object number -> cmap, from the objects that carry /ToUnicode */
const cmapByObj = new Map();
for (const m of s.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g)) {
  const ref = m[2].match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
  if (!ref) continue;
  const tgt = s.indexOf(ref[1] + ' 0 obj');
  if (tgt < 0) continue;
  let p = s.indexOf('stream', tgt) + 6;
  if (s[p] === '\r') p++;
  if (s[p] === '\n') p++;
  const en = s.indexOf('endstream', p);
  let txt = null;
  try { txt = zlib.inflateSync(buf.slice(p, en)).toString('latin1'); } catch { continue; }
  if (/beginbfchar|beginbfrange/.test(txt)) cmapByObj.set(Number(m[1]), parseCMap(txt));
}

/* font resource name -> object number (/FT10 10 0 R ...) */
const nameObj = new Map();
for (const m of s.matchAll(/\/(FT\d+)\s+(\d+)\s+0\s+R/g)) nameObj.set(m[1], Number(m[2]));

/* --- decode the page content streams, one array of positioned runs per page --- */
const pages = [];
for (const txt of streams) {
  if (!/<[0-9A-Fa-f]{2,}>\s*Tj|\)\s*Tj|TJ/.test(txt)) continue;
  const runs = [];
  let cur = null, x = 0, y = 0, pending = '';
  const tok = /(\/FT\d+)\s+[\d.]+\s+Tf|([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm|<([0-9A-Fa-f]+)>\s*Tj|\(((?:\\.|[^\\()])*)\)\s*Tj|([-\d.]+) ([-\d.]+) TD|ET/g;
  let m;
  const flush = () => { if (pending) { runs.push({ x, y, t: pending }); pending = ''; } };
  while ((m = tok.exec(txt))) {
    if (m[1]) { cur = cmapByObj.get(nameObj.get(m[1].slice(1))) || cur; continue; }
    if (m[2] !== undefined) { flush(); x = parseFloat(m[6]); y = parseFloat(m[7]); continue; }
    if (m[8] !== undefined || m[9] !== undefined) {
      if (m[8] !== undefined) {
        const bytes = Buffer.from(m[8], 'hex');
        for (let i = 0; i + 1 < bytes.length; i += 2) {
          const code = (bytes[i] << 8) | bytes[i + 1];
          pending += cur ? (cur.get(code) ?? '') : '';
        }
      } else pending += m[9];
      continue;
    }
    if (m[10] !== undefined) continue;    /* TD: same line advance */
    if (m[11]) flush();
  }
  flush();
  if (runs.length) pages.push(runs);
}

/* rebuild lines: same y -> one line, ordered by x */
const out = [];
pages.forEach((runs, pi) => {
  out.push('\n========== PAGE ' + (pi + 1) + ' ==========');
  const ys = [...new Set(runs.map((r) => Math.round(r.y * 10) / 10))].sort((a, b) => b - a);
  for (const y of ys) {
    const line = runs.filter((r) => Math.round(r.y * 10) / 10 === y).sort((a, b) => a.x - b.x).map((r) => r.t).join('');
    if (line.trim()) out.push(line.trim());
  }
});
process.stdout.write(out.join('\n'));
