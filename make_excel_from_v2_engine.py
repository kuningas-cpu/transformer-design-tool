#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 v2 引擎的公式集生成 Excel 版（transformer_design_tool_v2.xlsx）。

与已废弃旧脚本的区别：匝数按伏秒平衡 ΔB = V·t/(Np·Ae)（不用正弦 4.44 系数）；
半桥 Vo = Vin·D/n；推挽按总匝数、半绕组单独算电流；磁芯库带来源标注与实测 AL；
内置活体自检（磁通两条路径、实测 AL 与几何推算对比、填充率往返）。

用法：
  python make_excel_from_v2_engine.py
  python make_excel_from_v2_engine.py --verify dump.json     # 用 formulas 计算后与引擎逐项比对
"""
import json
import math
import re
import sys

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.worksheet.datavalidation import DataValidation

OUT = 'transformer_design_tool_v2.xlsx'
MU0 = 4e-7 * math.pi
RHO25 = 1.758e-8
RHO100 = 2.266e-8

TOPOS = ['Flyback', 'Active Clamp Flyback', 'Forward', 'Push-Pull', 'Half-Bridge', 'Full-Bridge', 'LLC Resonant']
CORES = [
    ('EE16/8/5', 'EE', 20.1, 37.6, 26.0, 34, None, 'preset', '族量级典型值，请按数据手册覆盖'),
    ('EE19/8/5', 'EE', 22.5, 39.4, 33.0, 36, None, 'preset', '族量级典型值'),
    ('EE25/13/7', 'EE', 52.2, 57.5, 54.0, 50, None, 'preset', '族量级典型值'),
    ('EE30/15/7', 'EE', 60.0, 67.0, 73.0, 57, None, 'preset', '族量级典型值'),
    ('EE35/18/11', 'EE', 101, 68.4, 106, 66, None, 'preset', '族量级典型值'),
    ('EFD15/8/5', 'EFD', 15.0, 34.0, 19.0, 33, None, 'preset', '族量级典型值'),
    ('EFD20/10/7', 'EFD', 31.0, 46.5, 39.0, 41, None, 'preset', '族量级典型值'),
    ('EFD30/15/9', 'EFD', 69.0, 64.8, 82.0, 52, None, 'preset', '族量级典型值'),
    ('ETD29/16/10', 'ETD', 76.0, 70.4, 104, 62, None, 'preset', '族量级典型值'),
    ('ETD34/17/11', 'ETD', 97.1, 78.6, 138, 68, None, 'preset', '族量级典型值'),
    ('PQ26/20', 'PQ', 118, 46.9, 76.0, 50, None, 'preset', '族量级典型值'),
    ('PQ35/35', 'PQ', 212, 60.4, 158, 62, None, 'preset', '族量级典型值'),
    ('PQ50/50', 'PQ', 328, 93.6, 375, 97, None, 'preset', '族量级典型值'),
    ('RM6/I', 'RM', 36.6, 45.6, 32.0, 40, None, 'preset', '族量级典型值'),
    ('RM8/I', 'RM', 64.0, 53.0, 52.0, 48, None, 'preset', '族量级典型值'),
    ('RM10/I', 'RM', 98.0, 61.5, 70.0, 55, None, 'preset', '族量级典型值'),
    ('EP13', 'EP', 19.6, 25.0, 21.0, 30, None, 'preset', '族量级典型值'),
    ('EP17', 'EP', 33.9, 31.7, 37.0, 36, None, 'preset', '族量级典型值'),
    ('EPC13', 'EPC', 12.1, 24.2, 14.0, 29, None, 'preset', '族量级典型值'),
    ('EPC19', 'EPC', 52.0, 32.0, 38.0, 38, 1146, 'measured', 'AL=1146nH/N²、MLT≈38mm 来自天胜 TST1724 承认书；Ae=52/le=32/Aw=38 由 19V/75W 输出电感不饱和反推（待手册确认，两个供应商数据均已印证）'),
    ('EPC25', 'EPC', 30.0, 35.0, 34.0, 42, None, 'preset', '族量级典型值'),
    ('Custom', 'CUSTOM', 50.0, 55.0, 50.0, 50, None, 'user', '自定义：自行填写几何与实测 AL'),
]
MATS = [('PC40', 2300, 0.39, 70, 1.45, 2.50), ('PC44', 2400, 0.39, 60, 1.45, 2.50),
        ('PC95', 3300, 0.40, 50, 1.50, 2.45), ('N27', 2000, 0.38, 110, 1.45, 2.45),
        ('N87', 2200, 0.39, 70, 1.45, 2.45), ('N97', 2300, 0.41, 45, 1.50, 2.40),
        ('3C90', 2300, 0.32, 80, 1.45, 2.40), ('3C94', 2300, 0.33, 65, 1.45, 2.40),
        ('3F3', 1800, 0.29, 40, 1.60, 2.25), ('3F4', 1600, 0.30, 30, 1.65, 2.20)]

HDR = PatternFill('solid', fgColor='D9EAF7')
KEYF = PatternFill('solid', fgColor='FFF3D6')
SELF = PatternFill('solid', fgColor='EDE7F6')
BOLD = Font(bold=True)
SMALL = Font(size=9, color='555555')

# 输入表：(短名, 标签, 默认值, 说明)
INPUTS = [
    ('topo', '拓扑 / Topology', 'Flyback', '下拉选择，全部公式按此分支'),
    ('core', '磁芯型号 / Core model', 'EE25/13/7', '取自"磁芯库"，可按数据手册修改'),
    ('mat', '材质 / Material', 'PC40', '取自"材质"表'),
    ('secR', '副边整流方式 (ct/bridge)', 'ct', '桥式/推挽中心抽头按 2 个副边绕组统计窗口'),
    ('vinnomIn', 'Vin_nom (V)（LLC 用，0=取中点）', 0, 'LLC 额定输入'),
    ('nsover', 'Ns 手动覆盖（0=按公式取整）', 0, '评审供应商方案时直接填其匝数'),
    ('vinmin', 'Vin_min (V)', 9, ''),
    ('vinmax', 'Vin_max (V)', 36, ''),
    ('vout', 'Vout (V)', 12, ''),
    ('iout', 'Iout (A)', 2, ''),
    ('vf', 'Vf (V)', 0.5, '输出整流压降'),
    ('fsk', 'Fs (kHz)', 100, ''),
    ('eta', 'eta', 0.9, ''),
    ('dmaxin', 'D_max（Vin_min 处）', 0.45, '反激=开关；正激=单管；桥式=每管'),
    ('dbt', 'ΔB_target (T)', 0.2, '允许磁通摆幅（峰峰）'),
    ('kder', 'Bsat 降额系数', 0.8, ''),
    ('K', '纹波比 K=ΔI/Ipk（反激类）', 0.4, '2=BCM 边界'),
    ('dil', '输出电感纹波 ΔI_L (A)', 0.6, '正激/桥式，Vin_min 设计点'),
    ('jtarget', '目标电流密度 J (A/mm²)', 4, ''),
    ('kumax', '窗口利用率上限 Ku', 0.4, ''),
    ('kpack', '绕线填充系数 k_pack', 1.25, '排绕≈1.1、乱绕1.2~1.4'),
    ('rth', '热阻 Rth (K/W)', 28, ''),
    ('dtt', '目标温升 ΔT (K)', 40, ''),
    ('tamb', '环境温度 Tamb (°C)', 40, ''),
    ('fr', '高频电阻系数 F_R', 1.2, ''),
    ('rippct', '输出纹波允许值 (% of Vout)', 1, ''),
    ('esr', '输出电容 ESR (Ω)', 0.01, ''),
    ('rds', '同步整流 Rds(on) (mΩ)', 10, ''),
    ('vfbody', 'SR 体二极管压降 (V)', 0.8, ''),
    ('tdead', '死区时间 t_dead (ns)', 200, ''),
    ('wmP', '原边线径模式 (auto/mm)', 'mm', 'auto 只自动取线径；股数用输入值'),
    ('wdP', '原边单股线径 (mm)', 0.4, '手动模式'),
    ('wsP', '原边股数', 10, ''),
    ('wpP', '原边并联绕组数', 1, ''),
    ('wmS', '副边线径模式 (auto/mm)', 'mm', ''),
    ('wdS', '副边单股线径 (mm)', 0.4, ''),
    ('wsS', '副边股数', 10, ''),
    ('wpS', '副边并联绕组数', 1, ''),
]


SCENARIOS = {
    'flyback': {},
    'forward': {'topo': 'Forward', 'vinmin': 48, 'vinmax': 72, 'vout': 5, 'iout': 10},
    'halfbridge': {'topo': 'Half-Bridge', 'vinmin': 380, 'vinmax': 420, 'vout': 12, 'iout': 20},
    'llc': {'topo': 'LLC Resonant', 'vinmin': 380, 'vinmax': 420, 'vout': 12, 'iout': 10},
}


def build(scenario='flyback'):
    wb = Workbook()
    wb.remove(wb.active)
    ir = {k: "'Inputs'!$B$%d" % (3 + i) for i, (k, _, _, _) in enumerate(INPUTS)}

    # ---------------- 说明 ----------------
    ws = wb.create_sheet('Notes')
    ws['A1'] = '变压器快速设计/校核工具 v2 · Excel 版（由 v2 引擎公式生成）'
    ws['A1'].font = Font(bold=True, size=13)
    for i, t in enumerate([
        '',
        '用法：只改「输入」表黄色单元格；「计算」表全为公式；「校核」表给判定；「磁芯库/材质」表按数据手册维护。',
        '权威实现是同目录的 transformer_design_tool_v2.html（含 LLC 谐振腔设计、磁芯逐项对比、输入电压扫描、供应商承认书校核模式）。本表用于在 Excel 里改参数与出报告。',
        '',
        '核心公式（全部基于伏秒平衡，不使用正弦 4.44 系数）：',
        '  磁通 ΔB = V·t/(Np·Ae)，V·t = 施加电压 × 导通时间',
        '  变比：反激 Vo=Vin·D/((1-D)n)；正激 Vo=Vin·D/n；推挽/全桥 Vo=2Vin·D/n；半桥 Vo=Vin·D/n；LLC 谐振点 Vo=Vin_nom/(2n)',
        '  匝数 Np = max(磁通下限, 不饱和下限)；Ns 默认取四舍五入（可手动覆盖）；占空比是否超限在「校核」表提示',
        '  正激复位绕组 Nr/Np ≥ D/(1-D)（等价 D_max = Nr/(Nr+Np)，1:1 时 D≤0.5）',
        '  反激 Ipk = (Pin/(Vin_min·D_max))/(1-K/2)，Lp = Vin_min·D_max/(ΔI·Fs)；K≥2 时按 BCM 2·Pin/(Vin·D)',
        '  电流有效值用梯形精确式 √(D(Ia²+Ia·Ib+Ib²)/3)；反激副边 Is_pk = n·Ipk',
        '  气隙 AL = µ0·Ae/(lg+le/µi)；线圈 DCR = ρ·MLT·N/A_cu（本表按 100°C 折算）',
        '  损耗 P_cu=ΣI_rms²·R_dc·F_R；P_core = Pcv_ref·(Fs/100kHz)^α·(B_ac/100mT)^β·Ve，B_ac=ΔB_pp/2；ΔT=(P_core+P_cu)·Rth',
        '  输出级 输出电感 L=Vo(1-D)/(ΔI_L·Fs)；输出电容按纹波预算分解 ESR/容性分量；整流对比 Vf·I_avg 与 Rds(on)·I_rms²',
        '',
        '与网页版的差异：本表不含 LLC 谐振腔（Q_max 二分/增益曲线/ZVS）与磁芯逐项对比；铜电阻率固定 100°C（网页版按实际温度迭代）。',
        '',
        '自检：见「校核」表末尾的"活体自检"区（磁通两条路径、实测 AL 与几何推算对照、填充率往返），偏差应为 0（或按说明为信息项）。',
        '',
        '★ 验证状态（重要，请勿忽略）：本表"反激"分支已与引擎逐格比对一致（19/19 项，含 n/Np/Ns/占空比/ΔB/Bpk/Lp/各电流/填充率/J/DCR/损耗/温升）；',
        '   正激/推挽/半桥/全桥/LLC 分支的公式结构相同但尚未全部通过逐格比对（还有 3~4 处偏差未定位，涉及励磁电感单位与桥式原边有效值电流）。',
        '   在非反激拓扑下请以网页版 transformer_design_tool_v2.html 为准，或把本表当作需人工复核的草稿。',
        '   （比对命令：node verify_transformer_tool_v2.mjs --dump dump.json <scenario> 后 python make_excel_from_v2_engine.py --verify dump.json，scenario ∈ flyback/forward/halfbridge/llc）',
        '可信边界：公式与内部一致性由 379 项自动检查覆盖（含 2800 例随机工况），但无样机实测对照；磁芯/材质数据必须按数据手册覆盖；漏感、EMI、绝缘、瞬态未建模。',
    ], 2):
        ws.cell(row=i, column=1, value=t)
    ws.column_dimensions['A'].width = 160

    # ---------------- 输入 ----------------
    wi = wb.create_sheet('Inputs')
    wi['A1'] = '设计输入（黄色=需填写/选择）'
    wi['A1'].font = Font(bold=True, size=12)
    over = SCENARIOS.get(scenario, {})
    for i, (k, label, val, note) in enumerate(INPUTS, 3):
        if k in over:
            val = over[k]
        wi.cell(row=i, column=1, value=label).font = BOLD
        c = wi.cell(row=i, column=2, value=val)
        c.fill = KEYF
        c.alignment = Alignment(horizontal='center')
        wi.cell(row=i, column=3, value=note).font = SMALL
    for key, vals in [('topo', TOPOS), ('secR', ['ct', 'bridge']), ('wmP', ['auto', 'mm']), ('wmS', ['auto', 'mm'])]:
        dv = DataValidation(type='list', formula1='"%s"' % ','.join(vals), allow_blank=False)
        wi.add_data_validation(dv)
        dv.add(ir[key])
    dv = DataValidation(type='list', formula1='=Cores!$A$2:$A$%d' % (len(CORES) + 1), allow_blank=False)
    wi.add_data_validation(dv)
    dv.add(ir['core'])
    dv = DataValidation(type='list', formula1='=Materials!$A$2:$A$%d' % (len(MATS) + 1), allow_blank=False)
    wi.add_data_validation(dv)
    dv.add(ir['mat'])
    for col, w in [('A', 34), ('B', 14), ('C', 52)]:
        wi.column_dimensions[col].width = w

    # ---------------- 磁芯库 / 材质 ----------------
    wc = wb.create_sheet('Cores')
    for j, h in enumerate(['型号 model', '族 family', 'Ae (mm²)', 'le (mm)', 'Aw (mm²)', 'MLT (mm)',
                           '实测 AL (nH/N²)', '来源 src', '备注 note'], 1):
        c = wc.cell(row=1, column=j, value=h)
        c.fill = HDR
        c.font = BOLD
    for i, row in enumerate(CORES, 2):
        for j, v in enumerate(row, 1):
            wc.cell(row=i, column=j, value=v)
    for col, w in zip('ABCDEFGHI', [16, 8, 11, 10, 11, 11, 14, 10, 70]):
        wc.column_dimensions[col].width = w
    wm = wb.create_sheet('Materials')
    for j, h in enumerate(['材质', 'µi', 'Bsat@100°C (T)', 'Pcv_ref@100kHz/100mT (kW/m³)', 'α', 'β', '备注'], 1):
        c = wm.cell(row=1, column=j, value=h)
        c.fill = HDR
        c.font = BOLD
    for i, row in enumerate(MATS, 2):
        for j, v in enumerate(row, 1):
            wm.cell(row=i, column=j, value=v)
        wm.cell(row=i, column=7, value='典型值，请按数据手册校核').font = SMALL
    for col, w in [('A', 10), ('D', 28), ('G', 34)]:
        wm.column_dimensions[col].width = w

    # ---------------- 计算 ----------------
    wk = wb.create_sheet('Calc')
    rows = []

    def add(key, label, formula, note='', fmt='0.000'):
        rows.append([key, label, formula, note, fmt])

    for k, label, val, note in INPUTS:
        add(k, label, '=' + ir[k], note, 'text' if isinstance(val, str) else '0.###')
    add('fs', 'Fs (Hz)', '{fsk}*1000', '', '0')
    # 查表
    C = 'Cores!$A$2:$I$%d' % (len(CORES) + 1)
    M = 'Materials!$A$2:$G$%d' % (len(MATS) + 1)
    add('ae', 'Ae (mm²)', 'VLOOKUP({core},%s,3,FALSE)' % C, '', '0.0')
    add('le', 'le (mm)', 'VLOOKUP({core},%s,4,FALSE)' % C, '', '0.0')
    add('aw', 'Aw (mm²)', 'VLOOKUP({core},%s,5,FALSE)' % C, '', '0.0')
    add('mlt', 'MLT (mm)', 'VLOOKUP({core},%s,6,FALSE)' % C, '', '0.0')
    add('alm', '实测 AL (nH/N²)', 'IFERROR(VLOOKUP({core},%s,7,FALSE),0)' % C, '承认书/实测值优先于几何推算', '0')
    add('mui', 'µi', 'VLOOKUP({mat},%s,2,FALSE)' % M, '', '0')
    add('bsat', 'Bsat@100°C (T)', 'VLOOKUP({mat},%s,3,FALSE)' % M, '', '0.00')
    add('pcvref', 'Pcv_ref (kW/m³)', 'VLOOKUP({mat},%s,4,FALSE)' % M, '', '0')
    add('lalpha', 'α', 'VLOOKUP({mat},%s,5,FALSE)' % M, '', '0.00')
    add('lbeta', 'β', 'VLOOKUP({mat},%s,6,FALSE)' % M, '', '0.00')
    # 拓扑标志
    add('isFB', '反激类?', 'OR({topo}="Flyback",{topo}="Active Clamp Flyback")', '', 'bool')
    add('isFW', '正激?', '{topo}="Forward"', '', 'bool')
    add('isPP', '推挽?', '{topo}="Push-Pull"', '', 'bool')
    add('isHB', '半桥?', '{topo}="Half-Bridge"', '', 'bool')
    add('isFBR', '全桥?', '{topo}="Full-Bridge"', '', 'bool')
    add('isLLC', 'LLC?', '{topo}="LLC Resonant"', '', 'bool')
    add('isBP', '桥式(推挽/半桥/全桥)?', 'OR({isPP},{isHB},{isFBR})', '', 'bool')
    add('isBuck', '有输出电感?', 'OR({isFW},{isBP})', '', 'bool')
    add('g', 'g（Vo 方程 Vin 倍数）', 'IF(OR({isPP},{isFBR}),2,IF({isHB},1,0))', '', '0')
    add('fluxV', 'k_v（折到整个 Np）', 'IF(OR({isPP},{isFBR}),2,IF(OR({isHB},{isLLC}),0.5,1))', '', '0.0')
    add('dlim', '拓扑占空比上限', 'IF({isFB},0.6,IF({isFW},0.5,IF({isLLC},0.5,0.48)))', '', '0.00')
    add('dmax', 'D_max（钳位后）', 'MIN({dmaxin},{dlim})', '', '0.0000')
    add('po', 'Po (W)', '{vout}*{iout}', '', '0.00')
    add('pin', 'Pin (W)', '{po}/{eta}', '', '0.00')
    add('vo', 'Vo = Vout+Vf (V)', '{vout}+{vf}', '', '0.00')
    add('vinnom', 'Vin_nom（LLC 用）', 'IF({vinnomIn}>0,{vinnomIn},({vinmin}+{vinmax})/2)', '', '0.0')
    add('ntarget', '目标变比 n=Np/Ns',
        'IF({isFB},{vinmin}*{dmax}/((1-{dmax})*{vo}),IF({isFW},{vinmin}*{dmax}/{vo},'
        'IF({isBP},{g}*{vinmin}*{dmax}/{vo},{vinnom}/(2*{vo}))))', '', '0.0000')
    add('d_tmin', 'D_max 点占空比(Vin_min,目标比)',
        'IF({isFB},{ntarget}*{vo}/({vinmin}+{ntarget}*{vo}),IF({isFW},{ntarget}*{vo}/{vinmin},'
        'IF({isBP},{ntarget}*{vo}/({g}*{vinmin}),0.5)))', '', '0.0000')
    add('d_tmax', 'D@Vin_max(目标比)',
        'IF({isFB},{ntarget}*{vo}/({vinmax}+{ntarget}*{vo}),IF({isFW},{ntarget}*{vo}/{vinmax},'
        'IF({isBP},{ntarget}*{vo}/({g}*{vinmax}),0.5)))', '', '0.0000')
    add('vtmin', 'V·t@Vin_min (V·s)', '{fluxV}*{vinmin}*{d_tmin}/{fs}', '', '0.00E+00')
    add('vtmax', 'V·t@Vin_max (V·s)', '{fluxV}*{vinmax}*{d_tmax}/{fs}', '', '0.00E+00')
    add('vtw', 'V·t 最恶劣 (V·s)', 'MAX({vtmin},{vtmax})', '', '0.00E+00')
    add('ae_m2', 'Ae (m²)', '{ae}/1000000', '', '0.00E+00')
    add('npminflux', '磁通决定 Np 下限', 'MAX(1,CEILING({vtw}/({ae_m2}*{dbt}),1))', '', '0')
    add('ipk', '原边峰值 Ipk (A)',
        'IF({isFB},IF({K}>=2,2*{pin}/({vinmin}*{dmax}),({pin}/{vinmin}/{dmax})/(1-{K}/2)),'
        'IF({isLLC},{pin}/(0.5*{vinnom})*1.414,({iout}+{dil}/2)/{ntarget}))', '', '0.000')
    add('lp', 'Lp (µH)（反激）', 'IF({isFB},1000000*({vinmin}*{dmax}/({K}*{ipk}*{fs})),0)', '按纹波比反算', '0.00')
    add('dip', 'ΔI_pri (A)（反激）', 'IF({isFB},{K}*{ipk},0)', '', '0.000')
    add('iv', '谷值 (A)（反激）', 'IF({isFB},MAX({ipk}-{dip},0),0)', '', '0.000')
    # 与引擎一致：Lp 按设计点定，电流用"实际匝比对应的占空比"重算
    add('dipa', 'ΔI_pri@实际占空比 (A)', 'IF({isFB},{vinmin}*{dmin}/(({lp}/1000000)*{fs}),0)', '', '0.000')
    add('ipka', 'Ipk@实际占空比 (A)', 'IF({isFB},{pin}/({vinmin}*{dmin})+{dipa}/2,{ipk})', '与引擎同一约定', '0.000')
    add('iva', '谷值@实际占空比 (A)', 'IF({isFB},{pin}/({vinmin}*{dmin})-{dipa}/2,0)', '', '0.000')
    add('npmin', '不饱和决定 Np 下限', 'IF({isFB},CEILING(({lp}/1000000)*{ipk}/({ae_m2}*{bsat}*{kder}),1),0)', '', '0')
    add('np', 'Np (匝)', 'MAX(1,{npminflux},{npmin})', '磁通与不饱和下限取大者', '0')
    add('nsauto', 'Ns 自动取整', 'MAX(1,ROUND({np}/{ntarget},0))', '', '0')
    add('ns', 'Ns (匝)', 'IF({nsover}>0,{nsover},{nsauto})', '可手动覆盖（评审供应商方案）', '0')
    add('n', '实际变比 n=Np/Ns', '{np}/{ns}', '', '0.0000')
    add('dmin', 'D@Vin_min（实际比）',
        'IF({isFB},{n}*{vo}/({vinmin}+{n}*{vo}),IF({isFW},{n}*{vo}/{vinmin},'
        'IF({isBP},{n}*{vo}/({g}*{vinmin}),0.5)))', '', '0.0000')
    add('dmaxx', 'D@Vin_max（实际比）',
        'IF({isFB},{n}*{vo}/({vinmax}+{n}*{vo}),IF({isFW},{n}*{vo}/{vinmax},'
        'IF({isBP},{n}*{vo}/({g}*{vinmax}),0.5)))', '', '0.0000')
    add('vta', 'V·t（实际比，Vin_min 端）', '{fluxV}*{vinmin}*{dmin}/{fs}', '', '0.00E+00')
    add('vtb', 'V·t（实际比，Vin_max 端）', '{fluxV}*{vinmax}*{dmaxx}/{fs}', '', '0.00E+00')
    add('dbpp', 'ΔB_pp (T)', 'MAX({vta},{vtb})/({np}*{ae_m2})', '取两端较恶劣者（反激摆动最大在 Vin_max）', '0.0000')
    add('bsatall', '允许峰值 Bsat·降额 (T)', '{bsat}*{kder}', '', '0.000')
    add('alauto', 'AL (nH/N²)', 'IF({alm}>0,{alm},1000000*4*PI()*0.0000001*{mui}*{ae_m2}/({le}/1000))', '实测优先，否则 µ0·µi·Ae/le', '0')
    add('lm', 'Lm (µH) = AL·Np²', '{alauto}/1000000000*{np}*{np}*1000000', '', '0.00')
    add('dIm', 'ΔI_m (A) = V·t/Lm', '{vtw}/({lm}/1000000)', '', '0.0000')
    add('bpk', 'Bpk (T)', 'IF({isFB},{lp}/1000000*{ipka}/({np}*{ae_m2}),IF(OR({isBP},{isLLC}),{dbpp}/2,{dbpp}))',
        '单极性 Bpk=ΔB；双极性减半；反激 Lp·Ipk/(Np·Ae)', '0.0000')
    add('ipkt', '原边峰值(含励磁) (A)', 'IF({isFB},{ipk},{ipk}+{dIm}/2)', '', '0.000')
    # 副边梯形电流的上下沿（正激/桥式），摊平公式便于人工复核
    add('iaS', '副边电流下沿 (A)', '{iout}-{dil}/2', '', '0.000')
    add('ibS', '副边电流上沿 (A)', '{iout}+{dil}/2', '', '0.000')
    add('ia', '原边电流下沿 (A)', 'IF({isFB},0,{iaS}/{n})', '', '0.000')
    add('ib', '原边电流上沿 (A)', 'IF({isFB},0,{ibS}/{n})', '', '0.000')
    add('kbp', '推挽半绕组电流倍数', 'IF({isPP},2,1)', '推挽每个半绕组电流为 2·Iout/n', '0')
    add('iaP', '原边绕组下沿 (A)', '{kbp}*{ia}', '', '0.000')
    add('ibP', '原边绕组上沿 (A)', '{kbp}*{ib}', '', '0.000')
    add('dutyP', '桥式原边导通占比', 'IF({isPP},{dmin},2*{dmin})', '推挽每半绕组一周期导通一次', '0.0000')
    add('dutyS', '副边导通占比', 'IF({isBP},IF({secR}="ct",{dmin},2*{dmin}),{dmin})', '', '0.0000')
    add('irmsP', '原边 I_rms (A)',
        'IF({isFB},SQRT({dmin}*({ipka}^2+{ipka}*{iva}+{iva}^2)/3),'
        'IF({isFW},SQRT({dmin}*({ia}^2+{ia}*{ib}+{ib}^2)/3+{dmin}*{dIm}^2/12),'
        'IF({isBP},SQRT({dutyP}*({iaP}^2+{iaP}*{ibP}+{ibP}^2)/3+{dIm}^2*{dutyP}/12),'
        '{pin}/(0.5*{vinnom}))))', '', '0.000')
    add('ispk', '副边峰值 Is_pk (A)',
        'IF({isFB},{n}*{ipka},IF({isLLC},1.5708*{iout},{iout}+{dil}/2))', '', '0.000')
    add('irsmS', '副边 I_rms (A)',
        'IF({isFB},{n}*SQRT((1-{dmin})*({ipka}^2+{ipka}*{iva}+{iva}^2)/3),'
        'IF({isLLC},1.1107*{iout},'
        'SQRT(IF({isBuck},{dutyS}*({iaS}^2+{iaS}*{ibS}+{ibS}^2)/3,({iaS}^2+{iaS}*{ibS}+{ibS}^2)/3))))', '', '0.000')
    add('iavgS', '副边导通期平均 (A)', 'IF({isFB},{pin}/{vo},IF({isFW},{dmin}*{iout},{iout}))', '', '0.000')
    add('nsecw', '副边绕组数', 'IF(AND({isBP},{secR}="ct"),2,1)', '', '0')
    add('dP', '原边单股线径 (mm)',
        'IF({wmP}="auto",CEILING(SQRT(4*({irmsP}/{jtarget})/({wsP}*{wpP})/PI()),0.05),{wdP})', '', '0.000')
    add('dS', '副边单股线径 (mm)',
        'IF({wmS}="auto",CEILING(SQRT(4*({irsmS}/{jtarget})/({wsS}*{wpS})/PI()),0.05),{wdS})', '', '0.000')
    add('acuP', '原边铜面积/匝 (mm²)', 'PI()/4*{dP}^2*{wsP}*{wpP}', '', '0.0000')
    add('acuS', '副边铜面积/匝 (mm²)', 'PI()/4*{dS}^2*{wsS}*{wpS}', '', '0.0000')
    add('resetN', '正激复位匝数 Nr', 'IF({isFW},CEILING({np}*{dmax}/(1-{dmax}),1),0)', 'Nr/Np ≥ D/(1-D)', '0')
    add('copperT', '总铜面积 (mm²)', '{np}*{acuP}+{ns}*{acuS}*{nsecw}+{resetN}*{acuP}', '', '0.000')
    add('fill', '窗口填充率 (%)', '{copperT}*{kpack}/{aw}*100', '与 Ku 比较', '0.00')
    add('awreq', '满足 Ku 所需 Aw (mm²)', '{copperT}*{kpack}/{kumax}', '', '0.0')
    add('jp', '原边电流密度 (A/mm²)', '{irmsP}/{acuP}', '', '0.00')
    add('js', '副边电流密度 (A/mm²)', '{irsmS}/{acuS}', '', '0.00')
    add('rdcP', '原边 DCR@25°C (mΩ)', '1000*%s*({mlt}/1000)*{np}/({acuP}/1000000)' % RHO25, '', '0.00')
    add('rdcS', '副边 DCR@25°C (mΩ)', '1000*%s*({mlt}/1000)*{ns}/({acuS}/1000000)' % RHO25, '', '0.00')
    add('pcuP', '原边铜损 (W)', '{irmsP}^2*%s*({mlt}/1000)*{np}/({acuP}/1000000)*{fr}' % RHO100, '', '0.000')
    add('pcuS', '副边铜损 (W)', '{irsmS}^2*%s*({mlt}/1000)*{ns}/({acuS}/1000000)*{fr}*{nsecw}' % RHO100, '', '0.000')
    add('pcu', '总铜损@100°C 初值 (W)', '{pcuP}+{pcuS}', '', '0.000')
    add('rho20', '铜电阻率@20°C (Ω·m)', '0.00000001724', '', '0.00000E+00')
    add('dt0', '温升初值 (K)', '({pcu}+{pcore})*{rth}', '用 100°C 初值先估一次', '0.00')
    add('thot', '绕组温度估计 (°C)', '{tamb}+{dt0}', '', '0.0')
    add('rhof', '铜电阻率@绕组温度 (Ω·m)', '{rho20}*(1+0.00393*({thot}-20))', '', '0.00000E+00')
    add('pcuPr', '原边铜损（迭代）(W)', '{irmsP}^2*{rhof}*({mlt}/1000)*{np}/({acuP}/1000000)*{fr}', '', '0.000')
    add('pcuSr', '副边铜损（迭代）(W)', '{irsmS}^2*{rhof}*({mlt}/1000)*{ns}/({acuS}/1000000)*{fr}*{nsecw}', '', '0.000')
    add('pcur', '总铜损（一次温度迭代）(W)', '{pcuPr}+{pcuSr}', '引擎为收敛迭代，本表一次迭代', '0.000')
    add('bac', 'B_ac = ΔB_pp/2 (T)', '{dbpp}/2', '', '0.0000')
    add('pcv', 'Pcv (kW/m³)', '{pcvref}*({fsk}/100)^{lalpha}*({bac}*1000/100)^{lbeta}', '', '0.0')
    add('pcore', '磁芯损耗 (W)', '{pcv}*({ae}*{le})/1000000', 'Ve = Ae·le (mm³)', '0.000')
    add('ptot', '总损耗 (W)', '{pcur}+{pcore}', '', '0.000')
    add('dt', '温升 ΔT (K)', '{ptot}*{rth}', '', '0.00')
    add('rthmax', '满足目标温升所需 Rth (K/W)', '{dtt}/{ptot}', '', '0.0')
    # 输出级
    add('lout', '输出电感 L (µH)', 'IF({isBuck},1000000*{vo}*(1-{dmin})/({dil}*{fs}),0)', 'Vin_min 设计点', '0.00')
    add('dilmax', 'ΔI_L@Vin_max (A)', 'IF({isBuck},{dil}*(1-{dmaxx})/(1-{dmin}),0)', '', '0.000')
    add('ipl', '输出电感峰值 (A)', 'IF({isBuck},{iout}+{dilmax}/2,0)', '', '0.000')
    add('nlout', '输出电感匝数', 'IF({isBuck},CEILING({lout}/1000000*{ipl}/({ae_m2}*{bsatall}),1),0)', '', '0')
    add('allout', '输出电感 AL (nH/N²)', 'IF({isBuck},({lout}/1000000)/{nlout}^2*1000000000,0)', '', '0')
    add('gaplout', '输出电感气隙 (mm)',
        'IF({isBuck},1000*(4*PI()*0.0000001*{ae_m2}*{nlout}^2/({lout}/1000000) - {le}/1000/{mui}),0)',
        'AL = µ0·Ae/(lg+le/µi)，AL=L/N²', '0.000')
    add('bpklout', '输出电感 Bpk (T)', 'IF({isBuck},{lout}/1000000*{ipl}/({nlout}*{ae_m2}),0)', '', '0.0000')
    add('budget', '纹波预算 (V)', '{vout}*{rippct}/100', '', '0.0000')
    add('iccap', '输出电容纹波电流 (A)', 'IF({isBuck},{dilmax}/SQRT(12),SQRT(MAX({irsmS}^2-{iout}^2,0)))', '', '0.000')
    add('dicap', '电容纹波电流峰值 (A)',
        'IF({isBuck},{dilmax},IF({isLLC},SQRT(2)*{iccap},{ispk}))', '', '0.000')
    add('dvesr', 'ESR 分量 (V)', '{dicap}*{esr}', '', '0.0000')
    add('cout', '输出电容 C_min (µF)',
        'IF({dvesr}>={budget},0,IF({isBuck},1000000*{dilmax}/(8*{fs}*({budget}-{dvesr})),'
        'IF({isLLC},1000000*SQRT(2)*{iccap}/(2*PI()*{fs}*({budget}-{dvesr})),'
        '1000000*{iout}*{dmin}/({fs}*({budget}-{dvesr})))))', '', '0.0')
    add('esrmax', 'ESR 上限 (mΩ)', '{budget}/{dicap}*1000', '', '0.0')
    add('pdiode', '二极管损耗 (W)', '{vf}*{iavgS}', '', '0.000')
    add('psr', '同步整流损耗 (W)', '{rds}/1000*{irsmS}^2+{vfbody}*{iavgS}*(2*{tdead}/1000000000*{fs})', '', '0.000')
    add('icross', 'SR/二极管临界电流 (A)', '{vf}/({rds}/1000)', '', '0.00')

    # 写表：先确定 key→行号，再解析占位符
    keyrow = {r[0]: 3 + i for i, r in enumerate(rows)}
    pat = re.compile(r'\{([A-Za-z0-9_]+)\}')
    wk['A1'] = '计算结果 / Calculations'
    wk['A1'].font = Font(bold=True, size=12)
    for i, (key, label, formula, note, fmt) in enumerate(rows, 3):
        wk.cell(row=i, column=1, value=label).font = BOLD
        def sub(m):
            k = m.group(1)
            if k not in keyrow:
                raise KeyError('未定义的占位符 {%s}（公式：%s）' % (k, formula))
            return '$B$%d' % keyrow[k]
        f = pat.sub(sub, formula)
        if not f.startswith('='):
            f = '=' + f          # 手写公式统一补上前导等号，否则会被当成文本
        c = wk.cell(row=i, column=2, value=f)
        cell = 'B%d' % i
        if fmt == 'text':
            c.font = Font(size=10)
        elif fmt == 'bool':
            c.number_format = 'GENERAL'
        elif fmt == '0':
            c.number_format = '0'
        elif 'E' in fmt:
            c.number_format = '0.00E+00'
        else:
            c.number_format = fmt
        wk.cell(row=i, column=3, value=note).font = SMALL
        wk.cell(row=i, column=4, value=cell).font = Font(size=8, color='999999')
    for col, w in [('A', 30), ('B', 16), ('C', 46), ('D', 8)]:
        wk.column_dimensions[col].width = w

    # ---------------- 校核 ----------------
    wr = wb.create_sheet('Checks')
    wr['A1'] = '校核 / Checks（判定公式，随输入自动更新）'
    wr['A1'].font = Font(bold=True, size=12)
    def rf(k):
        return 'Calc!$B$%d' % keyrow[k]
    checks = [
        ('磁通峰值 Bpk ≤ Bsat·降额', rf('bpk'), rf('bsatall'), 'IF(%s<=%s,"通过","不通过")'),
        ('Vin_min 所需占空比 D ≤ 上限', rf('dmin'), rf('dlim'), 'IF(%s<=%s,"通过","不通过（需增大 Np 或提高 D 上限）")'),
        ('窗口填充率 ≤ Ku', rf('fill'), '%s*100' % rf('kumax'), 'IF(%s<=%s,"通过","不通过（换大磁芯或减线径）")'),
        ('原边电流密度（参考，以温升为准）', rf('jp'), '%s*1.25' % rf('jtarget'), 'IF(%s<=%s,"通过","高于目标 J，若温升允许可接受")'),
        ('副边电流密度（参考，以温升为准）', rf('js'), '%s*1.25' % rf('jtarget'), 'IF(%s<=%s,"通过","高于目标 J，若温升允许可接受")'),
        ('温升 ΔT ≤ 目标', rf('dt'), rf('dtt'), 'IF(%s<=%s,"通过","不通过（需降损耗或改散热）")'),
        ('正激复位绕组 Nr/Np ≥ D/(1-D)', 'IF(%s=TRUE,%s/%s,1)' % (rf('isFW'), rf('resetN'), rf('np')), 'IF(%s=TRUE,%s/(1-%s),1)' % (rf('isFW'), rf('dmax'), rf('dmax')), 'IF(%s>=%s,"通过","不通过：复位时间不足")'),
        ('输出电感 Bpk ≤ 允许值', rf('bpklout'), 'IF(%s,%s,999)' % (rf('isBuck'), rf('bsatall')), 'IF(%s<=%s,"通过/不适用","不通过（电感磁芯偏小）")'),
        ('输出电感气隙（≤2mm 工程可用）', rf('gaplout'), 'IF(%s,2,999)' % rf('isBuck'), 'IF(%s<=%s,"通过/不适用","气隙过大：改磁芯或磁粉芯")'),
        ('输出电容 ESR 占纹波预算 ≤50%', '%s/%s*100' % (rf('dvesr'), rf('budget')), 50, 'IF(%s<=%s,"通过","ESR 主导：需更低 ESR 或多只并联（C 列为 0 表示 ESR 单独已超预算）")'),
    ]
    r = 3
    for label, val, lim, tmpl in checks:
        wr.cell(row=r, column=1, value=label).font = BOLD
        wr.cell(row=r, column=2, value='=' + val).number_format = '0.000'
        wr.cell(row=r, column=3, value='=' + str(lim)).number_format = '0.000'
        parts = re.split(r'%s', tmpl)
        out = parts[0]
        for i, chunk in enumerate(parts[1:]):
            out += ('B%d' % r if i % 2 == 0 else 'C%d' % r) + chunk
        wr.cell(row=r, column=4, value='=' + out).font = Font(bold=True)
        r += 1
    r += 1
    wr.cell(row=r, column=1, value='活体自检 / Self-consistency（相对偏差，应≈0）').font = Font(bold=True, size=11)
    r += 1
    selfs = [
        ('ΔB 两条路径：V·t/(Np·Ae) vs Lp·ΔI/(Np·Ae)（反激）',
         'ABS(%s/(%s*%s)-(%s/1000000)*%s/(%s*%s))/MAX(%s/(%s*%s),0.000001)' %
         (rf('vta'), rf('np'), rf('ae_m2'), rf('lp'), rf('dip'), rf('np'), rf('ae_m2'), rf('vta'), rf('np'), rf('ae_m2'))),
        ('Lm = AL·Np² 往返',
         'ABS(%s/1000000000*%s*%s-(%s/1000000))/(%s/1000000)' % (rf('alauto'), rf('np'), rf('np'), rf('lm'), rf('lm'))),
        ('填充率往返：铜面积×k_pack/Aw',
         'ABS(%s/100*%s/%s-%s)/MAX(%s,0.000001)' % (rf('fill'), rf('aw'), rf('kpack'), rf('copperT'), rf('copperT'))),
        ('实测 AL 与几何推算 µ0·µi·Ae/le 的偏差（信息项：几何可疑时会明显偏离）',
         'IF(%s=0,0,ABS(%s-1000000*4*PI()*0.0000001*%s*%s/(%s/1000))/(1000000*4*PI()*0.0000001*%s*%s/(%s/1000)))' %
         (rf('alm'), rf('alm'), rf('mui'), rf('ae_m2'), rf('le'), rf('mui'), rf('ae_m2'), rf('le'))),
    ]
    for label, f in selfs:
        wr.cell(row=r, column=1, value=label).font = SMALL
        c = wr.cell(row=r, column=2, value='=' + f)
        c.number_format = '0.0000'
        c.fill = SELF
        r += 1
    for col, w in [('A', 62), ('B', 14), ('C', 14), ('D', 46)]:
        wr.column_dimensions[col].width = w
    return wb, keyrow, wk, wr


def verify(dump_path):
    """用 formulas 计算工作簿，并与引擎输出逐项比对。"""
    import formulas
    with open(dump_path, encoding='utf-8') as fh:
        d = json.load(fh)
    # 先重新生成并落盘，保证"文件内容"与"行号映射"一致（否则会拿旧文件比对错行）
    scen = d.get('scenario', 'flyback')
    print('—— 场景 %s ——' % scen)
    wb, keyrow, wk, wr = build(scen)
    save_workbook(wb)
    xl = formulas.ExcelModel().loads(OUT).finish()
    sol = xl.calculate()
    s = d['summary']

    # 解析 formulas 的输出：把各种键形式统一成 (工作表, 单元格) -> 数值
    vals = {}
    pat = re.compile(r"([A-Za-z0-9_]+)'?!([A-Z]{1,3}[0-9]{1,7})$")
    for k, v in sol.items():
        m = pat.search(k.upper())
        if not m:
            continue
        sheet, ref = m.group(1), m.group(2)
        try:
            val = v.value[0, 0]
        except Exception:
            val = v
        try:
            num = float(val)
        except (TypeError, ValueError):
            num = None
        if num is None and (sheet, ref) in vals:
            continue
        if num is None and (sheet, ref) not in vals:
            vals[(sheet, ref)] = val
        if num is not None:
            vals[(sheet, ref)] = num

    def cell(sheet, ref):
        return vals.get((sheet.upper(), ref.upper()))

    tests = [
        ('ntarget', s['nTarget'], '0000'),
        ('n', s['n'], '0000'),
        ('np', s['Np'], 0),
        ('ns', s['Ns'], 0),
        ('dmin', d['points']['vinMin']['D'], '0.0000'),
        ('dmaxx', d['points']['vinMax']['D'], '0.0000'),
        ('dbpp', s['dBpp'], '0.0000'),
        ('bpk', s['Bpk'], '0.0000'),
        ('lp' if scen == 'flyback' else 'lm', s['LpUH'], '0.00'),   # 非反激：引擎的 Lp 即励磁电感 Lm
        ('irmsP', s['IrmsPri'], '0.000'),
        ('ispk', s['IsPkSec'], '0.000'),
        ('irsmS', s['IrmsSec'], '0.000'),
        ('fill', s['fillPct'], '0.00'),
        ('jp', s['Jpri'], '0.00'),
        ('js', s['Jsec'], '0.00'),
        ('dt', s['dT'], 0.06),      # 本表铜损按"一次温度迭代"，引擎为收敛迭代 → 允许 6% 相对偏差
        ('pcore', s['Pcore'], '0.000'),
        ('rdcP', s['RdcPri25Ohm'] * 1000, '0.00'),
        ('rdcS', s['RdcSec25Ohm'] * 1000, '0.00'),
    ]
    bad = 0
    for key, want, fmt in tests:
        got = cell('Calc', 'B%d' % keyrow[key])
        try:
            gotf = float(got)
        except (TypeError, ValueError):
            print('  ✗ %-10s 单元格无值（%r）' % (key, got))
            bad += 1
            continue
        rel = fmt if isinstance(fmt, float) else 2e-3
        tol = max(abs(want) * rel, 0.02)
        okk = abs(gotf - want) <= tol
        print('  %s %-10s excel=%-12.5f engine=%-12.5f' % ('✓' if okk else '✗', key, gotf, want))
        if not okk:
            bad += 1
    print('\nExcel 版比对：%d/%d 项一致' % (len(tests) - bad, len(tests)))
    return bad


def save_workbook(wb, path=None):
    """保存 xlsx：原地写入并重试（Windows 上文件被杀软/查看器短暂占用是常态）。"""
    import time
    target = path or OUT
    last = None
    for _ in range(8):
        try:
            wb.save(target)
            return target
        except PermissionError as e:      # 被占用：等一会儿再试
            last = e
            time.sleep(1.0)
    # 极端情况：目标持续被占用，改用带时间戳的文件名，保证本次运行仍能产出结果
    import datetime
    alt = target.replace('.xlsx', '_%s.xlsx' % datetime.datetime.now().strftime('%H%M%S'))
    wb.save(alt)
    print('提示：%s 被占用，已改存为 %s（上次错误：%s）' % (target, alt, last))
    return alt


MONO_TXT = None

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

if __name__ == '__main__':
    if '--verify' in sys.argv:
        sys.exit(1 if verify(sys.argv[sys.argv.index('--verify') + 1]) else 0)
    wb, _, _, _ = build()
    print('written', save_workbook(wb))
