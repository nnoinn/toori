// 고객 가입 저장·광고성 동의 (#47 4·5장). 로그인·DB·쿠키·화면 이동은 가짜로 바꿔서 DB 없이 돈다.
// DB에 실제로 저장되는 모양은 account-store.test.ts가 확인한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import {
  createCustomerAccount,
  getMarketingConsent,
  setMarketingConsent,
} from './customer-account';

const state = vi.hoisted(() => ({
  user: null as { userId: string; name: string | null } | null,
  customerAuth: null as unknown,
  savedCustomerId: 'customer-1' as string | null,
  saveCustomerAccount: vi.fn(),
  readMarketingConsent: vi.fn(),
  writeMarketingConsent: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: async () => ({ set: state.cookieSet }) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('./current-account', () => ({ getSessionUser: async () => state.user }));
vi.mock('./require', () => ({
  AUTH_ERRORS: { UNAUTHENTICATED: '로그인이 필요해요' },
  requireCustomer: async () => state.customerAuth,
}));
vi.mock('./account-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./account-store')>();
  return {
    CUSTOMER_REQUIRED_TERMS: actual.CUSTOMER_REQUIRED_TERMS,
    DEFAULT_CUSTOMER_NICKNAME: actual.DEFAULT_CUSTOMER_NICKNAME,
    saveCustomerAccount: state.saveCustomerAccount,
    readMarketingConsent: state.readMarketingConsent,
    writeMarketingConsent: state.writeMarketingConsent,
  };
});

const ALL_REQUIRED = { age14: true, service: true, privacy: true, location: true } as const;

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { userId: 'user-1', name: '김투리' };
  state.customerAuth = ok({ userId: 'user-1', customerId: 'customer-1' });
  state.saveCustomerAccount.mockImplementation(async () => state.savedCustomerId);
  state.savedCustomerId = 'customer-1';
});

describe('createCustomerAccount', () => {
  it('고객 계정을 만들고, 고객 모드로 두고, 보던 화면으로 보낸다', async () => {
    await expect(
      createCustomerAccount({
        agreements: { ...ALL_REQUIRED, marketing: true },
        next: '/slots/a',
      }),
    ).rejects.toThrow('redirect:/slots/a');
    expect(state.saveCustomerAccount).toHaveBeenCalledWith('tx', {
      userId: 'user-1',
      nickname: '김투리',
      marketing: true,
    });
    expect(state.cookieSet).toHaveBeenCalledWith(
      'account_mode',
      'customer',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('프로필 이름이 없으면 기본 닉네임, 돌아갈 주소가 없거나 다른 사이트면 홈으로', async () => {
    state.user = { userId: 'user-1', name: null };
    await expect(
      createCustomerAccount({ agreements: { ...ALL_REQUIRED, marketing: false } }),
    ).rejects.toThrow('redirect:/');
    expect(state.saveCustomerAccount).toHaveBeenCalledWith('tx', {
      userId: 'user-1',
      nickname: '고객',
      marketing: false,
    });

    await expect(
      createCustomerAccount({
        agreements: { ...ALL_REQUIRED, marketing: false },
        next: '//evil.example',
      }),
    ).rejects.toThrow('redirect:/');
  });

  it.each(['age14', 'service', 'privacy', 'location'] as const)(
    '필수 동의(%s)가 빠지면 저장하지 않는다',
    async (key) => {
      const agreements = { ...ALL_REQUIRED, marketing: true, [key]: false };
      // 화면 타입으로는 막히지만 서버는 화면을 믿지 않는다
      const result = await createCustomerAccount({ agreements } as never);
      expect(result).toEqual(fail('REQUIRED_TERMS_MISSING', '필수 항목에 모두 동의해 주세요'));
      expect(state.saveCustomerAccount).not.toHaveBeenCalled();
    },
  );

  it('입력 모양이 틀리면 INVALID_INPUT', async () => {
    const result = await createCustomerAccount({ agreements: { service: true } } as never);
    expect(result.ok === false && result.error.code).toBe('INVALID_INPUT');
    expect(state.saveCustomerAccount).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 UNAUTHENTICATED', async () => {
    state.user = null;
    const result = await createCustomerAccount({
      agreements: { ...ALL_REQUIRED, marketing: false },
    });
    expect(result.ok === false && result.error.code).toBe('UNAUTHENTICATED');
    expect(state.saveCustomerAccount).not.toHaveBeenCalled();
  });

  it('이미 고객 계정이 있으면 ALREADY_EXISTS이고 쿠키를 바꾸지 않는다', async () => {
    state.savedCustomerId = null;
    const result = await createCustomerAccount({
      agreements: { ...ALL_REQUIRED, marketing: false },
    });
    expect(result).toEqual(fail('ALREADY_EXISTS', '이미 가입한 계정이에요'));
    expect(state.cookieSet).not.toHaveBeenCalled();
  });
});

describe('setMarketingConsent·getMarketingConsent', () => {
  const agreed = { agreed: true, agreedAt: new Date('2026-10-27T05:00:00Z'), withdrawnAt: null };

  it('켜고 끈 결과(시각 포함)를 돌려준다', async () => {
    state.writeMarketingConsent.mockResolvedValue(agreed);
    expect(await setMarketingConsent(true)).toEqual(ok(agreed));
    expect(state.writeMarketingConsent).toHaveBeenCalledWith('tx', 'user-1', 'customer', true);
  });

  it('상태를 읽는다', async () => {
    state.readMarketingConsent.mockResolvedValue(agreed);
    expect(await getMarketingConsent()).toEqual(ok(agreed));
    expect(state.readMarketingConsent).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'customer',
    );
  });

  it('고객 계정이 아니면 권한 실패를 그대로 돌려주고 DB를 보지 않는다', async () => {
    state.customerAuth = fail('NO_CUSTOMER_ACCOUNT', '약관 동의 후 이용할 수 있어요');
    expect(await setMarketingConsent(true)).toEqual(state.customerAuth);
    expect(await getMarketingConsent()).toEqual(state.customerAuth);
    expect(state.writeMarketingConsent).not.toHaveBeenCalled();
    expect(state.readMarketingConsent).not.toHaveBeenCalled();
  });

  it('켜기·끄기 값이 아니면 INVALID_INPUT', async () => {
    const result = await setMarketingConsent('yes' as never);
    expect(result.ok === false && result.error.code).toBe('INVALID_INPUT');
    expect(state.writeMarketingConsent).not.toHaveBeenCalled();
  });
});
