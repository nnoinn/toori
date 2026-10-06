// 세션 시작 브리핑
// - 로컬 main을 GitHub 최신으로 맞춘다(fast-forward만, 작업 중인 파일은 건드리지 않음)
// - 지난 세션 이후 머지된 변경, 새 팀 공지, 바뀐 규칙·문서, 현재 브랜치 상태, 내 PR·Issue 상태를 모은다
// - SessionStart 훅(.claude/settings.json)에서 실행되면 결과를 Claude의 컨텍스트로 넘긴다
// 수동 실행: node scripts/session-start.mjs --print
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PRINT = process.argv.includes('--print');
const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function run(cmd, args, timeout = 15000) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, windowsHide: true });
  return { ok: r.status === 0 && !r.error, out: (r.stdout || '').trim() };
}
const git = (...args) => run('git', args);
const ghJson = (...args) => {
  const r = run('gh', args, 12000);
  if (!r.ok) return null;
  try { return JSON.parse(r.out || 'null'); } catch { return null; }
};

const REVIEW_LABEL = {
  CHANGES_REQUESTED: '수정 요청됨 → 가장 먼저 반영',
  APPROVED: '승인됨 → 머지 대기',
  REVIEW_REQUIRED: '리뷰 대기',
};

function briefing() {
  if (!git('rev-parse', '--show-toplevel').ok) return null;

  const sections = [];
  const notes = [];
  const commonDir = git('rev-parse', '--git-common-dir').out;
  const stateFile = path.resolve(cwd, commonDir, 'jupjup-last-seen');
  const lastSeen = existsSync(stateFile) ? readFileSync(stateFile, 'utf8').trim() : '';

  if (!run('git', ['fetch', 'origin', '--prune', '--quiet'], 25000).ok) {
    notes.push('GitHub에서 최신 정보를 받지 못했다(인터넷 또는 gh 로그인 확인 필요). 아래는 마지막으로 받은 정보 기준이다.');
  }
  const originMain = git('rev-parse', '--verify', '--quiet', 'origin/main').out;
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out;
  const dirty = git('status', '--porcelain').out.split('\n').filter(Boolean).length;

  // 1) 로컬 main 최신화: fast-forward만 한다
  if (originMain) {
    if (branch === 'main') {
      if (dirty === 0) {
        if (!git('merge', '--ff-only', '--quiet', 'origin/main').ok) {
          notes.push('로컬 main을 최신으로 맞추지 못했다(fast-forward 불가). main에 직접 커밋한 것이 있는지 확인한다.');
        }
      } else {
        notes.push(`main 브랜치에 커밋 안 된 변경이 ${dirty}개 있다. main에서는 작업하지 않으므로, 새 브랜치로 옮기도록 안내한다.`);
      }
    } else if (git('merge-base', '--is-ancestor', 'main', 'origin/main').ok) {
      git('update-ref', 'refs/heads/main', 'origin/main');
    }
  }

  // 2) 지난 세션 이후 main에 들어온 것
  const known = lastSeen && git('cat-file', '-e', `${lastSeen}^{commit}`).ok;
  if (originMain && known && lastSeen !== originMain) {
    const merged = git('log', '--format=- %s', `${lastSeen}..${originMain}`).out;
    if (merged) sections.push(['지난 세션 이후 main에 머지된 변경', merged]);

    const changed = git('diff', '--name-only', lastSeen, originMain).out.split('\n')
      .filter((f) => /^(CLAUDE\.md|docs\/|\.env\.example|package\.json|\.claude\/)/.test(f));
    if (changed.length) {
      sections.push(['바뀐 규칙·문서·설정 파일 (지금 다시 읽는다)', changed.map((f) => `- ${f}`).join('\n')]);
    }

    const added = git('diff', '--unified=0', lastSeen, originMain, '--', 'docs/announcements.md').out
      .split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n').trim();
    if (added) sections.push(['새 팀 공지 (docs/announcements.md)', added]);
  } else if (originMain && !known) {
    // 처음 실행: 가장 최근 공지 하나를 보여준다
    const text = git('show', `${originMain}:docs/announcements.md`).out;
    const latest = text.split(/\n(?=## \d{4}-\d{2}-\d{2})/).find((s) => /^## \d{4}-\d{2}-\d{2}/.test(s));
    if (latest) sections.push(['가장 최근 팀 공지 (처음 실행이라 최신 1건만)', latest.trim()]);
  }

  // 3) 현재 작업 상태
  const status = [`- 현재 브랜치: ${branch}`, `- 커밋 안 된 변경: ${dirty}개`];
  if (branch !== 'main' && branch !== 'HEAD') {
    const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
    if (upstream.ok) {
      status.push(`- 아직 푸시 안 한 커밋: ${git('rev-list', '--count', '@{u}..HEAD').out || 0}개`);
    } else {
      status.push('- 이 브랜치는 아직 GitHub에 올린 적이 없다');
    }
    if (originMain) {
      const behind = Number(git('rev-list', '--count', `HEAD..${originMain}`).out || 0);
      if (behind > 0) status.push(`- main에 이 브랜치에 없는 커밋이 ${behind}개 있다. PR 전에 main을 합치도록 제안한다`);
    }
  }
  sections.push(['현재 작업 상태', status.join('\n')]);

  // 4) GitHub: 내 PR, 리뷰할 PR(nnoinn), 배정된 Issue
  const login = run('gh', ['api', 'user', '--jq', '.login'], 10000);
  if (!login.ok) {
    notes.push('gh 로그인 정보를 읽지 못해 PR·Issue 상태를 확인하지 못했다. 필요하면 `gh auth status`로 확인한다.');
  } else {
    const me = login.out;
    const myPrs = ghJson('pr', 'list', '--author', '@me', '--state', 'open', '--json', 'number,title,reviewDecision,isDraft') || [];
    if (myPrs.length) {
      sections.push(['내 열린 PR', myPrs.map((p) => `- #${p.number} ${p.title} — ${p.isDraft ? '초안' : (REVIEW_LABEL[p.reviewDecision] || '리뷰 대기')}`).join('\n')]);
    }
    if (me === 'nnoinn') {
      const all = ghJson('pr', 'list', '--state', 'open', '--json', 'number,title,author,reviewDecision') || [];
      const others = all.filter((p) => p.author?.login !== me);
      if (others.length) {
        sections.push(['리뷰할 팀원 PR', others.map((p) => `- #${p.number} ${p.title} (${p.author?.login}) — ${REVIEW_LABEL[p.reviewDecision] || '리뷰 대기'}`).join('\n')]);
      }
    }
    const issues = ghJson('issue', 'list', '--assignee', '@me', '--state', 'open', '--json', 'number,title') || [];
    if (issues.length) sections.push(['나에게 배정된 Issue', issues.map((i) => `- #${i.number} ${i.title}`).join('\n')]);
    sections.unshift(['사용자', `- GitHub: ${me}`]);
  }

  if (originMain) writeFileSync(stateFile, originMain);

  const header = [
    '[세션 시작 브리핑 — scripts/session-start.mjs가 자동으로 모은 정보]',
    'Claude가 할 일: 사용자의 첫 메시지에 답하기 전에 이 브리핑을 3~6줄로 먼저 알린다.',
    '우선순위: ① 수정 요청된 내 PR ② 새 공지의 "할 일" ③ 바뀐 규칙·문서는 지금 다시 읽고 무엇이 바뀌었는지 한 줄 ④ 현재 브랜치 상태와 오늘의 다음 단계 제안.',
    '새 소식이 없으면 "새 소식 없음"이라고 한 줄만 말하고 바로 사용자 요청을 처리한다.',
  ];
  const body = sections.map(([title, text]) => `### ${title}\n${text}`).join('\n\n');
  const tail = notes.length ? `\n\n### 참고\n${notes.map((n) => `- ${n}`).join('\n')}` : '';
  return `${header.join('\n')}\n\n${body}${tail}`;
}

let text = null;
try {
  text = briefing();
} catch (e) {
  text = `[세션 시작 브리핑 실패] ${e?.message || e}\nClaude가 할 일: 사용자에게 브리핑을 불러오지 못했다고 한 줄 알리고, \`node scripts/session-start.mjs --print\`를 다시 실행해 본다.`;
}

if (text) {
  if (PRINT) {
    process.stdout.write(`${text}\n`);
  } else {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
  }
}
process.exit(0);
