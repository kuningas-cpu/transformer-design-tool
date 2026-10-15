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
try { new Function(uiSrc); uiCompiles = true; } catch (e) { uiCompiles = false; }
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
  kPack: 1.6, kuMax: 0.35, rth: 20, dtTarget: 50, tamb: 60
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
  ok('minimum core Ae grows with output power', smallestPassing.every((v, i, a) => i === 0 || v >= a[i - 1] || v === Infinity), JSON.stringify(smallestPassing));
  ok('a 5 W design fits the smallest cores', smallestPassing[0] < 25, String(smallestPassing[0]));
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

if (process.argv.includes('--diag')) {
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
