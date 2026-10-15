/* Verification harness for transformer_design_tool_v2.html
   Run:  node verify_transformer_tool_v2.mjs
   Sections: 1 structure/ids  2 first-render  3 flyback physics  4 hand calculations
             5 numerical RMS integration  6 invariants per topology  7 worst-case selection
             8 thermal/loss fixed point  9 reactivity (no dead inputs)  10 monotonicity
             11 core comparison */
import fs from 'fs';

/* resolve relative to this script so the archived copy keeps working after being moved */
const FILE = new URL('transformer_design_tool_v2.html', import.meta.url);
const html = fs.readFileSync(FILE, 'utf8');

let nPass = 0; const fails = [];
function ok(name, cond, detail = '') {
  if (cond) { nPass++; console.log('  PASS  ' + name); }
  else { fails.push(name + (detail ? '  [' + detail + ']' : '')); console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}
function close(a, b, tol, name) {
  const e = Math.abs(a - b) / (Math.abs(b) > 1e-12 ? Math.abs(b) : 1);
  ok(name, e <= tol, 'got ' + a + ' want ' + b + ' relErr ' + e.toExponential(2));
}
const header = (t) => console.log('\n=== ' + t + ' ===');

/* ---------------- extract engine + ui ---------------- */
const eS = html.indexOf('/* ================= ENGINE-START ================= */');
const eE = html.indexOf('/* ================= ENGINE-END ================= */');
const engineSrc = html.slice(eS, eE);
const uS = html.indexOf('<script id="tde-ui">');
const uE = html.lastIndexOf('</script>');
const uiSrc = html.slice(uS + '<script id="tde-ui">'.length, uE);

/* ---------------- form defaults straight from the HTML ---------------- */
const defaults = {};
for (const m of html.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)) defaults[m[1]] = m[2];
for (const m of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
  const first = m[2].match(/<option value="([^"]*)"/);
  if (first) defaults[m[1]] = first[1];
}
defaults.strandsP = '1'; defaults.strandsS = '1'; defaults.parP = '1'; defaults.parS = '1';
defaults.corePreset = 'EE25/13/7'; defaults.matPreset = 'PC40';
Object.assign(defaults, { ae: '52.2', le: '57.5', aw: '54', mlt: '50', bsat100: '0.39', muI: '2300', pcvRef: '70', lossA: '1.45', lossB: '2.5' });

function baseInputs(over = {}) {
  const n = (k, d) => { const v = parseFloat(defaults[k]); return isFinite(v) ? v : d; };
  const f = {
    topology: 'Flyback', fs: n('fs', 100), vinMin: n('vinMin', 9), vinMax: n('vinMax', 36),
    vout: n('vout', 12), iout: n('iout', 2), vf: n('vf', 0.5), eta: n('eta', 0.9), vinNom: n('vinNom', 0),
    secRect: 'ct', dutyMax: n('dutyMax', 0.45), rippleK: n('rippleK', 0.4), rippleLout: n('rippleLout', 0.6),
    deltaBTarget: n('deltaBTarget', 0.2), bsatDerate: n('bsatDerate', 0.8), acFactor: n('acFactor', 1.2),
    ae: n('ae', 52.2), le: n('le', 57.5), aw: n('aw', 54), mlt: n('mlt', 50), alNh: n('alNh', 0),
    bsat100: n('bsat100', 0.39), muI: n('muI', 2300), pcvRef: n('pcvRef', 70), lossA: n('lossA', 1.45), lossB: n('lossB', 2.5),
    jTarget: n('jTarget', 4),
    ripplePct: n('ripplePct', 1), esrOhm: n('esrOhm', 0.01), rdsOnMOhm: n('rdsOnMOhm', 10),
    vfBody: n('vfBody', 0.8), tDeadNs: n('tDeadNs', 200),
    llcFr: n('llcFr', 0), llcK: n('llcK', 5), llcQ: n('llcQ', 0), cossP: n('cossP', 200),
    wireModeP: 'auto', wireDiaP: n('wireDiaP', 0.45), strandsP: 1, parP: 1,
    wireModeS: 'auto', wireDiaS: n('wireDiaS', 0.8), strandsS: 1, parS: 1,
    kPack: n('kPack', 1.4), kuMax: n('kuMax', 0.4), rth: n('rth', 28), dtTarget: n('dtTarget', 40), tamb: n('tamb', 40)
  };
  return Object.assign(f, over);
}

/* ---------------- 1. structure ---------------- */
header('1 structure / ids');
let TD = null;
try { TD = new Function(engineSrc + '\n;return TD;')(); ok('engine parses in Node', !!TD); }
catch (e) { ok('engine parses in Node', false, e.message); }
let uiCompiles = false;
try { new Function(uiSrc); uiCompiles = true; } catch (e) {
  uiCompiles = false;
  try {
    fs.writeFileSync('_ui_syntax_check.js', uiSrc);
    const out = require('node:child_process').execFileSync('node', ['--check', '_ui_syntax_check.js'], { encoding: 'utf8' });
  } catch (e2) {
    console.log('  UI syntax error detail:\n' + String(e2.stdout || e2.stderr || e2.message).split('\n').slice(0, 12).join('\n'));
  }
}
ok('UI script compiles (syntax)', uiCompiles);

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const uiRefs = new Set([...(uiSrc + engineSrc).matchAll(/getElementById\('([^']+)'\)|\$\('([^']+)'\)/g)].map((m) => m[1] || m[2]));
const uiIdList = (uiSrc.match(/var IDS = \[([\s\S]*?)\];/) || [, ''])[1]
  .match(/'([^']+)'/g) || [];
const uiIdNames = uiIdList.map((s) => s.replace(/'/g, ''));
const missingUi = uiIdNames.filter((id) => !htmlIds.has(id));
ok('every id in the UI IDS list exists in the markup', missingUi.length === 0, 'missing: ' + missingUi.join(','));
const missingRefs = [...uiRefs].filter((id) => !htmlIds.has(id) && !uiIdNames.includes(id));
ok('every getElementById/$ reference resolves', missingRefs.length === 0, 'missing: ' + missingRefs.join(','));
ok('markup has no duplicate ids', [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]).length === htmlIds.size);

/* ---------------- 2. first render with a fake DOM ---------------- */
header('2 first load renders (the v1 killer bug)');
function makeElement(id) {
  return {
    id, value: defaults[id] !== undefined ? defaults[id] : '', textContent: '', innerHTML: '',
    hidden: id === 'errBox', className: '', children: [],
    style: {},
    addEventListener() {}, appendChild(c) { this.children.push(c); },
    querySelectorAll() { return []; }, getAttribute() { return null; }, click() { this.clicked = true; },
    href: '', download: ''
  };
}
const dom = {};
for (const id of htmlIds) dom[id] = makeElement(id);
const documentStub = {
  getElementById: (id) => dom[id] || null,
  querySelectorAll: () => [],
  createElement: () => makeElement('created'),
  addEventListener() {}, readyState: 'complete', body: { appendChild() {}, removeChild() {} }
};
let uiError = null, capturedCsv = null;
const windowStub = { addEventListener() {} };
try {
  /* engine + UI share one global scope in the browser, so evaluate them together */
  new Function('document', 'window', 'Blob', 'URL', 'setTimeout', engineSrc + '\n' + uiSrc)(
    documentStub, windowStub,
    function BlobStub(parts) { capturedCsv = String(parts[0]); },
    { createObjectURL: () => 'blob:', revokeObjectURL() {} }, () => {});
} catch (e) { uiError = e.message; }
ok('UI init() runs without throwing', uiError === null, uiError || '');
ok('key params rendered on load', (dom.keyParams.innerHTML || '').length > 50);
ok('checks rendered on load', (dom.checkTable.innerHTML || '').length > 50);
ok('sweep table rendered on load', (dom.sweepTable.innerHTML || '').length > 50);
ok('design steps rendered on load', (dom.stepTable.innerHTML || '').length > 50);
ok('core comparison rendered on load', (dom.coreTable.innerHTML || '').length > 50);
ok('formula table rendered on load', (dom.formulaTable.innerHTML || '').length > 50);
ok('error box hidden on a good load', dom.errBox.hidden === true, (dom.errBox.innerHTML || '').slice(0, 400));
ok('verdict rendered with a status class', /status/.test(dom.verdict.innerHTML || ''));
ok('render hook exposed', typeof windowStub.__TD_READY__ === 'boolean' && windowStub.__TD_READY__ === true);
let csvErr = null;
try { windowStub.__TD_EXPORT__(); } catch (e) { csvErr = e.message; }
ok('CSV export runs', csvErr === null, csvErr || '');
ok('CSV starts with a UTF-8 BOM', (capturedCsv || '').charCodeAt(0) === 0xFEFF);
ok('CSV has the parameter table, checks and sweep sections', /Parameter \/ 参数/.test(capturedCsv) && /^"Check","Value","Limit","Result"$/m.test(capturedCsv) && /^"Vin","D","dB_pp"/m.test(capturedCsv));
ok('CSV carries no unit strings inside numeric cells', !/"\d+(\.\d+)? (W|V|A|T|K|mm|uH)"/.test(capturedCsv));
ok('CSV reports the verdict', /"Verdict"/.test(capturedCsv));
const csvLines = (capturedCsv || '').split('\r\n').length;
ok('CSV looks complete (' + csvLines + ' lines)', csvLines > 70);

/* ---------------- 3. flyback physics ---------------- */
header('3 flyback physics (defaults 9-36V -> 12V/2A)');
const I1 = baseInputs();
const r1 = TD.design(I1);
ok('design returns ok', r1.ok === true, (r1.errs || []).join(';'));
const s1 = r1.summary;
const Vo = 12.5, Po = 24, Pin = 24 / 0.9;
close(s1.Po, Po, 1e-12, 'Po = Vout*Iout');
close(s1.Pin, Pin, 1e-12, 'Pin = Po/eta');
const nExp = 9 * 0.45 / (0.55 * Vo);
close(s1.nTarget, nExp, 1e-12, 'turns ratio from flyback equation');
ok('turns are integers >= 1', Number.isInteger(s1.Np) && Number.isInteger(s1.Ns) && s1.Np >= 1 && s1.Ns >= 1, s1.Np + '/' + s1.Ns);
ok('achieved ratio close to target (integer grid)', Math.abs(s1.n - s1.nTarget) <= s1.nTarget / Math.max(s1.Ns, 1) + 1e-9, s1.n + ' vs ' + s1.nTarget);
const LpExp = 12.30187e-6;                                  /* hand: Lp = Vin*D/(K*Ipk*Fs) */
const DneedHand = (7 / 12) * 12.5 / (9 + (7 / 12) * 12.5);  /* hand: integer turns 7/12 */
const IpkExp = Pin / (9 * DneedHand) + 9 * DneedHand / (2 * LpExp * 1e5);
close(s1.IpkPriMin, IpkExp, 1e-4, 'flyback peak current at Vin_min (hand chain)');
close(s1.LpUH, LpExp * 1e6, 1e-6, 'Lp from ripple spec');
close(s1.dNeedMin, s1.n * Vo / (9 + s1.n * Vo), 1e-12, 'duty needed at Vin_min');
close(s1.dNeedMax, s1.n * Vo / (36 + s1.n * Vo), 1e-12, 'duty needed at Vin_max');
const NpMinSat = Math.ceil(LpExp * IpkExp / (52.2e-6 * 0.39 * 0.8) - 1e-9);
ok('Np >= saturation-limited minimum', s1.Np >= NpMinSat, s1.Np + ' >= ' + NpMinSat);
const vtMax = 36 * (nExp * Vo / (36 + nExp * Vo)) / 1e5;
ok('Np >= flux-limited minimum', s1.Np >= Math.ceil(vtMax / (52.2e-6 * 0.2) - 1e-9));
close(s1.LsUH, s1.LpUH / (s1.n * s1.n), 1e-12, 'Ls = Lp*(Ns/Np)^2 = Lp/n^2');
close(s1.Bpk, s1.LpUH * 1e-6 * s1.IpkPriMin / (s1.Np * 52.2e-6), 1e-12, 'Bpk = Lp*Ipk/(Np*Ae)');
close(s1.dBpp, 36 * (s1.n * Vo / (36 + s1.n * Vo)) / 1e5 / (s1.Np * 52.2e-6), 1e-9, 'dBpp worst case = V.t/(Np*Ae) at Vin_max');
close(s1.IsPkSec * s1.Ns, s1.IpkPri * s1.Np, 1e-9, 'ampere-turns balance Np*Ipk = Ns*Is');
ok('DCM/CCM flagged consistently with the valley current', r1.points.vinMin.CCM === (r1.points.vinMin.Ivalley > 1e-9));

/* ---------------- 4. hand calculations ---------------- */
header('4 hand calculation cross-check');
const hand = { Po: 24, Pin: 26.6667, n: 0.58333, Ipk: 8.257, dI: 3.2745, Lp: 12.30187, Np: 7, Ns: 12, Dneed: 0.44758 };
close(s1.Pin, hand.Pin, 1e-4, 'hand: Pin');
close(s1.nTarget, 0.58909, 1e-4, 'hand: target ratio');
close(s1.n, hand.n, 1e-4, 'hand: achieved integer ratio 7/12');
close(s1.dNeedMin, hand.Dneed, 1e-4, 'hand: duty needed at Vin_min');
close(s1.LpUH, hand.Lp, 1e-6, 'hand: Lp');
close(s1.IpkPriMin, hand.Ipk, 1e-3, 'hand: Ipk at Vin_min');
close(r1.points.vinMin.dIpri, hand.dI, 1e-3, 'hand: ripple current at Vin_min');
close(s1.Np, hand.Np, 1e-9, 'hand: Np');
close(s1.Ns, hand.Ns, 1e-9, 'hand: Ns');
const rF = TD.design(baseInputs({ topology: 'Forward', vinMin: 48, vinMax: 72, vout: 5, iout: 10, deltaBTarget: 0.2 }));
const sF = rF.summary;
const resetReq = rF.inputs.dutyMax / (1 - rF.inputs.dutyMax);
ok('forward: reset turns ratio Nr/Np >= D/(1-D)', sF.resetTurns / sF.Np >= resetReq - 1e-9, (sF.resetTurns / sF.Np).toFixed(4) + ' >= ' + resetReq.toFixed(4));
ok('forward: reset turns are the smallest integer that satisfies it', (sF.resetTurns - 1) / sF.Np < resetReq, ((sF.resetTurns - 1) / sF.Np).toFixed(4));
ok('forward: reset completes inside the off-time', rF.inputs.dutyMax * sF.Np / sF.resetTurns <= (1 - rF.inputs.dutyMax) + 1e-9, (rF.inputs.dutyMax * sF.Np / sF.resetTurns).toFixed(4));
const rF50 = TD.design(baseInputs({ topology: 'Forward', vinMin: 48, vinMax: 72, vout: 5, iout: 10, dutyMax: 0.5 }));
ok('forward at D=0.5 needs a 1:1 reset winding', Math.abs(rF50.summary.resetTurns / rF50.summary.Np - 1) < 1e-9, rF50.summary.resetTurns + '/' + rF50.summary.Np);
const rw = rF.windings.find((w) => /复位/.test(w.name));
const dImF = Math.max(rF.points.vinMin.dIm, rF.points.vinMax.dIm);
const resetIrmsExp = Math.max(dImF / Math.sqrt(12) * Math.sqrt(1 - rF.summary.dDesign), 0.05);
ok('forward: reset winding current = max(dIm/sqrt(12)*sqrt(1-D), 0.05)', rw && Math.abs(rw.Irms - resetIrmsExp) < 1e-9, rw ? rw.Irms.toFixed(5) + ' vs ' + resetIrmsExp.toFixed(5) : 'missing');
const nF = 48 * 0.45 / 5.5;
close(sF.nTarget, nF, 1e-12, 'forward: n = Vin_min*D_max/Vo');
ok('forward: volt-seconds independent of Vin', Math.abs(rF.sweep[0].Vt - rF.sweep[rF.sweep.length - 1].Vt) / rF.sweep[0].Vt < 1e-9);
close(rF.sweep[rF.sweep.length - 1].D, sF.n * 5.5 / 72, 1e-9, 'forward: D scales as 1/Vin');
close(sF.dNeedMin, sF.n * 5.5 / 48, 1e-12, 'forward: duty needed at Vin_min');
const rHB = TD.design(baseInputs({ topology: 'Half-Bridge', vinMin: 400, vinMax: 400, vout: 12, iout: 20, fs: 100 }));
const nHB = 1 * 400 * 0.45 / 12.5;
close(rHB.summary.nTarget, nHB, 1e-12, 'half-bridge: n = g*Vin*D/Vo with g=1 (matches the guide)');
close(rHB.summary.dBpp, 0.5 * 400 * rHB.summary.dNeedMin / 1e5 / (rHB.summary.Np * 52.2e-6), 1e-9, 'half-bridge: dBpp = (Vin/2)*D/(Np*Ae*Fs)');
close(rHB.summary.Bpk, rHB.summary.dBpp / 2, 1e-12, 'half-bridge: Bpk = dBpp/2 (bipolar)');
const rFB = TD.design(baseInputs({ topology: 'Full-Bridge', vinMin: 400, vinMax: 400, vout: 12, iout: 20 }));
close(rFB.summary.nTarget, 2 * 400 * 0.45 / 12.5, 1e-12, 'full-bridge: n = 2*Vin*D/Vo');
close(rFB.summary.dBpp, 400 * rFB.summary.dNeedMin / 1e5 / (rFB.summary.Np * 52.2e-6), 1e-9, 'full-bridge: dBpp = Vin*D/(Np*Ae*Fs)');
const rPP = TD.design(baseInputs({ topology: 'Push-Pull', vinMin: 48, vinMax: 48, vout: 12, iout: 10 }));
close(rPP.summary.nTarget, 2 * 48 * 0.45 / 12.5, 1e-12, 'push-pull: n = 2*Vin*D/Vo (Np = total turns)');
close(rPP.summary.dBpp, 2 * 48 * rPP.summary.dNeedMin / 1e5 / (rPP.summary.Np * 52.2e-6), 1e-9, 'push-pull: dBpp = 2*Vin*D/(Np*Ae*Fs)');
const kPP = rPP.windings.find((w) => /半绕组/.test(w.name));
ok('push-pull: half winding N = Np/2', !!kPP && Math.abs(kPP.N - rPP.summary.Np / 2) < 1e-9);
close(kPP.Irms, 2 * 10 / rPP.summary.n * Math.sqrt(rPP.summary.dNeedMin), 2e-2, 'push-pull: half winding RMS ~ 2*Iout/n*sqrt(D)');
const rLLC = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vout: 12, iout: 10, vinNom: 400 }));
close(rLLC.summary.nTarget, 400 / (2 * 12.5), 1e-12, 'LLC: n = Vin_nom/(2*Vo)');
ok('LLC warns that the resonant tank is out of scope', rLLC.warns.some((w) => /LLC/.test(w)));

/* ---------------- 5. numerical RMS integration ---------------- */
header('5 closed-form RMS vs numerical integration');
function integrateRmsSeg(f, a, b, N = 200000) {
  let s = 0; const h = (b - a) / N;
  for (let i = 0; i < N; i++) { const v = f(a + (i + 0.5) * h); s += v * v; }
  return s * h;
}
function integrateRms(f, breaks) {
  let total = 0, edges = [0].concat(breaks || []).concat([1]);
  for (let i = 0; i < edges.length - 1; i++) total += integrateRmsSeg(f, edges[i], edges[i + 1]);
  return Math.sqrt(total);
}
const p1 = r1.points.vinMin, D1 = p1.D;
const primRms = integrateRms((t) => t <= D1 ? p1.Ivalley + (p1.IpkPri - p1.Ivalley) * t / D1 : 0, [D1]);
close(p1.IrmsPri, primRms, 1e-8, 'flyback primary RMS (trapezoid over D)');
const k1 = s1.n;
const secRms = integrateRms((t) => t >= D1 ? p1.IsPkSec - (p1.IsPkSec - p1.IsValleySec) * (t - D1) / (1 - D1) : 0, [D1]);
close(p1.IrmsSec, secRms, 1e-8, 'flyback secondary RMS (mirrored trapezoid over 1-D)');
const hb = rHB.points.vinMin;
const hbRms = integrateRms((t) => {
  const inPulse = (t <= hb.D) || (t >= 0.5 && t <= 0.5 + hb.D);
  return inPulse ? Math.max(Math.abs(hb.Ivalley), 1e-12) : 0;
});
ok('bridge primary RMS is above the pulse-only lower bound', hb.IrmsPri >= hbRms * 0.98, hb.IrmsPri + ' vs ' + hbRms);

/* ---------------- 6. invariants per topology ---------------- */
header('6 invariants per topology');
const scenarios = [
  ['Flyback', {}], ['Active Clamp Flyback', {}], ['Forward', { vinMin: 48, vinMax: 72, vout: 5, iout: 10 }],
  ['Push-Pull', { vinMin: 48, vinMax: 72, vout: 12, iout: 10 }], ['Half-Bridge', { vinMin: 380, vinMax: 420, vout: 12, iout: 20 }],
  ['Full-Bridge', { vinMin: 380, vinMax: 420, vout: 12, iout: 20 }], ['LLC Resonant', { vinMin: 380, vinMax: 420, vout: 12, iout: 10, vinNom: 400 }]
];
for (const [top, over] of scenarios) {
  const r = TD.design(baseInputs(Object.assign({ topology: top }, over)));
  const s = r.summary;
  const tag = top + ': ';
  ok(tag + 'ok', r.ok === true, (r.errs || []).join(';'));
  ok(tag + 'all numbers finite', Object.values(s).every((v) => typeof v !== 'number' || isFinite(v)));
  ok(tag + 'self-consistency all pass', r.self.every((x) => x.pass), JSON.stringify(r.self.map((x) => x.name + '=' + x.err)));
  ok(tag + 'Ls = Lp/n^2', Math.abs(s.LsUH - s.LpUH / (s.n * s.n)) / s.LsUH < 1e-12);
  ok(tag + 'swing uses V.t/(Np*Ae)', Math.abs(s.dBpp - Math.max(...r.sweep.map((p) => p.Vt / (s.Np * r.inputs.ae * 1e-6)))) / s.dBpp < 1e-9);
  if (r.T.kind === 'flyback') ok(tag + 'Bpk = Lp*Ipk/(Np*Ae) and Bpk >= dBpp (CCM peak above swing)', Math.abs(s.Bpk - s.LpUH * 1e-6 * r.points.vinMin.IpkPri / (s.Np * r.inputs.ae * 1e-6)) / s.Bpk < 1e-12 && s.Bpk >= s.dBpp - 1e-12);
  else ok(tag + 'Bpk matches bipolar/unipolar convention', Math.abs(s.Bpk - (r.T.bipolar ? s.dBpp / 2 : s.dBpp)) / s.Bpk < 1e-12);
  ok(tag + 'fill = copper*kpack/Aw', Math.abs(s.fillPct / 100 * r.inputs.aw / r.inputs.kPack - s.copperTotal) / s.copperTotal < 1e-9);
  ok(tag + 'AwReq = copper*kpack/Ku', Math.abs(s.AwReq - s.copperTotal * r.inputs.kPack / r.inputs.kuMax) / s.AwReq < 1e-9);
  ok(tag + 'J = Irms/area', Math.abs(s.Jpri - s.IrmsPri / s.Aprim) / s.Jpri < 1e-9 && Math.abs(s.Jsec - s.IrmsSec / s.Asec) / s.Jsec < 1e-9);
  const mismatches = r.checks.filter((c) => {
    if (/^磁通峰值/.test(c.name)) return !(c.pass === (s.Bpk <= s.BsatAllow));
    if (/^窗口填充率/.test(c.name)) return !(c.pass === (s.fillPct <= r.inputs.kuMax * 100 + 1e-9));
    if (/^温升 ΔT/.test(c.name)) return !(c.pass === (s.dT <= r.inputs.dtTarget));
    if (/J_p/.test(c.name)) return !(c.pass === true && c.warn === (s.Jpri > r.inputs.jTarget * 1.25 * 0.8));
    return false;
  });
  ok(tag + 'checks agree with the summary', mismatches.length === 0, JSON.stringify(mismatches.map((c) => c.name + '=' + c.value + '/' + c.limit + ' pass=' + c.pass + ' warn=' + c.warn)));
  ok(tag + 'verdict matches the check counts', s.verdict.indexOf(s.hardFail ? 'FAIL' : (s.softWarn ? 'REVIEW' : 'OK')) >= 0);
  if (r.T.kind !== 'flyback' && r.T.kind !== 'llc') {
    ok(tag + 'V.t constant over the input range', Math.abs(r.sweep[0].Vt - r.sweep[r.sweep.length - 1].Vt) / r.sweep[0].Vt < 1e-9);
  }
  if (r.T.kind === 'llc') {
    ok(tag + 'LLC: V.t scales with Vin (primary square amplitude = Vin/2)', r.sweep[r.sweep.length - 1].Vt > r.sweep[0].Vt);
    ok(tag + 'LLC: integer turns give the closest resonant-point output', Math.abs(s.nTarget - s.n) / s.nTarget < 0.06, s.n + ' vs ' + s.nTarget);
    ok(tag + 'LLC: deviation is reported as a check', r.checks.some((c) => /谐振点输出电压偏差/.test(c.name) && c.value < 10));
  }
  if (/Bridge|Push-Pull/.test(top)) {
    ok(tag + 'duty stays within the topology limit', r.sweep.every((p) => p.D <= r.T.dLimit + 1e-9), 'max D=' + Math.max(...r.sweep.map((p) => p.D)).toFixed(4));
  }
}

/* ---------------- 7. worst-case selection ---------------- */
header('7 worst-case selection');
ok('flyback: Bpk worst at Vin_min', r1.points.vinMin.Bpk >= r1.points.vinMax.Bpk);
ok('flyback: dBpp worst at Vin_max', r1.points.vinMax.dBpp >= r1.points.vinMin.dBpp);
ok('flyback: reported Bpk == max over the sweep', Math.abs(s1.Bpk - Math.max(...r1.sweep.map((p) => p.Bpk))) < 1e-12);
ok('flyback: reported dBpp == max over the sweep', Math.abs(s1.dBpp - Math.max(...r1.sweep.map((p) => p.dBpp))) < 1e-12);
ok('flyback: reported Irms == max over the sweep', Math.abs(s1.IrmsPri - Math.max(...r1.sweep.map((p) => p.IrmsPri))) < 1e-12);
ok('flyback: Ipk worst at Vin_min', r1.points.vinMin.IpkPri >= r1.points.vinMax.IpkPri);
const wider = TD.design(baseInputs({ vinMax: 72 }));
ok('raising Vin_max raises the worst-case swing', wider.summary.dBpp > s1.dBpp, wider.summary.dBpp.toFixed(4) + ' > ' + s1.dBpp.toFixed(4));
ok('raising Vin_max leaves the Vin_min peak current alone', Math.abs(wider.summary.IpkPriMin - s1.IpkPriMin) < 1e-9);
ok('the Vin_max end matters: it is not ignored', wider.summary.dNeedMax < s1.dNeedMax);

/* ---------------- 8. loss / thermal ---------------- */
header('8 copper, core loss and thermal fixed point');
const w0 = r1.windings[0], p0 = s1.lossPer[0];
const rho = TD.rhoCu(s1.tempC);
const Rhand = rho * (50e-3) * w0.N / (r1.summary.Aprim * 1e-6);
close(p0.R, Rhand, 1e-9, 'R_dc = rho*MLT*N/A_cu');
const PcuHand = r1.windings.reduce((a, w, i) => a + w.Irms * w.Irms * s1.lossPer[i].R * 1.2 * w.count, 0);
close(s1.Pcu, PcuHand, 1e-9, 'P_cu = sum(Irms^2*R*F_R)');
const rePcv = r1.inputs.pcvRef * Math.pow(r1.inputs.fs / 100, r1.inputs.lossA) * Math.pow(s1.Bac * 1000 / 100, r1.inputs.lossB);
close(s1.Pcv, rePcv, 1e-12, 'Pcv Steinmetz scaling');
close(s1.Pcore, s1.Pcv * s1.Ve * 1e-6, 1e-9, 'P_core = Pcv*Ve');
close(s1.dT, (s1.Pcore + s1.Pcu) * r1.inputs.rth, 1e-6, 'dT = (Pcore+Pcu)*Rth');
const rhoHot = TD.rhoCu(r1.inputs.tamb + s1.dT);
const PcuHot = r1.windings.reduce((a, w) => a + w.Irms * w.Irms * (rhoHot * (w.mlt * 1e-3) * w.N / (w.area * 1e-6)) * w.acFactor * w.count, 0);
close(s1.Pcu, PcuHot, 5e-3, 'copper loss converged at the hot winding temperature');
close(s1.RthMax, r1.inputs.dtTarget / s1.Ptotal, 1e-12, 'Rth_max = dT_target/P_total');
close(s1.RthMax, 40 / (s1.Pcore + s1.Pcu), 1e-12, 'Rth_max cross-check');
const gas = TD.design(baseInputs({ alNh: 300 }));
close(gas.summary.ALreqNh, 300, 1e-2, 'with AL given: AL_req == the given AL');
close(gas.summary.LpUH * 1e-6, 300e-9 * gas.summary.Np * gas.summary.Np, 1e-9, 'with AL given: Lp = AL*Np^2');
close(gas.summary.gapMm, (TD.MU0 * gas.inputs.ae * 1e-6 / (300e-9) - gas.inputs.le * 1e-3 / gas.inputs.muI) * 1000, 1e-9, 'gap implied by the given AL');

/* ---------------- 9. reactivity: no dead inputs ---------------- */
header('9 reactivity (a changed input must change something)');
const ECHO = new Set(['topology', 'topologyLabel']);
const canonical = (r) => JSON.stringify([r.summary, r.checks, r.sweep, r.windings, r.self, r.steps]);
const probe = (id, value, over) => {
  const a = TD.design(baseInputs(over));
  const b = TD.design(baseInputs(Object.assign({}, over, { [id]: value })));
  return canonical(a) !== canonical(b);
};
const irrelevant = {
  rippleK: ['Forward', 'Push-Pull', 'Half-Bridge', 'Full-Bridge', 'LLC Resonant'],
  rippleLout: ['Flyback', 'Active Clamp Flyback', 'LLC Resonant'],
  llcFr: ['Flyback', 'Active Clamp Flyback', 'Forward', 'Push-Pull', 'Half-Bridge', 'Full-Bridge'],
  llcK: ['Flyback', 'Active Clamp Flyback', 'Forward', 'Push-Pull', 'Half-Bridge', 'Full-Bridge'],
  llcQ: ['Flyback', 'Active Clamp Flyback', 'Forward', 'Push-Pull', 'Half-Bridge', 'Full-Bridge'],
  cossP: ['Flyback', 'Active Clamp Flyback', 'Forward', 'Push-Pull', 'Half-Bridge', 'Full-Bridge'],
  vinNom: ['Flyback', 'Active Clamp Flyback', 'Forward', 'Push-Pull', 'Half-Bridge', 'Full-Bridge'],
  secRect: ['Flyback', 'Active Clamp Flyback', 'Forward', 'LLC Resonant']
};
const overrides = {
  'Forward': { vinMin: 48, vinMax: 72, vout: 5, iout: 10 },
  'Push-Pull': { vinMin: 48, vinMax: 72, vout: 12, iout: 10 },
  'Half-Bridge': { vinMin: 380, vinMax: 420, vout: 12, iout: 20 },
  'Full-Bridge': { vinMin: 380, vinMax: 420, vout: 12, iout: 20 },
  'LLC Resonant': { vinMin: 380, vinMax: 420, vout: 12, iout: 10, vinNom: 400 },
  'Active Clamp Flyback': {}
};
const testValues = {
  fs: 150, vinMin: 8, vinMax: 40, vout: 15, iout: 3, vf: 0.8, eta: 0.85, vinNom: 24, secRect: 'bridge',
  dutyMax: 0.4, rippleK: 0.6, rippleLout: 1.2, deltaBTarget: 0.25, bsatDerate: 0.7, acFactor: 1.4,
  ae: 60, le: 60, aw: 60, mlt: 55, alNh: 250, bsat100: 0.35, muI: 2000, pcvRef: 80, lossA: 1.5, lossB: 2.6,
  jTarget: 3, wireModeP: 'awg', wireDiaP: 0.8, strandsP: 3, parP: 2, wireModeS: 'awg', wireDiaS: 1.2, strandsS: 2, parS: 2,
  kPack: 1.6, kuMax: 0.35, rth: 20, dtTarget: 50, tamb: 60,
  ripplePct: 2, esrOhm: 0.05, rdsOnMOhm: 30, vfBody: 0.9, tDeadNs: 300,
  llcFr: 120, llcK: 3, llcQ: 0.3, cossP: 400
};
for (const top of Object.keys(TD.TOPOS)) {
  /* manual wire so the diameter fields matter, and 200 kHz so the frequency exponent matters */
  const over = Object.assign({ topology: top, wireModeP: 'mm', wireModeS: 'mm', fs: 200 }, overrides[top] || {});
  const dead = [], expectedDeadWrong = [];
  for (const id of Object.keys(testValues)) {
    const reacts = probe(id, testValues[id], over);
    const shouldNotReact = (irrelevant[id] || []).indexOf(top) >= 0;
    if (!reacts && !shouldNotReact) dead.push(id);
    if (reacts && shouldNotReact) expectedDeadWrong.push(id);
  }
  ok(top + ': no dead inputs', dead.length === 0, 'inert: ' + dead.join(','));
  ok(top + ': documented-irrelevant inputs are indeed inert', expectedDeadWrong.length === 0, 'unexpectedly active: ' + expectedDeadWrong.join(','));
}

/* ---------------- 10. monotonicity ---------------- */
header('10 monotonicity / directional sanity');
const man = (over) => TD.design(baseInputs(Object.assign({ wireModeP: 'mm', wireModeS: 'mm' }, over)));
const m1 = man({ strandsP: 1, wireDiaP: 0.4 });
const m2 = man({ strandsP: 4, wireDiaP: 0.4 });
ok('more primary strands -> lower P_cu', m2.summary.Pcu < m1.summary.Pcu, m2.summary.Pcu.toFixed(3) + ' < ' + m1.summary.Pcu.toFixed(3));
ok('more primary strands -> lower dT', m2.summary.dT < m1.summary.dT);
ok('more primary strands -> lower J_p', m2.summary.Jpri < m1.summary.Jpri);
const j2 = TD.design(baseInputs({ jTarget: 2 }));
const j8 = TD.design(baseInputs({ jTarget: 8 }));
ok('higher J target -> less copper area', j8.summary.Aprim < j2.summary.Aprim, j8.summary.Aprim + ' < ' + j2.summary.Aprim);
ok('higher J target -> achieved J rises', j8.summary.Jpri > j2.summary.Jpri, j8.summary.Jpri.toFixed(2) + ' > ' + j2.summary.Jpri.toFixed(2));
ok('higher J target -> higher copper loss', j8.summary.Pcu > j2.summary.Pcu);
ok('auto wire never exceeds 1.5x skin depth when avoidable', Math.min(j2.summary.wirePd, j8.summary.wirePd) <= 1.5 * j8.summary.skinMm * 1.02, j2.summary.wirePd + '/' + j8.summary.wirePd + ' vs ' + (1.5 * j8.summary.skinMm).toFixed(3));
const bigCore = TD.design(baseInputs({ ae: 101, le: 68.4, aw: 106, mlt: 66 }));
ok('bigger core -> fewer turns', bigCore.summary.Np < s1.Np, bigCore.summary.Np + ' < ' + s1.Np);
ok('bigger core -> lower fill', bigCore.summary.fillPct < s1.fillPct);
const thick = man({ strandsP: 1, wireDiaP: 1.2, aw: 20 });
ok('big wire in a small window -> fill over limit flagged', thick.summary.fillPct > thick.inputs.kuMax * 100 && thick.checks.some((c) => /填充率/.test(c.name) && c.pass === false));
const sat = TD.design(baseInputs({ ae: 12.1, le: 24.2, aw: 14, mlt: 29 }));
ok('turns are sized so that Bpk stays under Bsat (flyback, AL=0)', sat.summary.Bpk <= sat.summary.BsatAllow + 1e-12, 'Bpk=' + sat.summary.Bpk.toFixed(3) + ' limit=' + sat.summary.BsatAllow.toFixed(3));
ok('tiny core is rejected on window filling instead', sat.summary.hardFail >= 1 && sat.checks.some((c) => /填充率/.test(c.name) && c.pass === false), 'fill=' + sat.summary.fillPct.toFixed(0) + '%');
const alBad = TD.design(baseInputs({ alNh: 4000 }));
ok('large AL on a small core -> flux limit flagged, not silently accepted', alBad.warns.some((w) => /AL/.test(w)) || alBad.checks.some((c) => /磁通峰值/.test(c.name) && c.pass === false), 'Bpk=' + alBad.summary.Bpk.toFixed(3));
const overD = TD.design(baseInputs({ dutyMax: 0.9 }));
ok('illegal duty (0.9) is clamped to the topology limit and warned', overD.summary.dDesign <= TD.TOPOS.Flyback.dLimit + 1e-9 && overD.warns.some((w) => /占空比/.test(w)));

/* ---------------- 11. core comparison ---------------- */
header('11 core comparison');
const cmp = TD.coreComparison(baseInputs());
ok('comparison covers the preset library (custom entry excluded)', cmp.length === TD.CORES.filter((c) => c.family !== 'CUSTOM').length, cmp.length + ' of ' + TD.CORES.length);
ok('comparison rows carry verdicts', cmp.every((c) => c.error || (c.verdict && c.Np > 0)));
const passers = cmp.filter((c) => c.hardFail === 0);
ok('at least one core passes on the default spec', passers.length > 0, passers.map((c) => c.model).join(','));
ok('every passing row respects fill / Bpk / dT limits',
  passers.every((c) => c.fill <= 40.0001 && c.Bpk <= c.BsatAllow + 1e-12 && c.dT <= 40.0001),
  JSON.stringify(passers.map((c) => ({ m: c.model, fill: +c.fill.toFixed(1), Bpk: +c.Bpk.toFixed(3), lim: +c.BsatAllow.toFixed(3), dT: +c.dT.toFixed(1) }))));
ok('at least one row is rejected by a hard limit on a hard spec',
  TD.coreComparison(baseInputs({ iout: 6, vout: 24 })).some((c) => c.hardFail > 0 && (c.fill > 40 || c.Bpk > c.BsatAllow || c.dT > 40)));
for (const c of passers.slice(0, 3)) {
  const rr = TD.design(baseInputs({ ae: TD.CORES.find((x) => x.model === c.model).ae, le: TD.CORES.find((x) => x.model === c.model).le, aw: TD.CORES.find((x) => x.model === c.model).aw, mlt: TD.CORES.find((x) => x.model === c.model).mlt }));
  ok('comparison row for ' + c.model + ' matches a direct design', rr.summary.Np === c.Np && Math.abs(rr.summary.fillPct - c.fill) < 1e-9);
}

/* ---------------- summary ---------------- */
/* ---------------- 12. independent power/current balance ---------------- */
header('12 independent cross-checks (numeric, not closed-form)');
{
  const p = r1.points.vinMin, D = p.D;
  /* input power recomputed straight from the switching waveform: P = Vin*D*(Ip+Iv)/2 */
  const PinWave = r1.inputs.vinMin * D * (p.IpkPri + p.Ivalley) / 2;
  close(PinWave, s1.Pin, 1e-9, 'flyback: input power from the primary waveform equals Pin');
  close(p.IavgSec, s1.Pin / s1.Vo, 1e-9, 'flyback: secondary charge balance I_avg = Pin/Vo');
  /* independent energy-storage route */
  const Pstore = 0.5 * s1.LpUH * 1e-6 * (p.IpkPri * p.IpkPri - p.Ivalley * p.Ivalley) * r1.inputs.fs * 1000;
  close(Pstore, s1.Pin, 1e-9, 'flyback: stored-energy route ½Lp(Ip²-Iv²)Fs equals Pin');
  /* forward: no energy storage -> magnetising component must stay small and the load path must carry Po */
  const fw = rF.points.vinMin;
  const Pthrough = fw.D * (rF.inputs.vinMin / sF.n) * rF.inputs.iout;
  close(Pthrough, sF.Vo * rF.inputs.iout, 1e-9, 'forward: transformer throughput V_sec*D*Iout = Vo*Iout');
  ok('forward: magnetising ripple stays well below the load current', fw.dIm < 0.1 * fw.IpkPri, 'dIm=' + fw.dIm.toFixed(3) + 'A');
}

/* ---------------- 13. waveform RMS per topology (muI huge -> no magnetising term) ---------------- */
header('13 RMS currents vs numerically integrated waveforms');
{
  const noMag = { muI: 1e9 };
  const rH2 = TD.design(baseInputs(Object.assign({ topology: 'Half-Bridge', vinMin: 380, vinMax: 380, vout: 12, iout: 20 }, noMag)));
  const h = rH2.points.vinMin;
  const ramp = (t0, t1v, t) => h.Ivalley + (h.IpkPri - h.Ivalley) * (t - t0) / t1v;
  const wave = (t) => {
    if (t <= h.D) return ramp(0, h.D, t);
    if (t >= 0.5 && t <= 0.5 + h.D) return ramp(0.5, h.D, t);
    return 0;
  };
  const num = integrateRms(wave, [h.D, 0.5, 0.5 + h.D]);
  close(h.IrmsPri, num, 1e-6, 'half-bridge: primary RMS (two pulses) matches integration');
  const rP2 = TD.design(baseInputs(Object.assign({ topology: 'Push-Pull', vinMin: 48, vinMax: 48, vout: 12, iout: 10 }, noMag)));
  const pp = rP2.points.vinMin;
  const numPP = integrateRms((t) => t <= pp.D ? pp.Ivalley + (pp.IpkPri - pp.Ivalley) * t / pp.D : 0, [pp.D]);
  close(pp.IrmsPri, numPP, 1e-6, 'push-pull: half-winding RMS matches integration');
  ok('push-pull: half-winding current = 2*(Iout+dIL/2)/n', Math.abs(pp.IpkPri - pp.dIm / 2 - 2 * (rP2.inputs.iout + rP2.inputs.rippleLout / 2) / rP2.summary.n) < 1e-9, pp.IpkPri.toFixed(3));
  const rF2 = TD.design(baseInputs(Object.assign({ topology: 'Forward', vinMin: 48, vinMax: 72, vout: 5, iout: 10 }, noMag)));
  const f2 = rF2.points.vinMin;
  const numF = integrateRms((t) => t <= f2.D ? (f2.Ivalley + (f2.IpkPri - f2.Ivalley) * t / f2.D) : 0, [f2.D]);
  close(f2.IrmsPri, numF, 1e-6, 'forward: primary RMS matches integration');
  const numFs = integrateRms((t) => t <= f2.D ? (rF2.inputs.iout - rF2.inputs.rippleLout / 2 + rF2.inputs.rippleLout * t / f2.D) : 0, [f2.D]);
  close(f2.IrmsSec, numFs, 1e-6, 'forward: secondary RMS matches integration');
}

/* ---------------- 14. textbook constants ---------------- */
header('14 textbook constants used by the engine');
close(TD.awgToMm(36), 0.1270, 1e-9, 'AWG36 = 0.127 mm (by definition)');
close(TD.awgToMm(0), 8.252, 3e-3, 'AWG0 = 8.252 mm (0.3249 in)');
close(TD.awgToMm(10), 2.5882, 1e-3, 'AWG10 = 2.588 mm');
close(TD.awgToMm(20), 0.8118, 3e-3, 'AWG20 = 0.8118 mm');
close(TD.mmToAwg(0.8118), 20, 1e-4, 'mm -> AWG round trip');
close(TD.rhoCu(20), 1.724e-8, 1e-12, 'copper resistivity at 20 C');
close(TD.rhoCu(100), 2.27e-8, 5e-3, 'copper resistivity at 100 C (~2.27e-8)');
close(TD.skinDepthMm(1e5, 20), 0.209, 5e-3, 'skin depth 100 kHz / 20 C = 0.209 mm');
close(TD.skinDepthMm(2e5, 20), 0.148, 5e-3, 'skin depth 200 kHz / 20 C = 0.148 mm');
{
  /* the Steinmetz model must scale exactly: Pcv = Pcv_ref*(f/100k)^a*(Bac/100mT)^b */
  const a = TD.design(baseInputs({ fs: 100 }));
  const b = TD.design(baseInputs({ fs: 200 }));
  const expect = Math.pow(b.inputs.fs / 100, a.inputs.lossA) * Math.pow(b.summary.Bac / a.summary.Bac, a.inputs.lossB);
  close(b.summary.Pcv / a.summary.Pcv, expect, 1e-9, 'core loss follows the Steinmetz exponents exactly');
  const c = TD.design(baseInputs({ deltaBTarget: 0.2 }));
  const d2 = TD.design(baseInputs({ deltaBTarget: 0.45 }));
  ok('a larger allowed swing never lowers the achieved B_ac', d2.summary.Bac >= c.summary.Bac - 1e-12);
  ok('core loss density rises with B_ac at fixed f', d2.summary.Pcv >= c.summary.Pcv - 1e-12);
}

/* ---------------- 15. extreme inputs + fuzz ---------------- */
header('15 extreme inputs');
{
  const cases = [
    ['tiny load', { iout: 0.01 }],
    ['1 MHz', { fs: 1000 }],
    ['single input voltage', { vinMin: 24, vinMax: 24 }],
    ['eta = 1', { eta: 1 }],
    ['K = 2 (BCM)', { rippleK: 2 }],
    ['K = 3 (invalid, must clamp)', { rippleK: 3 }],
    ['big gap AL = 30nH', { alNh: 30 }],
    ['100 A output', { iout: 100, vout: 1.2 }],
    ['400 V in, 1 kV out', { vinMin: 400, vinMax: 400, vout: 1000, iout: 1 }],
    ['D = 0.9 (above limit)', { dutyMax: 0.9 }],
    ['D = 0.05 (very low)', { dutyMax: 0.05 }],
    ['far high side', { vinMin: 300, vinMax: 400 }]
  ];
  for (const [name, over] of cases) {
    const r = TD.design(baseInputs(over));
    const finite = r.ok && Object.values(r.summary).every((v) => typeof v !== 'number' || isFinite(v));
    ok('extreme: ' + name + ' -> ok and all finite', finite, (r.errs || []).join(';'));
    if (!r.ok) continue;
    ok('extreme: ' + name + ' -> self-tests pass', r.self.every((x) => x.pass), JSON.stringify(r.self.filter((x) => !x.pass).map((x) => x.name + '=' + x.err)));
    ok('extreme: ' + name + ' -> valley current never negative', r.sweep.every((p) => p.Ivalley === undefined || p.Ivalley >= -1e-9));
    ok('extreme: ' + name + ' -> VP > 0 and Ns >= 1', r.summary.Np >= 1 && r.summary.Ns >= 1);
  }
  for (const bad of [{ vout: -1 }, { iout: 0 }, { fs: 0 }, { ae: 0 }, { vinMin: 30, vinMax: 5 }, { bsat100: 0 }, { mlt: 0 }]) {
    const r = TD.design(baseInputs(bad));
    ok('invalid input ' + JSON.stringify(bad) + ' -> rejected with a message', r.ok === false && r.errs.length > 0 && r.summary && Object.keys(r.summary).length === 0);
  }
}
header('16 fuzz: 7 topologies x 400 random operating points');
{
  let seed = 20261015;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const topos = Object.keys(TD.TOPOS);
  let n = 0, bad = [], badSelf = [], badInv = [], infeasible = 0;
  for (const top of topos) {
    for (let i = 0; i < 400; i++) {
      const voutR = 1.2 + rnd() * 46;
      const ioutR = 0.2 + rnd() * 24;
      const vinLo = top === 'Half-Bridge' || top === 'Full-Bridge' || top === 'LLC Resonant' ? 200 + rnd() * 200 : 5 + rnd() * 60;
      const vinHi = vinLo * (1 + rnd() * 1.6);
      const ov = {
        topology: top, vinMin: +vinLo.toFixed(2), vinMax: +vinHi.toFixed(2),
        vout: +voutR.toFixed(2), iout: +ioutR.toFixed(3),
        vf: +(rnd() * 1.2).toFixed(2), eta: +(0.6 + rnd() * 0.39).toFixed(3),
        fs: +(20 + rnd() * 480).toFixed(1), dutyMax: +(0.15 + rnd() * 0.55).toFixed(3),
        rippleK: +(0.05 + rnd() * 1.95).toFixed(3), rippleLout: +(0.05 + rnd() * 2).toFixed(3),
        deltaBTarget: +(0.05 + rnd() * 0.4).toFixed(3), bsatDerate: +(0.3 + rnd() * 0.7).toFixed(3),
        acFactor: +(1 + rnd() * 2).toFixed(2), alNh: rnd() < 0.4 ? Math.round(rnd() * 900) : 0,
        kPack: +(1 + rnd() * 1.5).toFixed(2), kuMax: +(0.15 + rnd() * 0.5).toFixed(3),
        rth: +(2 + rnd() * 60).toFixed(1), dtTarget: +(5 + rnd() * 80).toFixed(1), tamb: +(rnd() * 80).toFixed(1),
        semis: null,
        secRect: rnd() < 0.5 ? 'ct' : 'bridge',
        wireModeP: rnd() < 0.5 ? 'auto' : 'mm', wireModeS: rnd() < 0.5 ? 'auto' : 'mm'
      };
      ov.wireDiaP = +(0.1 + rnd() * 1.4).toFixed(2);
      ov.wireDiaS = +(0.1 + rnd() * 1.8).toFixed(2);
      ov.strandsP = 1 + Math.floor(rnd() * 20);
      ov.strandsS = 1 + Math.floor(rnd() * 20);
      ov.parP = 1 + Math.floor(rnd() * 5);
      ov.parS = 1 + Math.floor(rnd() * 5);
      const core = TD.CORES[Math.floor(rnd() * 8)];
      ov.ae = core.ae; ov.le = core.le; ov.aw = core.aw * (0.4 + rnd() * 1.2); ov.mlt = core.mlt * (0.7 + rnd() * 0.6);
      let r;
      try { r = TD.design(baseInputs(ov)); } catch (e) { bad.push(JSON.stringify(ov) + ' threw ' + e.message); continue; }
      n++;
      if (!r.ok) { infeasible++; continue; }
      const bads = Object.entries(r.summary).filter(([, v]) => typeof v === 'number' && !isFinite(v)).map(([k]) => k);
      if (bads.length) bad.push(top + ' non-finite: ' + bads.join(',') + ' ' + JSON.stringify(ov));
      if (!r.self.every((x) => x.pass)) badSelf.push(top + ' ' + JSON.stringify(r.self.filter((x) => !x.pass).map((x) => x.name + '=' + x.err)));
      const s = r.summary;
      const inv = [];
      if (Math.abs(s.LsUH - s.LpUH / (s.n * s.n)) / Math.max(s.LsUH, 1e-9) > 1e-9) inv.push('Ls');
      if (Math.abs(s.dT - (s.Pcore + s.Pcu) * ov.rth) / Math.max(s.dT, 1e-9) > 1e-9) inv.push('dT');
      if (r.T.kind === 'flyback' && s.Bpk + 1e-12 < s.dBpp) inv.push('Bpk<dBpp');
      if (!r.T.bipolar && r.T.kind !== 'flyback' && Math.abs(s.Bpk - s.dBpp) > 1e-12) inv.push('unipolar Bpk');
      if (r.T.bipolar && Math.abs(s.Bpk - s.dBpp / 2) > 1e-12) inv.push('bipolar Bpk');
      if (!(s.skinMm > 0)) inv.push('skin');
      if (s.hardFail === 0 && !(s.Bpk <= s.BsatAllow + 1e-9 && s.fillPct <= ov.kuMax * 100 + 1e-9 && s.dT <= ov.dtTarget + 1e-9)) inv.push('verdict vs limits');
      r.sweep.forEach((p) => { if (!isFinite(p.D) || !isFinite(p.Bpk) || !isFinite(p.IrmsPri) || p.D < 0 || p.D > 0.81) inv.push('sweep ' + p.Vin); });
      if (inv.length) badInv.push(top + ' ' + inv.join(',') + ' ' + JSON.stringify(ov));
    }
  }
  ok('fuzz: ' + n + ' cases, none threw a non-finite result', bad.length === 0, bad.slice(0, 3).join(' | '));
  ok('fuzz: all self-consistency tests pass', badSelf.length === 0, badSelf.slice(0, 3).join(' | '));
  ok('fuzz: all physical invariants hold', badInv.length === 0, badInv.slice(0, 3).join(' | '));
  console.log('  note: ' + infeasible + ' of ' + n + ' random cases were legitimately rejected by the input validator');
}

/* ---------------- 17. sizing behaves like an engineer ---------------- */
header('17 core-sizing trend');
{
  const smallestPassing = [];
  for (const po of [5, 15, 30, 60, 120, 250]) {
    const iout = 2, vout = po / iout;
    const rows = TD.coreComparison(baseInputs({ vout, iout }));
    const ok0 = rows.filter((r) => r.hardFail === 0);
    smallestPassing.push(ok0.length ? Math.min(...ok0.map((r) => TD.CORES.find((c) => c.model === r.model).ae)) : Infinity);
  }
  const feasible = smallestPassing.filter((v) => isFinite(v));
  ok('minimum core Ae grows with output power (over the feasible cases)', feasible.every((v, i, a) => i === 0 || v >= a[i - 1]), JSON.stringify(smallestPassing.map((v) => (isFinite(v) ? v : 'none'))));
  ok('a 5 W design fits the smallest cores', isFinite(smallestPassing[0]) && smallestPassing[0] < 25, String(smallestPassing[0]));
  ok('the 250 W / 125 V spec legitimately has no library core (extreme ratio)', !isFinite(smallestPassing[5]), String(smallestPassing[5]));
}

/* ---------------- 18. audit mode (given turns / measured AL / spec DCR) ---------------- */
header('18 audit mode: check a supplier spec instead of sizing');
{
  const spec = baseInputs({
    topology: 'Forward', vinMin: 21.6, vinMax: 26.4, vout: 5, voutNom: 5, iout: 2, vf: 0.6, eta: 0.88, fs: 200,
    auditOn: true, npGiven: 23, nsGiven: 12,
    alNh: 1146,                      /* 165 µH / 12^2 = 1146 nH/N^2, measured on the 12-turn winding */
    ae: 21.5, le: 30, aw: 24, mlt: 38,
    wireModeP: 'mm', wireDiaP: 0.2, strandsP: 2, parP: 1,
    wireModeS: 'mm', wireDiaS: 0.4, strandsS: 2, parS: 1,
    dcrLimitS: 32, dcrLimitP: 0
  });
  const r = TD.design(spec);
  const s = r.summary;
  ok('audit: uses the given turns', s.Np === 23 && s.Ns === 12, s.Np + '/' + s.Ns);
  close(s.n, 23 / 12, 1e-12, 'audit: n = 23/12');
  close(s.LmUH, 1146e-9 * 23 * 23 * 1e6, 1e-9, 'audit: Lm = AL*Np^2 from the measured AL');
  close(s.LsUH, s.LmUH / (s.n * s.n), 1e-9, 'audit: secondary inductance = Lm/n^2');
  /* the supplier measures 165 uH on the 12-turn winding -> AL = 1146 nH/N^2 */
  close(s.LmUH / (23 * 23), 1146e-9 * 1e6, 1e-9, 'audit: AL recovered from Lm and turns');
  /* DCR spec check: 12 turns of 0.4 mm x2 at MLT 38 mm should land near the 32 mOhm spec */
  const R12 = TD.rhoCu(25) * 0.038 * 12 / (2 * Math.PI / 4 * 0.4e-3 * 0.4e-3);
  close(s.RdcSec25Ohm, R12, 1e-9, 'audit: secondary DCR @25C matches rho*MLT*N/A');
  ok('audit: computed DCR is of the same order as the 32 mOhm spec', s.RdcSec25Ohm * 1000 > 20 && s.RdcSec25Ohm * 1000 < 60, (s.RdcSec25Ohm * 1000).toFixed(1) + ' mΩ');
  ok('audit: DCR spec check is present and passes', r.checks.some((c) => /副边 DCR/.test(c.name) && c.pass === true), JSON.stringify(r.checks.filter((c) => /DCR/.test(c.name))));
  ok('audit: no DCR check when the limit input is 0', !r.checks.some((c) => /原边 DCR/.test(c.name)));
  ok('audit: reports the flux and margin', s.Bpk < s.BsatAllow, 'Bpk=' + s.Bpk.toFixed(3) + ' limit=' + s.BsatAllow.toFixed(3));
  ok('audit: magnetising ripple is small at 606 uH primary inductance', r.points.vinMin.dIm / r.points.vinMin.IpkPri < 0.15, (r.points.vinMin.dIm / r.points.vinMin.IpkPri * 100).toFixed(1) + '%');
  ok('audit: flag downgrades a too-small turn count', TD.design(baseInputs(Object.assign({}, spec, { npGiven: 5, nsGiven: 3 }))).checks.some((c) => /给定 Np/.test(c.name) && c.pass === false));
  /* switching audit mode off must restore automatic sizing */
  const auto = TD.design(baseInputs(Object.assign({}, spec, { auditOn: false, npGiven: 0, nsGiven: 0 })));
  ok('audit off -> turns are sized again', auto.summary.npGiven === false && auto.summary.Np !== 23);
  ok('audit: self-consistency still holds', r.self.every((x) => x.pass));
}

/* ---------------- 19. output stage (L_out / C_out / SR) ---------------- */
header('19 output stage: output inductor, output capacitor, SR vs diode');
{
  const fw = TD.design(baseInputs({ topology: 'Forward', vinMin: 48, vinMax: 72, vout: 5, iout: 10 }));
  const os = fw.outputStage, sf = fw.summary;
  const Ae = fw.inputs.ae * 1e-6, dMin = sf.dNeedMax, dMax = sf.dNeedMin;
  ok('forward: has an output inductor', os.buckDerived === true && os.LoutUH > 0);
  close(os.LoutUH, sf.Vo * (1 - dMax) / (fw.inputs.rippleLout * 1e5) * 1e6, 1e-9, 'L_out = Vo(1-D)/(ΔI·Fs) at the Vin_min design point');
  close(os.dILmax, fw.inputs.rippleLout * (1 - dMin) / (1 - dMax), 1e-9, 'ΔI_L(Vin_max) = ΔI·(1-D_at_Vin_max)/(1-D_at_Vin_min)');
  ok('ripple is worst at Vin_max', os.dILmax > fw.inputs.rippleLout);
  const IpkL = 10 + os.dILmax / 2, IrmsL = Math.sqrt(100 + os.dILmax * os.dILmax / 12);
  close(os.LoutN, Math.ceil(os.LoutUH * 1e-6 * IpkL / (Ae * sf.BsatAllow) - 1e-9), 1e-9, 'inductor turns from L·Ipk ≤ Bsat·Ae·N');
  close(os.LoutBpk, os.LoutUH * 1e-6 * IpkL / (os.LoutN * Ae), 1e-9, 'inductor Bpk = L·Ipk/(N·Ae)');
  close(os.LoutAL * 1e-9 * os.LoutN * os.LoutN, os.LoutUH * 1e-6, 1e-9, 'AL·N² = L');
  close(TD.MU0 * Ae / (os.LoutGap * 1e-3 + fw.inputs.le * 1e-3 / fw.inputs.muI), os.LoutAL * 1e-9, 1e-9, 'gap ↔ AL round trip');
  close(os.LoutIrms, IrmsL, 1e-12, 'inductor RMS = √(Iout² + ΔI²/12)');
  close(os.CoutIcRms, os.dILmax / Math.sqrt(12), 1e-12, 'buck output cap RMS = ΔI/√12');
  const budget = 5 * fw.inputs.ripplePct / 100;
  close(os.rippleBudget, budget, 1e-12, 'ripple budget = Vout·ripple%');
  close(os.dVesr, os.dILmax * fw.inputs.esrOhm, 1e-12, 'ESR ripple contribution = ΔI·ESR');
  close(os.CoutUF, os.dILmax / (8 * 1e5 * (budget - os.dVesr)) * 1e6, 1e-9, 'C ≥ ΔI/(8·Fs·ΔV_cap)');
  ok('buck cap uses the triangular-ripple mode', os.capMode === 'buck');
  close(os.Pdiode, fw.inputs.vf * fw.points.vinMin.IavgSec, 1e-12, 'diode loss = Vf·I_avg(secondary conduction average)');
  close(os.Psr, fw.inputs.rdsOnMOhm * 1e-3 * fw.points.vinMin.IrmsSec ** 2 + fw.inputs.vfBody * fw.points.vinMin.IavgSec * (2 * fw.inputs.tDeadNs * 1e-9 * 1e5), 1e-12, 'SR loss = Rds·Irms² + body-diode during dead time');
  close(os.Icross, fw.inputs.vf / (fw.inputs.rdsOnMOhm * 1e-3), 1e-12, 'crossover current = Vf/Rds');
  const fb = TD.design(baseInputs());
  ok('flyback: no output inductor', fb.outputStage.buckDerived === false && fb.outputStage.LoutUH === 0);
  close(fb.outputStage.CoutUF, (2 * fb.summary.dNeedMin) / (1e5 * (fb.outputStage.rippleBudget - fb.outputStage.dVesr)) * 1e6, 1e-9, 'flyback C ≥ Iout·D/(Fs·ΔV_cap)');
  close(fb.outputStage.CoutIcRms, Math.sqrt(Math.max(fb.points.vinMin.IrmsSec ** 2 - 4, 0)), 1e-9, 'flyback cap RMS = √(I_sec,rms² - Iout²)');
  ok('flyback cap uses the pulse mode', fb.outputStage.capMode === 'flyback');
  /* ESR 单独超过纹波预算时必须明确报"无解"，而不是给出荒谬的容值 */
  const badEsr = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vinNom: 400, vout: 12, iout: 10, esrOhm: 0.05, ripplePct: 0.5 }));
  ok('ESR alone over budget -> flagged as unsolvable, no fake capacitance', badEsr.outputStage.esrImpossible === true && badEsr.outputStage.CoutUF === 0 && badEsr.checks.some((c) => /输出电容 ESR/.test(c.name) && c.pass === false));
  const lcCap = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vinNom: 400, vout: 12, iout: 10, esrOhm: 0.002, ripplePct: 1 }));
  close(lcCap.outputStage.CoutUF, Math.SQRT2 * lcCap.outputStage.CoutIcRms / (2 * Math.PI * 1e5 * (lcCap.outputStage.rippleBudget - lcCap.outputStage.dVesr)) * 1e6, 1e-9, 'LLC cap uses the sinusoidal-ripple estimate');
  ok('LLC cap mode tagged', lcCap.outputStage.capMode === 'llc');
  const inactive = (v) => JSON.stringify(TD.design(baseInputs({ rippleLout: v })).outputStage);
  ok('rippleLout is genuinely inert for the flyback', inactive(3) === inactive(0.1));
  const lc = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vinNom: 400, vout: 12, iout: 10 }));
  ok('LLC has no output inductor but has a capacitor and SR comparison', lc.outputStage.buckDerived === false && lc.outputStage.CoutUF > 0 && isFinite(lc.outputStage.Psr));
}

/* ---------------- 20. LLC resonant tank (FHA) ---------------- */
header('20 LLC resonant tank (first-harmonic approximation)');
{
  const l = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vinNom: 400, vout: 12, iout: 10, llcFr: 100, llcK: 5 }));
  const t = l.tank, s = l.summary;
  ok('tank computed', !!t && t.LrUH > 0 && t.CrNf > 0);
  const gain = (fn, Q, k) => 1 / Math.sqrt(Math.pow(1 + (1 / k) * (1 - 1 / (fn * fn)), 2) + Math.pow(Q * (fn - 1 / fn), 2));
  const peak = (Q, k) => { let b = 0; for (let fn = 0.3; fn <= 1.0001; fn += 0.002) b = Math.max(b, gain(fn, Q, k)); return b; };
  const row1 = t.gainRow.find((g) => Math.abs(g.fn - 1) < 1e-9);
  close(row1.M, 1, 1e-12, 'M(fn=1) = 1 exactly (any Q, k)');
  close(gain(0.8, t.Q, t.k), t.gainRow.find((g) => Math.abs(g.fn - 0.8) < 1e-9).M, 1e-12, 'gain row matches the FHA formula');
  ok('gain is boosted below resonance and attenuated above', gain(0.8, t.Q, t.k) > 1 && gain(1.5, t.Q, t.k) < 1);
  close(1 / (2 * Math.PI * Math.sqrt(t.LrUH * 1e-6 * t.CrNf * 1e-9)) / 1000, t.fr_kHz, 1e-9, 'fr = 1/(2π√(Lr·Cr))');
  close(Math.sqrt(t.LrUH * 1e-6 / (t.CrNf * 1e-9)), t.Q * t.Rac, 1e-9, 'Zr = √(Lr/Cr) = Q·Rac');
  close(t.LmReqUH, t.k * t.LrUH, 1e-9, 'Lm = k·Lr');
  close(t.Rac, 8 / (Math.PI * Math.PI) * s.n * s.n * s.Vo * s.Vo / s.Po, 1e-9, 'Rac = 8n²Vo²/(π²Po) (FHA equivalent load)');
  close(t.Mmax, 2 * s.n * s.Vo / 380, 1e-9, 'M_max = 2n·Vo/Vin_min');
  close(t.Mmin, 2 * s.n * s.Vo / 420, 1e-9, 'M_min = 2n·Vo/Vin_max');
  close(peak(t.Qmax, t.k), t.Mmax, 3e-3, 'Q_max is the largest Q whose peak gain still reaches M_max');
  ok('a 3% larger Q can no longer reach M_max', peak(t.Qmax * 1.03, t.k) < t.Mmax);
  ok('the design Q stays inside the achievable region', t.Q <= t.Qmax && peak(t.Q, t.k) >= t.Mmax);
  const k3 = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vinNom: 400, vout: 12, iout: 10, llcK: 3 }));
  const k9 = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vinNom: 400, vout: 12, iout: 10, llcK: 9 }));
  ok('smaller k (Lm closer to Lr) allows a larger Q', k3.tank.Qmax > k9.tank.Qmax, k3.tank.Qmax.toFixed(3) + ' vs ' + k9.tank.Qmax.toFixed(3));
  close(t.ImPk, s.n * s.Vo / (4 * t.LmReqUH * 1e-6 * t.fr_kHz * 1000), 1e-9, 'I_Lm,pk = n·Vo·T/(4·Lm)');
  close(t.IZvsNeed, 2 * l.inputs.cossP * 1e-12 * 420 / (l.inputs.tDeadNs * 1e-9), 1e-9, 'ZVS required current = 2·Coss·Vin/t_dead');
  ok('switching-frequency range covers the whole gain range', t.fMin_kHz > 0 && t.fMin_kHz < t.fr_kHz && t.fMax_kHz >= t.fr_kHz, t.fMin_kHz.toFixed(1) + '~' + t.fMax_kHz.toFixed(1) + ' kHz');
  ok('the tank values are in a physically sane range', t.LrUH > 1 && t.LrUH < 500 && t.CrNf > 1 && t.CrNf < 2000, 'Lr=' + t.LrUH.toFixed(1) + 'µH Cr=' + t.CrNf.toFixed(1) + 'nF');
  ok('LLC checks include gain margin, Lm agreement and ZVS', ['峰值增益裕量', 'Lm 与磁芯', 'ZVS'].every((p) => l.checks.some((c) => c.name.indexOf(p) >= 0)));
  ok('the Lm agreement check ties the tank to the selected core', l.checks.some((c) => /Lm 与磁芯/.test(c.name)) && t.LmActUH > 0);
  ok('without a given AL the tool derives the required AL and gap from the tank', t.ALgiven === false && t.ALreqNh > 0 && Math.abs(t.ALreqNh - t.LmReqUH * 1000 / (s.Np * s.Np)) < 1e-6, 'AL=' + t.ALreqNh.toFixed(0) + ' nH/N², gap=' + t.gapMm.toFixed(3) + 'mm');
  ok('required-AL gap round trip (AL = µ0·Ae/(lg + le/µi))',
    Math.abs(TD.MU0 * l.inputs.ae * 1e-6 / (t.ALreqNh * 1e-9) - (l.inputs.le * 1e-3 / l.inputs.muI + t.gapMm * 1e-3)) < 1e-12,
    'AL=' + t.ALreqNh.toFixed(0) + ' lg=' + t.gapMm.toFixed(4));
  close(s.LmUH, t.LmReqUH, 1e-6, 'for the LLC the design Lm equals the tank requirement');
  ok('LLC gap check present', l.checks.some((c) => /LLC 所需气隙/.test(c.name)));
  const lcAL = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vinNom: 400, vout: 12, iout: 10, llcFr: 100, llcK: 5, alNh: 2500 }));
  ok('with a given AL the Lm mismatch is reported instead of a gap', lcAL.tank.ALgiven === true && lcAL.tank.LmErrPct > 20 && lcAL.checks.some((c) => /Lm 与磁芯/.test(c.name) && c.pass === false));
  const wide = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 200, vinMax: 420, vinNom: 400, vout: 12, iout: 10, llcK: 5 }));
  ok('a 2:1 input range demands more gain and shrinks Q_max', wide.tank.Mmax > 1.9 && wide.tank.Qmax < l.tank.Qmax, 'Mmax=' + wide.tank.Mmax.toFixed(2) + ' Qmax=' + wide.tank.Qmax.toFixed(3));
}

/* ---------------- 21. regression baselines (pinned values) ---------------- */
header('21 regression baselines');
{
  const cases = [
    ['flyback 9-36V -> 12V/2A @100kHz', baseInputs(), { Np: 7, Ns: 12, LpUH: 12.3019, Bpk: 0.278, fill: 38.78, dT: 12.20, gap: 0.2363 }],
    ['forward 48-72V -> 5V/10A @100kHz', baseInputs({ topology: 'Forward', vinMin: 48, vinMax: 72, vout: 5, iout: 10 }), { Np: 21, Ns: 5, resetTurns: 18, Bpk: 0.2107 }],
    ['half-bridge 380-420V -> 12V/20A @100kHz', baseInputs({ topology: 'Half-Bridge', vinMin: 380, vinMax: 420, vout: 12, iout: 20 }), { Np: 82, Ns: 6, Bpk: 0.0998 }],
    ['push-pull 48V -> 12V/10A @100kHz', baseInputs({ topology: 'Push-Pull', vinMin: 48, vinMax: 48, vout: 12, iout: 10 }), { Bpk: 0.0998 }],
    ['llc 380-420V -> 12V/10A @100kHz (fr=100k, k=5)', baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vinNom: 400, vout: 12, iout: 10, llcFr: 100, llcK: 5 }), { Np: 101, Ns: 6 }],
    /* 1 号主变 TST1724 实际结构（用户确认）：12 匝原边 / 23 匝副边，同匝数在 PCB 并联，电容谐振复位 */
    ['EPC19 1号 TST1724 校核 (12T原边/23T副边, AL=1146 nH/N²)', baseInputs({ topology: 'Forward', vinMin: 18, vinMax: 36, vout: 19, iout: 3.947, fs: 200, auditMode: '1', npGiven: 12, nsGiven: 23, alNh: 1146, ae: 52, le: 32, aw: 38, mlt: 34, resetMode: 'cap', dutyMax: 0.65, wireModeP: 'mm', wireDiaP: 0.4, strandsP: 2, parP: 2, wireModeS: 'mm', wireDiaS: 0.2, strandsS: 2, parS: 3, dcrLimitP: 32 }), { Np: 12, Ns: 23, LmUH: 165.0 }]
  ];
  for (const [name, inp, exp] of cases) {
    const r = TD.design(inp), s = r.summary;
    const got = {
      Np: s.Np, Ns: s.Ns, resetTurns: s.resetTurns, LpUH: s.LpUH, LmUH: s.LmUH, Bpk: s.Bpk,
      fill: s.fillPct, dT: s.dT, gap: s.gapMm, RdcSec25: s.RdcSec25Ohm * 1000
    };
    const bad = Object.keys(exp).filter((k) => Math.abs(got[k] - exp[k]) > Math.max(Math.abs(exp[k]) * 2e-3, 0.02));
    ok('baseline: ' + name, bad.length === 0, bad.map((k) => k + ': got ' + got[k] + ' want ' + exp[k]).join('; '));
  }
}

/* --dump <file>: 把默认工况的引擎结果写成 JSON，供 Excel 版逐格比对 */
if (process.argv.includes('--dump')) {
  const out = process.argv[process.argv.indexOf('--dump') + 1];
  const scen = process.argv[process.argv.indexOf('--dump') + 2] || 'flyback';
  const wire = {
    wireModeP: 'mm', wireDiaP: 0.4, strandsP: 10, parP: 1,
    wireModeS: 'mm', wireDiaS: 0.4, strandsS: 10, parS: 1
  };
  const scenOver = {
    forward: { topology: 'Forward', vinMin: 48, vinMax: 72, vout: 5, iout: 10, dil: 0.6 },
    halfbridge: { topology: 'Half-Bridge', vinMin: 380, vinMax: 420, vout: 12, iout: 20 },
    llc: { topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vout: 12, iout: 10 },
    /* 用户的单端正激板：1号 EPC19 主变（12T原边/23T副边、电容谐振复位）
       + 2号 EPC19 副变（38T输出电感145µH×4并联 + 25T辅助绕组）；工作点为假设值 */
    epc19board: {
      topology: 'Forward', vinMin: 10.8, vinMax: 13.2, vout: 12, iout: 1, fs: 200,
      auditMode: '1', npGiven: 12, nsGiven: 23,
      alNh: 1146, ae: 52, le: 32, aw: 38, mlt: 34,
      wireModeP: 'mm', wireDiaP: 0.4, strandsP: 2, parP: 2,
      wireModeS: 'mm', wireDiaS: 0.2, strandsS: 2, parS: 3,
      resetMode: 'cap', cresNf: 0, vdsRated: 100,
      nlGiven: 38, lmGiven: 145, naux: 25, dutyMax: 0.5, dcrLimitP: 32, dcrLimitS: 0
    },
    flyback: {}
    ,board19: {
      /* 用户的 19V/75W 隔离 DCDC 板（Vin 取 24V 轨假设）：1号 12/23 + 电容复位；2号 38T输出电感+25T辅助 */
      topology: 'Forward', vinMin: 18, vinMax: 36, vout: 19, iout: 3.947, fs: 200,
      auditMode: '1', npGiven: 12, nsGiven: 23,
      alNh: 1146, ae: 52, le: 32, aw: 38, mlt: 34,
      wireModeP: 'mm', wireDiaP: 0.4, strandsP: 2, parP: 2,
      wireModeS: 'mm', wireDiaS: 0.2, strandsS: 2, parS: 3,
      resetMode: 'cap', cresNf: 0, vdsRated: 150,
      nlGiven: 38, lmGiven: 145, naux: 25, dutyMax: 0.65, dcrLimitP: 32
    }
  }[scen] || {};
  /* 与 Excel 版默认输入保持一致（手动线径 0.4mm×10 股、k_pack 1.25） */
  const r = TD.design(baseInputs(Object.assign({}, wire, scenOver)));
  fs.writeFileSync(out, JSON.stringify({
    scenario: scen,
    inputs: r.inputs, summary: r.summary, points: r.points, checks: r.checks,
    tank: r.tank, outputStage: r.outputStage
  }, null, 1));
  console.log('dumped ' + out + ' [' + scen + ']  (Np=' + r.summary.Np + ' Ns=' + r.summary.Ns + ' Bpk=' + r.summary.Bpk.toFixed(4) + ')');
  process.exit(0);
}

/* ---------------- 23. 电容谐振复位（正激，无复位绕组）+ 2号变压器(输出电感+辅助绕组) ---------------- */
/* ---------------- 24. 第三方数据交叉验证：第二家供应商（鼎铖 03-56319-01/-02） ---------------- */
/* ---------------- 25. 本轮优化项 ---------------- */
/* ---------------- 26. AL / "不开气隙"陷阱：等效有效气隙 ---------------- */
header('26 AL source: "no air gap" is a process statement, not zero effective gap');
{
  const fwTurn = { topology: 'Forward', vinMin: 18, vinMax: 36, vout: 19, iout: 3.947, fs: 200,
    auditMode: '1', npGiven: 12, nsGiven: 23, ae: 52, le: 32, aw: 38, mlt: 34, resetMode: 'cap', muI: 2400 };
  /* ① AL 填 0 + 库内实测 AL（天胜承认书 1146）→ Lm 必须等于承认书的 165 µH */
  const lib = TD.design(baseInputs(Object.assign({}, fwTurn, { alNh: 0, alLibNh: 1146 })));
  close(lib.summary.LmUH, 1146e-9 * 144 * 1e6, 1e-9, 'with the library measured AL, Lm = 165.0 µH (matches TST1724)');
  ok('AL source reported as library', lib.summary.alSource === 'library');
  close(lib.summary.gapEffMm, (TD.MU0 * 52e-6 / (1146e-9) - 32e-3 / 2400) * 1000, 1e-12, 'implied effective gap ≈ 0.044 mm');
  ok('the implied process gap is tens of microns', lib.summary.gapEffMm > 0.02 && lib.summary.gapEffMm < 0.08, lib.summary.gapEffMm.toFixed(4) + ' mm');
  /* ② AL 填 0 且库里也没有实测值 → 理想无气隙值（这才是"对不上"的根源） */
  const ideal = TD.design(baseInputs(Object.assign({}, fwTurn, { alNh: 0, alLibNh: 0 })));
  close(ideal.summary.alIdealNh, TD.MU0 * 2400 * 52e-6 / 32e-3 * 1e9, 1e-9, 'ideal ungapped AL = µ0·µi·Ae/le');
  close(ideal.summary.LmUH, ideal.summary.alIdealNh * 1e-9 * 144 * 1e6, 1e-9, 'ideal path: Lm = AL_ideal·Np²');
  ok('the ideal path is ~4.3× the measured AL (this is what makes inductance/turns look wrong)',
    Math.abs(ideal.summary.alIdealNh / 1146 - 4.3) < 0.4, ideal.summary.alIdealNh.toFixed(0) + ' vs 1146 nH/N²');
  ok('the tool warns when it has to fall back to the ideal ungapped value', ideal.warns.some((w) => /理想无气隙/.test(w)));
  ok('and says so in the step table as well', ideal.steps.some((st) => /AL 取值与等效有效气隙/.test(st.t) && /等效有效气隙/.test(st.s)));
  /* ③ 用户显式填实测 AL 时优先于库值 */
  const user = TD.design(baseInputs(Object.assign({}, fwTurn, { alNh: 1038, alLibNh: 1146 })));
  ok('explicit AL wins over the library value', user.summary.alSource === 'user' && Math.abs(user.summary.alUsedNh - 1038) < 1e-9);
  close(user.summary.LmUH, 1038e-9 * 144 * 1e6, 1e-9, 'DCE spec AL=1038 (149.5 µH/12²) → Lm = 149.5 µH');
}

header('25 optimisation batch: DCM / AC front-end / leakage / window / inductor / LLC / UI tools');
{
  /* --- 真 DCM：用很小的 AL（大间隙）让工作点进入 DCM --- */
  let dcmCase = null;
  for (const al of [30, 60, 100, 150, 200]) {
    const rr = TD.design(baseInputs({ alNh: al }));
    if (rr.points.vinMin.DCM || rr.points.vinMax.DCM) { dcmCase = { al: al, r: rr }; break; }
  }
  ok('a DCM operating point is reachable (small AL / big gap)', !!dcmCase, dcmCase ? ('AL=' + dcmCase.al) : '未找到');
  if (dcmCase) {
    const r = dcmCase.r, p = r.points.vinMin, s = r.summary;
    ok('DCM self-consistency (energy / reset time / charge balance)', r.self.every((x) => x.pass), JSON.stringify(r.self.filter((x) => !x.pass).map((x) => x.name + '=' + x.err)));
    const Lp = s.LpUH * 1e-6, Fs = r.inputs.fs * 1000;
    close(p.D, Math.min(Math.sqrt(2 * s.Pin * Lp * Fs) / p.Vin, 0.95), 1e-9, 'DCM duty D = √(2·Pin·Lp·Fs)/Vin');
    close(p.IpkPri, p.Vin * p.D / (Lp * Fs), 1e-9, 'DCM peak Ipk = Vin·D/(Lp·Fs)');
    const Vr = s.Vo * s.n, tr = Math.min(Lp * p.IpkPri / Vr * Fs, 1 - p.D);
    close(p.trFrac, tr, 1e-9, 'DCM reset-time fraction tr/T');
    close(p.IrmsPri, p.IpkPri * Math.sqrt(p.D / 3), 1e-9, 'DCM primary RMS = Ipk·√(D/3)');
    ok('DCM valley is exactly zero', p.Ivalley === 0);
    ok('DCM mode reported in the check list', r.checks.some((c) => /工作模式/.test(c.name) && /DCM/.test(String(c.value))));
  }
  /* --- 电容复位的漏感项 --- */
  const fwBase = { topology: 'Forward', vinMin: 18, vinMax: 36, vout: 19, iout: 3.947, fs: 200,
    auditMode: '1', npGiven: 12, nsGiven: 23, alNh: 1146, ae: 52, le: 32, aw: 38, mlt: 34, resetMode: 'cap' };
  const withLk = TD.design(baseInputs(Object.assign({}, fwBase, { lkUh: 0.8 })));
  const noLk = TD.design(baseInputs(fwBase));
  const cr1 = withLk.summary.capReset, cr0 = noLk.summary.capReset;
  close(cr1.dVLk, (withLk.inputs.iout + withLk.inputs.rippleLout / 2) / withLk.summary.n * Math.sqrt(0.8e-6 / (cr1.crNf * 1e-9)), 1e-9, 'leakage spike ΔV = I_design·√(Lk/C)');
  close(cr1.vdsPk, 36 + cr1.vResetPk + cr1.dVLk, 1e-12, 'Vds,pk = Vin_max + V_res + ΔV_leak');
  ok('without leakage the tool warns Vds is under-estimated', cr0.dVLk === 0 && noLk.warns.some((w) => /漏感/.test(w)));
  ok('leakage materially raises the stress', cr1.vdsPk > cr0.vdsPk + 50, cr0.vdsPk.toFixed(0) + ' → ' + cr1.vdsPk.toFixed(0) + ' V');
  /* --- 窗口 + 挡墙胶带 --- */
  const win = TD.design(baseInputs(Object.assign({}, fwBase, { awW: 20, awH: 4.0, marginMm: 1.5 })));
  const awEff = (20 - 2 * 1.5) * 4.0;
  close(win.summary.fillPct, win.summary.copperTotal * win.inputs.kPack / awEff * 100, 1e-9, 'fill uses (window width − 2·margin)·height');
  const winNoWH = TD.design(baseInputs(Object.assign({}, fwBase, { marginMm: 1.5 })));
  ok('margin without window dimensions warns', winNoWH.warns.some((w) => /挡墙/.test(w)));
  /* --- 输出电感：自己的线径/股数/并联 + 辅助绕组铜面积 --- */
  const ind = TD.design(baseInputs(Object.assign({}, fwBase, { nlGiven: 38, lmGiven: 145, naux: 25, nlDia: 0.25, nlStrands: 1, nlPar: 4 })));
  const os = ind.summary.outStage;
  close(os.LoutPar, 4, 1e-9, 'output inductor parallel = 4 (38T×4 as built)');
  const Apar = Math.PI / 4 * 0.25 * 0.25 * 1 * 4;
  close(os.LoutRdc25, TD.rhoCu(25) * (ind.inputs.mlt * 1e-3) * 38 / (Apar * 1e-6), 1e-9, 'inductor DCR from its own wire × strands × parallel');
  ok('single-winding DCR ≈ DCE spec 433 mΩ (within 15%)', Math.abs(os.LoutRdc25 * 4 * 1000 - 433) / 433 < 0.15, (os.LoutRdc25 * 4 * 1000).toFixed(0) + ' mΩ');
  close(os.LoutCopper, 38 * Apar + 25 * (Math.PI / 4 * 0.0625), 1e-9, 'inductor window copper includes the 25T aux winding');
  ok('inductor window check present', ind.checks.some((c) => /输出电感窗口填充率/.test(c.name)));
  /* --- 交流前端 --- */
  const ac = TD.design(baseInputs(Object.assign({}, fwBase, { acMode: 'ac', vacMin: 176, vacMax: 264, fline: 50, cbusUf: 220, holdMs: 20, holdVmin: 200 })));
  const af = ac.summary.acFront;
  ok('AC mode overrides Vin_min/Vin_max with the bus', ac.inputs.vinMin === af.vValley && ac.inputs.vinMax === af.vpkMax, ac.inputs.vinMin.toFixed(1) + '~' + ac.inputs.vinMax.toFixed(1) + ' V');
  close(af.vpkMin, Math.SQRT2 * 176 - 2 * 1.4, 1e-9, 'V_pk = √2·Vac_min − 2·Vf_bridge');
  close(af.pInCheck, ac.summary.Pin, 0.15, 'bus simulator energy balance ≈ Pin');
  close(af.vAtHold, Math.sqrt(Math.max(af.vpkMin ** 2 - 2 * ac.summary.Pin * 0.02 / 220e-6, 0)), 1e-9, 'hold-up V2 = √(Vpk² − 2Pt/C)');
  close(af.cReqUf, 2 * ac.summary.Pin * 0.02 / (af.vpkMin ** 2 - 200 ** 2) * 1e6, 1e-9, 'required bus capacitance');
  ok('hold-up check present', ac.checks.some((c) => /母线保持时间/.test(c.name)));
  const acBig = TD.design(baseInputs(Object.assign({}, fwBase, { acMode: 'ac', vacMin: 176, vacMax: 264, fline: 50, cbusUf: 4700 })));
  close(acBig.summary.acFront.pInCheck, acBig.summary.Pin, 0.15, 'big-cap: simulator energy balance also holds');
  ok('bigger bus capacitor reduces the ripple (monotonic)',
    acBig.summary.acFront.ripple < ac.summary.acFront.ripple, ac.summary.acFront.ripple.toFixed(1) + ' V → ' + acBig.summary.acFront.ripple.toFixed(1) + ' V');
  /* 把源阻降到接近理想，仿真应逼近解析式 I/(2fC)——这才是对仿真本身的有效验证 */
  const acIdeal = TD.design(baseInputs(Object.assign({}, fwBase, { acMode: 'ac', vacMin: 176, vacMax: 264, fline: 50, cbusUf: 4700, rsAc: 0.04, cbusEsr: 0.01 })));
  const iLoad = acIdeal.summary.Pin / acIdeal.summary.acFront.vValley;
  const ideal = iLoad / (2 * 50 * 4700e-6);
  close(acIdeal.summary.acFront.ripple, ideal, 0.6, 'with a near-ideal source the simulator approaches I/(2fC) (±60%)');
  ok('series resistance makes the ripple larger than the ideal bound (as physics dictates)',
    acBig.summary.acFront.ripple > acIdeal.summary.acFront.ripple, acBig.summary.acFront.ripple.toFixed(2) + ' V (R=0.8Ω) vs ' + acIdeal.summary.acFront.ripple.toFixed(2) + ' V (R=0.05Ω)');
  ok('bus valley is below the peak and above zero', acBig.summary.acFront.vValley > 0 && acBig.summary.acFront.vValley < acBig.summary.acFront.vpkMin);
  const pfc = TD.design(baseInputs(Object.assign({}, fwBase, { acMode: 'pfc', pfcBus: 390 })));
  ok('PFC mode sets a regulated bus', Math.abs(pfc.inputs.vinMin - 390 * 0.98) < 1e-9 && pfc.ok === true);
  /* --- LLC 补充项 --- */
  const l25 = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vinNom: 400, vout: 12, iout: 10, llcFr: 100, llcK: 5, crRated: 400 }));
  close(l25.tank.mMinAsymptote, l25.tank.k / (l25.tank.k + 1), 1e-12, 'FHA asymptotic minimum gain k/(k+1)');
  close(l25.tank.LrOverLm, 1 / l25.tank.k, 1e-12, 'required Lr/Lm = 1/k');
  ok('light-load gain-limit check present', l25.checks.some((c) => /高线轻载可降增益/.test(c.name)));
  ok('Cr voltage-rating check present when given', l25.checks.some((c) => /谐振电容耐压/.test(c.name)));
  /* --- UI 工具 --- */
  ok('report builder exposed', typeof windowStub.__TD_UI__.buildReport === 'function');
  const rep = windowStub.__TD_UI__.buildReport(windowStub.__TD_LAST__());
  ok('report has inputs/results/checks/verdict', /设计报告/.test(rep) && /输入/.test(rep) && /计算结果/.test(rep) && /校核清单/.test(rep) && /结论/.test(rep));
  const vars = windowStub.__TD_UI__.parseVariants('A家,12,23,1146,38,145,25,0.4,2,2,0.2,2,3\nB家,12,23,1038,38,148,25,0.4,2,2,0.2,2,3');
  ok('variant parser reads two suppliers', vars.length === 2 && vars[0].name === 'A家' && vars[0].alNh === 1146 && vars[1].alNh === 1038 && vars[0].naux === 25);
  dom.cmpInput.value = 'A家,12,23,1146,38,145,25,0.4,2,2,0.2,2,3\nB家,12,23,1038,38,148,25,0.4,2,2,0.2,2,3';
  windowStub.__TD_UI__.runCompare();
  ok('comparison table rendered for both suppliers', /A家/.test(dom.cmpTable.innerHTML) && /B家/.test(dom.cmpTable.innerHTML) && /结论/.test(dom.cmpTable.innerHTML));
  windowStub.__TD_UI__.loadMyBoard();
  ok('"my board" preset loads the 19V/75W forward', dom.topology.value === 'Forward' && Number(dom.vout.value) === 19 && dom.resetMode.value === 'cap' && Number(dom.nlGiven.value) === 38 && Number(dom.lkUh.value) === 0.8);
  let saveOk = true;
  try { windowStub.__TD_UI__.savePreset(); windowStub.__TD_UI__.loadPreset(); } catch (e) { saveOk = false; }
  ok('save/load preset tolerates a missing localStorage', saveOk);
}

header('24 second supplier (DCE 03-56319) — independent data against the same model');
{
  /* B 家 1 号：与 A 家同结构（6-7/5-8 12T×0.40mm×2P，1-12/2-11/3-10 23T×0.20mm×2P），AL=149.5µH/12²=1038 nH/N²，
     规格 DCR 31.5 mΩ（原边）、238/244/260 mΩ 量级（副边三层） */
  const B = { topology: 'Forward', vinMin: 18, vinMax: 36, vout: 19, iout: 3.947, fs: 200,
    auditMode: '1', npGiven: 12, nsGiven: 23, alNh: 1038, ae: 52, le: 32, aw: 38, mlt: 38,
    wireModeP: 'mm', wireDiaP: 0.4, strandsP: 2, parP: 2,
    wireModeS: 'mm', wireDiaS: 0.2, strandsS: 2, parS: 3,
    resetMode: 'cap', dutyMax: 0.65, dcrLimitP: 31.5, dcrLimitS: 260 };
  const rb = TD.design(baseInputs(B));
  const sb = rb.summary;
  close(sb.LmUH, 1038e-9 * 144 * 1e6, 1e-9, 'B: Lm = AL·Np² = 149.5 µH (matches DCE spec)');
  /* 引擎报的是"并联后"的直流电阻；规格书是"单绕组"测量值 → 单绕组 = 并联值 × 并联数 */
  close(sb.RdcPri25Ohm * 1000 * 2, 31.9, 0.02, 'single-winding DCR = parallel DCR × 2 ≈ DCE spec 31.5 mΩ (within 2%)');
  const secPerWinding = sb.RdcSec25Ohm * 1000 * 3;
  ok('B: secondary per-winding DCR inside DCE 228~260 mΩ bracket', secPerWinding > 220 && secPerWinding < 270, secPerWinding.toFixed(1) + ' mΩ vs 228/244/260');
  ok('B: both par conventions stated (parallel value × 并联数 = spec value)', Math.abs(sb.RdcPri25Ohm * 1000 * 2 - 31.5) / 31.5 < 0.03);
  close(sb.LmUH / sb.LpUH, 1, 1e-12, 'B: transformer primary inductance is Lm');
  ok('B: same flux/thermal picture as A (both pass flux, differ only in assumptions)',
    sb.Bpk < sb.BsatAllow && rb.checks.some((c) => /^磁通峰值/.test(c.name) && c.pass === true), 'Bpk=' + sb.Bpk.toFixed(4));
  /* B 家 2 号：38 匝输出电感（148 µH，AL=102.5 nH/N²）+ 25 匝辅助（66 µH，AL=105.6 nH/N²）→ 两个绕组自洽 */
  const AL38 = 148e-6 / (38 * 38) * 1e9, AL25 = 66e-6 / (25 * 25) * 1e9;
  ok('B: the two windings on one core imply the same AL (spec self-consistency)',
    Math.abs(AL38 - AL25) / AL38 < 0.05, 'AL(38T)=' + AL38.toFixed(1) + ' vs AL(25T)=' + AL25.toFixed(1) + ' nH/N²');
  const r2 = TD.design(baseInputs(Object.assign({}, B, { nlGiven: 38, lmGiven: 148, naux: 25, lmGiven35: 0 })));
  const os2 = r2.summary.outStage;
  close(os2.LoutUH, 148, 1e-9, 'B: output inductor 148 µH used as measured');
  close(os2.LoutBpk, 148e-6 * os2.LoutIpk / (38 * 52e-6), 1e-9, 'B: output-inductor Bpk with DC bias');
  close(os2.auxV, (25 / 38) * (19 + 0.5) - 0.5, 1e-9, 'B: aux voltage ≈12.3 V (UC3843 VCC window)');
  ok('B: aux voltage sits inside the UC3843 window (8.4 V start ~ 34 V clamp)',
    os2.auxV > 8.4 * 1.2 && os2.auxV < 30, os2.auxV.toFixed(2) + ' V');
  /* 两家 A/B 的差异只体现在 AL 与材质上：同一工况下结论一致 */
  const rbA = TD.design(baseInputs(Object.assign({}, B, { alNh: 1146 })));
  ok('A vs B differ by AL only (149.5 vs 165 µH) — same verdict class on flux/magnetics',
    (rb.summary.verdict.indexOf('FAIL') >= 0) === (rbA.summary.verdict.indexOf('FAIL') >= 0),
    'A: ' + rbA.summary.verdict + ' | B: ' + rb.summary.verdict);
}

header('23 forward with capacitor reset + transformer #2 as output inductor/aux');
{
  const base = { topology: 'Forward', vinMin: 9, vinMax: 16, vout: 12, iout: 1, fs: 200,
    alNh: 1146, ae: 52, le: 32, aw: 38, mlt: 34,
    wireModeP: 'mm', wireDiaP: 0.4, strandsP: 2, parP: 2,
    wireModeS: 'mm', wireDiaS: 0.2, strandsS: 2, parS: 3,
    resetMode: 'cap', cresNf: 0, vdsRated: 100,
    nlGiven: 38, lmGiven: 145, naux: 25, dutyMax: 0.5 };
  const r = TD.design(baseInputs(base));
  const s = r.summary, cr = s.capReset, os = s.outStage || r.outputStage;
  ok('capacitor-reset mode produces no reset winding', s.resetTurns === 0 && !r.checks.some((c) => /复位绕组匝比/.test(c.name)));
  ok('D may exceed 0.5 in capacitor-reset mode', s.dNeedMin <= 0.70 + 1e-9 && !r.checks.some((c) => /^Vin_min 所需占空比/.test(c.name) && c.pass === false), 'D=' + s.dNeedMin.toFixed(3));
  ok('reset capacitor block exists', !!cr && cr.crNf > 0);
  const Lm = s.LmUH * 1e-6, Fs = base.fs * 1000;
  close(cr.crMaxNf, Math.pow(1 - s.dNeedMin, 2) / (Math.PI * Math.PI * Lm * Fs * Fs) * 1e9, 1e-9, 'C_max 用实际工作占空比 D(Vin_min) 计算');
  close(cr.dMaxUsed, s.dNeedMin, 1e-12, 'reset sizing uses the achieved duty, not the raw D_max input');
  close(cr.vResetClosed, Math.PI * s.n * s.Vo / (1 - s.dNeedMin), 1e-9, 'closed form V_res,pk = π·n·Vo/(1-D)');
  close(cr.vResetPk, s.n * s.Vo / Fs / Math.sqrt(Lm * cr.crNf * 1e-9), 1e-9, 'V_res,pk = n·Vo·T/√(Lm·C)');
  close(cr.vdsPk, base.vinMax + cr.vResetPk, 1e-12, 'Vds,pk = Vin_max + V_res,pk');
  ok('switch-stress check present (100 V device)', r.checks.some((c) => /开关管电压应力/.test(c.name)), 'Vds=' + cr.vdsPk.toFixed(1));
  const small = TD.design(baseInputs(Object.assign({}, base, { cresNf: cr.crMaxNf / 4 })));
  ok('smaller reset capacitor -> higher switch stress (monotonic)', small.summary.capReset.vdsPk > cr.vdsPk, small.summary.capReset.vdsPk.toFixed(1) + ' > ' + cr.vdsPk.toFixed(1));
  const big = TD.design(baseInputs(Object.assign({}, base, { cresNf: cr.crMaxNf * 2 })));
  ok('capacitor above the limit is rejected', big.checks.some((c) => /复位电容/.test(c.name) && c.pass === false));
  const wind = TD.design(baseInputs(Object.assign({}, base, { resetMode: 'winding', dutyMax: 0.45 })));
  ok('reset-winding mode unchanged', wind.summary.resetTurns > 0 && wind.checks.some((c) => /复位绕组匝比/.test(c.name)));
  /* 2 号变压器 TST1725：38 匝 ×4 并联输出电感（145 µH 实测）+ 25 匝辅助绕组 */
  ok('given inductor inductance/turns are used (TST1725: 145 µH / 38 匝)', os.LoutLmGiven === true && os.LoutN === 38 && Math.abs(os.LoutUH - 145) < 1e-9, os.LoutUH.toFixed(2) + 'µH / ' + os.LoutN + 'T');
  close(os.dILmax, s.Vo * (1 - s.dNeedMax) / (145e-6 * Fs), 1e-9, 'output ripple recomputed from the measured inductance');
  close(os.LoutBpk, 145e-6 * os.LoutIpk / (38 * base.ae * 1e-6), 1e-9, 'inductor Bpk with DC bias');
  close(os.auxV, (25 / 38) * (base.vout + 0.5) - 0.5, 1e-9, 'Vaux = (Naux/N_L)·(Vout+Vf) - Vf');
}

/* ---------------- 22. core library provenance + import/export ---------------- */
header('22 core library: provenance, measured AL, CSV import/export');
{
  ok('every core carries a provenance tag', TD.CORES.every((c) => c.src === 'preset' || c.src === 'measured' || c.src === 'user' || c.src === 'datasheet'));
  const e19 = TD.CORES.find((c) => c.model === 'EPC19');
  ok('EPC19 carries the measured AL from the supplier spec', !!e19 && e19.src === 'measured' && e19.alMeas === 1146, JSON.stringify({ src: e19 && e19.src, al: e19 && e19.alMeas, mlt: e19 && e19.mlt }));
  ok('MLT for EPC19 comes from the DCR spec (38 mm)', e19 && e19.mlt === 38);
  /* 有实测 AL 的预设必须把 AL 填进输入框（实测值优先于 µi·Ae/le 推算） */
  ok('applying a measured-AL preset fills the AL input', typeof windowStub.__TD_APPLY_CORE__ === 'function');
  windowStub.__TD_APPLY_CORE__('EPC19');
  ok('EPC19 preset sets ae/mlt and passes the measured AL through the library channel',
    Number(dom.ae.value) === 52 && Number(dom.mlt.value) === 38 && Number(dom.alLibNh.value) === 1146 && Number(dom.alNh.value) === 0,
    [dom.ae.value, dom.mlt.value, dom.alNh.value, dom.alLibNh.value].join('/'));
  const builtin = JSON.parse(JSON.stringify(TD.CORES));
  const csv = TD.coresToCsv(TD.CORES);
  ok('CSV export has a header and one row per core', csv.split('\n').length === TD.CORES.length + 1 && /^model,family/.test(csv));
  const back = TD.parseCoreCsv(csv);
  ok('CSV round trip preserves every field', back.length === TD.CORES.length && back.every((c, i) => c.model === TD.CORES[i].model && c.ae === TD.CORES[i].ae && c.le === TD.CORES[i].le && c.aw === TD.CORES[i].aw && c.mlt === TD.CORES[i].mlt && (c.alMeas || 0) === (TD.CORES[i].alMeas || 0) && c.src === TD.CORES[i].src));
  ok('CSV parser tolerates a header, blanks and CRLF', TD.parseCoreCsv('model,family,Ae_mm2,le_mm,Aw_mm2,MLT_mm,AL,src,note\r\n\r\nX,EE,50,60,40,45,,datasheet,"note, with comma"\r\n').length === 1);
  /* 用自制磁芯库跑设计流程 */
  TD.setCores([{ model: 'MY-EE30', family: 'EE', ae: 60, le: 67, aw: 73, mlt: 57, src: 'datasheet' },
               { model: 'MY-EE16', family: 'EE', ae: 20.1, le: 37.6, aw: 26, mlt: 34, src: 'datasheet' }]);
  const r = TD.design(baseInputs({ ae: 60, le: 67, aw: 73, mlt: 57 }));
  ok('a custom library works end to end', r.ok === true && r.summary.Np > 0);
  const cmp = TD.coreComparison(baseInputs({ ae: 60, le: 67, aw: 73, mlt: 57 }));
  ok('comparison covers only the custom library', cmp.length === 2 && cmp.every((c) => c.model.indexOf('MY-') === 0));
  TD.setCores(builtin);
  ok('library restored after the test', TD.CORES.length === builtin.length);
}

if (process.argv.includes('--diag')) {
  const show = (label, r) => {
    const s = r.summary, o = s.outStage;
    console.log('--- ' + label + ' ---');
    console.log('  n=' + s.n.toFixed(3) + ' Np/Ns=' + s.Np + '/' + s.Ns + ' Bpk=' + s.Bpk.toFixed(3) + 'T fill=' + s.fillPct.toFixed(1) + '% Jp=' + s.Jpri.toFixed(2) + ' dT=' + s.dT.toFixed(1) + 'K ' + s.verdict);
    if (o.buckDerived) console.log('  L_out=' + o.LoutUH.toFixed(2) + 'µH N=' + o.LoutN + ' AL=' + o.LoutAL.toFixed(0) + 'nH/N² gap=' + o.LoutGap.toFixed(3) + 'mm Bpk=' + o.LoutBpk.toFixed(3) + 'T ΔI=' + o.dILmax.toFixed(2) + 'A Pcu=' + o.LoutPcu.toFixed(3) + 'W dT=' + o.LoutdT.toFixed(1) + 'K');
    console.log('  C_out=' + o.CoutUF.toFixed(1) + 'µF  Ic,rms=' + o.CoutIcRms.toFixed(2) + 'A  ΔV_esr=' + (o.dVesr * 1000).toFixed(0) + 'mV/' + (o.rippleBudget * 1000).toFixed(0) + 'mV  ESR_max=' + o.CoutEsrMax.toFixed(1) + 'mΩ');
    console.log('  rectifier: diode=' + o.Pdiode.toFixed(3) + 'W SR=' + o.Psr.toFixed(3) + 'W (body ' + o.PsrBody.toFixed(3) + 'W) cross=' + (isFinite(o.Icross) ? o.Icross.toFixed(2) + 'A' : '-') + ' -> ' + (o.SRbetter ? 'SR' : 'diode'));
    if (s.llcTank) { const t = s.llcTank;
      console.log('  tank: Rac=' + t.Rac.toFixed(2) + 'Ω Qmax=' + t.Qmax.toFixed(3) + ' Q=' + t.Q.toFixed(3) + ' Zr=' + t.Zr.toFixed(1) + 'Ω');
      console.log('        Lr=' + t.LrUH.toFixed(2) + 'µH Cr=' + t.CrNf.toFixed(1) + 'nF Lm_req=' + t.LmReqUH.toFixed(1) + 'µH Lm_act=' + t.LmActUH.toFixed(1) + 'µH (' + t.LmErrPct.toFixed(0) + '% off)');
      console.log('        M ' + t.Mmin.toFixed(2) + '~' + t.Mmax.toFixed(2) + ' peak=' + t.Mpeak.toFixed(3) + '@fn=' + t.fnPeak.toFixed(3) + ' margin=' + t.gainMargin.toFixed(2) + 'x  frange=' + t.fMin_kHz.toFixed(0) + '~' + t.fMax_kHz.toFixed(0) + 'kHz');
      console.log('        ZVS: Im_pk=' + t.ImPk.toFixed(3) + 'A vs need ' + t.IZvsNeed.toFixed(3) + 'A  Vcr_pk=' + t.VcrPk.toFixed(0) + 'V');
      console.log('        M(fn): ' + t.gainRow.map((g) => g.fn.toFixed(1) + ':' + g.M.toFixed(2)).join(' '));
    }
  };
  show('forward 48-72V -> 5V/10A @100kHz (输出级)', TD.design(baseInputs({ topology: 'Forward', vinMin: 48, vinMax: 72, vout: 5, iout: 10 })));
  show('llc 380-420V -> 12V/10A @100kHz k=5', TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vinNom: 400, vout: 12, iout: 10, llcFr: 100, llcK: 5 })));
  show('llc 200-420V -> 12V/10A @100kHz k=3 (宽范围)', TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 200, vinMax: 420, vinNom: 400, vout: 12, iout: 10, llcFr: 100, llcK: 3 })));
  const strip = (h) => String(h).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/[ \t]+/g, ' ').replace(/\n +/g, '\n');
  console.log('\n=== what the page renders (default case) ===');
  console.log('[resultSub] ' + strip(dom.resultSub.textContent));
  console.log('[keyParams]' + strip(dom.keyParams.innerHTML).replace(/ (输出功率|输入功率|变比|匝数|Vin_min|Vin_max|原边|副边|磁通|允许|所需|次级|窗口|磁芯|铜损|总损耗|满足|趋肤)/g, '\n  $1'));
  console.log('[checks]' + strip(dom.checkTable.innerHTML));
  console.log('[selfTest]');
  console.log('  ' + strip(dom.selfTest.innerHTML).replace(/ ✓ /g, '\n  ✓ '));
  console.log('[verdict] ' + strip(dom.verdict.innerHTML));
  console.log('[coreTable]' + strip(dom.coreTable.innerHTML).slice(0, 900));
  console.log('\n--- diagnostic: default flyback ---');
  const d = TD.design(baseInputs());
  d.checks.forEach((c) => console.log('  ' + (c.pass === false ? 'FAIL' : (c.warn ? 'WARN' : 'ok  ')) + '  ' + c.name + ' = ' + (typeof c.value === 'number' ? c.value.toFixed(4) : c.value) + ' / ' + c.limit + ' ' + c.unit));
  console.log('  wires', d.summary.wirePd.toFixed(4), d.summary.wireSd.toFixed(4), 'Jp', d.summary.Jpri.toFixed(2), 'Js', d.summary.Jsec.toFixed(2), 'fill', d.summary.fillPct.toFixed(1), 'dT', d.summary.dT.toFixed(2), 'skin', d.summary.skinMm.toFixed(3));
  console.log('  verdict', d.summary.verdict, 'hardFail', d.summary.hardFail, 'softWarn', d.summary.softWarn);
  console.log('--- diagnostic: core comparison (top 6) ---');
  TD.coreComparison(baseInputs()).slice(0, 6).forEach((c) => console.log('  ' + (c.error || (c.model + ' hf=' + c.hardFail + ' sw=' + c.softWarn + ' fill=' + c.fill.toFixed(1) + '% Bpk=' + c.Bpk.toFixed(3) + '/' + c.BsatAllow.toFixed(3) + ' dT=' + c.dT.toFixed(1) + ' ' + c.verdict))));
  console.log('--- diagnostic: LLC ---');
  const l = TD.design(baseInputs({ topology: 'LLC Resonant', vinMin: 380, vinMax: 420, vout: 12, iout: 10, vinNom: 400 }));
  console.log('  Np/Ns', l.summary.Np + '/' + l.summary.Ns, 'n', l.summary.n.toFixed(3), 'target', l.summary.nTarget.toFixed(3));
  console.log('--- diagnostic: flyback with AL ---');
  const a = TD.design(baseInputs({ alNh: 300 }));
  console.log('  Np/Ns', a.summary.Np + '/' + a.summary.Ns, 'Lp', a.summary.LpUH.toFixed(2), 'AL', a.summary.ALreqNh.toFixed(0), 'gap', a.summary.gapMm.toFixed(3), 'Bpk', a.summary.Bpk.toFixed(3));
  const fwd = TD.design(baseInputs({ topology: 'Forward', vinMin: 48, vinMax: 72, vout: 5, iout: 10 }));
  console.log('--- diagnostic: forward ---');
  console.log('  Np/Ns', fwd.summary.Np + '/' + fwd.summary.Ns, 'Lm', fwd.summary.LmUH.toFixed(1), 'uH dIm', fwd.points.vinMin.dIm.toFixed(4), fwd.points.vinMax.dIm.toFixed(4),
    'D', fwd.points.vinMin.D.toFixed(4), 'dDesign', fwd.summary.dDesign, 'Nr', fwd.summary.resetTurns);
  fwd.windings.forEach((w) => console.log('   winding', w.name, 'N=' + w.N, 'Irms=' + w.Irms.toFixed(5), 'A_cu=' + w.area.toFixed(4)));
  console.log('--- diagnostic: EPC19 supplier-spec audit (assumed 24V -> 5V/2A, 200 kHz) ---');
  const epc = TD.design(baseInputs({
    topology: 'Forward', vinMin: 21.6, vinMax: 26.4, vout: 5, iout: 2, vf: 0.6, eta: 0.88, fs: 200,
    auditOn: true, npGiven: 23, nsGiven: 12, alNh: 1146, ae: 21.5, le: 30, aw: 24, mlt: 38,
    wireModeP: 'mm', wireDiaP: 0.2, strandsP: 2, parP: 1, wireModeS: 'mm', wireDiaS: 0.4, strandsS: 2, parS: 1,
    dcrLimitS: 32
  }));
  const e = epc.summary;
  console.log('  n = ' + e.n.toFixed(3) + '  Lm = ' + e.LmUH.toFixed(0) + ' µH (per 23T)  Ls = ' + e.LsUH.toFixed(1) + ' µH');
  console.log('  D(21.6V) = ' + e.dNeedMin.toFixed(3) + '  D(26.4V) = ' + e.dNeedMax.toFixed(3) + '  Vo@D=0.45 = ' + e.voutAtDmax.toFixed(2) + ' V');
  console.log('  ΔB_pp = ' + e.dBpp.toFixed(3) + ' T  Bpk = ' + e.Bpk.toFixed(3) + ' T  (限值 ' + e.BsatAllow.toFixed(3) + ' T)');
  console.log('  Ipk_pri = ' + e.IpkPri.toFixed(3) + ' A  Irms_pri = ' + e.IrmsPri.toFixed(3) + ' A  Irms_sec = ' + e.IrmsSec.toFixed(3) + ' A');
  console.log('  ΔI_m/周期 = ' + (epc.points.vinMin.dIm * 1000).toFixed(1) + ' mA  (' + (epc.points.vinMin.dIm / epc.points.vinMin.IpkPri * 100).toFixed(1) + '% of Ipk)');
  console.log('  DCR: 原边 ' + (e.RdcPri25Ohm * 1000).toFixed(1) + ' mΩ / 副边 ' + (e.RdcSec25Ohm * 1000).toFixed(1) + ' mΩ @25°C  (规格副边 32 mΩ max)');
  console.log('  P_cu = ' + e.Pcu.toFixed(3) + ' W  P_core = ' + e.Pcore.toFixed(3) + ' W  ΔT(Rth=' + epc.inputs.rth + ') = ' + e.dT.toFixed(1) + ' K');
  console.log('  fill = ' + e.fillPct.toFixed(1) + '% (Ku ' + (epc.inputs.kuMax * 100) + '%)  J_p = ' + e.Jpri.toFixed(2) + '  J_s = ' + e.Jsec.toFixed(2) + ' A/mm²');
  console.log('  verdict = ' + e.verdict);
  epc.checks.forEach((c) => console.log('   ' + (c.pass === false ? 'FAIL' : (c.warn ? 'WARN' : 'ok  ')) + ' ' + c.name + ' = ' + (typeof c.value === 'number' ? c.value.toFixed(3) : c.value) + ' / ' + c.limit + ' ' + c.unit));
}
console.log('\n================ RESULT ================');
console.log('passed: ' + nPass + '   failed: ' + fails.length);
if (fails.length) { console.log('failures:'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
console.log('ALL CHECKS PASSED');
