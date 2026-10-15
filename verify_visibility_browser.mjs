/* Real-browser regression for the input panel's dynamic visibility.
   Drives headless Edge/Chrome (whatever is installed) through a set of
   "input type x topology x rectifier" scenarios and checks which fields
   the page actually hides.  Run:  node verify_visibility_browser.mjs
   If no Chromium-based browser is found the script skips and exits 0. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TOOL = new URL('./transformer_design_tool_v2.html', import.meta.url);
const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];
const browser = CANDIDATES.find((p) => fs.existsSync(p));
if (!browser) {
  console.log('no Chromium-based browser found -> browser visibility check SKIPPED');
  process.exit(0);
}

/* --- build an instrumented copy that can be steered from the URL fragment --- */
const html = fs.readFileSync(TOOL, 'utf8');
const hook = `
<script>
(function () {
  var raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  if (!raw) return;
  var p = raw.split(',');
  window.addEventListener('load', function () {
    var map = { acMode: p[0], topology: p[1], rectDevice: p[2], resetMode: p[3] };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && map[id]) el.value = map[id];
    });
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    window.__TD_PROBE__ = true;
  });
})();
</script>
</body>`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdvis-'));
const probe = path.join(tmpDir, 'probe.html');
/* 注意：工具自己的报告生成器字符串里也含 </body>，必须插到最后一个（真正的文档结尾） */
const cut = html.lastIndexOf('</body>');
fs.writeFileSync(probe, html.slice(0, cut) + hook + html.slice(cut + '</body>'.length), 'utf8');

const profileDir = path.join(tmpDir, 'profile');
const fileUrl = 'file:///' + probe.replace(/\\/g, '/');

function dumpDom(scenario) {
  const out = execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profileDir, '--virtual-time-budget=4000', '--dump-dom',
    fileUrl + '#' + scenario
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  return out;
}

/* 收集被内联 style 隐藏的输入 id（div.field 里紧跟 label for="..."，标题取 h3 文本） */
function hiddenIds(dom) {
  const ids = new Set();
  for (const m of dom.matchAll(/<div class="field"[^>]*style="display:\s*none;?"[^>]*>\s*<label for="([^"]+)"/g)) ids.add(m[1]);
  const heads = [];
  for (const m of dom.matchAll(/<h3[^>]*style="display:\s*none;?"[^>]*>([^<]*)</g)) heads.push(m[1].trim());
  return { ids, heads };
}
/* 取某个 select 内部实际渲染出来的 HTML（用来核对选项文字/是否被收起） */
function selectBlock(dom, id) {
  const m = dom.match(new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)</select>'));
  return m ? m[1] : '';
}
function hintText(dom, id) {
  const m = dom.match(new RegExp('<div class="hint" id="' + id + '"[^>]*>([\\s\\S]*?)</div>'));
  return m ? m[1].replace(/<[^>]+>/g, '') : '';
}

let nPass = 0; const fails = [];
function check(name, cond, detail = '') {
  if (cond) { nPass++; console.log('  PASS  ' + name); }
  else { fails.push(name + (detail ? '  [' + detail + ']' : '')); console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}
const AC_ONLY = ['vacMin', 'vacMax', 'fline', 'cbusUf', 'cbusEsr', 'rsAc', 'vdBridge', 'holdMs', 'holdVmin'];
const BUCK_ONLY = ['rippleLout', 'nlGiven', 'lmGiven', 'naux', 'nlDia', 'nlStrands', 'nlPar'];
const LLC_ONLY = ['vinNom', 'llcFr', 'llcK', 'llcQ', 'cossP', 'crRated'];
const FWD_RESET = ['resetMode', 'cresNf', 'vdsRated', 'lkUh'];
const DEG = (arr, c) => arr.map((id) => id + (c.has(id) ? ':H' : ':v')).join(' ');

const SCENARIOS = [
  {
    s: 'dc,Flyback,diode,cap', title: 'DC 输入 + 反激：只有直流参数与反激参数', topoLabel: '反激 / Flyback',
    shown: ['vinMin', 'vinMax', 'rippleK', 'dutyMax', 'deltaBTarget', 'jTarget'],
    hidden: [].concat(AC_ONLY, ['pfcBus'], BUCK_ONLY, ['secRect'], LLC_ONLY, FWD_RESET, ['rdsOnMOhm', 'vfBody', 'tDeadNs']),
    hiddenHeads: ['LLC tank'],
    rectSelect: { has: ['无续流管'], notHas: ['整流管 + 续流管'], sr2Hidden: true, hintHas: ['没有续流管', '单管'] }
  },
  {
    s: 'ac,Flyback,diode,cap', title: 'AC 输入 + 反激：只有交流前端参数', topoLabel: '反激 / Flyback',
    shown: AC_ONLY.slice(),
    hidden: ['vinMin', 'vinMax', 'pfcBus'].concat(BUCK_ONLY, LLC_ONLY, FWD_RESET)
  },
  {
    s: 'pfc,Flyback,diode,cap', title: 'AC + PFC：只留 PFC 母线电压', topoLabel: '反激 / Flyback',
    shown: ['pfcBus'],
    hidden: AC_ONLY.concat(['vinMin', 'vinMax'], BUCK_ONLY, LLC_ONLY, FWD_RESET)
  },
  {
    s: 'dc,Forward,diode,cap', title: 'DC + 正激（电容复位）：复位电容/输出电感/辅助绕组出现', topoLabel: '单端正激 / Forward',
    shown: FWD_RESET.concat(BUCK_ONLY),
    hidden: ['rippleK', 'secRect'].concat(AC_ONLY, ['pfcBus'], LLC_ONLY, ['rdsOnMOhm', 'vfBody', 'tDeadNs']),
    rectSelect: { has: ['整流管 + 续流管', '续流二极管'], notHas: ['无续流管'], sr2Hidden: false, hintHas: ['Buck 型副边'] },
    vdsRow: true
  },
  {
    s: 'dc,Forward,diode,winding', title: '正激 + 复位绕组：C_res/耐压/漏感自动收起', topoLabel: '单端正激 / Forward',
    shown: ['resetMode'],
    hidden: ['cresNf', 'vdsRated', 'lkUh', 'rippleK']
  },
  {
    s: 'dc,LLC%20Resonant,diode,cap', title: 'LLC：谐振腔字段出现，Buck 型输出电感消失', topoLabel: 'LLC 谐振 / LLC',
    shown: LLC_ONLY.concat(['tDeadNs']),
    hidden: BUCK_ONLY.concat(['rippleLout', 'rippleK', 'resetMode', 'cresNf']),
    shownHeads: ['LLC tank'],
    rectSelect: { has: ['交替导通'], notHas: ['整流管 + 续流管'], sr2Hidden: true, hintHas: ['LLC：副边整流管'] }
  },
  {
    s: 'dc,Push-Pull,sr2,cap', title: '推挽 + 同步整流：中心抽头选择与 SR 参数出现', topoLabel: '推挽 / Push-Pull',
    shown: ['secRect', 'rdsOnMOhm', 'vfBody', 'tDeadNs'].concat(BUCK_ONLY),
    hidden: ['rippleK', 'resetMode', 'vinNom'].concat(AC_ONLY)
  }
];

SCENARIOS.forEach((sc) => {
  console.log('\n=== ' + sc.title + '   [' + sc.s + '] ===');
  let dom;
  try { dom = dumpDom(sc.s); }
  catch (e) { check(sc.title + ' -> 页面可加载', false, String(e.message).slice(0, 160)); return; }
  const { ids: hid, heads } = hiddenIds(dom);
  /* 注意：dump 里带着脚本文本（其中也有"计算出错"字样），所以只能看 errBox 是否仍带 hidden */
  const rendered = /id="keyParams"[^>]*><div/.test(dom) && /id="verdict"[^>]*>\s*<span/.test(dom) && /id="errBox"[^>]*hidden/.test(dom);
  check('页面渲染完成（errBox 未弹错、结果区已填充）', rendered);
  const badShow = sc.shown.filter((id) => hid.has(id));
  const badHide = sc.hidden.filter((id) => !hid.has(id));
  check('这些字段应当可见: ' + sc.shown.join(','), badShow.length === 0, '被隐藏了: ' + badShow.join(','));
  check('这些字段应当隐藏: ' + sc.hidden.length + ' 项', badHide.length === 0, '仍可见: ' + badHide.join(','));
  if (sc.hiddenHeads) {
    const miss = sc.hiddenHeads.filter((t) => !heads.some((h) => h.indexOf(t) >= 0));
    check('无关小节标题一并隐藏: ' + sc.hiddenHeads.join(','), miss.length === 0, '仍可见: ' + miss.join(','));
  }
  if (sc.shownHeads) {
    const miss = sc.shownHeads.filter((t) => heads.some((h) => h.indexOf(t) >= 0));
    check('相关小节标题保持显示: ' + sc.shownHeads.join(','), miss.length === 0, '被隐藏了: ' + miss.join(','));
  }
  /* 面板顺序：输入（类型 + 电压）必须是第一块 */
  const iIn = dom.indexOf('输入类型与输入电压'), iSpec = dom.indexOf('规格 / Specification'), iOp = dom.indexOf('拓扑工作点');
  check('输入参数在面板最前（输入 → 规格 → 拓扑工作点）', iIn > 0 && iIn < iSpec && iSpec < iOp, iIn + '/' + iSpec + '/' + iOp);
  /* 顶部"当前拓扑填什么"的提示 + 公式表只列当前拓扑（其余收在折叠块里） */
  const ALL_LABELS = ['反激 / Flyback', '有源钳位反激 / ACF', '单端正激 / Forward', '推挽 / Push-Pull', '半桥 / Half-Bridge', '全桥 / Full-Bridge', 'LLC 谐振 / LLC'];
  const scope = hintText(dom, 'inputScope');
  check('面板顶部提示当前拓扑要填什么', scope.indexOf('当前拓扑：' + sc.topoLabel) >= 0 && scope.length > 60, scope.slice(0, 100));
  const fStart = dom.indexOf('这里只列当前拓扑'), fDet = dom.indexOf('<details', fStart > 0 ? fStart : 0);
  const fRegion = (fStart > 0 && fDet > fStart) ? dom.slice(fStart, fDet) : '';
  const leaked = ALL_LABELS.filter((l) => l !== sc.topoLabel && fRegion.indexOf(l) >= 0);
  check('公式表默认只列当前拓扑: ' + sc.topoLabel,
    fRegion.indexOf(sc.topoLabel) >= 0 && leaked.length === 0, '混入了其他拓扑: ' + leaked.join(','));
  const inDetails = fDet > 0 ? ALL_LABELS.filter((l) => dom.slice(fDet).indexOf(l) >= 0) : [];
  check('折叠块里保留全部 7 种拓扑（未丢信息）', inDetails.length === ALL_LABELS.length, '折叠块里缺少: ' + ALL_LABELS.filter((l) => inDetails.indexOf(l) < 0).join(','));
  /* 次级整流器件的措辞随拓扑变：反激没有续流管，且 sr2 选项被收起 */
  const sel = selectBlock(dom, 'rectDevice');
  if (sc.rectSelect) {
    const missHas = sc.rectSelect.has.filter((t) => sel.indexOf(t) < 0);
    const badHas = sc.rectSelect.notHas.filter((t) => sel.indexOf(t) >= 0);
    check('次级整流器件选项措辞: ' + sc.rectSelect.has.join(' / '), missHas.length === 0, '缺少: ' + missHas.join(','));
    check('次级整流器件选项不含: ' + sc.rectSelect.notHas.join(' / '), badHas.length === 0, '出现了: ' + badHas.join(','));
    const sr2Hidden = /value="sr2"[^>]*(hidden|disabled)/.test(sel);
    check(sc.rectSelect.sr2Hidden ? '没有续流管的拓扑（反激/LLC）sr2 选项被收起（disabled/hidden）' : '该拓扑下 sr2 选项可用',
      sr2Hidden === !!sc.rectSelect.sr2Hidden, 'sr2Hidden=' + sr2Hidden);
    const hint = hintText(dom, 'rectHint');
    const hintOk = sc.rectSelect.hintHas.every((t) => hint.indexOf(t) >= 0);
    check('整流器件提示文字匹配当前拓扑', hintOk && hint.length > 20, hint.slice(0, 120));
  }
  /* 开关管电压应力：只有"正激 + 电容谐振复位"才有这一步；0.85 降额的说明在静态速查表里。
     注意 dump 里带着脚本源码（同样的字符串也在源码里），所以只能看 #stepTable 这段渲染结果 */
  const iStep = dom.indexOf('id="stepTable"');
  const iNextCard = dom.indexOf('<div class="card"', iStep + 1);
  const stepRegion = (iStep > 0 && iNextCard > iStep) ? dom.slice(iStep, iNextCard) : '';
  const hasVdsStep = /Vds,pk = Vin_max \+ V_res,pk \+ ΔV_Lk ;/.test(stepRegion);
  check('Vds,pk 计算步骤' + (sc.vdsRow ? '存在（正激+电容复位）' : '不存在（该拓扑没有复位电容）'),
    hasVdsStep === !!sc.vdsRow, 'found=' + hasVdsStep);
  check('速查表解释了 0.85 降额（任何拓扑都能查到）',
    dom.indexOf('开关管耐压降额 0.85') >= 0 && dom.indexOf('BVdss') >= 0);
  /* 热阻 Rth 是谁的 + 温升步骤行 */
  const rthHint = hintText(dom, 'rthHint');
  check('热阻提示写清 Rth 是谁的、怎么取值',
    /Rth 是谁的/.test(rthHint) && /实测反推/.test(rthHint) && /不是器件\/磁芯的数据手册参数/.test(rthHint), rthHint.slice(0, 90));
  check('温升步骤行指明"变压器自身热点→环境"',
    /温升（Rth = 变压器自身/.test(stepRegion) && /Rth_max = ΔT_目标\/P_总/.test(stepRegion), stepRegion.slice(0, 0));
  console.log('    hidden = ' + [...hid].join(' '));
});

try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* temp dir */ }
console.log('\n================ BROWSER RESULT ================');
console.log('browser: ' + browser);
console.log('passed: ' + nPass + '   failed: ' + fails.length);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
console.log('ALL BROWSER VISIBILITY CHECKS PASSED');
