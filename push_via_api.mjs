/* 当 github.com:443 被阻断、api.github.com 可用时，用 Git Data API 把本地 HEAD 推送上去。
   本机若开着本地代理（Windows Internet Settings 里 ProxyEnable=1，例如 127.0.0.1:7890），
   直连 api.github.com 会 ConnectTimeout（Node 的 fetch 默认不读系统代理），此时这样跑：
     PowerShell: $env:HTTPS_PROXY="http://127.0.0.1:7890"; $env:NODE_USE_ENV_PROXY="1"; node push_via_api.mjs <owner> <repo> --parent-from-remote
   做法：把本地 HEAD 的 blob/tree/提交元数据原样搬到远端，使远端 commit SHA == 本地 commit SHA。
   令牌从环境变量 GH_TOKEN 读取，绝不打印。用法：node push_via_api.mjs <owner> <repo> [--dry] */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';

const OWNER = process.argv[2], REPO = process.argv[3];
const DRY = process.argv.includes('--dry');
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(2); }
const API = 'https://api.github.com';
const H = { Authorization: `token ${TOKEN}`, 'User-Agent': 'codex-push', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/* Rebuild the exact remote commit object locally (same SHA), then point
   refs/remotes/origin/main and refs/heads/main at it and set upstream.
   GitHub's git/commits API returns dates in UTC; the raw object may keep the
   original +0800 offset and a different trailing-newline count, so try the
   small set of candidates and only accept an exact SHA match. */
function parseIsoDate(s) {
  const m = String(s).match(/^(.+?)([+-]\d{2}):(\d{2})$/);
  return { ts: Math.floor(Date.parse(s) / 1000), tz: m ? m[2] + m[3] : '+0000' };
}
function commitRaw(tree, parents, author, committer, msg, nl) {
  return [
    `tree ${tree}`,
    ...parents.map((p) => `parent ${p}`),
    `author ${author.name} <${author.email}> ${author.ts} ${author.tz}`,
    `committer ${committer.name} <${committer.email}> ${committer.ts} ${committer.tz}`,
    '',
    msg + '\n'.repeat(nl)
  ].join('\n');
}
function commitSha(raw) {
  return crypto.createHash('sha1').update(`commit ${Buffer.byteLength(raw)}\0${raw}`, 'utf8').digest('hex');
}
function reconstructRemoteCommit(c, meta, msg) {
  const aLocal = parseIsoDate(meta.aI), cLocal = parseIsoDate(meta.cI);
  const aApi = parseIsoDate(c.author.date), cApi = parseIsoDate(c.committer.date);
  const authors = [
    { name: meta.an, email: meta.ae, ...aLocal },
    { name: c.author.name, email: c.author.email, ...aApi }
  ];
  const committers = [
    { name: meta.cn, email: meta.ce, ...cLocal },
    { name: c.committer.name, email: c.committer.email, ...cApi }
  ];
  const msgs = [msg, c.message, msg.trimEnd(), c.message.trimEnd()];
  for (const a of authors) for (const cm of committers) for (const m of msgs) {
    for (const nl of [0, 1, 2, 3]) {
      const raw = commitRaw(c.tree.sha, c.parents.map((p) => p.sha), a, cm, m, nl);
      if (commitSha(raw) === c.sha) {
        execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { input: raw, encoding: 'utf8' });
        return true;
      }
    }
  }
  return false;
}

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
  const content = execFileSync('git', ['cat-file', 'blob', e.sha], { maxBuffer: 128 * 1024 * 1024 }).toString('base64');
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

/* Keep local Git tracking in sync even though this push bypassed git://. */
const remoteSha = commit.sha;
const sameTree = tree.sha === localTree;
if (reconstructRemoteCommit(commit, { an, ae, aI, cn, ce, cI }, message)) {
  execFileSync('git', ['update-ref', 'refs/remotes/origin/main', remoteSha]);
  const dirty = git('status', '--porcelain').trim();
  if (sameTree && !dirty) {
    execFileSync('git', ['update-ref', 'refs/heads/main', remoteSha]);
    execFileSync('git', ['branch', '--set-upstream-to=origin/main', 'main'], { stdio: 'inherit' });
    console.log('tracking: local main -> ' + remoteSha.slice(0, 12) + ' (origin/main)');
  } else {
    execFileSync('git', ['branch', '--set-upstream-to=origin/main', 'main'], { stdio: 'inherit' });
    console.warn('tracking: origin/main updated, but local main was not moved' +
      (sameTree ? '（工作区有未提交修改）' : '（远端 tree 与本地不一致）'));
  }
  console.log(git('status', '-sb').trim());
} else {
  console.warn('tracking: could not reconstruct the remote commit locally; origin/main/upstream not updated');
}
console.log('remote main:', head.sha.slice(0, 12));
