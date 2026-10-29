// 원장님 가입 저장 (#47 4장). 입력 확인·약관·로그인·등록증 경로·주소 변환 실패를 어떻게 돌려주는지와 저장에 넘기는 값을 본다.
// 로그인·DB·주소 변환·암호화·쿠키는 가짜로 바꿔서 DB 없이 돈다. DB에 실제로 저장되는 모양은 account-store.test.ts가 확인한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import { createOwnerAccount, type CreateOwnerAccountInput } from './owner-account';

const USER = '3b1557e8-0000-4000-8000-000000000001';
const DOC = `users/${USER}/0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d.jpg`;

const state = vi.hoisted(() => ({
  user: null as { userId: string; name: string | null } | null,
  existingOwner: false,
  geocode: vi.fn(),
  saveOwnerAccount: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: async () => ({ set: state.cookieSet }) }));
vi.mock('@/lib/request-time', () => ({
  getRequestNow: async () => new Date('2026-10-28T06:00:00Z'), // 한국 시간 10/28 15시
}));
vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ where: async () => (state.existingOwner ? [{ id: 'owner-0' }] : []) }),
    }),
    transaction: (run: (tx: string) => unknown) => run('tx'),
  }),
}));
vi.mock('@/features/map/geocode', () => ({ geocodeAddress: state.geocode }));
vi.mock('@/server/payouts/account-crypto', () => ({
  encryptAccountNumber: (value: string) => `enc(${value})`,
}));
vi.mock('./current-account', () => ({ getSessionUser: async () => state.user }));
vi.mock('./account-store', () => ({ saveOwnerAccount: state.saveOwnerAccount }));

function input(change: (value: CreateOwnerAccountInput) => void = () => {}) {
  const value: CreateOwnerAccountInput = {
    owner: { name: '김원장', phone: '010-1234-5678' },
    shop: {
      businessName: '투리헤어',
      representativeName: '김원장',
      businessRegistrationNumber: '123-45-67890',
      openedOn: '2025-03-01',
      businessDocPath: DOC,
      name: '투리헤어 중앙점',
      category: 'hair',
      phone: '031-123-4567',
      roadAddress: '경기 안산시 단원구 중앙대로 1',
      addressDetail: ' 2층 ',
    },
    payout: { bankCode: '088', accountNumber: '110-123-456789', accountHolder: '김원장' },
    agreements: { supplier: true, privacy: true, payoutInfo: true },
  };
  change(value);
  return value;
}

const GEOCODED = {
  roadAddress: '경기 안산시 단원구 중앙대로 1',
  jibunAddress: '경기 안산시 단원구 고잔동 1',
  lat: 37.3,
  lng: 126.8,
  region: { sido: '경기', sigungu: '안산시 단원구', sigunguCode: '41273' },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { userId: USER, name: null };
  state.existingOwner = false;
  state.geocode.mockResolvedValue({ ok: true, data: GEOCODED });
  state.saveOwnerAccount.mockResolvedValue({ ownerId: 'owner-1', shopId: 'shop-1' });
});

describe('createOwnerAccount', () => {
  it('주소는 서버가 바꾼 값으로, 계좌번호는 암호화해서 저장하고 원장님 모드로 둔다', async () => {
    expect(await createOwnerAccount(input())).toEqual(ok({ ownerId: 'owner-1', shopId: 'shop-1' }));
    expect(state.geocode).toHaveBeenCalledWith('경기 안산시 단원구 중앙대로 1');
    expect(state.saveOwnerAccount).toHaveBeenCalledWith('tx', {
      userId: USER,
      owner: { name: '김원장', phone: '010-1234-5678' },
      shop: {
        name: '투리헤어 중앙점',
        category: 'hair',
        phone: '031-123-4567',
        roadAddress: GEOCODED.roadAddress,
        jibunAddress: GEOCODED.jibunAddress,
        addressDetail: '2층',
        sido: '경기',
        sigungu: '안산시 단원구',
        sigunguCode: '41273',
        location: { lat: 37.3, lng: 126.8 },
        businessName: '투리헤어',
        representativeName: '김원장',
        businessRegistrationNumber: '1234567890',
        openedOn: '2025-03-01',
        businessDocPath: DOC,
      },
      payout: {
        bankCode: '088',
        accountNumberEncrypted: 'enc(110123456789)',
        accountLast4: '6789',
        accountHolder: '김원장',
      },
    });
    expect(state.cookieSet).toHaveBeenCalledWith(
      'account_mode',
      'owner',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('상세 주소가 비어 있으면 null, 개업일이 오늘이면 된다', async () => {
    await createOwnerAccount(
      input((v) => {
        v.shop.addressDetail = '  ';
        v.shop.openedOn = '2026-10-28';
      }),
    );
    expect(state.saveOwnerAccount.mock.calls[0][1].shop.addressDetail).toBeNull();
  });

  it.each([
    ['하이픈 없는 휴대폰', '01012345678', '010-1234-5678'],
    ['하이픈 없는 지역번호', '0311234567', '031-123-4567'],
    ['0507 안심번호', '0507-1234-5678', '0507-1234-5678'],
    ['하이픈 없는 안심번호', '050712345678', '0507-1234-5678'],
    ['대표번호', '15881234', '1588-1234'],
  ])('전화번호(%s)는 하이픈 넣은 모양으로 저장한다', async (_, raw, saved) => {
    await createOwnerAccount(
      input((v) => {
        v.owner.phone = raw;
        v.shop.phone = raw;
      }),
    );
    const { owner, shop } = state.saveOwnerAccount.mock.calls[0][1];
    expect([owner.phone, shop.phone]).toEqual([saved, saved]);
  });

  it.each<[string, (v: CreateOwnerAccountInput) => void]>([
    ['사업자등록번호 9자리', (v) => void (v.shop.businessRegistrationNumber = '123-45-6789')],
    ['목록에 없는 은행 코드', (v) => void (v.payout.bankCode = '999')],
    ['계좌번호에 글자', (v) => void (v.payout.accountNumber = '110-abc-456789')],
    ['계좌번호 7자리', (v) => void (v.payout.accountNumber = '1234567')],
    ['원장님 전화번호 모양', (v) => void (v.owner.phone = '1234')],
    ['샵 전화번호 자릿수', (v) => void (v.shop.phone = '010-1234-567')],
    ['전화번호에 글자', (v) => void (v.shop.phone = '031-123-abcd')],
    ['없는 업종', (v) => void ((v.shop as { category: string }).category = 'spa')],
    ['날짜 모양', (v) => void (v.shop.openedOn = '2025/03/01')],
    ['미래 개업일', (v) => void (v.shop.openedOn = '2026-10-29')],
    ['빈 상호', (v) => void (v.shop.businessName = '  ')],
  ])('%s → INVALID_INPUT, 저장·주소 변환 안 함', async (_, change) => {
    const result = await createOwnerAccount(input(change));
    expect(result.ok === false && result.error.code).toBe('INVALID_INPUT');
    expect(state.geocode).not.toHaveBeenCalled();
    expect(state.saveOwnerAccount).not.toHaveBeenCalled();
  });

  it.each(['supplier', 'privacy', 'payoutInfo'] as const)(
    '필수 동의(%s)가 빠지면 REQUIRED_TERMS_MISSING',
    async (key) => {
      const result = await createOwnerAccount(
        input((v) => void ((v.agreements as Record<string, boolean>)[key] = false)),
      );
      expect(result).toEqual(fail('REQUIRED_TERMS_MISSING', '필수 항목에 모두 동의해 주세요'));
    },
  );

  it('로그인하지 않았으면 UNAUTHENTICATED', async () => {
    state.user = null;
    const result = await createOwnerAccount(input());
    expect(result.ok === false && result.error.code).toBe('UNAUTHENTICATED');
  });

  it('등록증이 본인 가입 폴더의 것이 아니면 INVALID_PATH', async () => {
    for (const path of [
      `users/someone-else/0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d.jpg`,
      `shops/shop-1/0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d.jpg`,
      'test/business-doc.pdf',
    ]) {
      const result = await createOwnerAccount(input((v) => void (v.shop.businessDocPath = path)));
      expect(result.ok === false && result.error.code).toBe('INVALID_PATH');
    }
    expect(state.saveOwnerAccount).not.toHaveBeenCalled();
  });

  it('이미 원장님 계정이 있으면 주소 변환 전에 ALREADY_EXISTS', async () => {
    state.existingOwner = true;
    expect(await createOwnerAccount(input())).toEqual(
      fail('ALREADY_EXISTS', '이미 원장님 계정이 있어요'),
    );
    expect(state.geocode).not.toHaveBeenCalled();
  });

  it('동시에 두 번 눌러 저장 단계에서 겹치면 ALREADY_EXISTS이고 모드를 바꾸지 않는다', async () => {
    state.saveOwnerAccount.mockResolvedValue(null);
    expect(await createOwnerAccount(input())).toEqual(
      fail('ALREADY_EXISTS', '이미 원장님 계정이 있어요'),
    );
    expect(state.cookieSet).not.toHaveBeenCalled();
  });

  it('주소 변환 실패는 후보 목록까지 그대로 돌려준다(#51)', async () => {
    const ambiguous = {
      ok: false,
      error: {
        code: 'ADDRESS_AMBIGUOUS',
        message: '주소가 여러 개 나와요. 하나를 골라 주세요',
        candidates: [{ roadAddress: '경기 안산시 단원구 중앙대로 1', jibunAddress: null }],
      },
    };
    state.geocode.mockResolvedValue(ambiguous);
    expect(await createOwnerAccount(input())).toEqual(ambiguous);
    expect(state.saveOwnerAccount).not.toHaveBeenCalled();
  });
});
