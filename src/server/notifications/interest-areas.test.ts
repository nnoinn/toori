// 관심 동네 읽기·바꾸기 (C-601, 연결 #12 #131). 고객 계정만, 동네 고르기 목록(REGIONS)의 동네만 받는지 본다.
// 로그인·DB는 가짜로 바꿔서 DB 없이 돈다. 실제 저장은 interest-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

const state = vi.hoisted(() => ({
  auth: null as unknown,
  stored: [] as string[],
  replaced: [] as { tx: unknown; customerId: string; codes: readonly string[] }[],
}));

vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('@/server/auth', () => ({ requireCustomer: async () => state.auth }));
vi.mock('./interest-store', () => ({
  readInterestAreas: async () => state.stored,
  replaceInterestAreas: async (tx: unknown, customerId: string, codes: readonly string[]) => {
    state.replaced.push({ tx, customerId, codes });
    state.stored = [...codes];
  },
}));

const { getInterestAreas, setInterestAreas } = await import('./interest-areas');

const SANGNOK = '41271';
const DANWON = '41273';

beforeEach(() => {
  state.auth = ok({ userId: 'user-1', customerId: 'customer-1' });
  state.stored = [];
  state.replaced = [];
});

describe('관심 동네', () => {
  it('저장된 동네를 동네 고르기 목록 순서로 돌려준다', async () => {
    state.stored = [DANWON, SANGNOK];
    expect(await getInterestAreas()).toEqual(ok({ sigunguCodes: [SANGNOK, DANWON] }));
  });

  it('고른 목록으로 바꾸고(겹침은 하나로), 바꾼 목록을 돌려준다', async () => {
    expect(await setInterestAreas([DANWON, DANWON, SANGNOK])).toEqual(
      ok({ sigunguCodes: [SANGNOK, DANWON] }),
    );
    expect(state.replaced).toEqual([
      { tx: 'tx', customerId: 'customer-1', codes: [SANGNOK, DANWON] },
    ]);
  });

  it('빈 목록이면 모두 지운다', async () => {
    expect(await setInterestAreas([])).toEqual(ok({ sigunguCodes: [] }));
    expect(state.replaced[0].codes).toEqual([]);
  });

  it('목록에 없는 동네가 하나라도 있으면 INVALID_REGION이고 바꾸지 않는다', async () => {
    // 동네 목록이 전국 시·군·구라(#200) 목록에 없는 코드로 본다
    expect(await setInterestAreas([SANGNOK, '99999'])).toEqual(
      fail('INVALID_REGION', '고를 수 없는 동네예요'),
    );
    expect(state.replaced).toEqual([]);
  });

  it('모양이 틀리면 INVALID_INPUT', async () => {
    const result = await setInterestAreas('41271' as never);
    expect(result.ok === false && result.error.code).toBe('INVALID_INPUT');
  });

  it('고객 계정이 아니면 그 실패를 그대로 돌려준다', async () => {
    state.auth = fail('WRONG_MODE', '고객 계정으로 바꿔서 이용해 주세요');
    expect(await getInterestAreas()).toEqual(state.auth);
    expect(await setInterestAreas([SANGNOK])).toEqual(state.auth);
    expect(state.replaced).toEqual([]);
  });
});
