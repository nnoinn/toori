// 팀 확인 대기 목록: 누가 누구의 답을 기다리는지 GitHub에서 모은다(11/9)
// - 세션 시작 브리핑(scripts/session-start.mjs)이 맨 위에 "나에게 온 요청"으로 보여준다
// - 직접 보기: npm run inbox(나에게 온 것), npm run inbox -- --all(팀 전체)
// - GitHub Actions(.github/workflows/inbox.yml)가 고정 Issue "팀 확인 대기 목록"을 고친다: --update-issue
//
// 답을 기다리는 것으로 보는 것(열린 Issue·PR만 보고, 봇 글은 뺀다)
// 1. 누가 글에서 나를 @아이디로 불렀는데 그 뒤로 그 Issue·PR에 내 글이 없다("이름님"은 언급일 때가 많아 세지 않는다).
//    내 PR이면 새 커밋을 올린 것도 답한 것으로 본다. 11/1 전 글은 이 목록을 만들기 전 것이라 보지 않는다
// 2. 내 PR에 수정 요청(Changes requested) 리뷰가 달렸는데 그 뒤로 내 커밋이나 글이 없다
// 3. 내 마지막 글에 <!-- pending: 남은 것 --> 가 있다(일부만 답하고 이어서 답하기로 함)
// 4. nnoinn: 팀원 PR(초안 제외)을 아직 리뷰하지 않았거나, 마지막 리뷰·글 뒤에 새 커밋이 올라왔다
// 답만 하는 글(확인했어요)에는 @를 넣지 않는다. @를 넣으면 상대에게 새 요청이 된다.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DIRECTOR = 'nnoinn';
/** CLAUDE.md "팀" 표와 같게 둔다 */
export const TEAM = [
  { login: 'nnoinn', name: '현동훈' },
  { login: 'chosanai', name: '정찬형' },
  { login: 'alstjr62', name: '정민석' },
  { login: 'poiuyst282-ui', name: '강규민' },
];
export const INBOX_TITLE = '팀 확인 대기 목록';
/** 이보다 오래된 부름은 보지 않는다(목록을 만든 11/9 전에 쌓인 연결 Issue의 언급이 대부분 끝난 일이라서) */
export const TRACK_FROM = '2026-11-01T00:00:00+09:00';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const KST_OFFSET = 9 * HOUR;
const PENDING = /<!--\s*pending:?\s*([\s\S]*?)\s*-->/i;

export const nameOf = (login) => TEAM.find((m) => m.login === login)?.name ?? login;
const time = (iso) => (iso ? Date.parse(iso) : -Infinity);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cut = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** 사람을 부른 곳을 찾을 때는 주석·코드·인용은 뺀다(예시로 적은 @아이디는 부른 것이 아니다) */
export function plainText(body) {
  return (body ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n');
}

/** 글에서 @아이디로 부른 팀원 아이디들 */
export function mentionedLogins(body) {
  const text = plainText(body);
  return TEAM.filter(({ login }) => new RegExp(`@${escapeRegExp(login)}(?![A-Za-z0-9_-])`, 'i').test(text)).map(
    (m) => m.login,
  );
}

/** 목록에 보여줄 한 줄 요약: 부른 아이디, "OOO이에요." 인사, 마크다운 기호를 뺀다 */
export function excerpt(body, max = 70) {
  const text = plainText(body)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@[A-Za-z0-9_-]+/g, '')
    .replace(/[*_#|[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\S+이에요[.!]?\s*/u, '');
  return cut(text, max);
}

function post(author, body, at, url) {
  return { login: author?.login ?? null, bot: author?.__typename === 'Bot', body: body ?? '', at, url };
}

/** Issue·PR의 글(본문, 댓글, 리뷰)을 시간 순서로 늘어놓는다. 봇 글과 지운 계정 글은 뺀다 */
export function postsOf(node) {
  const reviews = (node.reviews?.nodes ?? [])
    .filter((r) => r.submittedAt)
    .map((r) => ({ ...post(r.author, r.body, r.submittedAt, r.url), review: r.state, oid: r.commit?.oid }));
  return [
    post(node.author, node.body, node.createdAt, node.url),
    ...(node.comments?.nodes ?? []).map((c) => post(c.author, c.body, c.createdAt, c.url)),
    ...reviews,
  ]
    .filter((p) => p.login && !p.bot)
    .sort((a, b) => time(a.at) - time(b.at));
}

/** nnoinn이 팀원 PR을 (다시) 리뷰해야 하는지. 마지막 리뷰·글 뒤에 새 커밋이 오면 다시 본다 */
function directorReview(node, posts, commit) {
  const last = posts.filter((p) => p.login === DIRECTOR).at(-1);
  if (!last) return { reason: 'review', again: false, since: node.createdAt, url: node.url };
  const committedAt = commit?.committedDate;
  if (time(committedAt) > time(last.at)) return { reason: 'review', again: true, since: committedAt, url: node.url };
  // 리뷰한 뒤 예전에 만든 커밋을 올린 경우: 리뷰한 커밋과 지금 커밋이 다르다
  if (last.review && last.oid && commit?.oid && last.oid !== commit.oid) {
    return { reason: 'review', again: true, since: last.at, url: node.url };
  }
  return null;
}

/** 한 사람(login)이 이 Issue·PR에서 답할 차례인지. 차례면 항목 하나, 아니면 null */
export function waitingItem(login, node) {
  const posts = postsOf(node);
  const isPr = node.kind === 'pr';
  const commit = isPr ? node.commits?.nodes?.[0]?.commit : null;
  const isAuthor = node.author?.login === login;
  const lastMine = posts.filter((p) => p.login === login).at(-1);
  // 내 PR이면 새 커밋도 내 답으로 본다
  const lastMineAt = Math.max(time(lastMine?.at), isPr && isAuthor ? time(commit?.committedDate) : -Infinity);
  const after = posts.filter((p) => p.login !== login && time(p.at) > lastMineAt);
  const base = {
    login,
    kind: node.kind,
    number: node.number,
    title: node.title,
    ...(isPr ? { ci: commit?.statusCheckRollup?.state ?? null, mergeable: node.mergeable ?? null } : {}),
  };

  const changes = isPr && isAuthor ? after.find((p) => p.review === 'CHANGES_REQUESTED') : null;
  if (changes) {
    return { ...base, reason: 'changes', since: changes.at, url: changes.url ?? node.url, from: [changes.login], excerpt: excerpt(changes.body) };
  }

  const calls = after.filter((p) => time(p.at) >= time(TRACK_FROM) && mentionedLogins(p.body).includes(login));
  if (calls.length) {
    const from = [...new Set(calls.map((p) => p.login))];
    return { ...base, reason: 'call', since: calls[0].at, url: calls[0].url ?? node.url, from, count: calls.length, excerpt: excerpt(calls[0].body) };
  }

  if (isPr && login === DIRECTOR && !isAuthor && !node.isDraft) {
    const review = directorReview(node, posts, commit);
    if (review) return { ...base, ...review, from: [node.author?.login], excerpt: '' };
  }

  const mark = lastMine?.body.match(PENDING);
  if (mark) {
    return { ...base, reason: 'pending', since: lastMine.at, url: lastMine.url ?? node.url, from: [], excerpt: excerpt(mark[1]) };
  }
  return null;
}

/** 팀원 모두의 답을 기다리는 항목. 오래 기다린 것부터 */
export function collectWaiting(repo) {
  const threads = [
    ...(repo.issues?.nodes ?? []).filter((n) => n.title !== INBOX_TITLE).map((n) => ({ ...n, kind: 'issue' })),
    ...(repo.pullRequests?.nodes ?? []).map((n) => ({ ...n, kind: 'pr' })),
  ];
  const items = [];
  for (const { login } of TEAM) {
    for (const node of threads) {
      const item = waitingItem(login, node);
      if (item) items.push(item);
    }
  }
  return items.sort((a, b) => time(a.since) - time(b.since));
}

/** 기다린 시간: 하루가 넘으면 "N일", 아니면 "N시간" */
export function waited(since, now) {
  const ms = Math.max(0, now.getTime() - time(since));
  return ms >= DAY ? `${Math.floor(ms / DAY)}일` : `${Math.max(1, Math.floor(ms / HOUR))}시간`;
}

const CI_LABEL = { SUCCESS: '검사 통과', FAILURE: '검사 실패', ERROR: '검사 실패', PENDING: '검사 중', EXPECTED: '검사 중' };

/** 무엇을 기다리는지 한 마디. 예: "정민석의 요청", "새 커밋, 다시 리뷰 · 검사 통과" */
export function whatLabel(item) {
  const names = (item.from ?? []).map(nameOf).join('·');
  const what = {
    call: `${names}의 요청${item.count > 1 ? ` ${item.count}개` : ''}`,
    changes: `${names}의 수정 요청`,
    review: item.again ? '새 커밋, 다시 리뷰' : 'PR 리뷰',
    pending: '이어서 답하기로 함',
  }[item.reason];
  const pr = item.kind === 'pr' ? [CI_LABEL[item.ci], item.mergeable === 'CONFLICTING' ? '충돌' : null] : [];
  return [what, ...pr].filter(Boolean).join(' · ');
}

/** 세션 시작 브리핑용: 한 사람의 목록. 없으면 빈 문자열 */
export function renderFor(login, items, now = new Date()) {
  return items
    .filter((i) => i.login === login)
    .map((i) => {
      const quote = i.excerpt ? `: "${i.excerpt}"` : '';
      return `- #${i.number} ${cut(i.title, 50)} — ${whatLabel(i)}, ${waited(i.since, now)}째${quote} ${i.url}`;
    })
    .join('\n');
}

const cell = (text) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** 고정 Issue "팀 확인 대기 목록"의 본문 */
export function renderBoard(items, now = new Date()) {
  const stamp = new Date(now.getTime() + KST_OFFSET).toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    '<!-- .github/workflows/inbox.yml이 scripts/inbox.mjs로 고친다. 손으로 고치지 않는다 -->',
    '누가 누구의 답을 기다리는지 모은 목록이에요. Issue·PR에 글이 올라오면 바로, 새 커밋·리뷰는 한 시간 안에 저절로 바뀌어요.',
    '',
    '- 글에 `@아이디`를 넣으면 그 사람이 답할 차례가 돼서 여기 올라와요. 그 사람이 같은 Issue·PR에 글을 남기면 빠져요',
    '- 답만 하는 글(확인했어요)에는 @를 넣지 않아요. @를 넣으면 상대에게 새 요청이 돼요',
    '- 일부만 답했으면 글 끝에 `<!-- pending: 남은 것 -->`을 넣어요. 다 답할 때까지 남아요',
    '- 기준은 `scripts/inbox.mjs` 맨 위 설명에 있어요. 세션 시작 브리핑에는 "나에게 온 요청"으로 나와요',
    '',
    `마지막 갱신: ${stamp} (한국 시각)`,
  ];
  for (const { login, name } of TEAM) {
    const mine = items.filter((i) => i.login === login);
    lines.push('', `### ${name} (${login}) · ${mine.length ? `${mine.length}건` : '없음'}`);
    if (!mine.length) continue;
    lines.push('', '| 기다린 시간 | 어디 | 무엇 | 내용 |', '| --- | --- | --- | --- |');
    for (const i of mine) {
      lines.push(`| ${waited(i.since, now)} | [#${i.number}](${i.url}) ${cell(cut(i.title, 40))} | ${cell(whatLabel(i))} | ${cell(i.excerpt ?? '')} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

const QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url createdAt body
        author { login __typename }
        comments(last: 50) { nodes { author { login __typename } body createdAt url } }
      }
    }
    pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url createdAt body isDraft mergeable
        author { login __typename }
        commits(last: 1) { nodes { commit { oid committedDate statusCheckRollup { state } } } }
        comments(last: 50) { nodes { author { login __typename } body createdAt url } }
        reviews(last: 30) { nodes { author { login __typename } body state submittedAt url commit { oid } } }
      }
    }
  }
}`;

/** gh 명령을 실행하고 출력을 돌려준다. 실패하면 이유를 담아 멈춘다 */
export function gh(args, { input, cwd, timeout = 30000 } = {}) {
  const r = spawnSync('gh', args, { cwd, input, timeout, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0 || r.error) {
    throw new Error(`gh ${args.slice(0, 2).join(' ')} 실패: ${(r.stderr || r.error?.message || '').trim()}`);
  }
  return r.stdout;
}

/** 열린 Issue·PR과 글·리뷰를 GraphQL 한 번으로 받는다 */
export function fetchRepo({ cwd, timeout } = {}) {
  const nameWithOwner =
    process.env.GITHUB_REPOSITORY || gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd, timeout }).trim();
  const [owner, name] = nameWithOwner.split('/');
  const out = gh(['api', 'graphql', '-f', `query=${QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`], { cwd, timeout });
  return JSON.parse(out).data.repository;
}

const withoutStamp = (text) => (text ?? '').replace(/\r\n/g, '\n').replace(/^마지막 갱신: .*$/m, '').trim();

/** 고정 Issue를 찾아 본문을 바꾼다. 없으면 만든다. 목록이 그대로면 고치지 않는다 */
function updateIssue(body) {
  const open = JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,body']));
  const issue = open.find((i) => i.title === INBOX_TITLE);
  if (!issue) {
    gh(['issue', 'create', '--title', INBOX_TITLE, '--body-file', '-'], { input: body });
    return `"${INBOX_TITLE}" Issue를 새로 만들었다`;
  }
  if (withoutStamp(issue.body) === withoutStamp(body)) return `#${issue.number}: 바뀐 것 없음`;
  gh(['issue', 'edit', String(issue.number), '--body-file', '-'], { input: body });
  return `#${issue.number}: 목록을 고쳤다`;
}

function main() {
  const args = process.argv.slice(2);
  const now = new Date();
  const items = collectWaiting(fetchRepo());
  if (args.includes('--update-issue')) {
    console.log(updateIssue(renderBoard(items, now)));
    return;
  }
  if (args.includes('--all')) {
    process.stdout.write(renderBoard(items, now));
    return;
  }
  const me = gh(['api', 'user', '--jq', '.login']).trim();
  const list = renderFor(me, items, now);
  const who = `${nameOf(me)}(${me})에게 온 요청`;
  process.stdout.write(list ? `${who} (아직 답하지 않음, 오래 기다린 것부터)\n${list}\n` : `${who}: 없음\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(e?.message || e);
    process.exit(1);
  }
}
