// 고객 가입 저장·선택 동의 (#47 4·5장, #267). 로그인·DB·쿠키·화면 이동은 가짜로 바꿔서 DB 없이 돈다.
// DB에 실제로 저장되는 모양은 account-store.test.ts가 확인한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import {
  createCustomerAccount,
  getMarketingConsent,
  getOptionalConsents,
  setMarketingConsent,
  setOptionalConsent,
  takeConsentNotices,
  takeMarketingConsentNotice,
} from './customer-account';

const state = vi.hoisted(() => ({
  user: null as { userId: string; name: string | null } | null,
  customerAuth: null as unknown,
  saved: null as {
    customerId: string;
    consentNotices: { type: 'interest_alert' | 'marketing'; agreedAt: Date }[];
  } | null,
  cookies: new Map<string, string>(),
  saveCustomerAccount: vi.fn(),
  readOptionalConsents: vi.fn(),
  writeOptionalConsent: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = state.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: state.cookieSet,
    delete: state.cookieDelete,
  }),
}));
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
    OPTIONAL_CUSTOMER_TERMS: actual.OPTIONAL_CUSTOMER_TERMS,
    isOptionalTerms: actual.isOptionalTerms,
    saveCustomerAccount: state.saveCustomerAccount,
    readOptionalConsents: state.readOptionalConsents,
    writeOptionalConsent: state.writeOptionalConsent,
  };
});

const ALL_REQUIRED = { age14: true, service: true, privacy: true, location: true } as const;
const PHONE = '010-1234-5678';

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { userId: 'user-1', name: '김투리' };
  state.customerAuth = ok({ userId: 'user-1', customerId: 'customer-1' });
  state.saved = { customerId: 'customer-1', consentNotices: [] };
  state.saveCustomerAccount.mockImplementation(async () => state.saved);
  state.cookies.clear();
  state.cookieDelete.mockImplementation((name: string) => state.cookies.delete(name));
});

describe('createCustomerAccount', () => {
  it('고객 계정을 만들고, 고객 모드로 두고, 보던 화면으로 보낸다', async () => {
    await expect(
      createCustomerAccount({
        agreements: { ...ALL_REQUIRED, marketing: true },
        phone: PHONE,
        next: '/slots/a',
      }),
    ).rejects.toThrow('redirect:/slots/a');
    expect(state.saveCustomerAccount).toHaveBeenCalledWith('tx', {
      userId: 'user-1',
      name: '김투리',
      nickname: '김투리',
      phone: PHONE,
      optionalTerms: ['marketing'],
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
      createCustomerAccount({ agreements: { ...ALL_REQUIRED, marketing: false }, phone: PHONE }),
    ).rejects.toThrow('redirect:/');
    expect(state.saveCustomerAccount).toHaveBeenCalledWith('tx', {
      userId: 'user-1',
      name: '고객',
      nickname: '고객',
      phone: PHONE,
      optionalTerms: [],
    });

    await expect(
      createCustomerAccount({
        agreements: { ...ALL_REQUIRED, marketing: false },
        phone: PHONE,
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

  it.each(['01012345678', ' 010 1234 5678 ', '010-1234-5678'])(
    '번호(%s)를 저장 모양으로 맞춰 저장한다',
    async (phone) => {
      await expect(
        createCustomerAccount({ agreements: { ...ALL_REQUIRED, marketing: false }, phone }),
      ).rejects.toThrow('redirect:/');
      expect(state.saveCustomerAccount).toHaveBeenCalledWith(
        'tx',
        expect.objectContaining({ phone: PHONE }),
      );
    },
  );

  it.each(['', '   '])('번호가 비었으면(%j) PHONE_REQUIRED이고 저장하지 않는다', async (phone) => {
    const result = await createCustomerAccount({
      agreements: { ...ALL_REQUIRED, marketing: false },
      phone,
    });
    expect(result).toEqual(fail('PHONE_REQUIRED', '휴대폰 번호를 입력해 주세요'));
    expect(state.saveCustomerAccount).not.toHaveBeenCalled();
  });

  it.each(['010-1234', '010-1234-56789', '031-123-4567', '010-abcd-5678'])(
    '휴대폰 번호 모양이 아니면(%s) INVALID_INPUT이고 저장하지 않는다',
    async (phone) => {
      const result = await createCustomerAccount({
        agreements: { ...ALL_REQUIRED, marketing: false },
        phone,
      });
      expect(result).toEqual(
        fail('INVALID_INPUT', '휴대폰 번호를 확인해 주세요. 예: 010-1234-5678'),
      );
      expect(state.saveCustomerAccount).not.toHaveBeenCalled();
    },
  );

  it('번호를 보내지 않은 요청도 PHONE_REQUIRED이고 저장하지 않는다(화면을 거치지 않은 요청)', async () => {
    const result = await createCustomerAccount({
      agreements: { ...ALL_REQUIRED, marketing: false },
    } as never);
    expect(result.ok === false && result.error.code).toBe('PHONE_REQUIRED');
    expect(state.saveCustomerAccount).not.toHaveBeenCalled();
  });

  it('이름을 보내면 앞뒤 공백을 빼고 예약자 이름으로 저장하고, 닉네임은 프로필 이름 그대로다(#375)', async () => {
    await expect(
      createCustomerAccount({
        agreements: { ...ALL_REQUIRED, marketing: false },
        phone: PHONE,
        name: '  강투리  ',
      }),
    ).rejects.toThrow('redirect:/');
    expect(state.saveCustomerAccount).toHaveBeenCalledWith('tx', {
      userId: 'user-1',
      name: '강투리',
      nickname: '김투리',
      phone: PHONE,
      optionalTerms: [],
    });
  });

  it.each(['', '   '])('이름을 비우면("%s") NAME_REQUIRED이고 저장하지 않는다', async (name) => {
    const result = await createCustomerAccount({
      agreements: { ...ALL_REQUIRED, marketing: false },
      phone: PHONE,
      name,
    });
    expect(result).toEqual(fail('NAME_REQUIRED', '이름을 입력해 주세요'));
    expect(state.saveCustomerAccount).not.toHaveBeenCalled();
  });

  it('이름은 앞뒤 공백을 빼고 30자까지, 31자면 INVALID_INPUT이고 저장하지 않는다(#375)', async () => {
    const tooLong = await createCustomerAccount({
      agreements: { ...ALL_REQUIRED, marketing: false },
      phone: PHONE,
      name: '가'.repeat(31),
    });
    expect(tooLong).toEqual(fail('INVALID_INPUT', '이름은 30자까지 쓸 수 있어요'));
    expect(state.saveCustomerAccount).not.toHaveBeenCalled();

    await expect(
      createCustomerAccount({
        agreements: { ...ALL_REQUIRED, marketing: false },
        phone: PHONE,
        name: ` ${'가'.repeat(30)} `,
      }),
    ).rejects.toThrow('redirect:/');
    expect(state.saveCustomerAccount).toHaveBeenCalledWith(
      'tx',
      expect.objectContaining({ name: '가'.repeat(30) }),
    );
  });

  it('입력 모양이 틀리면 INVALID_INPUT', async () => {
    const result = await createCustomerAccount({ agreements: { service: true } } as never);
    expect(result.ok === false && result.error.code).toBe('INVALID_INPUT');
    expect(state.saveCustomerAccount).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 UNAUTHENTICATED', async () => {
    state.user = null;
    const result = await createCustomerAccount({
      agreements: { ...ALL_REQUIRED, marketing: false },
      phone: PHONE,
    });
    expect(result.ok === false && result.error.code).toBe('UNAUTHENTICATED');
    expect(state.saveCustomerAccount).not.toHaveBeenCalled();
  });

  it('이미 고객 계정이 있으면 ALREADY_EXISTS이고 쿠키를 바꾸지 않는다', async () => {
    state.saved = null;
    const result = await createCustomerAccount({
      agreements: { ...ALL_REQUIRED, marketing: false },
      phone: PHONE,
    });
    expect(result).toEqual(fail('ALREADY_EXISTS', '이미 가입한 계정이에요'));
    expect(state.cookieSet).not.toHaveBeenCalled();
  });

  it('관심 동네·찜한 샵 알림 동의도 받고, 보내지 않으면 동의하지 않은 것으로 본다', async () => {
    await expect(
      createCustomerAccount({
        agreements: { ...ALL_REQUIRED, marketing: true, interest_alert: true },
        phone: PHONE,
      }),
    ).rejects.toThrow('redirect:/');
    expect(state.saveCustomerAccount).toHaveBeenLastCalledWith(
      'tx',
      expect.objectContaining({ optionalTerms: ['interest_alert', 'marketing'] }),
    );

    await expect(
      createCustomerAccount({
        agreements: { ...ALL_REQUIRED, marketing: false, interest_alert: true },
        phone: PHONE,
      }),
    ).rejects.toThrow('redirect:/');
    expect(state.saveCustomerAccount).toHaveBeenLastCalledWith(
      'tx',
      expect.objectContaining({ optionalTerms: ['interest_alert'] }),
    );
  });
});

const AGREED_AT = new Date('2026-10-28T03:00:00.000Z');
const ALERT_AT = new Date('2026-10-28T03:00:01.000Z');

describe('가입 직후 선택 동의 처리 결과 안내', () => {
  it('가입 때 고른 선택 동의마다 종류와 동의 시각을 누구의 것인지와 같이 14일짜리 쿠키로 남긴다', async () => {
    state.saved = {
      customerId: 'customer-1',
      consentNotices: [
        { type: 'interest_alert', agreedAt: ALERT_AT },
        { type: 'marketing', agreedAt: AGREED_AT },
      ],
    };
    await expect(
      createCustomerAccount({
        agreements: { ...ALL_REQUIRED, marketing: true, interest_alert: true },
        phone: PHONE,
      }),
    ).rejects.toThrow('redirect:/');
    expect(state.cookieSet).toHaveBeenCalledWith(
      'marketing_consent_notice',
      `user-1|interest_alert=${ALERT_AT.toISOString()}|marketing=${AGREED_AT.toISOString()}`,
      expect.objectContaining({ httpOnly: true, maxAge: 14 * 24 * 60 * 60 }),
    );
  });

  it('선택 동의를 고르지 않았으면 남기지 않는다', async () => {
    await expect(
      createCustomerAccount({ agreements: { ...ALL_REQUIRED, marketing: false }, phone: PHONE }),
    ).rejects.toThrow('redirect:/');
    expect(state.cookieSet).not.toHaveBeenCalledWith(
      'marketing_consent_notice',
      expect.anything(),
      expect.anything(),
    );
  });

  it('takeConsentNotices는 동의마다 처리 결과를 한 번만 돌려주고 쿠키를 지운다', async () => {
    state.cookies.set(
      'marketing_consent_notice',
      `user-1|interest_alert=${ALERT_AT.toISOString()}|marketing=${AGREED_AT.toISOString()}`,
    );
    expect(await takeConsentNotices()).toEqual(
      ok([
        { type: 'interest_alert', agreedAt: ALERT_AT },
        { type: 'marketing', agreedAt: AGREED_AT },
      ]),
    );
    expect(state.cookieDelete).toHaveBeenCalledWith('marketing_consent_notice');
    expect(await takeConsentNotices()).toEqual(ok([]));
  });

  it('예전 모양(동의 시각만)의 쿠키는 광고성 동의로 읽고, 모르는 종류는 버린다', async () => {
    state.cookies.set('marketing_consent_notice', `user-1|${AGREED_AT.toISOString()}|other=x`);
    expect(await takeConsentNotices()).toEqual(ok([{ type: 'marketing', agreedAt: AGREED_AT }]));
  });

  it('예전 함수 takeMarketingConsentNotice는 광고성 동의 시각만 한 번 돌려주고 쿠키를 지운다', async () => {
    state.cookies.set(
      'marketing_consent_notice',
      `user-1|interest_alert=${ALERT_AT.toISOString()}|marketing=${AGREED_AT.toISOString()}`,
    );
    expect(await takeMarketingConsentNotice()).toEqual(ok({ agreedAt: AGREED_AT }));
    expect(state.cookieDelete).toHaveBeenCalledWith('marketing_consent_notice');
    expect(await takeMarketingConsentNotice()).toEqual(ok(null));
  });

  it('다른 사람의 값이거나 로그인하지 않았거나 모양이 틀리면 보여주지 않고 지운다', async () => {
    for (const [user, value] of [
      [{ userId: 'user-2', name: null }, `user-1|${AGREED_AT.toISOString()}`],
      [null, `user-1|${AGREED_AT.toISOString()}`],
      [{ userId: 'user-1', name: null }, 'user-1|not-a-date'],
      [{ userId: 'user-1', name: null }, 'broken'],
    ] as const) {
      state.user = user;
      state.cookies.set('marketing_consent_notice', value);
      expect(await takeMarketingConsentNotice()).toEqual(ok(null));
      expect(state.cookies.has('marketing_consent_notice')).toBe(false);
    }
  });
});

describe('선택 동의 켜고 끄기·읽기', () => {
  const agreed = { agreed: true, agreedAt: new Date('2026-10-27T05:00:00Z'), withdrawnAt: null };
  const never = { agreed: false, agreedAt: null, withdrawnAt: null };

  it('고른 종류를 켜고 끈 결과(시각 포함)를 돌려준다', async () => {
    state.writeOptionalConsent.mockResolvedValue(agreed);
    expect(await setOptionalConsent('interest_alert', true)).toEqual(ok(agreed));
    expect(state.writeOptionalConsent).toHaveBeenCalledWith(
      'tx',
      'user-1',
      'customer',
      'interest_alert',
      true,
    );
  });

  it('두 동의를 한 번에 읽는다', async () => {
    state.readOptionalConsents.mockResolvedValue({ interest_alert: agreed, marketing: never });
    expect(await getOptionalConsents()).toEqual(ok({ interest_alert: agreed, marketing: never }));
    expect(state.readOptionalConsents).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'customer',
    );
  });

  it('예전 함수는 광고성(marketing) 동의만 켜고 끄고 읽는다', async () => {
    state.writeOptionalConsent.mockResolvedValue(agreed);
    expect(await setMarketingConsent(true)).toEqual(ok(agreed));
    expect(state.writeOptionalConsent).toHaveBeenCalledWith(
      'tx',
      'user-1',
      'customer',
      'marketing',
      true,
    );
    state.readOptionalConsents.mockResolvedValue({ interest_alert: never, marketing: agreed });
    expect(await getMarketingConsent()).toEqual(ok(agreed));
  });

  it('고객 계정이 아니면 권한 실패를 그대로 돌려주고 DB를 보지 않는다', async () => {
    state.customerAuth = fail('NO_CUSTOMER_ACCOUNT', '약관 동의 후 이용할 수 있어요');
    expect(await setOptionalConsent('interest_alert', true)).toEqual(state.customerAuth);
    expect(await getOptionalConsents()).toEqual(state.customerAuth);
    expect(await setMarketingConsent(true)).toEqual(state.customerAuth);
    expect(await getMarketingConsent()).toEqual(state.customerAuth);
    expect(state.writeOptionalConsent).not.toHaveBeenCalled();
    expect(state.readOptionalConsents).not.toHaveBeenCalled();
  });

  it('종류나 켜기·끄기 값이 아니면 INVALID_INPUT', async () => {
    for (const [type, agree] of [
      ['interest_alert', 'yes'],
      ['service', true],
    ] as const) {
      const result = await setOptionalConsent(type as never, agree as never);
      expect(result.ok === false && result.error.code).toBe('INVALID_INPUT');
    }
    expect(state.writeOptionalConsent).not.toHaveBeenCalled();
  });
});
