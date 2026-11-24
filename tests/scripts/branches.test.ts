// 끝난 브랜치 정리(scripts/branches.mjs)가 지워도 되는 브랜치와 주인에게 물어볼 브랜치를 맞게 고르는지 확인한다.
import { describe, expect, it } from 'vitest';

import {
  finishedPr,
  localCleanup,
  parseRefs,
  remoteLeftovers,
  renderLocalCleanup,
  renderRemoteLeftovers,
  STALE_DAYS,
} from '../../scripts/branches.mjs';

type State = 'OPEN' | 'MERGED' | 'CLOSED';
const pr = (number: number, headRefName: string, headRefOid: string, state: State) => ({
  number,
  headRefName,
  headRefOid,
  state,
});

const NOW = new Date('2026-11-24T12:00:00+09:00');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const remote = (name: string, tip: string, days: number, author = 'Kyumin Kang') => ({
  name,
  tip,
  date: daysAgo(days),
  author,
});

describe('parseRefs: git for-each-ref 출력 읽기', () => {
  it('탭으로 나눈 이름·끝 커밋·날짜·작성자를 읽고 빈 줄은 건너뛴다', () => {
    expect(parseRefs('feat/a\tabc\t2026-11-24T11:54:00+09:00\tKyumin Kang\n\nfix/b\tdef\n')).toEqual([
      { name: 'feat/a', tip: 'abc', date: '2026-11-24T11:54:00+09:00', author: 'Kyumin Kang' },
      { name: 'fix/b', tip: 'def', date: undefined, author: undefined },
    ]);
  });
});

describe('finishedPr: PR이 끝났고 그 뒤 커밋이 없는 브랜치', () => {
  it('머지되거나 닫힌 PR의 마지막 커밋과 끝 커밋이 같으면 그 PR', () => {
    expect(finishedPr({ name: 'feat/a', tip: 'a1' }, [pr(10, 'feat/a', 'a1', 'MERGED')])?.number).toBe(10);
    expect(finishedPr({ name: 'feat/b', tip: 'b1' }, [pr(11, 'feat/b', 'b1', 'CLOSED')])?.number).toBe(11);
  });

  it('PR이 끝난 뒤 커밋이 더 있으면(끝 커밋이 다르면) 끝난 브랜치가 아니다', () => {
    expect(finishedPr({ name: 'feat/a', tip: 'a2' }, [pr(10, 'feat/a', 'a1', 'MERGED')])).toBeNull();
  });

  it('같은 이름의 열린 PR이 있으면 진행 중이라 끝난 브랜치가 아니다', () => {
    const prs = [pr(10, 'feat/a', 'a1', 'CLOSED'), pr(12, 'feat/a', 'a1', 'OPEN')];
    expect(finishedPr({ name: 'feat/a', tip: 'a1' }, prs)).toBeNull();
  });

  it('이름이 달라도 끝 커밋이 끝난 PR의 마지막 커밋이면 끝난 브랜치다(리뷰하려고 받은 pr-번호 브랜치)', () => {
    expect(finishedPr({ name: 'pr-10', tip: 'a1' }, [pr(10, 'feat/a', 'a1', 'MERGED')])?.number).toBe(10);
  });
});

describe('localCleanup: 지워도 되는 로컬 브랜치', () => {
  it('main, 지금 브랜치, 다른 폴더(worktree)에 열린 브랜치는 끝났어도 빼고 나머지 끝난 브랜치만 고른다', () => {
    const prs = [
      pr(1, 'main', 'm1', 'MERGED'),
      pr(10, 'feat/a', 'a1', 'MERGED'),
      pr(11, 'feat/b', 'b1', 'CLOSED'),
      pr(12, 'feat/c', 'c1', 'MERGED'),
      pr(13, 'feat/d', 'd1', 'MERGED'),
    ];
    const branches = [
      { name: 'main', tip: 'm1' },
      { name: 'feat/a', tip: 'a1' },
      { name: 'feat/b', tip: 'b1' },
      { name: 'feat/c', tip: 'c1' },
      { name: 'feat/d', tip: 'd1' },
      { name: 'feat/new', tip: 'n1' },
    ];
    const names = localCleanup(branches, prs, ['feat/c', 'feat/d']).map((b) => b.name);
    expect(names).toEqual(['feat/a', 'feat/b']);
  });
});

describe('remoteLeftovers: GitHub에 남은 브랜치(nnoinn 주간 점검)', () => {
  it('PR이 끝났고 그 뒤 커밋이 없으면 날짜와 상관없이 지울 목록이다', () => {
    const { finished, ask } = remoteLeftovers([remote('feat/a', 'a1', 0)], [pr(10, 'feat/a', 'a1', 'CLOSED')], NOW);
    expect(finished.map((b) => [b.name, b.pr.number])).toEqual([['feat/a', 10]]);
    expect(ask).toEqual([]);
  });

  it('열린 PR이 있는 브랜치, main, HEAD는 오래됐어도 건드리지 않는다', () => {
    const branches = [remote('feat/a', 'a2', 30), remote('main', 'm1', 30), remote('HEAD', 'm1', 30)];
    const { finished, ask } = remoteLeftovers(branches, [pr(10, 'feat/a', 'a1', 'OPEN')], NOW);
    expect(finished).toEqual([]);
    expect(ask).toEqual([]);
  });

  it(`PR 없이 ${STALE_DAYS}일이 지나면 주인에게 묻고, 그 전(매일 하는 백업 푸시)에는 묻지 않는다`, () => {
    const branches = [remote('feat/old', 'o1', STALE_DAYS), remote('feat/fresh', 'f1', STALE_DAYS - 1)];
    const { finished, ask } = remoteLeftovers(branches, [], NOW);
    expect(finished).toEqual([]);
    expect(ask.map((b) => [b.name, b.days, b.pr])).toEqual([['feat/old', STALE_DAYS, null]]);
  });

  it('PR이 끝난 뒤 커밋이 더 있고 오래됐으면 가장 최근 PR과 함께 묻는다', () => {
    const prs = [pr(10, 'feat/a', 'a1', 'MERGED'), pr(20, 'feat/a', 'a2', 'CLOSED')];
    const { finished, ask } = remoteLeftovers([remote('feat/a', 'a3', 9)], prs, NOW);
    expect(finished).toEqual([]);
    expect(ask.map((b) => [b.name, b.pr?.number])).toEqual([['feat/a', 20]]);
  });

  it('마지막 커밋 날짜를 읽지 못하면 묻지 않는다', () => {
    const { ask } = remoteLeftovers([{ name: 'feat/x', tip: 'x1', date: undefined, author: 'A' }], [], NOW);
    expect(ask).toEqual([]);
  });
});

describe('브리핑 문구', () => {
  it('정리할 것이 없으면 null이라 브리핑에 칸이 생기지 않는다', () => {
    expect(renderLocalCleanup([])).toBeNull();
    expect(renderRemoteLeftovers({ finished: [], ask: [] })).toBeNull();
  });

  it('로컬은 브랜치 이름과 PR 번호·상태를 보여 준다', () => {
    const items = localCleanup([{ name: 'feat/a', tip: 'a1' }], [pr(10, 'feat/a', 'a1', 'CLOSED')]);
    expect(renderLocalCleanup(items)).toBe('- feat/a (#10 닫힘)');
  });

  it('GitHub는 지울 것과 물어볼 것을 나눠 보여 주고, 15개가 넘으면 나머지는 개수만 적는다', () => {
    const branches = [
      ...Array.from({ length: 17 }, (_, i) => remote(`feat/s${i}`, `s${i}`, 1)),
      remote('feat/old', 'o1', 9, 'Minsuk Jung'),
    ];
    const prs = Array.from({ length: 17 }, (_, i) => pr(100 + i, `feat/s${i}`, `s${i}`, 'MERGED'));
    const text = renderRemoteLeftovers(remoteLeftovers(branches, prs, NOW)) ?? '';
    expect(text).toContain('PR이 끝났는데 남은 브랜치 17개');
    expect(text).toContain('- feat/s0 (#100 머지됨, Kyumin Kang)');
    expect(text).toContain('- 외 2개');
    expect(text).not.toContain('feat/s16');
    expect(text).toContain(`열린 PR 없이 ${STALE_DAYS}일 넘은 브랜치 1개`);
    expect(text).toContain('- feat/old (Minsuk Jung, 마지막 커밋 9일 전, PR 없음)');
  });
});
