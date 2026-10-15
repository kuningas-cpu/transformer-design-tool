/* 当 github.com:443 被阻断、api.github.com 可用时，用 Git Data API 把本地 HEAD 推送上去。
   做法：把本地 HEAD 的 blob/tree/提交元数据原样搬到远端，使远端 commit SHA == 本地 commit SHA。
   令牌从环境变量 GH_TOKEN 读取，绝不打印。用法：node push_via_api.mjs <owner> <repo> [--dry] */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const OWNER = process.argv[2], REPO = process.argv[3];
const DRY = process.argv.includes('--dry');
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(2); }
const API = 'https://api.github.com';
const H = { Authorization: `token ${TOKEN}`, 'User-Agent': 'codex-push', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

async function api(method, path, body) {
  let last;
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(API + path, { method, headers: body ? { ...H, 'Content-Type': 'application/json' } : H, body: body ? JSON.stringify(body) : undefined });
      const text = await res.text();
      if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
      return text ? JSON.parse(text) : {};
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * i)); }
  }
  throw last;
}

const message = git('log', '-1', '--format=%B');
const meta = git('log', '-1', '--format=%an%x1f%ae%x1f%aI%x1f%cn%x1f%ce%x1f%cI').trim().split('\x1f');
const [an, ae, aI, cn, ce, cI] = meta;
let parents = git('log', '-1', '--format=%P').trim().split(' ').filter(Boolean);
const localSha = git('rev-parse', 'HEAD').trim();
const entries = git('ls-tree', '-r', '-z', 'HEAD').split('\0').filter(Boolean).map((l) => {
  const m = l.match(/^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/);
  return { mode: m[1], sha: m[3], path: m[4] };
});
console.log('本地 HEAD =', localSha.slice(0, 12), '| 文件', entries.length, '| 父提交', parents.map((p) => p.slice(0, 12)).join(',') || '(根提交)');

const me = await api('GET', '/user');
console.log('令牌身份 =', me.login, '| 目标 =', `${OWNER}/${REPO}`);
/* 本地历史与远端不一致时（例如上次推送的 commit 对象元数据不同），用远端 main 作父提交 */
if (process.argv.includes('--parent-from-remote')) {
  const h = await api('GET', `/repos/${OWNER}/${REPO}/commits/main`);
  console.log('改用远端 main 作为父提交:', h.sha.slice(0, 12));
  parents = [h.sha];
}
if (DRY) { entries.forEach((e) => console.log('  would upload', e.path)); process.exit(0); }

for (const e of entries) {
  /* 从 git 对象读内容（而不是工作区文件），保证与提交内容一致 */
  const content = execFileSync('git', ['cat-file', 'blob', e.sha]).toString('base64');
  const blob = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, { content, encoding: 'base64' });
  if (blob.sha !== e.sha) throw new Error('blob SHA 不一致: ' + e.path);
  console.log('  blob ✓', e.path);
}
const tree = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, {
  tree: entries.map((e) => ({ path: e.path, mode: e.mode, type: 'blob', sha: e.sha }))
});
const localTree = git('rev-parse', 'HEAD^{tree}').trim();
console.log('tree:', tree.sha.slice(0, 12), tree.sha === localTree ? '✓ 与本地一致' : '✗ 不一致');
const commit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
  message, tree: tree.sha, parents,
  author: { name: an, email: ae, date: aI }, committer: { name: cn, email: ce, date: cI }
});
console.log('commit:', commit.sha.slice(0, 12), commit.sha === localSha ? '✓ 与本地完全相同' : '✗ 与本地不同');
const ref = await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: true });
console.log('main →', ref.object.sha.slice(0, 12));
const head = await api('GET', `/repos/${OWNER}/${REPO}/commits/main`);
console.log('远端 main 现为', head.sha.slice(0, 12), '| 与本地一致:', head.sha === localSha);
