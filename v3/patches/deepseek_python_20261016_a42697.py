# -*- coding: utf-8 -*-
"""兜底修复：用正则匹配 common 定义里的 dIL，强制改回 I.rippleLout。
   同时确保 num() 有 null 检查。v3_final11 → v3_final14
"""
import io, os, sys, re

SRC = 'transformer_design_tool_v3_final11.html'
DST = 'transformer_design_tool_v3_final14.html'

if not os.path.exists(SRC):
    print('找不到 ' + SRC); sys.exit(1)

with io.open(SRC, 'r', encoding='utf-8') as f:
    html = f.read()

orig_len = len(html)
applied, skipped, missed = [], [], []

# ---------- 1. num() 加 null 检查 ----------
def sub(tag, old, new):
    global html
    if new in html and old not in html:
        skipped.append(tag + '（已应用过）'); return
    if old not in html:
        missed.append(tag); return
    html = html.replace(old, new, 1)
    applied.append(tag)

sub('num() null 检查',
    "function num(id, dflt) { var v = parseFloat($(id).value); return isFinite(v) ? v : dflt; }",
    "function num(id, dflt) { var node = $(id); if (!node) return dflt; var v = parseFloat(node.value); return isFinite(v) ? v : dflt; }")

# ---------- 2. 用正则把 common 里的 dIL 强制改回 I.rippleLout ----------
# common 定义特征：var common = { ... dIL: 任意内容, nSecWind: nSecWind };
m = re.search(r"var common = \{(.*?)\};", html, re.DOTALL)
if m:
    body = m.group(1)
    new_body = re.sub(r"dIL:\s*[^,}]+,", "dIL: I.rippleLout,", body, count=1)
    if new_body != body:
        html = html[:m.start(1)] + new_body + html[m.end(1):]
        applied.append('common.dIL 正则强制改回 I.rippleLout（原为 os.xxx）')
    else:
        skipped.append('common.dIL 已是 I.rippleLout（跳过）')
else:
    missed.append('找不到 var common = {...} 定义')

# ---------- 3. 再保险：把可能残留的 os.buckDerived 引用换成 I.rippleLout 兜底 ----------
old_a = "dIL: (os.buckDerived && os.dILmin > 0 ? os.dILmin : I.rippleLout), nSecWind: nSecWind };"
new_a = "dIL: I.rippleLout, nSecWind: nSecWind };"
if old_a in html:
    html = html.replace(old_a, new_a, 1)
    applied.append('精确匹配兜底：dIL 从 os.buckDerived 改为 I.rippleLout')
else:
    skipped.append('精确匹配的 os.buckDerived dIL 已不存在（跳过）')

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
    print('未找到匹配（需手工处理）：')
    for m in missed: print('  [!!] ' + m)
print('')
print('已生成：' + DST)