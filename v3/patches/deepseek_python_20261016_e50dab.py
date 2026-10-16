# -*- coding: utf-8 -*-
"""修复 patch12 引入的致命 JS 错误：common 里引用了尚未定义的 os 对象。"""
import io, os, sys

SRC = 'transformer_design_tool_v3_final11.html'
DST = 'transformer_design_tool_v3_final12.html'

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

# 唯一修改：把 common 里的 os 引用改回 I.rippleLout
old1 = "dIL: (os.buckDerived && os.dILmin > 0 ? os.dILmin : I.rippleLout), nSecWind: nSecWind };"
new1 = "dIL: I.rippleLout, nSecWind: nSecWind };"
sub('common 里去掉 os 引用', old1, new1)

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