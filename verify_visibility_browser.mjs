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
    s: 'dc,Flyback,diode,cap', title: 'DC 输入 + 反激：只有直流参数与反激参数',
    shown: ['vinMin', 'vinMax', 'rippleK', 'dutyMax', 'deltaBTarget', 'jTarget'],
    hidden: [].concat(AC_ONLY, ['pfcBus'], BUCK_ONLY, ['secRect'], LLC_ONLY, FWD_RESET, ['rdsOnMOhm', 'vfBody', 'tDeadNs']),
    hiddenHeads: ['LLC tank']
  },
  {
    s: 'ac,Flyback,diode,cap', title: 'AC 输入 + 反激：只有交流前端参数',
    shown: AC_ONLY.slice(),
    hidden: ['vinMin', 'vinMax', 'pfcBus'].concat(BUCK_ONLY, LLC_ONLY, FWD_RESET)
  },
  {
    s: 'pfc,Flyback,diode,cap', title: 'AC + PFC：只留 PFC 母线电压',
    shown: ['pfcBus'],
    hidden: AC_ONLY.concat(['vinMin', 'vinMax'], BUCK_ONLY, LLC_ONLY, FWD_RESET)
  },
  {
    s: 'dc,Forward,diode,cap', title: 'DC + 正激（电容复位）：复位电容/输出电感/辅助绕组出现',
    shown: FWD_RESET.concat(BUCK_ONLY),
    hidden: ['rippleK', 'secRect'].concat(AC_ONLY, ['pfcBus'], LLC_ONLY, ['rdsOnMOhm', 'vfBody', 'tDeadNs'])
  },
  {
    s: 'dc,Forward,diode,winding', title: '正激 + 复位绕组：C_res/耐压/漏感自动收起',
    shown: ['resetMode'],
    hidden: ['cresNf', 'vdsRated', 'lkUh', 'rippleK']
  },
  {
    s: 'dc,LLC%20Resonant,diode,cap', title: 'LLC：谐振腔字段出现，Buck 型输出电感消失',
    shown: LLC_ONLY.concat(['tDeadNs']),
    hidden: BUCK_ONLY.concat(['rippleLout', 'rippleK', 'resetMode', 'cresNf']),
    shownHeads: ['LLC tank']
  },
  {
    s: 'dc,Push-Pull,sr2,cap', title: '推挽 + 同步整流：中心抽头选择与 SR 参数出现',
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
  console.log('    hidden = ' + [...hid].join(' '));
});

try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* temp dir */ }
console.log('\n================ BROWSER RESULT ================');
console.log('browser: ' + browser);
console.log('passed: ' + nPass + '   failed: ' + fails.length);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
console.log('ALL BROWSER VISIBILITY CHECKS PASSED');
