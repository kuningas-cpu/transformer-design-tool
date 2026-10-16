# -*- coding: utf-8 -*-
"""给正激/推挽/半桥/全桥加 CCM/BCM/DCM 输出电感模式选择器。v3_final10 → v3_final11"""
import io, os, sys

SRC = 'transformer_design_tool_v3_final10.html'
DST = 'transformer_design_tool_v3_final11.html'

if not os.path.exists(SRC):
    print('找不到 ' + SRC); sys.exit(1)

with io.open(SRC, 'r', encoding='utf-8') as f:
    html = f.read()

orig_len = len(html)
applied, skipped, missed = [], [], []

def sub(tag, old, new):
    global html
    if new in html and old not in html:
        skipped.append(tag + '（已应用过）'); return
    if old not in html:
        missed.append(tag); return
    html = html.replace(old, new, 1)
    applied.append(tag)

# ---- 1. HTML：替换 rippleLout 输入为模式选择器 + K + D ----
old1 = '<div class="field" data-show="topo:Forward,Push-Pull,Half-Bridge,Full-Bridge"><label for="rippleLout">输出电感纹波 ΔI_L <span class="unit">(A，正激/桥式用)</span></label><input id="rippleLout" type="number" value="0.6" step="0.05" min="0"/></div>'
new1 = """<div class="field" data-show="topo:Forward,Push-Pull,Half-Bridge,Full-Bridge"><label for="buckMode">输出电感工作模式</label>
          <select id="buckMode">
            <option value="ccm">CCM 连续导通（指定 K = ΔI_L/Iout）</option>
            <option value="bcm">BCM 临界导通（K = 2，谷值=0）</option>
            <option value="dcm">DCM 断续导通（指定 D @ Vin_min）</option>
          </select></div>
        <div class="field" data-show="topo:Forward,Push-Pull,Half-Bridge,Full-Bridge&buckMode:ccm"><label for="buckRippleK">CCM 纹波比 K = ΔI_L/Iout <span class="unit">(无量纲，典型 0.2~0.4)</span></label><input id="buckRippleK" type="number" value="0.3" step="0.05" min="0.05" max="1.5"/></div>
        <div class="field" data-show="topo:Forward,Push-Pull,Half-Bridge,Full-Bridge&buckMode:dcm"><label for="buckDcmD">DCM 导通占空比 D @ Vin_min <span class="unit">(0.05~0.80)</span></label><input id="buckDcmD" type="number" value="0.4" step="0.01" min="0.05" max="0.80"/></div>"""
sub('1 HTML 模式选择器', old1, new1)

# ---- 2. IDS 加字段 ----
old2 = "'fbMode','fbDutyD','vorTarget','rippleLout',"
new2 = "'fbMode','fbDutyD','vorTarget','buckMode','buckRippleK','buckDcmD','rippleLout',"
sub('2 IDS', old2, new2)

# ---- 3. readInputs ----
old3 = "      vorTarget: num('vorTarget', 0),"
new3 = """      vorTarget: num('vorTarget', 0),
      buckMode: $('buckMode') ? String($('buckMode').value) : 'ccm',
      buckRippleK: num('buckRippleK', 0.3),
      buckDcmD: num('buckDcmD', 0.4),"""
sub('3 readInputs', old3, new3)

# ---- 4. showRuleHit cur 加 buckMode ----
old4 = """      fbMode: $('fbMode') ? String($('fbMode').value) : 'auto'
    };"""
new4 = """      fbMode: $('fbMode') ? String($('fbMode').value) : 'auto',
      buckMode: $('buckMode') ? String($('buckMode').value) : 'ccm'
    };"""
sub('4 showRuleHit', old4, new4)

# ---- 5. design() 重写 os.buckDerived 分支 ----
old5 = """    var os = { buckDerived: (T.kind === 'forward' || T.kind === 'bipolar') };
    /* 输出电感只存在于 Buck 型副边（正激/推挽/桥式）；其余拓扑该输入不参与任何计算 */
    os.dIL = os.buckDerived ? I.rippleLout : 0;
    os.dILmax = os.buckDerived ? I.rippleLout * (1 - dNeedMax) / Math.max(1 - dNeedMin, 1e-6) : 0;
    os.LoutUH = 0;
    if (os.buckDerived) {
      /* ΔI_L = Vo·(1-D)/(L·Fs)：纹波在 Vin_max（D 最小）最大，按 Vin_min 设计点定 L */
      /* 给了实测电感（如供应商承认书）就直接用它；给了匝数就用给定匝数 */
      var LoutH = lmGiven > 0 ? lmGiven * 1e-6 : Vo * (1 - dNeedMin) / (Math.max(I.rippleLout, 1e-6) * Fs);
      os.LoutUH = LoutH * 1e6;
      os.LoutLmGiven = lmGiven > 0;
      os.dILmin = Vo * (1 - dNeedMin) / (LoutH * Fs);
      os.dILmax = Vo * (1 - dNeedMax) / (LoutH * Fs);
      var IpkL = I.iout + os.dILmax / 2;
      var IrmsL = Math.sqrt(I.iout * I.iout + os.dILmax * os.dILmax / 12);
      os.LoutIpk = IpkL; os.LoutIrms = IrmsL;"""
new5 = """    var os = { buckDerived: (T.kind === 'forward' || T.kind === 'bipolar') };
    /* 输出电感只存在于 Buck 型副边（正激/推挽/桥式） */
    os.buckMode = (I.buckMode === 'bcm' || I.buckMode === 'dcm') ? I.buckMode : 'ccm';
    os.buckRippleK = numOr(I.buckRippleK, 0.3);
    os.buckDcmD = numOr(I.buckDcmD, 0.4);
    os.dIL = 0;
    os.dILmax = 0;
    os.LoutUH = 0;
    if (os.buckDerived) {
      /* 输出电感工作模式：CCM / BCM / DCM
         · CCM：用户填纹波比 K = ΔI_L/Iout；Lout = Vo(1-D_min)/(K·Iout·Fs)
         · BCM：K=2（谷值=0）；Lout = Vo(1-D_min)/(2·Iout·Fs)
         · DCM：用户填 D @ Vin_min；Pout = (Vs-Vo)²·D²/(2·Lout·Fs)，Vs = Vin_min/n */
      var LoutH;
      var buckReportExtra = '';
      if (lmGiven > 0) {
        LoutH = lmGiven * 1e-6;
        buckReportExtra = '（用实测电感，模式仅做参考）';
      } else if (os.buckMode === 'dcm') {
        var D_dcm = Math.min(Math.max(os.buckDcmD, 0.05), 0.80);
        var Vs_min_dcm = I.vinMin / nAch;
        var Pout_dcm = Vo * I.iout;
        var VLon_dcm = Vs_min_dcm - Vo;
        if (VLon_dcm <= 1e-6) {
          LoutH = Vo * (1 - dNeedMin) / (2 * I.iout * Fs);
          warns.push('DCM 模式：Vin_min 处次级脉冲电压 ' + Vs_min_dcm.toFixed(2) + ' V ≤ Vo ' + Vo.toFixed(2) + ' V，无法起振；已退回 BCM 公式。');
          buckReportExtra = '（Vs ≤ Vo，退回 BCM）';
        } else {
          LoutH = VLon_dcm * VLon_dcm * D_dcm * D_dcm / (2 * Pout_dcm * Fs);
          buckReportExtra = '，D @ Vin_min = ' + D_dcm.toFixed(3) + '，Vs = ' + Vs_min_dcm.toFixed(2) + ' V';
        }
      } else {
        var K_user = (os.buckMode === 'bcm') ? 2 : Math.min(Math.max(os.buckRippleK, 0.05), 1.9);
        var dIL_eff = K_user * I.iout;
        LoutH = Vo * (1 - dNeedMin) / (Math.max(dIL_eff, 1e-6) * Fs);
        buckReportExtra = '，K = ' + K_user.toFixed(2) + '（ΔI_L @ Vin_min = ' + dIL_eff.toFixed(3) + ' A）';
      }
      os.LoutUH = LoutH * 1e6;
      os.LoutLmGiven = lmGiven > 0;
      os.dILmin = Vo * (1 - dNeedMin) / (LoutH * Fs);
      os.dILmax = Vo * (1 - dNeedMax) / (LoutH * Fs);
      /* 反推实际工作模式 */
      var K_actual_min = (I.iout > 1e-9) ? (os.dILmin / I.iout) : 0;
      var K_actual_max = (I.iout > 1e-9) ? (os.dILmax / I.iout) : 0;
      if (K_actual_min >= 2 - 1e-3) os.buckModeActual = 'DCM';
      else if (K_actual_min >= 1.98) os.buckModeActual = 'BCM';
      else os.buckModeActual = 'CCM';
      os.K_actual_min = K_actual_min;
      os.K_actual_max = K_actual_max;
      os.buckReportExtra = buckReportExtra;
      var IpkL = I.iout + os.dILmax / 2;
      var IrmsL = Math.sqrt(I.iout * I.iout + os.dILmax * os.dILmax / 12);
      os.LoutIpk = IpkL; os.LoutIrms = IrmsL;"""
sub('5 design() buck 分支', old5, new5)

# ---- 6. common 里 dIL 换成 os.dILmin ----
old6 = "var common = { n: nAch, Vo: Vo, VinNom: I.vinNom > 0 ? I.vinNom : (I.vinMin + I.vinMax) / 2, Iout: I.iout, Pin: Pin, Fs: Fs, Lp: Lp, Lm: Lm, Np: Np, Ns: Ns, Ae: Ae, dIL: I.rippleLout, nSecWind: nSecWind };"
new6 = "var common = { n: nAch, Vo: Vo, VinNom: I.vinNom > 0 ? I.vinNom : (I.vinMin + I.vinMax) / 2, Iout: I.iout, Pin: Pin, Fs: Fs, Lp: Lp, Lm: Lm, Np: Np, Ns: Ns, Ae: Ae, dIL: (os.buckDerived && os.dILmin > 0 ? os.dILmin : I.rippleLout), nSecWind: nSecWind };"
sub('6 common dIL', old6, new6)

# ---- 7. steps 里输出电感说明行 ----
old7 = "steps.push({ t: '输出电感（Buck 型副边的 LC 滤波）', f: 'ΔI_L = Vo·(1-D)/(L·Fs) ;  N ≥ L·Ipk/(Ae·Bsat·k_der) ;  AL = L/N² ;  l_g = μ0·Ae/AL - le/µi',"
new7 = "steps.push({ t: '输出电感（Buck 型副边的 LC 滤波，模式 = ' + (os.buckModeActual || os.buckMode) + '）', f: '模式 = CCM/BCM/DCM ; ' + (os.buckMode === 'dcm' ? 'DCM: Lout = (Vs-Vo)²·D²/(2·Pout·Fs)' : 'CCM/BCM: Lout = Vo(1-D_min)/(K·Iout·Fs)') + ' ;  N ≥ L·Ipk/(Ae·Bsat·k_der) ;  AL = L/N² ;  l_g = μ0·Ae/AL - le/µi',"
sub('7 steps 输出电感说明', old7, new7)

# ---- 8. steps 输出电感数值行开头加模式提示 ----
old8 = "s: 'ΔI_L(设计点 Vin_min) = ' + I.rippleLout + ' A → ΔI_L(Vin_max) = ' + os.dILmax.toFixed(3) + ' A；L = ' + os.LoutUH.toFixed(2) +"
new8 = "s: '模式 = ' + (os.buckModeActual || os.buckMode) + (os.buckReportExtra || '') + '；ΔI_L(Vin_min) = ' + os.dILmin.toFixed(3) + ' A → ΔI_L(Vin_max) = ' + os.dILmax.toFixed(3) + ' A；L = ' + os.LoutUH.toFixed(2) +"
sub('8 steps 输出电感数值', old8, new8)

# ---- 9. UI 输出电感行加模式说明 ----
old9 = "rows.push(['输出电感 L', fmt(os.LoutUH, 2) + ' µH', 'ΔI_L 设计点 = ' + fmt(os.dIL, 3) + ' A，Vin_max 处最大 ' + fmt(os.dILmax, 3) + ' A']);"
new9 = "rows.push(['输出电感 L', fmt(os.LoutUH, 2) + ' µH', '模式 = ' + (os.buckModeActual || os.buckMode || '—') + '；ΔI_L(Vin_min) = ' + fmt(os.dILmin, 3) + ' A，Vin_max 处最大 ' + fmt(os.dILmax, 3) + ' A']);"
sub('9 UI 输出电感行', old9, new9)

with io.open(DST, 'w', encoding='utf-8', newline='\n') as f:
    f.write(html)

print('')
print('源文件字符数：' + str(orig_len))
print('输出文件字符数：' + str(len(html)))
print('已应用：')
for a in applied: print('  [OK] ' + a)
if skipped:
    print('已存在（跳过）：')
    for a in skipped: print('  [--] ' + a)
if missed:
    print('未找到匹配：')
    for m in missed: print('  [!!] ' + m)
print('')
print('已生成：' + DST)