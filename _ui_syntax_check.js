
/* ================= UI ================= */
(function () {
  'use strict';
  var IDS = ['topology','fs','vinMin','vinMax','vout','iout','vf','eta','vinNom','secRect','dutyMax','rippleK','rippleLout',
    'auditMode','npGiven','nsGiven','dcrLimitP','dcrLimitS',
    'resetMode','cresNf','vdsRated','nlGiven','lmGiven','naux',
    'lkUh','mltTol','marginMm','awW','awH','nlDia','nlStrands','nlPar','crRated',
    'acMode','vacMin','vacMax','fline','cbusUf','cbusEsr','rsAc','vdBridge','holdMs','holdVmin','pfcBus',
    'ripplePct','esrOhm','rdsOnMOhm','vfBody','tDeadNs','llcFr','llcK','llcQ','cossP',
    'deltaBTarget','bsatDerate','acFactor','corePreset','aw','ae','le','mlt','alNh','matPreset','bsat100','muI','pcvRef',
    'lossA','lossB','jTarget','wireModeP','wireDiaP','strandsP','parP','wireModeS','wireDiaS','strandsS','parS','kPack',
    'kuMax','rth','dtTarget','tamb','resetBtn','exportBtn','errBox','resultSub','keyParams','checkTable','selfTest','verdict',
    'sweepTable','stepTable','coreTable','formulaTable'];
  var STRANDS = [1,2,3,4,5,7,10,14,20,25,30];
  var PAR = [1,2,3,4,5];
  var DEFAULTS = {};
  var lastResult = null;

  function $(id) { return document.getElementById(id); }
  function fmt(x, d) {
    if (x === Infinity) return '∞';
    if (x === -Infinity) return '-∞';
    if (!isFinite(x)) return '-';
    var s = Number(x).toFixed(d === undefined ? 2 : d);
    return s;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(id, dflt) { var v = parseFloat($(id).value); return isFinite(v) ? v : dflt; }
  function clampInt(v, lo, hi) { v = Math.round(v); if (!isFinite(v)) v = lo; return Math.min(Math.max(v, lo), hi); }

  function fillSelect(id, values, labels) {
    var s = $(id);
    s.innerHTML = '';
    values.forEach(function (v, i) {
      var o = document.createElement('option');
      o.value = v; o.textContent = labels ? labels[i] : v;
      s.appendChild(o);
    });
  }
  function buildStaticSelects() {
    fillSelect('strandsP', STRANDS, STRANDS.map(function (v) { return v + ' 股'; }));
    fillSelect('strandsS', STRANDS, STRANDS.map(function (v) { return v + ' 股'; }));
    fillSelect('parP', PAR, PAR.map(function (v) { return v + ' 组并联'; }));
    fillSelect('parS', PAR, PAR.map(function (v) { return v + ' 组并联'; }));
    var mp = $('matPreset');
    buildCoreSelect();
    mp.innerHTML = '';
    for (var m in TD.MATERIALS) {
      if (!Object.prototype.hasOwnProperty.call(TD.MATERIALS, m)) continue;
      var om = document.createElement('option');
      om.value = m; om.textContent = m + ' · ' + TD.MATERIALS[m].kind;
      mp.appendChild(om);
    }
  }
  function applyCorePreset(model) {
    var c = null, i;
    for (i = 0; i < TD.CORES.length; i++) if (TD.CORES[i].model === model) c = TD.CORES[i];
    if (!c) return;
    $('ae').value = c.ae; $('le').value = c.le; $('aw').value = c.aw; $('mlt').value = c.mlt;
    /* 有实测 AL 时直接填 AL（实测值比 µi·Ae/le 推算更可信） */
    if (c.alMeas > 0) { $('alNh').value = c.alMeas; }
  }
  function applyMaterialPreset(name) {
    var m = TD.MATERIALS[name];
    if (!m) return;
    $('bsat100').value = m.bsat100; $('muI').value = m.muI; $('pcvRef').value = m.pcvRef;
    $('lossA').value = m.a; $('lossB').value = m.b;
  }
  function readInputs() {
    var strandsPo = parseInt($('strandsP').value, 10) || 1;
    var strandsSo = parseInt($('strandsS').value, 10) || 1;
    var parPo = parseInt($('parP').value, 10) || 1;
    var parSo = parseInt($('parS').value, 10) || 1;
    return {
      topology: $('topology').value,
      fs: num('fs', 100),
      vinMin: num('vinMin', 9), vinMax: num('vinMax', 36),
      vout: num('vout', 12), iout: num('iout', 2), vf: num('vf', 0.5), eta: num('eta', 0.9),
      vinNom: num('vinNom', 0), secRect: $('secRect').value,
      auditOn: $('auditMode').value === '1',
      npGiven: $('auditMode').value === '1' ? num('npGiven', 0) : 0,
      nsGiven: $('auditMode').value === '1' ? num('nsGiven', 0) : 0,
      dcrLimitP: num('dcrLimitP', 0), dcrLimitS: num('dcrLimitS', 0),
      resetMode: $('resetMode').value,
      cresNf: num('cresNf', 0), vdsRated: num('vdsRated', 0),
      nlGiven: num('nlGiven', 0), lmGiven: num('lmGiven', 0), naux: num('naux', 0),
      lkUh: num('lkUh', 0), mltTol: num('mltTol', 0), marginMm: num('marginMm', 0),
      awW: num('awW', 0), awH: num('awH', 0),
      nlDia: num('nlDia', 0), nlStrands: num('nlStrands', 1), nlPar: num('nlPar', 1),
      crRated: num('crRated', 0),
      acMode: $('acMode').value, vacMin: num('vacMin', 176), vacMax: num('vacMax', 264), fline: num('fline', 50),
      cbusUf: num('cbusUf', 220), cbusEsr: num('cbusEsr', 0.3), rsAc: num('rsAc', 0.5), vdBridge: num('vdBridge', 1.4),
      holdMs: num('holdMs', 0), holdVmin: num('holdVmin', 0), pfcBus: num('pfcBus', 390),
      dutyMax: num('dutyMax', 0.45), rippleK: num('rippleK', 0.4), rippleLout: num('rippleLout', 0.6),
      deltaBTarget: num('deltaBTarget', 0.2), bsatDerate: num('bsatDerate', 0.8), acFactor: num('acFactor', 1.2),
      ae: num('ae', 52.2), le: num('le', 57.5), aw: num('aw', 54), mlt: num('mlt', 50), alNh: num('alNh', 0),
      bsat100: num('bsat100', 0.39), muI: num('muI', 2300), pcvRef: num('pcvRef', 70),
      lossA: num('lossA', 1.45), lossB: num('lossB', 2.5),
      jTarget: num('jTarget', 4),
      ripplePct: num('ripplePct', 1), esrOhm: num('esrOhm', 0.01), rdsOnMOhm: num('rdsOnMOhm', 10),
      vfBody: num('vfBody', 0.8), tDeadNs: num('tDeadNs', 200),
      llcFr: num('llcFr', 0), llcK: num('llcK', 5), llcQ: num('llcQ', 0), cossP: num('cossP', 200),
      wireModeP: $('wireModeP').value, wireDiaP: num('wireDiaP', 0.45), strandsP: strandsPo, parP: parPo,
      wireModeS: $('wireModeS').value, wireDiaS: num('wireDiaS', 0.8), strandsS: strandsSo, parS: parSo,
      kPack: num('kPack', 1.4), kuMax: num('kuMax', 0.4),
      rth: num('rth', 28), dtTarget: num('dtTarget', 40), tamb: num('tamb', 40)
    };
  }
  function kvItem(k, v) { return '<div class="item"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>'; }
  function renderKeyParams(r) {
    var s = r.summary;
    var items = [
      ['输出功率 Po / 输入功率 Pin', fmt(s.Po, 2) + ' W / ' + fmt(s.Pin, 2) + ' W'],
      ['变比 n = Np/Ns（目标 → 实际）', fmt(s.nTarget, 4) + ' → ' + fmt(s.n, 4)],
      ['匝数 Np / Ns（整数）', s.Np + ' 匝 / ' + s.Ns + ' 匝'],
      ['Vin_min 所需占空比 D', fmt(s.dNeedMin, 4) + '（设计点 D_max=' + fmt(s.dDesign, 3) + '）'],
      ['Vin_max 所需占空比 D', fmt(s.dNeedMax, 4)],
      ['原边峰值电流 Ipk（最恶劣）', fmt(s.IpkPri, 2) + ' A'],
      ['原边有效值电流 I_rms', fmt(s.IrmsPri, 2) + ' A'],
      ['副边峰值电流 Is_pk', fmt(s.IsPkSec, 2) + ' A'],
      ['副边有效值电流 I_rms', fmt(s.IrmsSec, 2) + ' A'],
      ['磁通摆幅 ΔB_pp / 峰值 Bpk', fmt(s.dBpp, 3) + ' T / ' + fmt(s.Bpk, 3) + ' T'],
      ['允许磁通 Bsat·降额', fmt(s.BsatAllow, 3) + ' T'],
      ['原边电感 Lp / Lm', fmt(s.LpUH, 2) + ' µH' + (r.T.kind === 'flyback' ? '' : ' / ' + fmt(s.LmUH, 1) + ' µH')],
      ['次级电感 Ls = Lp/n²', fmt(s.LsUH, 2) + ' µH'],
      ['所需 AL / 气隙', r.T.kind === 'flyback' ? (fmt(s.ALreqNh, 0) + ' nH/N² / ' + fmt(s.gapMm, 3) + ' mm') : (fmt(s.ALusedNh, 0) + ' nH/N²（无气隙）')],
      ['原边线径×股数×并联 / J_p', fmt(s.wirePd, 3) + ' mm ×' + s.wirePstrands + '×' + s.wirePpar + ' / ' + fmt(s.Jpri, 2) + ' A/mm²' + (s.wirePauto ? '（自动）' : '')],
      ['副边线径×股数×并联 / J_s', fmt(s.wireSd, 3) + ' mm ×' + s.wireSstrands + '×' + s.wireSpar + ' / ' + fmt(s.Jsec, 2) + ' A/mm²' + (s.wireSauto ? '（自动）' : '')],
      ['直流电阻 DCR 原边/副边 @25°C（热态）',
        fmt(s.RdcPri25Ohm * 1000, 1) + '/' + fmt(s.RdcSec25Ohm * 1000, 1) + ' mΩ（' + fmt(s.RdcPriOhm * 1000, 1) + '/' + fmt(s.RdcSecOhm * 1000, 1) + ' mΩ）'
        + (r.inputs.parP > 1 || r.inputs.parS > 1 ? '｜注意：这是并联后的值，单绕组规格 = 该值 × 并联数（P×' + r.inputs.parP + ' / S×' + r.inputs.parS + '）' : '')],
      ['窗口填充率（上限 ' + (r.inputs.kuMax * 100).toFixed(0) + '%）', fmt(s.fillPct, 1) + '%  · 需 Aw ≥ ' + fmt(s.AwReq, 1) + ' mm²'],
      ['磁芯损耗 P_core（Pcv=' + fmt(s.Pcv, 1) + ' kW/m³）', fmt(s.Pcore, 3) + ' W'],
      ['铜损 P_cu（含 F_R=' + fmt(s.acFactor, 2) + '）', fmt(s.Pcu, 3) + ' W'],
      ['总损耗 / 温升 ΔT', fmt(s.Ptotal, 3) + ' W / ' + fmt(s.dT, 1) + ' K'],
      ['满足目标温升所需 Rth', (isFinite(s.RthMax) ? fmt(s.RthMax, 1) + ' K/W' : '—')],
      ['趋肤深度 δ（绕组温度下）', fmt(s.skinMm, 3) + ' mm']
    ];
    var html = '';
    items.forEach(function (x) { html += kvItem(x[0], x[1]); });
    $('keyParams').innerHTML = html;
    $('resultSub').textContent = s.topologyLabel + '；已按整数匝数 ' + s.Np + '/' + s.Ns + ' 反算工作点，最恶劣值取 Vin_min 与 Vin_max 的较大者。';
  }
  function renderChecks(r) {
    var html = '<table><thead><tr><th>校核项</th><th class="num">计算值</th><th class="num">限值</th><th>判定</th></tr></thead><tbody>';
    r.checks.forEach(function (c) {
      var cls = c.pass === false ? 'bad' : (c.warn ? 'warn' : 'ok');
      var txt = c.pass === false ? '不通过' : (c.warn ? '接近上限' : '通过');
      var v = (typeof c.value === 'number') ? fmt(c.value, Math.abs(c.value) < 1 ? 4 : 2) : c.value;
      var l = (typeof c.limit === 'number') ? fmt(c.limit, Math.abs(c.limit) < 1 ? 4 : 2) : c.limit;
      html += '<tr><td>' + esc(c.name) + '</td><td class="num">' + esc(v) + ' ' + esc(c.unit) + '</td><td class="num">' + esc(l) + ' ' + esc(c.limitUnit) + '</td><td><span class="status ' + cls + '">' + esc(txt) + '</span></td></tr>';
    });
    html += '</tbody></table>';
    $('checkTable').innerHTML = html;
    var shtml = '<strong>数值自检（相对误差，均应 ≈ 0）</strong><br>';
    r.self.forEach(function (s) {
      shtml += (s.pass ? '✓ ' : '✗ ') + esc(s.name) + ' : ' + (s.err === Infinity ? '∞' : s.err.toExponential(2)) + '<br>';
    });
    $('selfTest').innerHTML = shtml;
    var v = r.summary;
    $('verdict').innerHTML = '<span class="status ' + v.verdictClass + '">' + esc(v.verdict) + '</span>' +
      '<div style="margin-top:8px;font-size:12.5px;line-height:1.8;color:#4b5563;">硬性校核不通过 ' + v.hardFail + ' 项，接近上限 ' + v.softWarn + ' 项。</div>' +
      (r.warns.length ? '<div class="hint"><strong>提示</strong><br>' + r.warns.map(esc).join('<br>') + '</div>' : '');
  }
  function renderSweep(r) {
    var html = '<table><thead><tr><th class="num">Vin (V)</th><th class="num">D</th><th class="num">ΔB_pp (T)</th><th class="num">Bpk (T)</th><th class="num">Ipk_pri (A)</th><th class="num">I_rms_pri (A)</th><th class="num">I_rms_sec (A)</th><th>模式</th></tr></thead><tbody>';
    r.sweep.forEach(function (p) {
      var mode = r.T.kind === 'flyback' ? (p.CCM ? 'CCM' : 'DCM') : '—';
      html += '<tr><td class="num">' + fmt(p.Vin, 2) + '</td><td class="num">' + fmt(p.D, 4) + '</td><td class="num">' + fmt(p.dBpp, 4) +
        '</td><td class="num">' + fmt(p.Bpk, 4) + '</td><td class="num">' + fmt(p.IpkPri, 2) + '</td><td class="num">' + fmt(p.IrmsPri, 2) +
        '</td><td class="num">' + fmt(p.IrmsSec, 2) + '</td><td>' + mode + '</td></tr>';
    });
    html += '</tbody></table>';
    $('sweepTable').innerHTML = html;
  }
  function renderSteps(r) {
    var html0 = '', s = r.summary, os = s.outStage;
    if (!os) { html0 = '<div class="hint">未计算输出级。</div>'; }
    else {
      var rows = [];
      if (os.buckDerived) {
        rows.push(['输出电感 L', fmt(os.LoutUH, 2) + ' µH', 'ΔI_L 设计点 = ' + fmt(os.dIL, 3) + ' A，Vin_max 处最大 ' + fmt(os.dILmax, 3) + ' A']);
        if (os.LoutLmGiven) rows.push(['输出电感（实测值校核）', fmt(os.LoutUH, 2) + ' µH / ' + os.LoutN + ' 匝' + (os.LoutNgiven ? '（给定）' : ''), '按承认书实测电感与匝数反查 Bpk、纹波及损耗']);
        if (os.naux) rows.push(['辅助供电绕组', os.naux + ' 匝（N_aux/N_L = ' + fmt(os.auxRatio, 3) + '）→ V_aux ≈ ' + fmt(os.auxV, 2) + ' V', '与输出电感同磁芯，续流期二极管整流估算；实际取决于绕组极性与整流管接法']);
        rows.push(['输出电感匝数 / 电流', os.LoutN + ' 匝 / ' + fmt(os.LoutIpk, 2) + ' A 峰值，' + fmt(os.LoutIrms, 2) + ' A 有效值', '按不饱和 Ipk 定匝数']);
        rows.push(['输出电感 AL / 气隙', fmt(os.LoutAL, 0) + ' nH/N² / ' + fmt(os.LoutGap, 3) + ' mm', 'DC 偏置电感需要气隙（或磁粉芯）']);
        rows.push(['输出电感磁通 / 损耗', 'Bpk ' + fmt(os.LoutBpk, 3) + ' T（P_cu ' + fmt(os.LoutPcu, 3) + ' W，P_core ' + fmt(os.LoutPcore, 3) + ' W）', 'ΔT ≈ ' + fmt(os.LoutdT, 1) + ' K（需 Rth ≤ ' + fmt(os.LoutRthMax, 1) + ' K/W）']);
        rows.push(['输出电感线径', fmt(os.LoutDia, 3) + ' mm ×' + os.LoutStrands + ' 股（自动，按 J=' + fmt(r.inputs.jTarget, 1) + '）', 'DCR@25°C ≈ ' + fmt(os.LoutRdc25 * 1000, 2) + ' mΩ']);
      }
      rows.push(['输出电容 C_min', fmt(os.CoutUF, 1) + ' µF', '纹波预算 ' + fmt(os.rippleBudget, 3) + ' V（' + fmt(r.inputs.ripplePct, 2) + '% of Vout）']);
      rows.push(['纹波分解', 'ESR 分量 ' + fmt(os.dVesr, 4) + ' V + 容性分量 ' + fmt(os.dVcap, 4) + ' V', os.esrDominant ? 'ESR 主导：需降低 ESR 或多只并联' : '容性为主']);
      rows.push(['电容纹波电流 / 耐压', fmt(os.CoutIcRms, 2) + ' A rms，耐压建议 ≥ ' + fmt(os.CoutVrate, 0) + ' V', 'ESR 上限 ≈ ' + fmt(os.CoutEsrMax, 1) + ' mΩ']);
      rows.push(['整流损耗：二极管 vs 同步整流', fmt(os.Pdiode, 3) + ' W vs ' + fmt(os.Psr, 3) + ' W（死区体二极管 ' + fmt(os.PsrBody, 3) + ' W）',
        os.SRbetter ? '推荐同步整流，省 ' + fmt(os.Pdiode - os.Psr, 3) + ' W' : '此电流下二极管更划算']);
      rows.push(['同步整流临界电流', isFinite(os.Icross) ? fmt(os.Icross, 2) + ' A（超过即 SR 更省）' : '—', 'SR 导通时间 ≈ ' + fmt(os.SRonTime, 2) + ' µs' + (os.SRdeadOK ? '' : '（不足 2×死区，需注意时序）')]);
      html0 = '<table><thead><tr><th style="width:26%">项目</th><th style="width:34%">结果</th><th>说明</th></tr></thead><tbody>';
      rows.forEach(function (x) { html0 += '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td><td>' + esc(x[2]) + '</td></tr>'; });
      html0 += '</tbody></table>';
    }
    $('outStage').innerHTML = html0;
    if (s.capReset) {
      $('outStage').innerHTML += '<div class="hint"><strong>正激磁复位（电容谐振复位）</strong><br>' +
        '复位电容上限 C ≤ ' + fmt(s.capReset.crMaxNf, 2) + ' nF（按 Vin_min 处 D=' + fmt(s.capReset.dMaxUsed, 3) + '、Lm=' + fmt(s.capReset.LmUH, 1) + ' µH 计算）；本次取 ' + fmt(s.capReset.crNf, 2) + ' nF' + (s.capReset.crAuto ? '（自动取上限）' : '（用户输入）') + '。<br>' +
        '复位峰值电压 ' + fmt(s.capReset.vResetPk, 1) + ' V → 开关管 Vds,pk ≈ ' + fmt(s.capReset.vdsPk, 1) + ' V' + (s.capReset.vdsRated > 0 ? '（耐压 ' + fmt(s.capReset.vdsRated, 0) + ' V，校核见清单）' : '（未填耐压，不做校核）') + '。<br>' +
        '电容越小开关应力越高、关断期复位越快；电容超过上限则复位在下一个周期前完不成。</div>';
    }
    if (s.acFront) {
      var a = s.acFront;
      $('outStage').innerHTML += '<div class="hint"><strong>交流输入前端' + (a.mode === 'pfc' ? '（PFC，母线恒定）' : '（桥式整流 + 母线电容）') + '</strong><br>' +
        (a.mode === 'pfc'
          ? ('母线 ' + fmt(a.vbus, 0) + ' V（±2% 工频纹波）→ 后级按 Vin ' + fmt(a.vBusMin, 0) + '~' + fmt(a.vBusMax, 0) + ' V 设计；PFC 电感/输入电流/THD/浪涌不在本工具范围。<br>')
          : ('Vac 峰值 ' + fmt(a.vpkMin, 1) + ' ~ ' + fmt(a.vpkMax, 1) + ' V；C_bus ' + fmt(a.cbusUf, 0) + ' µF → 母线谷值 <b>' + fmt(a.vValley, 1) + ' V</b>（纹波 ' + fmt(a.ripple, 1) + ' V，导通角 ' + fmt(a.condFrac * 100, 0) + '%，电容纹波电流 ' + fmt(a.icRms, 2) + ' A）；<b>设计已改用该母线电压</b>。<br>') +
        (a.holdMs > 0 ? ('保持 ' + fmt(a.holdMs, 0) + ' ms 后母线 ' + fmt(a.vAtHold, 1) + ' V（下限 ' + fmt(a.holdVmin, 0) + ' V）→ 需要 C_bus ≥ ' + fmt(a.cReqUf, 0) + ' µF。<br>') : '') +
        '提示：母线电容太小会把谷值拉得很低，匝数与占空比会随之变化——这正是"先定母线、再设计变压器"的顺序。</div>';
    }
    var t = r.tank;
    if (!t) {
      $('tankCard').style.display = 'none';
    } else {
      $('tankCard').style.display = '';
      var th = '<table><thead><tr><th>参数</th><th>值</th><th>校验</th></tr></thead><tbody>';
      th += '<tr><td>Rac（折算到原边的等效交流负载）</td><td>' + fmt(t.Rac, 2) + ' Ω</td><td>8n²Vo²/(π²Po)</td></tr>';
      th += '<tr><td>需要的增益范围 M</td><td>' + fmt(t.Mmin, 3) + ' ~ ' + fmt(t.Mmax, 3) + '</td><td>M = 2n·Vo/Vin（额定点 = 1）</td></tr>';
      th += '<tr><td>允许最大 Q / 取用 Q</td><td>' + fmt(t.Qmax, 4) + ' / ' + fmt(t.Q, 4) + '</td><td>峰值增益 ' + fmt(t.Mpeak, 3) + ' @ fn=' + fmt(t.fnPeak, 3) + '，裕量 ' + fmt(t.gainMargin, 3) + '×</td></tr>';
      th += '<tr><td>谐振频率 fr（k = Lm/Lr）</td><td>' + fmt(t.fr_kHz, 1) + ' kHz（k = ' + fmt(t.k, 2) + '）</td><td>调频范围 ≈ ' + fmt(t.fMin_kHz, 1) + ' ~ ' + fmt(t.fMax_kHz, 1) + ' kHz</td></tr>';
      th += '<tr><td>谐振电容 Cr</td><td>' + fmt(t.CrNf, 1) + ' nF</td><td>谐振电容峰值电压 ≈ ' + fmt(t.VcrPk, 1) + ' V，电流 ' + fmt(t.IpriRms, 2) + ' A rms</td></tr>';
      th += '<tr><td>谐振电感 Lr</td><td>' + fmt(t.LrUH, 2) + ' µH</td><td>可用变压器漏感 + 外串电感实现</td></tr>';
      th += '<tr><td>所需 Lm / 磁芯实得 Lm</td><td>' + fmt(t.LmReqUH, 1) + ' / ' + fmt(t.LmActUH, 1) + ' µH</td><td>' +
        (t.ALgiven ? '按给定 AL 校核，偏差 ' + fmt(t.LmErrPct, 0) + '%（&gt;20% 需调整气隙或 k）'
                   : '所需 AL = ' + fmt(t.ALreqNh, 0) + ' nH/N²，气隙 ≈ ' + fmt(t.gapMm, 3) + ' mm') + '</td></tr>';
      th += '<tr><td>ZVS：励磁峰值电流 vs 需要值</td><td>' + fmt(t.ImPk, 3) + ' A vs ' + fmt(t.IZvsNeed, 3) + ' A</td><td>' + (t.ImPk >= t.IZvsNeed ? '满足（t_dead 内可完成换流）' : '不足：需减小 Lm 或增大 t_dead') + '</td></tr>';
      th += '</tbody></table>';
      th += '<h3>增益曲线 M(fn)</h3><table><thead><tr><th class="num">fn = fsw/fr</th>';
      t.gainRow.forEach(function (g) { th += '<th class="num">' + fmt(g.fn, 1) + '</th>'; });
      th += '</tr></thead><tbody><tr><td><b>M</b></td>';
      t.gainRow.forEach(function (g) { th += '<td class="num">' + fmt(g.M, 3) + '</td>'; });
      th += '</tr></tbody></table>';
      /* 增益曲线（SVG）：虚线 = M_max / M_min 需求线 */
      var W = 560, H = 190, pad = 34, n = t.gainRow.length;
      var mMaxY = Math.max(t.Mpeak, t.Mmax) * 1.08, mMinY = 0;
      function px(i) { return pad + (W - 2 * pad) * (i / (n - 1)); }
      function py(m) { return H - pad - (H - 2 * pad) * ((m - mMinY) / (mMaxY - mMinY)); }
      var poly = t.gainRow.map(function (g, i) { return px(i).toFixed(1) + ',' + py(g.M).toFixed(1); }).join(' ');
      var svg = '<svg width="' + W + '" height="' + H + '" style="background:#fff;border:1px solid #dfe7f5;border-radius:8px">';
      svg += '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="#9ca3af"/>';
      svg += '<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (H - pad) + '" stroke="#9ca3af"/>';
      svg += '<line x1="' + pad + '" y1="' + py(1).toFixed(1) + '" x2="' + (W - pad) + '" y2="' + py(1).toFixed(1) + '" stroke="#c7d2fe" stroke-dasharray="4 3"/>';
      svg += '<text x="' + (W - pad - 4) + '" y="' + (py(1) - 4).toFixed(1) + '" font-size="10" fill="#6366f1" text-anchor="end">M=1</text>';
      svg += '<line x1="' + pad + '" y1="' + py(t.Mmax).toFixed(1) + '" x2="' + (W - pad) + '" y2="' + py(t.Mmax).toFixed(1) + '" stroke="#f59e0b" stroke-dasharray="4 3"/>';
      svg += '<text x="' + (W - pad - 4) + '" y="' + (py(t.Mmax) - 4).toFixed(1) + '" font-size="10" fill="#b45309" text-anchor="end">M_max=' + fmt(t.Mmax, 3) + '</text>';
      svg += '<line x1="' + pad + '" y1="' + py(t.Mmin).toFixed(1) + '" x2="' + (W - pad) + '" y2="' + py(t.Mmin).toFixed(1) + '" stroke="#10b981" stroke-dasharray="4 3"/>';
      svg += '<text x="' + (W - pad - 4) + '" y="' + (py(t.Mmin) - 4).toFixed(1) + '" font-size="10" fill="#0f766e" text-anchor="end">M_min=' + fmt(t.Mmin, 3) + '</text>';
      svg += '<polyline fill="none" stroke="#2563eb" stroke-width="2" points="' + poly + '"/>';
      svg += '<text x="' + px(n - 1) + '" y="' + (H - pad + 14) + '" font-size="10" fill="#6b7280" text-anchor="end">fn = fsw/fr</text>';
      svg += '<text x="' + pad + '" y="' + (pad - 8) + '" font-size="10" fill="#6b7280">M(fn)（Q=' + fmt(t.Q, 3) + ', k=' + fmt(t.k, 1) + '）</text>';
      svg += '</svg>';
      th += '<h3>增益曲线</h3>' + svg + '<div class="hint" style="margin-top:6px">峰值 ' + fmt(t.Mpeak, 3) + ' @ fn=' + fmt(t.fnPeak, 3) +
        '；轻载降增益需升频到 fn≈' + fmt(t.fnHighLight, 2) + '（' + fmt(t.fMaxLight_kHz, 0) + ' kHz）；FHA 渐近最小增益 k/(k+1) = ' + fmt(t.mMinAsymptote, 3) +
        '；所需 Lr/Lm = 1/k = ' + fmt(t.LrOverLm * 100, 1) + '%（可部分由变压器漏感实现，夹层绕法漏感通常为 Lm 的 0.3%~2%）。</div>';
      $('tankTable').innerHTML = th;
    }
    var html = '<table><thead><tr><th style="width:22%">步骤</th><th style="width:38%">公式</th><th>代入数值</th></tr></thead><tbody>';
    r.steps.forEach(function (s) {
      html += '<tr><td>' + esc(s.t) + '</td><td class="mono">' + esc(s.f) + '</td><td class="mono">' + esc(s.s) + '</td></tr>';
    });
    html += '</tbody></table>';
    $('stepTable').innerHTML = html;
  }
  function renderCores(r) {
    var rows = TD.coreComparison(r.inputs);
    var html = '<table><thead><tr><th>磁芯</th><th>族</th><th>来源</th><th class="num">Np/Ns</th><th class="num">Bpk (T)</th><th class="num">填充 %</th><th class="num">P_core (W)</th><th class="num">P_cu (W)</th><th class="num">ΔT (K)</th><th class="num">气隙 (mm)</th><th class="num">外围</th><th>结论</th><th></th></tr></thead><tbody>';
    rows.forEach(function (c) {
      if (c.error) { html += '<tr><td>' + esc(c.model) + '</td><td>' + esc(c.family) + '</td><td colspan="11">' + esc(c.error) + '</td></tr>'; return; }
      var core = TD.CORES.filter(function (x) { return x.model === c.model; })[0] || {};
      var srcTxt = core.src === 'measured' ? '实测' : (core.src === 'user' ? '用户' : (core.src === 'datasheet' ? '手册' : '预设'));
      html += '<tr><td>' + esc(c.model) + '</td><td>' + esc(c.family) + '</td><td>' + esc(srcTxt) + (core.alMeas > 0 ? '+AL' : '') + '</td><td class="num">' + c.Np + '/' + c.Ns + '</td><td class="num">' + fmt(c.Bpk, 3) +
        '</td><td class="num">' + fmt(c.fill, 1) + '</td><td class="num">' + fmt(c.Pcore, 3) + '</td><td class="num">' + fmt(c.Pcu, 3) +
        '</td><td class="num">' + fmt(c.dT, 1) + '</td><td class="num">' + (r.T.kind === 'flyback' ? fmt(c.gap, 3) : '—') +
        '</td><td class="num">' + (c.perFail ? '<span class="status warn">' + c.perFail + ' 项</span>' : '—') +
        '</td><td><span class="status ' + c.verdictClass + '">' + esc(c.verdict) + '</span></td>' +
        '<td><button class="mini" data-core="' + esc(c.model) + '" type="button">套用</button></td></tr>';
    });
    html += '</tbody></table>';
    $('coreTable').innerHTML = html;
    Array.prototype.forEach.call($('coreTable').querySelectorAll('button[data-core]'), function (b) {
      b.addEventListener('click', function () {
        $('corePreset').value = b.getAttribute('data-core');
        applyCorePreset(b.getAttribute('data-core'));
        render();
      });
    });
  }
  function renderFormulas() {
    /* ---------- 设计报告（可打印）与方案对比 ---------- */
    function buildReport(r) {
      if (!r || !r.ok) return '<p>无有效结果。</p>';
      var s = r.summary, rows = [];
      function kv(k, v) { return '<tr><td style="width:34%">' + esc(k) + '</td><td><b>' + esc(v) + '</b></td></tr>'; }
      var h = '<h2>变压器设计报告</h2><p style="font-size:12px;color:#555">由变压器快速设计/校核工具 v2 生成（' +
        new Date().toLocaleString() + '）。结论以样机实测为准。</p>';
      h += '<h3>1. 输入</h3><table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:13px">';
      [['拓扑', s.topologyLabel], ['Vin_min / Vin_max (V)', r.inputs.vinMin + ' / ' + r.inputs.vinMax],
       ['Vout / Iout (A)', r.inputs.vout + ' V / ' + r.inputs.iout + ' A'],
       ['Fs (kHz) / η', r.inputs.fs + ' / ' + r.inputs.eta],
       ['磁芯 / 材质', r.inputs.coreModelHint || (r.inputs.ae + ' mm² / ' + r.inputs.bsat100 + ' T')],
       ['磁复位方式', r.summary.resetMode === 'cap' ? '电容谐振复位（初级并联电容）' : '复位绕组'],
       ['绕组', 'Np=' + s.Np + ' / Ns=' + s.Ns + '（并联 P' + r.inputs.parP + ' / S' + r.inputs.parS + '）'],
       ['线材', 'P ' + fmt(s.wirePd, 3) + 'mm×' + s.wirePstrands + ' 股；S ' + fmt(s.wireSd, 3) + 'mm×' + s.wireSstrands + ' 股']
      ].forEach(function (x) { h += kv(x[0], x[1]); });
      h += '</table><h3>2. 计算结果</h3><table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:13px">';
      [['占空比 D(Vin_min) / D(Vin_max)', fmt(s.dNeedMin, 4) + ' / ' + fmt(s.dNeedMax, 4)],
       ['峰值/有效值电流（原边）', fmt(s.IpkPri, 2) + ' A / ' + fmt(s.IrmsPri, 2) + ' A'],
       ['副边峰值/有效值', fmt(s.IsPkSec, 2) + ' A / ' + fmt(s.IrmsSec, 2) + ' A'],
       ['ΔB_pp / Bpk（限值）', fmt(s.dBpp, 3) + ' / ' + fmt(s.Bpk, 3) + ' T（' + fmt(s.BsatAllow, 3) + ' T）'],
       ['电感 / AL / 气隙', (r.T.kind === 'flyback' ? fmt(s.LpUH, 2) + ' µH' : fmt(s.LmUH, 1) + ' µH') + ' / ' + fmt(s.ALreqNh || s.ALusedNh, 0) + ' nH/N² / ' + (r.T.kind === 'flyback' ? fmt(s.gapMm, 3) + ' mm' : '—')],
       ['窗口填充率 / 电流密度', fmt(s.fillPct, 1) + '% / Jp ' + fmt(s.Jpri, 2) + ' Js ' + fmt(s.Jsec, 2) + ' A/mm²'],
       ['DCR@25°C（并联值／单绕组）', fmt(s.RdcPri25Ohm * 1000, 1) + '／' + fmt(s.RdcPri25Ohm * 1000 * r.inputs.parP, 1) + ' mΩ（原边）'],
       ['损耗 / 温升', 'Pcu ' + fmt(s.Pcu, 3) + ' W，Pcore ' + fmt(s.Pcore, 3) + ' W → ΔT ' + fmt(s.dT, 1) + ' K'],
       ['满足目标温升所需 Rth', (isFinite(s.RthMax) ? fmt(s.RthMax, 1) : '—') + ' K/W']
      ].forEach(function (x) { h += kv(x[0], x[1]); });
      if (s.capReset) h += kv('电容谐振复位', 'C ≤ ' + fmt(s.capReset.crMaxNf, 2) + ' nF（取 ' + fmt(s.capReset.crNf, 2) + '），V_励磁 ' + fmt(s.capReset.vResetPk, 1) + ' V + V_漏感 ' + fmt(s.capReset.dVLk, 1) + ' V → Vds,pk ' + fmt(s.capReset.vdsPk, 1) + ' V');
      if (s.outStage && s.outStage.LoutUH) h += kv('输出电感', fmt(s.outStage.LoutUH, 2) + ' µH / ' + s.outStage.LoutN + ' 匝，Bpk ' + fmt(s.outStage.LoutBpk, 3) + ' T，气隙 ' + fmt(s.outStage.LoutGap, 3) + ' mm');
      if (s.outStage && s.outStage.naux) h += kv('辅助绕组', s.outStage.naux + ' 匝 → V_aux ≈ ' + fmt(s.outStage.auxV, 2) + ' V，DCR ' + fmt(s.outStage.auxRdc25 * 1000, 0) + ' mΩ');
      if (s.llcTank) h += kv('LLC 谐振腔', 'Lr ' + fmt(s.llcTank.LrUH, 2) + ' µH，Cr ' + fmt(s.llcTank.CrNf, 1) + ' nF，Lm_req ' + fmt(s.llcTank.LmReqUH, 1) + ' µH，Q ' + fmt(s.llcTank.Q, 3) + '，增益裕量 ' + fmt(s.llcTank.gainMargin, 2) + '×');
      h += '</table><h3>3. 校核清单</h3><table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:13px">';
      r.checks.forEach(function (c) {
        var v = (typeof c.value === 'number') ? fmt(c.value, Math.abs(c.value) < 1 ? 4 : 2) : c.value;
        var l = (typeof c.limit === 'number') ? fmt(c.limit, Math.abs(c.limit) < 1 ? 4 : 2) : c.limit;
        h += '<tr><td>' + esc(c.name) + '</td><td>' + esc(v) + ' ' + esc(c.unit) + '</td><td>' + esc(l) + ' ' + esc(c.limitUnit) + '</td><td><b>' +
          (c.pass === false ? '不通过' : (c.warn ? '接近上限' : '通过')) + '</b></td></tr>';
      });
      h += '</table><h3>4. 结论</h3><p style="font-size:14px"><b>' + esc(s.verdict) + '</b>（硬性不通过 ' + s.hardFail + ' 项，接近上限 ' + s.softWarn + ' 项）</p>';
      if (r.warns.length) h += '<h3>5. 提示</h3><ul style="font-size:13px">' + r.warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
      return h;
    }
    function openReport() {
      var html = buildReport(lastResult);
      try {
        var w = window.open('', '_blank');
        if (!w) { coreLibMsg('浏览器拦截了弹出窗口，请允许弹窗后重试。'); return; }
        w.document.write('<html><head><meta charset="utf-8"><title>变压器设计报告</title></head><body style="font-family:Segoe UI,Microsoft YaHei;padding:24px">' + html + '</body></html>');
        w.document.close();
        w.print();
      } catch (e) { coreLibMsg('生成报告失败：' + (e.message || e)); }
    }
    function parseVariants(text) {
      var out = [];
      String(text || '').split(/\r?\n/).forEach(function (line) {
        if (!line.trim()) return;
        var p = line.split(',').map(function (x) { return x.trim(); });
        var v = { name: p[0] || ('方案' + (out.length + 1)) };
        if (p[1]) v.npGiven = parseFloat(p[1]);
        if (p[2]) v.nsGiven = parseFloat(p[2]);
        if (p[3]) v.alNh = parseFloat(p[3]);
        if (p[4]) v.nlGiven = parseFloat(p[4]);
        if (p[5]) v.lmGiven = parseFloat(p[5]);
        if (p[6]) v.naux = parseFloat(p[6]);
        if (p[7]) { v.wireModeP = 'mm'; v.wireDiaP = parseFloat(p[7]); }
        if (p[8]) { v.wireModeP = 'mm'; v.strandsP = parseFloat(p[8]); }
        if (p[9]) { v.wireModeP = 'mm'; v.parP = parseFloat(p[9]); }
        if (p[10]) { v.wireModeS = 'mm'; v.wireDiaS = parseFloat(p[10]); }
        if (p[11]) { v.wireModeS = 'mm'; v.strandsS = parseFloat(p[11]); }
        if (p[12]) { v.wireModeS = 'mm'; v.parS = parseFloat(p[12]); }
        if (v.npGiven && v.nsGiven) v.auditMode = '1';
        out.push(v);
      });
      return out;
    }
    function runCompare() {
      var variants = parseVariants($('cmpInput').value);
      if (!variants.length) { coreLibMsg('对比失败：至少填一行（名称,Np,Ns,AL,…）。'); return; }
      var baseI = readInputs();
      var results = variants.map(function (v) {
        var name = v.name; var over = Object.assign({}, v); delete over.name;
        return { name: name, r: TD.design(Object.assign({}, baseI, over)) };
      });
      var cols = ['结论', 'Np/Ns', 'Lm/Lp (µH)', 'Bpk (T)', '填充 %', '原边 DCR (mΩ,单绕组)', '副边 DCR (mΩ,单绕组)', '温升 (K)', '硬性不通过', '提示'];
      var h = '<table><thead><tr><th>项目</th>' + results.map(function (x) { return '<th>' + esc(x.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
      function row(label, fn) { return '<tr><td>' + label + '</td>' + results.map(function (x) { return '<td>' + fn(x.r) + '</td>'; }).join('') + '</tr>'; }
      h += row('<b>结论</b>', function (r) { return '<span class="status ' + r.summary.verdictClass + '">' + esc(r.summary.verdict) + '</span>'; });
      h += row('Np / Ns', function (r) { return r.summary.Np + ' / ' + r.summary.Ns; });
      h += row('Lm（变压器）/ 输出电感 (µH)', function (r) { return fmt(r.summary.LmUH, 1) + ' / ' + (r.summary.outStage ? fmt(r.summary.outStage.LoutUH, 1) : '—'); });
      h += row('Bpk / 限值 (T)', function (r) { return fmt(r.summary.Bpk, 3) + ' / ' + fmt(r.summary.BsatAllow, 3); });
      h += row('窗口填充率 (%)', function (r) { return fmt(r.summary.fillPct, 1); });
      h += row('原边 DCR 单绕组 (mΩ)', function (r) { return fmt(r.summary.RdcPri25Ohm * 1000 * r.inputs.parP, 1); });
      h += row('副边 DCR 单绕组 (mΩ)', function (r) { return fmt(r.summary.RdcSec25Ohm * 1000 * r.inputs.parS, 1); });
      h += row('输出电感 Bpk (T)', function (r) { return r.summary.outStage && r.summary.outStage.LoutBpk ? fmt(r.summary.outStage.LoutBpk, 3) : '—'; });
      h += row('辅助电压 (V)', function (r) { return r.summary.outStage && r.summary.outStage.naux ? fmt(r.summary.outStage.auxV, 2) : '—'; });
      h += row('温升 ΔT (K)', function (r) { return fmt(r.summary.dT, 1); });
      h += row('硬性不通过项', function (r) { return String(r.summary.hardFail); });
      h += row('未通过项名称', function (r) { return esc(r.checks.filter(function (c) { return c.pass === false; }).map(function (c) { return c.name; }).join('；') || '—'); });
      h += '</tbody></table>';
      $('cmpTable').innerHTML = h;
    }
    function savePreset() {
      try {
        var name = ($('presetName').value || '').trim() || ('方案' + new Date().toLocaleString());
        if (!window.localStorage) { coreLibMsg('本浏览器不支持 localStorage。'); return; }
        var all = JSON.parse(window.localStorage.getItem('tde_designs') || '{}');
        all[name] = readInputs();
        window.localStorage.setItem('tde_designs', JSON.stringify(all));
        refreshPresetList();
        coreLibMsg('已保存方案：' + name);
      } catch (e) { coreLibMsg('保存失败：' + (e.message || e)); }
    }
    function refreshPresetList(sel) {
      var el = $('presetList');
      el.innerHTML = '';
      try {
        var all = JSON.parse((window.localStorage && window.localStorage.getItem('tde_designs')) || '{}');
        Object.keys(all).forEach(function (k) {
          var o = document.createElement('option'); o.value = k; o.textContent = k; el.appendChild(o);
        });
        if (sel) el.value = sel;
      } catch (e) { /* ignore */ }
    }
    function loadPreset() {
      try {
        var all = JSON.parse((window.localStorage && window.localStorage.getItem('tde_designs')) || '{}');
        var d = all[$('presetList').value];
        if (!d) { coreLibMsg('没有选中已保存的方案。'); return; }
        Object.keys(d).forEach(function (k) {
          var node = document.getElementById(k);
          if (node && typeof d[k] !== 'object') node.value = d[k];
        });
        render();
        coreLibMsg('已读取方案：' + $('presetList').value);
      } catch (e) { coreLibMsg('读取失败：' + (e.message || e)); }
    }
    function loadMyBoard() {
      var v = { topology: 'Forward', vinMin: 18, vinMax: 36, vout: 19, iout: 3.947, fs: 200, vf: 0.5, eta: 0.9,
        dutyMax: 0.65, deltaBTarget: 0.2, bsatDerate: 0.8, resetMode: 'cap', auditMode: '1', npGiven: 12, nsGiven: 23,
        alNh: 1146, ae: 52, le: 32, aw: 38, mlt: 34, corePreset: 'EPC19', matPreset: 'PC40',
        wireModeP: 'mm', wireDiaP: 0.4, strandsP: 2, parP: 2, wireModeS: 'mm', wireDiaS: 0.2, strandsS: 2, parS: 3,
        nlGiven: 38, lmGiven: 145, naux: 25, nlDia: 0.25, nlStrands: 1, nlPar: 4, vdsRated: 250, lkUh: 0.8,
        dcrLimitP: 32, ripplePct: 1, esrOhm: 0.01, rdsOnMOhm: 10, rth: 28, dtTarget: 40, tamb: 40, kPack: 1.25, kuMax: 0.4, jTarget: 4 };
      Object.keys(v).forEach(function (k) {
        var node = document.getElementById(k);
        if (node) node.value = v[k];
      });
      render();
      coreLibMsg('已载入 19V/75W 板（1号 12T/23T + 电容复位；2号 38T 输出电感 + 25T 辅助）。工作点与漏感请按实测修改。');
    }
    var rows = [
      ['Flyback / 反激', 'Vo = Vin·D/((1-D)·n)', 'ΔB = Lp·ΔI/(Np·Ae) = Vin·D/(Np·Ae·Fs)', '单极性，Bpk=ΔB；D 为开关导通占空比；Lp 由 ΔI/Ipk 决定'],
      ['Active Clamp Flyback', 'Vo ≈ Vin·D/((1-D)·n)', '同反激（钳位电容提供复位）', '单极性，Bpk=ΔB；漏感能量由钳位回路吸收'],
      ['Forward / 正激', 'Vo = Vin·D/n', 'ΔB = Vin·D/(Np·Ae·Fs)', '单极性，Bpk=ΔB；变比固定时伏秒积与 Vin 无关；1:1 复位绕组要求 D≤0.5'],
      ['Push-Pull / 推挽', 'Vo = 2·Vin·D/n', 'ΔB_pp = 2·Vin·D/(Np·Ae·Fs)', '双极性，Bpk=ΔB_pp/2；Np 为两半绕组总匝数，每个半绕组 Vin 耐受、电流为 2·Iout/n'],
      ['Half-Bridge / 半桥', 'Vo = Vin·D/n', 'ΔB_pp = (Vin/2)·D/(Np·Ae·Fs)', '双极性，Bpk=ΔB_pp/2；原边承受 Vin/2，一个周期正负各一次'],
      ['Full-Bridge / 全桥', 'Vo = 2·Vin·D/n', 'ΔB_pp = Vin·D/(Np·Ae·Fs)', '双极性，Bpk=ΔB_pp/2；原边承受全 Vin，两个半周期各一次'],
      ['LLC Resonant', 'Vo = Vin_nom/(2n)（谐振点）', 'ΔB_pp = (Vin/2)·0.5/(Np·Ae·Fs)', '双极性；谐振腔增益/软开关范围不在本工具范围']
    ];
    var html = '<table><thead><tr><th style="width:16%">拓扑</th><th style="width:20%">输出电压方程</th><th style="width:32%">磁通（伏秒积）</th><th>约定</th></tr></thead><tbody>';
    rows.forEach(function (r) { html += '<tr><td>' + esc(r[0]) + '</td><td class="mono">' + esc(r[1]) + '</td><td class="mono">' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td></tr>'; });
    html += '</tbody></table>';
    $('formulaTable').innerHTML = html;
    /* 把报告/对比/保存这些工具函数暴露给 init 里的按钮（render 之后才存在，故延迟查找） */
    window.__TD_UI__ = { buildReport: buildReport, openReport: openReport, runCompare: runCompare,
      savePreset: savePreset, loadPreset: loadPreset, loadMyBoard: loadMyBoard,
      refreshPresetList: refreshPresetList, parseVariants: parseVariants };
  }
  function showError(msg) {
    var b = $('errBox');
    b.hidden = false;
    b.innerHTML = '<strong>计算出错：</strong>' + esc(msg) +
      '<br>请检查输入是否合法（Ae/Aw/le/MLT>0、Vin_min≤Vin_max、Fs>0）。';
  }
  function clearError() { $('errBox').hidden = true; $('errBox').innerHTML = ''; }
  function render() {
    try {
      var inputs = readInputs();
      var r = TD.design(inputs);
      lastResult = r;
      if (!r.ok) {
        clearError();
        $('keyParams').innerHTML = '';
        $('checkTable').innerHTML = '';
        $('selfTest').innerHTML = '';
        $('sweepTable').innerHTML = '';
        $('stepTable').innerHTML = '';
        $('coreTable').innerHTML = '';
        $('outStage').innerHTML = '';
        $('tankTable').innerHTML = '';
        $('verdict').innerHTML = '<span class="status bad">输入无效 / INVALID INPUT</span><div class="hint">' + r.errs.map(esc).join('<br>') + '</div>';
        $('resultSub').textContent = '输入参数不完整或非法。';
        renderFormulas();
        return;
      }
      clearError();
      renderKeyParams(r);
      renderChecks(r);
      renderSweep(r);
      renderSteps(r);
      renderCores(r);
      renderFormulas();
    } catch (e) {
      showError(e && e.message ? e.message : String(e));
    }
  }
  function exportCSV() {
    var r = lastResult;
    if (!r || !r.ok) { showError('没有可导出的结果，请先修正输入。'); return; }
    var s = r.summary, rows = [];
    rows.push(['Parameter / 参数', 'Value', 'Unit']);
    rows.push(['Topology', s.topology, '']);
    rows.push(['Po', s.Po.toFixed(3), 'W']);
    rows.push(['Pin', s.Pin.toFixed(3), 'W']);
    rows.push(['Vin_min', r.inputs.vinMin, 'V']);
    rows.push(['Vin_max', r.inputs.vinMax, 'V']);
    rows.push(['Vout', r.inputs.vout, 'V']);
    rows.push(['Iout', r.inputs.iout, 'A']);
    rows.push(['Vf', r.inputs.vf, 'V']);
    rows.push(['Fs', r.inputs.fs, 'kHz']);
    rows.push(['eta', r.inputs.eta, '']);
    rows.push(['D_max_design', r.inputs.dutyMax, '']);
    rows.push(['D_required_at_Vin_min', s.dNeedMin.toFixed(5), '']);
    rows.push(['D_required_at_Vin_max', s.dNeedMax.toFixed(5), '']);
    rows.push(['Turns_ratio_target', s.nTarget.toFixed(5), '']);
    rows.push(['Turns_ratio_actual', s.n.toFixed(5), '']);
    rows.push(['Np', s.Np, 'turns']);
    rows.push(['Ns', s.Ns, 'turns']);
    rows.push(['Ipk_primary_worst', s.IpkPri.toFixed(4), 'A']);
    rows.push(['Irms_primary', s.IrmsPri.toFixed(4), 'A']);
    rows.push(['Ipk_secondary', s.IsPkSec.toFixed(4), 'A']);
    rows.push(['Irms_secondary', s.IrmsSec.toFixed(4), 'A']);
    rows.push(['dB_pp', s.dBpp.toFixed(5), 'T']);
    rows.push(['Bpk', s.Bpk.toFixed(5), 'T']);
    rows.push(['Bsat_allow', s.BsatAllow.toFixed(5), 'T']);
    rows.push(['Lp', s.LpUH.toFixed(3), 'uH']);
    rows.push(['Ls', s.LsUH.toFixed(3), 'uH']);
    if (r.T.kind !== 'flyback') rows.push(['Lm', s.LmUH.toFixed(3), 'uH']);
    if (r.T.kind === 'flyback') {
      rows.push(['AL_required', s.ALreqNh.toFixed(2), 'nH/N^2']);
      rows.push(['Air_gap_estimate', s.gapMm.toFixed(4), 'mm']);
    }
    rows.push(['Ae', r.inputs.ae, 'mm2']);
    rows.push(['Aw', r.inputs.aw, 'mm2']);
    rows.push(['le', r.inputs.le, 'mm']);
    rows.push(['MLT', r.inputs.mlt, 'mm']);
    rows.push(['Aw_required', s.AwReq.toFixed(2), 'mm2']);
    rows.push(['Fill_factor', s.fillPct.toFixed(2), '%']);
    rows.push(['Wire_primary_dia', s.wirePd.toFixed(4), 'mm']);
    rows.push(['Wire_primary_strands', s.wirePstrands, '']);
    rows.push(['Wire_primary_parallel', s.wirePpar, '']);
    rows.push(['Wire_secondary_dia', s.wireSd.toFixed(4), 'mm']);
    rows.push(['Wire_secondary_strands', s.wireSstrands, '']);
    rows.push(['Wire_secondary_parallel', s.wireSpar, '']);
    rows.push(['J_primary', s.Jpri.toFixed(3), 'A/mm2']);
    rows.push(['J_secondary', s.Jsec.toFixed(3), 'A/mm2']);
    rows.push(['DCR_primary_25C', (s.RdcPri25Ohm * 1000).toFixed(3), 'mOhm']);
    rows.push(['DCR_secondary_25C', (s.RdcSec25Ohm * 1000).toFixed(3), 'mOhm']);
    rows.push(['DCR_primary_hot', (s.RdcPriOhm * 1000).toFixed(3), 'mOhm']);
    rows.push(['DCR_secondary_hot', (s.RdcSecOhm * 1000).toFixed(3), 'mOhm']);
    if (s.npGiven) {
      rows.push(['Np_min_flux_limit', s.npMinFlux, 'turns']);
      rows.push(['Np_min_saturation_limit', s.npMinSat, 'turns']);
    }
    rows.push(['P_core', s.Pcore.toFixed(4), 'W']);
    rows.push(['P_cu', s.Pcu.toFixed(4), 'W']);
    rows.push(['P_total', s.Ptotal.toFixed(4), 'W']);
    rows.push(['Delta_T', s.dT.toFixed(2), 'K']);
    rows.push(['Rth_max_allowed', isFinite(s.RthMax) ? s.RthMax.toFixed(2) : '', 'K/W']);
    rows.push(['Skin_depth', s.skinMm.toFixed(4), 'mm']);
    if (s.outStage && s.outStage.buckDerived) {
      rows.push(['Output_inductor_L', s.outStage.LoutUH.toFixed(3), 'uH']);
      rows.push(['Output_inductor_turns', s.outStage.LoutN, 'turns']);
      rows.push(['Output_inductor_AL', s.outStage.LoutAL.toFixed(1), 'nH/N^2']);
      rows.push(['Output_inductor_gap', s.outStage.LoutGap.toFixed(4), 'mm']);
      rows.push(['Output_inductor_Bpk', s.outStage.LoutBpk.toFixed(4), 'T']);
      rows.push(['Output_inductor_dT', s.outStage.LoutdT.toFixed(1), 'K']);
    }
    if (s.outStage) {
      rows.push(['Output_cap_min', s.outStage.CoutUF.toFixed(2), 'uF']);
      rows.push(['Output_cap_Ic_rms', s.outStage.CoutIcRms.toFixed(3), 'A']);
      rows.push(['Output_cap_ESR_budget', s.outStage.CoutEsrMax.toFixed(1), 'mOhm']);
      rows.push(['Rectifier_loss_diode', s.outStage.Pdiode.toFixed(4), 'W']);
      rows.push(['Rectifier_loss_SR', s.outStage.Psr.toFixed(4), 'W']);
    }
    if (s.llcTank) {
      rows.push(['LLC_Rac', s.llcTank.Rac.toFixed(2), 'ohm']);
      rows.push(['LLC_Q_max', s.llcTank.Qmax.toFixed(4), '']);
      rows.push(['LLC_Q_used', s.llcTank.Q.toFixed(4), '']);
      rows.push(['LLC_Lr', s.llcTank.LrUH.toFixed(3), 'uH']);
      rows.push(['LLC_Cr', s.llcTank.CrNf.toFixed(2), 'nF']);
      rows.push(['LLC_Lm_required', s.llcTank.LmReqUH.toFixed(2), 'uH']);
      rows.push(['LLC_gain_margin', s.llcTank.gainMargin.toFixed(3), '']);
      rows.push(['LLC_freq_range_low', s.llcTank.fMin_kHz.toFixed(1), 'kHz']);
      rows.push(['LLC_freq_range_high', s.llcTank.fMax_kHz.toFixed(1), 'kHz']);
    }
    rows.push(['Verdict', s.verdict, '']);
    rows.push([]);
    rows.push(['Check', 'Value', 'Limit', 'Result']);
    r.checks.forEach(function (c) { rows.push([c.name, c.value, c.limit, c.pass === false ? 'FAIL' : (c.warn ? 'REVIEW' : 'OK')]); });
    rows.push([]);
    rows.push(['Vin', 'D', 'dB_pp', 'Bpk', 'Ipk_pri', 'Irms_pri', 'Irms_sec', 'Mode']);
    r.sweep.forEach(function (p) {
      rows.push([p.Vin.toFixed(3), p.D.toFixed(5), p.dBpp.toFixed(5), p.Bpk.toFixed(5), p.IpkPri.toFixed(4), p.IrmsPri.toFixed(4), p.IrmsSec.toFixed(4), (r.T.kind === 'flyback' ? (p.CCM ? 'CCM' : 'DCM') : '')]);
    });
    var csv = '\ufeff' + rows.map(function (row) { return row.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'transformer_design_v2.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function resetForm() {
    IDS.forEach(function (id) {
      var node = $(id);
      if (!node || !(id in DEFAULTS)) return;
      node.value = DEFAULTS[id];
    });
    render();
  }
  /* ---------- 磁芯库维护 ---------- */
  var BUILTIN_CORES = null;
  function coreLibMsg(t) { var el = $('coreLibMsg'); if (el) el.textContent = t; }
  function saveCoresLocal() {
    try { if (window.localStorage) window.localStorage.setItem('tde_cores', JSON.stringify(TD.CORES)); } catch (e) { /* 无 localStorage 时忽略 */ }
  }
  function loadCoresLocal() {
    try {
      if (!window.localStorage) return false;
      var raw = window.localStorage.getItem('tde_cores');
      if (!raw) return false;
      var list = JSON.parse(raw);
      if (Array.isArray(list) && list.length) { TD.setCores(list); return true; }
    } catch (e) { /* 解析失败则用内置库 */ }
    return false;
  }
  function dumpCores() { $('coreCsv').value = TD.coresToCsv(TD.CORES); }
  function applyCores() {
    var list = TD.parseCoreCsv($('coreCsv').value);
    if (!list.length) { coreLibMsg('解析失败：至少要有一行有效数据（model,family,Ae,le,Aw,MLT,…）'); return; }
    TD.setCores(list);
    saveCoresLocal();
    var keep = $('corePreset').value;
    buildCoreSelect();
    $('corePreset').value = keep;
    applyCorePreset(keep);
    render();
    coreLibMsg('已应用 ' + list.length + ' 个磁芯并保存在本机浏览器。预设未包含的字段（如 Bsat/µi/Pcv）仍由材质表提供。');
  }
  function resetCores() {
    if (BUILTIN_CORES) TD.setCores(JSON.parse(JSON.stringify(BUILTIN_CORES)));
    try { if (window.localStorage) window.localStorage.removeItem('tde_cores'); } catch (e) { /* ignore */ }
    buildCoreSelect();
    applyCorePreset($('corePreset').value);
    dumpCores();
    render();
    coreLibMsg('已恢复内置预设库。');
  }
  function buildCoreSelect() {
    var cp = $('corePreset');
    cp.innerHTML = '';
    for (var i = 0; i < TD.CORES.length; i++) {
      var o = document.createElement('option');
      o.value = TD.CORES[i].model;
      var src = TD.CORES[i].src === 'measured' ? '实测' : (TD.CORES[i].src === 'user' ? '用户' : '预设');
      o.textContent = TD.CORES[i].model + (TD.CORES[i].family === 'CUSTOM' ? '（自定义）' : '  · ' + TD.CORES[i].family)
        + '  [' + src + (TD.CORES[i].alMeas > 0 ? ' AL' : '') + ']';
      cp.appendChild(o);
    }
  }
  function init() {
    BUILTIN_CORES = JSON.parse(JSON.stringify(TD.CORES));
    buildStaticSelects();
    if (loadCoresLocal()) buildCoreSelect();
    dumpCores();
    $('applyCoresBtn').addEventListener('click', applyCores);
    $('dumpCoresBtn').addEventListener('click', dumpCores);
    $('resetCoresBtn').addEventListener('click', resetCores);
    $('strandsP').value = '10';
    $('strandsS').value = '10';
    IDS.forEach(function (id) { if ($(id) && DEFAULTS[id] === undefined) DEFAULTS[id] = $(id).value; });
    Array.prototype.forEach.call(document.querySelectorAll('input,select'), function (n) {
      if (n.id && DEFAULTS[n.id] === undefined) DEFAULTS[n.id] = n.value;
    });
    $('corePreset').value = 'EE25/13/7';
    applyCorePreset('EE25/13/7');
    $('matPreset').value = 'PC40';
    applyMaterialPreset('PC40');
    DEFAULTS.ae = $('ae').value; DEFAULTS.le = $('le').value; DEFAULTS.aw = $('aw').value; DEFAULTS.mlt = $('mlt').value;
    DEFAULTS.bsat100 = $('bsat100').value; DEFAULTS.muI = $('muI').value; DEFAULTS.pcvRef = $('pcvRef').value;
    DEFAULTS.lossA = $('lossA').value; DEFAULTS.lossB = $('lossB').value;
    DEFAULTS.corePreset = 'EE25/13/7'; DEFAULTS.matPreset = 'PC40';
    IDS.forEach(function (id) {
      var node = $(id);
      if (!node || id === 'resetBtn' || id === 'exportBtn') return;
      node.addEventListener('input', render);
      node.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'corePreset') applyCorePreset($('corePreset').value);
        if (e.target && e.target.id === 'matPreset') applyMaterialPreset($('matPreset').value);
        render();
      });
    });
    $('resetBtn').addEventListener('click', resetForm);
    $('exportBtn').addEventListener('click', exportCSV);
    function ui(fn) { return function () { var u = window.__TD_UI__; if (u && typeof u[fn] === 'function') u[fn](); }; }
    $('cmpBtn').addEventListener('click', ui('runCompare'));
    $('reportBtn').addEventListener('click', ui('openReport'));
    $('saveBtn').addEventListener('click', ui('savePreset'));
    $('loadBtn').addEventListener('click', ui('loadPreset'));
    $('myBoardBtn').addEventListener('click', ui('loadMyBoard'));
    try { if (window.localStorage) { var u0 = window.__TD_UI__; } } catch (e) { /* ignore */ }
    render();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    window.addEventListener('load', render);
    window.__TD_READY__ = true;
    window.__TD_RENDER__ = render;
    window.__TD_APPLY_CORE__ = applyCorePreset;
    window.__TD_EXPORT__ = exportCSV;
    window.__TD_LAST__ = function () { return lastResult; };
  }
  try {
    init();
  } catch (e) {
    showError((e && e.message ? e.message : String(e)) + '（初始化阶段）');
  }
})();
