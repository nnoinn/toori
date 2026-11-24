// 끝난 브랜치 정리(11/24 nnoinn). 세션 시작 브리핑(scripts/session-start.mjs)이 쓴다.
// GitHub는 머지된 PR의 브랜치만 저절로 지운다. 머지하지 않고 닫은 PR(쌓인 PR을 위 PR로 같이 머지했거나 그만둔 PR)의
// 브랜치와 각자 컴퓨터의 로컬 브랜치는 남는다. 브랜치는 커밋을 가리키는 이름표라 많아도 느려지거나 돈이 들지 않지만,
// 끝난 브랜치가 쌓이면 어느 것이 진행 중인지 헷갈리고, 끝난 브랜치에 이어서 작업하는 실수가 생긴다.
// - 로컬(모두): PR이 머지되거나 닫혔고 그 뒤 커밋이 없는 브랜치는 지워도 된다(커밋은 GitHub의 PR에 남는다)
// - GitHub(nnoinn): PR이 끝났는데 남은 브랜치는 지우고(PR 화면의 Restore branch로 되돌릴 수 있다),
//   열린 PR 없이 오래된 브랜치는 주인에게 묻는다. 일요일 주간 점검 때 비운다

/** @typedef {{ number: number, headRefName: string, headRefOid: string, state: string }} Pr */
/** @typedef {{ name: string, tip: string, date?: string | undefined, author?: string | undefined }} Branch */

/** 열린 PR 없이 이 날수가 지난 GitHub 브랜치는 주인에게 묻는다. 매일 하는 백업 푸시(작업 흐름 3번)는 묻지 않으려고 1주로 둔다 */
export const STALE_DAYS = 7;

const STATE_LABEL = { MERGED: '머지됨', CLOSED: '닫힘' };
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `git for-each-ref --format=...`에서 탭(%09)으로 나눈 이름·끝 커밋·날짜·작성자를 읽는다
 * @param {string} text
 * @returns {Branch[]}
 */
export function parseRefs(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, tip, date, author] = line.split('\t');
      return { name, tip, date, author };
    });
}

/** @param {string} name @param {Pr[]} prs */
const hasOpenPr = (name, prs) => prs.some((p) => p.state === 'OPEN' && p.headRefName === name);

/**
 * 브랜치 끝 커밋이 머지되거나 닫힌 PR의 마지막 커밋과 같으면 그 PR. 같은 이름의 열린 PR이 있으면 진행 중이라 null
 * @param {{ name: string, tip: string }} branch
 * @param {Pr[]} prs
 * @returns {Pr | null}
 */
export function finishedPr(branch, prs) {
  if (hasOpenPr(branch.name, prs)) return null;
  return prs.find((p) => (p.state === 'MERGED' || p.state === 'CLOSED') && p.headRefOid === branch.tip) ?? null;
}

/**
 * 지워도 되는 로컬 브랜치. main과 keep(지금 브랜치, 다른 폴더(worktree)에 열린 브랜치)은 빼고, PR이 끝났고 그 뒤 커밋이 없는 것만
 * @template {{ name: string, tip: string }} B
 * @param {B[]} branches
 * @param {Pr[]} prs
 * @param {string[]} [keep]
 * @returns {(B & { pr: Pr })[]}
 */
export function localCleanup(branches, prs, keep = []) {
  const skip = new Set(['main', ...keep]);
  return branches.flatMap((b) => {
    if (skip.has(b.name)) return [];
    const pr = finishedPr(b, prs);
    return pr ? [{ ...b, pr }] : [];
  });
}

/**
 * GitHub에 남은 브랜치(nnoinn).
 * finished: PR이 끝났고 그 뒤 커밋이 없다 → 지운다.
 * ask: 열린 PR이 없고 마지막 커밋이 STALE_DAYS일을 넘었다(PR이 없거나, PR이 끝난 뒤 커밋이 더 있다) → 주인에게 묻는다
 * @param {Branch[]} branches
 * @param {Pr[]} prs
 * @param {Date} [now]
 */
export function remoteLeftovers(branches, prs, now = new Date()) {
  /** @type {(Branch & { pr: Pr })[]} */
  const finished = [];
  /** @type {(Branch & { days: number, pr: Pr | null })[]} */
  const ask = [];
  for (const b of branches) {
    if (b.name === 'main' || b.name === 'HEAD' || hasOpenPr(b.name, prs)) continue;
    const pr = finishedPr(b, prs);
    if (pr) {
      finished.push({ ...b, pr });
      continue;
    }
    const days = Math.floor((now.getTime() - new Date(b.date ?? '').getTime()) / DAY_MS);
    if (!(days >= STALE_DAYS)) continue;
    const last = prs.filter((p) => p.headRefName === b.name).sort((x, y) => y.number - x.number)[0] ?? null;
    ask.push({ ...b, days, pr: last });
  }
  return { finished, ask };
}

/** @param {Pr} pr */
const prLabel = (pr) => `#${pr.number} ${STATE_LABEL[/** @type {keyof typeof STATE_LABEL} */ (pr.state)] ?? pr.state}`;

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} line
 */
function bullets(items, line, max = 15) {
  const lines = items.slice(0, max).map(line);
  if (items.length > max) lines.push(`- 외 ${items.length - max}개`);
  return lines.join('\n');
}

/**
 * 브리핑의 '지워도 되는 로컬 브랜치' 본문. 없으면 null(브리핑에 칸을 만들지 않는다)
 * @param {{ name: string, pr: Pr }[]} items
 */
export function renderLocalCleanup(items) {
  return items.length ? bullets(items, (b) => `- ${b.name} (${prLabel(b.pr)})`) : null;
}

/**
 * nnoinn 브리핑의 '정리할 GitHub 브랜치' 본문. 없으면 null
 * @param {ReturnType<typeof remoteLeftovers>} leftovers
 */
export function renderRemoteLeftovers({ finished, ask }) {
  const parts = [];
  if (finished.length) {
    parts.push(
      `PR이 끝났는데 남은 브랜치 ${finished.length}개 → 사용자에게 알리고 \`git push origin --delete <이름…>\`으로 지운다(PR 화면의 Restore branch로 되돌릴 수 있다)`,
      bullets(finished, (b) => `- ${b.name} (${prLabel(b.pr)}, ${b.author})`),
    );
  }
  if (ask.length) {
    parts.push(
      `열린 PR 없이 ${STALE_DAYS}일 넘은 브랜치 ${ask.length}개 → 주인에게 PR을 올릴지 지울지 묻는다`,
      bullets(
        ask,
        (b) =>
          `- ${b.name} (${b.author}, 마지막 커밋 ${b.days}일 전, ${b.pr ? `${prLabel(b.pr)} 뒤에 커밋이 더 있다` : 'PR 없음'})`,
      ),
    );
  }
  return parts.length ? parts.join('\n') : null;
}
