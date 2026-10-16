# -*- coding: utf-8 -*-
"""修复 num() 缺少 null 检查导致的 TypeError。
   v3_final11 → v3_final13
"""
import io, os, sys

SRC = 'transformer_design_tool_v3_final11.html'
DST = 'transformer_design_tool_v3_final13.html'

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

# ---- num() 加 null 检查 ----
old1 = "function num(id, dflt) { var v = parseFloat($(id).value); return isFinite(v) ? v : dflt; }"
new1 = "function num(id, dflt) { var node = $(id); if (!node) return dflt; var v = parseFloat(node.value); return isFinite(v) ? v : dflt; }"
sub('num() null 检查', old1, new1)

# ---- readInputs 里 rippleLout 加注释（可选） ----
old2 = "      dutyMax: num('dutyMax', 0.45), rippleK: num('rippleK', 0.4), rippleLout: num('rippleLout', 0.6),"
new2 = "      dutyMax: num('dutyMax', 0.45), rippleK: num('rippleK', 0.4), rippleLout: num('rippleLout', 0.6),  /* rippleLout 的 input 已被 patch12 移除，num 会返回默认 0.6；此值仅作扫描占位，不影响设计点 */"
sub('readInputs rippleLout 注释', old2, new2)

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