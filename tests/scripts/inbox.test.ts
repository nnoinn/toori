// 팀 확인 대기 목록(scripts/inbox.mjs)이 누구의 답을 기다리는지 맞게 고르는지 확인한다.
import { describe, expect, it } from 'vitest';

import {
  collectWaiting,
  excerpt,
  INBOX_TITLE,
  mentionedLogins,
  renderBoard,
  renderFor,
  waited,
  waitingItem,
} from '../../scripts/inbox.mjs';

type Author = { login: string; __typename: string };
type Comment = { author: Author; body: string; createdAt: string; url: string };
type Review = {
  author: Author;
  state: string;
  submittedAt: string;
  body: string;
  url: string;
  commit: { oid: string };
};

const user = (login: string): Author => ({ login, __typename: 'User' });
const comment = (login: string, body: string, createdAt: string, author = user(login)): Comment => ({
  author,
  body,
  createdAt,
  url: `https://example.test/comment/${createdAt}`,
});
const review = (login: string, state: string, submittedAt: string, oid = 'aaa'): Review => ({
  author: user(login),
  state,
  submittedAt,
  body: '',
  url: `https://example.test/review/${submittedAt}`,
  commit: { oid },
});

function issue(author: string, body: string, comments: Comment[] = [], title = '연결 이슈') {
  return {
    kind: 'issue',
    number: 1,
    title,
    url: 'https://example.test/issues/1',
    createdAt: '2026-11-03T00:00:00Z',
    author: user(author),
    body,
    comments: { nodes: comments },
  };
}

function pr({
  author = 'chosanai',
  committedDate = '2026-11-05T00:00:00Z',
  oid = 'aaa',
  reviews = [] as Review[],
  comments = [] as Comment[],
  isDraft = false,
} = {}) {
  return {
    kind: 'pr',
    number: 2,
    title: '화면 PR',
    url: 'https://example.test/pull/2',
    createdAt: '2026-11-04T00:00:00Z',
    author: user(author),
    body: 'PR 설명',
    isDraft,
    mergeable: 'MERGEABLE',
    commits: { nodes: [{ commit: { oid, committedDate, statusCheckRollup: { state: 'SUCCESS' } } }] },
    comments: { nodes: comments },
    reviews: { nodes: reviews },
  };
}

describe('mentionedLogins', () => {
  it('@아이디로 부른 팀원만 고른다', () => {
    expect(mentionedLogins('@nnoinn 확인 부탁해요')).toEqual(['nnoinn']);
    expect(mentionedLogins('@alstjr62 @poiuyst282-ui 정찬형이에요')).toEqual(['alstjr62', 'poiuyst282-ui']);
  });

  it('이름 언급, 코드, 인용, 주석, 다른 아이디는 부른 것으로 보지 않는다', () => {
    expect(mentionedLogins('정민석님 답을 반영했어요')).toEqual([]);
    expect(mentionedLogins('글에 `@nnoinn`을 넣어요\n> @chosanai 예전 글\n<!-- @alstjr62 -->')).toEqual([]);
    expect(mentionedLogins('@nnoinnx 다른 사람')).toEqual([]);
  });
});

describe('excerpt', () => {
  it('부른 아이디와 인사, 마크다운 기호를 뺀다', () => {
    expect(excerpt('@nnoinn 정민석이에요. **"3. 디자인·사용성"** 바꿀 목록이에요')).toBe('"3. 디자인·사용성" 바꿀 목록이에요');
  });

  it('코드는 글자만 남기고, 가로줄·표 구분선·목록 기호는 뺀다', () => {
    expect(excerpt('머지되면 `reservation.cancelled`가 와요')).toBe('머지되면 reservation.cancelled가 와요');
    expect(excerpt('@chosanai 강규민이에요. 바뀐 것\n\n---\n- 첫째\n1. 둘째\n| a | b |\n| --- | --- |')).toBe(
      '바뀐 것 첫째 둘째 a b',
    );
  });
});

describe('waitingItem: Issue', () => {
  const ask = comment('alstjr62', '@nnoinn 정민석이에요. 바꿀 목록이에요', '2026-11-05T00:00:00Z');

  it('나를 부른 글 뒤에 내 글이 없으면 내 차례다', () => {
    const item = waitingItem('nnoinn', issue('alstjr62', '로드맵', [ask]));
    expect(item).toMatchObject({ reason: 'call', since: ask.createdAt, url: ask.url, from: ['alstjr62'] });
  });

  it('내가 답하면 빠지고, 답에 @를 넣으면 상대 차례가 된다', () => {
    const quiet = issue('alstjr62', '로드맵', [ask, comment('nnoinn', '확인했어요', '2026-11-06T00:00:00Z')]);
    expect(waitingItem('nnoinn', quiet)).toBeNull();
    expect(waitingItem('alstjr62', quiet)).toBeNull();

    const reply = comment('nnoinn', '@alstjr62 승인이에요', '2026-11-06T00:00:00Z');
    expect(waitingItem('alstjr62', issue('alstjr62', '로드맵', [ask, reply]))).toMatchObject({
      reason: 'call',
      from: ['nnoinn'],
    });
    const acked = issue('alstjr62', '로드맵', [ask, reply, comment('alstjr62', '확인했어요', '2026-11-07T00:00:00Z')]);
    expect(waitingItem('alstjr62', acked)).toBeNull();
  });

  it('11/1 전 글과 봇 글은 보지 않는다', () => {
    expect(waitingItem('nnoinn', issue('alstjr62', '로드맵', [comment('alstjr62', '@nnoinn', '2026-10-20T00:00:00Z')]))).toBeNull();
    const fromBot = comment('vercel', '@nnoinn 배포', '2026-11-05T00:00:00Z', { login: 'vercel', __typename: 'Bot' });
    expect(waitingItem('nnoinn', issue('alstjr62', '로드맵', [fromBot]))).toBeNull();
  });

  it('내 마지막 글에 pending 표시가 있으면 이어서 답할 때까지 남는다', () => {
    const partial = comment('nnoinn', 'Q2만 정했어요\n<!-- pending: Q3 답 -->', '2026-11-06T00:00:00Z');
    expect(waitingItem('nnoinn', issue('chosanai', '질문', [partial]))).toMatchObject({
      reason: 'pending',
      excerpt: 'Q3 답',
    });
  });
});

describe('waitingItem: PR', () => {
  it('수정 요청을 받은 PR은 새 커밋이나 글을 올릴 때까지 작성자 차례다', () => {
    const changes = review('nnoinn', 'CHANGES_REQUESTED', '2026-11-06T00:00:00Z');
    expect(waitingItem('poiuyst282-ui', pr({ author: 'poiuyst282-ui', reviews: [changes] }))).toMatchObject({
      reason: 'changes',
      from: ['nnoinn'],
    });
    expect(waitingItem('nnoinn', pr({ author: 'poiuyst282-ui', reviews: [changes] }))).toBeNull();

    const fixed = pr({ author: 'poiuyst282-ui', reviews: [changes], committedDate: '2026-11-07T00:00:00Z', oid: 'bbb' });
    expect(waitingItem('poiuyst282-ui', fixed)).toBeNull();
    expect(waitingItem('nnoinn', fixed)).toMatchObject({ reason: 'review', again: true, since: '2026-11-07T00:00:00Z' });
  });

  it('리뷰하지 않은 팀원 PR은 nnoinn 차례이고, 초안은 뺀다', () => {
    expect(waitingItem('nnoinn', pr())).toMatchObject({ reason: 'review', again: false, since: '2026-11-04T00:00:00Z' });
    expect(waitingItem('nnoinn', pr({ isDraft: true }))).toBeNull();
  });

  it('리뷰한 커밋과 지금 커밋이 다르면 날짜가 앞서도 다시 리뷰한다', () => {
    const approved = review('nnoinn', 'APPROVED', '2026-11-06T00:00:00Z', 'aaa');
    expect(waitingItem('nnoinn', pr({ reviews: [approved], oid: 'bbb' }))).toMatchObject({ reason: 'review', again: true });
    expect(waitingItem('nnoinn', pr({ reviews: [approved], oid: 'aaa' }))).toBeNull();
  });

  it('내 PR에서는 새 커밋을 올리면 부른 글에 답한 것으로 본다', () => {
    const ask = comment('nnoinn', '@chosanai main을 합쳐 주세요', '2026-11-06T00:00:00Z');
    expect(waitingItem('chosanai', pr({ comments: [ask] }))).toMatchObject({ reason: 'call' });
    expect(waitingItem('chosanai', pr({ comments: [ask], committedDate: '2026-11-07T00:00:00Z' }))).toBeNull();
  });
});

describe('collectWaiting과 목록 글', () => {
  const now = new Date('2026-11-09T00:00:00Z');
  const repo = {
    issues: {
      nodes: [
        issue('alstjr62', '로드맵', [comment('alstjr62', '@nnoinn 바꿀 목록이에요', '2026-11-05T00:00:00Z')]),
        issue('github-actions', '@nnoinn 목록', [], INBOX_TITLE),
      ],
    },
    pullRequests: { nodes: [pr()] },
  };

  it('목록 Issue는 빼고 오래 기다린 것부터 늘어놓는다', () => {
    const items = collectWaiting(repo);
    expect(items.map((i: { number: number; reason: string }) => [i.number, i.reason])).toEqual([
      [2, 'review'],
      [1, 'call'],
    ]);
  });

  it('기다린 시간을 일·시간으로 보여준다', () => {
    expect(waited('2026-11-07T00:00:00Z', now)).toBe('2일');
    expect(waited('2026-11-08T21:00:00Z', now)).toBe('3시간');
    expect(waited('2026-11-08T23:50:00Z', now)).toBe('1시간');
  });

  it('브리핑과 고정 Issue 글을 만든다', () => {
    const items = collectWaiting(repo);
    expect(renderFor('nnoinn', items, now)).toContain('- #1 연결 이슈 — 정민석의 요청, 4일째: "바꿀 목록이에요"');
    expect(renderFor('chosanai', items, now)).toBe('');
    const board = renderBoard(items, now);
    expect(board).toContain('마지막 갱신: 2026-11-09 09:00 (한국 시각)');
    expect(board).toContain('### 현동훈 (nnoinn) · 2건');
    expect(board).toContain('### 정찬형 (chosanai) · 없음');
  });

  it('고정 Issue는 사람마다 가로줄로 칸을 나눈다', () => {
    const board = renderBoard(collectWaiting(repo), now);
    // 4명 모두 "빈 줄 · 가로줄 · 빈 줄 · 이름 제목" 순서로 시작한다(빈 줄이 없으면 위 글이 제목으로 바뀐다)
    expect(board.match(/\n\n---\n\n### /g)).toHaveLength(4);
    expect(board).toMatch(/\n\n---\n\n### 정민석 \(alstjr62\)/);
  });
});
