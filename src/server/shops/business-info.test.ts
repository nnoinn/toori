// 운영자: 승인된 샵 사업자 정보 수정 (#50 4장, W18). 로그인·DB 저장·등록증 경로 확인은 가짜로 바꾼다.
// 입력 규칙은 원장님과 같은 validateBusinessInput을 그대로 쓴다. 실제 저장 내용은 business-info-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { businessNumberCheckDigit } from '@/lib/business-number';
import { fail, ok } from '@/lib/result';

const SHOP = '2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091';
const NOW = new Date('2026-11-10T03:00:00.000Z');
const OLD_NUMBER = `123456789${businessNumberCheckDigit('123456789')}`;
const NEW_NUMBER = `220818765${businessNumberCheckDigit('220818765')}`;
const DOC = `shops/${SHOP}/old.pdf`;

const state = vi.hoisted(() => ({
  auth: null as unknown,
  current: null as Record<string, string> | null,
  saves: [] as Record<string, unknown>[],
  docCheck: null as unknown,
  docChecks: [] as string[],
}));

vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.auth }));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => NOW }));
vi.mock('@/server/storage', () => ({
  assertBusinessDocPath: async (_owner: unknown, path: string) => {
    state.docChecks.push(path);
    return state.docCheck;
  },
}));
vi.mock('./business-info-store', async (original) => ({
  ...(await original<typeof import('./business-info-store')>()),
  lockBusinessInfo: async () => state.current,
  saveBusinessUpdate: async (_tx: unknown, input: Record<string, unknown>) => {
    state.saves.push(input);
  },
}));

const { updateShopBusinessInfo } = await import('./business-info');

function input(extra: Record<string, string> = {}) {
  return {
    businessName: '투리 헤어',
    representativeName: '김원장',
    businessRegistrationNumber: OLD_NUMBER.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3'),
    openedOn: '2025-03-01',
    businessDocPath: DOC,
    reason: '11/10 카카오톡 문의',
    ...extra,
  };
}

beforeEach(() => {
  state.auth = ok({ userId: 'admin-1' });
  state.current = {
    status: 'approved',
    businessName: '투리 헤어',
    representativeName: '김원장',
    businessRegistrationNumber: OLD_NUMBER,
    openedOn: '2025-03-01',
    businessDocPath: DOC,
  };
  state.saves = [];
  state.docCheck = ok(null);
  state.docChecks = [];
});

describe('updateShopBusinessInfo', () => {
  it('바뀐 칸만 저장하고 사유와 바뀐 칸을 넘긴다. 번호는 숫자만 저장한다', async () => {
    const result = await updateShopBusinessInfo(
      SHOP,
      input({ businessName: '  투리 헤어 2호점 ', businessRegistrationNumber: NEW_NUMBER }),
    );
    expect(result).toEqual({
      ok: true,
      data: { changed: ['businessName', 'businessRegistrationNumber'] },
    });
    expect(state.saves).toEqual([
      {
        shopId: SHOP,
        adminId: 'admin-1',
        values: { businessName: '투리 헤어 2호점', businessRegistrationNumber: NEW_NUMBER },
        changed: ['businessName', 'businessRegistrationNumber'],
        reason: '11/10 카카오톡 문의',
      },
    ]);
    expect(state.docChecks).toEqual([]);
  });

  it('하이픈을 넣어 저장된 같은 번호는 바뀐 것으로 보지 않는다', async () => {
    state.current = {
      ...state.current!,
      businessRegistrationNumber: OLD_NUMBER.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3'),
    };
    const result = await updateShopBusinessInfo(SHOP, input({ representativeName: '박원장' }));
    expect(result.ok && result.data.changed).toEqual(['representativeName']);
  });

  it('등록증을 바꾸면 그 샵 폴더의 경로인지 확인하고, 아니면 저장하지 않는다', async () => {
    const newDoc = `shops/${SHOP}/new.pdf`;
    expect(await updateShopBusinessInfo(SHOP, input({ businessDocPath: newDoc }))).toEqual({
      ok: true,
      data: { changed: ['businessDocPath'] },
    });
    expect(state.docChecks).toEqual([newDoc]);

    state.docCheck = fail('INVALID_PATH', '올린 파일 경로가 올바르지 않아요');
    expect(
      await updateShopBusinessInfo(SHOP, input({ businessDocPath: 'shops/other/x.pdf' })),
    ).toEqual(state.docCheck);
    expect(state.saves).toHaveLength(1);
  });

  it('입력이 틀리거나 사유가 없으면 칸마다 문구를 돌려주고 DB를 보지 않는다', async () => {
    state.current = null;
    const result = await updateShopBusinessInfo(
      SHOP,
      input({ businessRegistrationNumber: '1234567890', openedOn: '2026-11-11', reason: '  ' }),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: '입력한 내용을 다시 확인해 주세요',
        fieldErrors: {
          businessRegistrationNumber: '사업자등록번호를 다시 확인해 주세요',
          openedOn: '개업일자는 오늘이나 그 전 날짜여야 해요',
          reason: '변경 사유를 입력해 주세요',
        },
      },
    });
  });

  it('사유는 200자까지', async () => {
    const result = await updateShopBusinessInfo(SHOP, input({ reason: '가'.repeat(201) }));
    expect(result.ok === false && result.error.fieldErrors?.reason).toBe(
      '200자 이하로 입력해 주세요',
    );
  });

  it('승인 전 샵, 없는 샵, 바뀐 것이 없으면 저장하지 않는다', async () => {
    state.current = { ...state.current!, status: 'pending' };
    const pending = await updateShopBusinessInfo(SHOP, input({ representativeName: '박원장' }));
    expect(pending.ok === false && pending.error.code).toBe('INVALID_STATUS');

    state.current = null;
    const missing = await updateShopBusinessInfo(SHOP, input());
    expect(missing.ok === false && missing.error.code).toBe('SHOP_NOT_FOUND');

    state.current = {
      status: 'approved',
      businessName: '투리 헤어',
      representativeName: '김원장',
      businessRegistrationNumber: OLD_NUMBER,
      openedOn: '2025-03-01',
      businessDocPath: DOC,
    };
    expect(await updateShopBusinessInfo(SHOP, input())).toEqual(
      fail('NO_CHANGE', '바뀐 내용이 없어요'),
    );
    expect(state.saves).toEqual([]);
  });

  it('운영자가 아니거나 샵 id 모양이 아니면 아무것도 하지 않는다', async () => {
    state.auth = fail('FORBIDDEN', '접근 권한이 없어요');
    expect(await updateShopBusinessInfo(SHOP, input({ representativeName: '박원장' }))).toEqual(
      state.auth,
    );
    state.auth = ok({ userId: 'admin-1' });
    const badId = await updateShopBusinessInfo(
      'not-a-uuid',
      input({ representativeName: '박원장' }),
    );
    expect(badId.ok === false && badId.error.code).toBe('SHOP_NOT_FOUND');
    expect(state.saves).toEqual([]);
  });
});
