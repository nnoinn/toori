// 샵 사진·사업자등록증 업로드 서버 함수 (#47 6장). 권한·형식·크기 확인과 어느 경로·버킷에 주소를 만드는지 본다.
// 로그인·DB·Storage는 가짜로 바꿔서 DB 없이 돈다. 실제 Storage 업로드는 PR 설명의 "실제 확인"으로 했다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import type { CurrentAccount } from '@/server/auth';

import { createBusinessDocUploadUrl, createShopImageUploadUrl, getBusinessDocUrl } from './upload';

const SHOP = '2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091';
const NOW = new Date('2026-10-28T06:00:00Z');

const state = vi.hoisted(() => ({
  account: null as Partial<CurrentAccount> | null,
  ownerAuth: null as unknown,
  reviewStatus: 'pending' as string,
  docRows: [] as { businessDocPath: string }[],
  createSignedUploadUrl: vi.fn(),
  createSignedUrl: vi.fn(),
  bucket: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  AUTH_ERRORS: {
    UNAUTHENTICATED: '로그인이 필요해요',
    WRONG_MODE_OWNER: '원장님 계정으로 들어와 주세요',
    FORBIDDEN: '접근 권한이 없어요',
  },
  getCurrentAccount: async () => state.account,
  requireShopOwner: async () => state.ownerAuth,
}));
vi.mock('@/server/shops/review-store', async (importOriginal) => ({
  SHOP_REVIEW_ERRORS: (await importOriginal<typeof import('@/server/shops/review-store')>())
    .SHOP_REVIEW_ERRORS,
  readShopReviewStatus: async () => ({ status: state.reviewStatus }),
}));
vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: async () => state.docRows }) }),
  }),
}));
vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => NOW }));
vi.mock('@/server/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: (bucket: string) => {
        state.bucket(bucket);
        return {
          createSignedUploadUrl: state.createSignedUploadUrl,
          createSignedUrl: state.createSignedUrl,
        };
      },
    },
  }),
}));

const FILE = { contentType: 'image/jpeg', size: 1_000_000 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.ownerAuth = ok({ userId: 'user-1', ownerId: 'owner-1', shopId: SHOP });
  state.account = { userId: 'user-1', mode: 'owner', ownerId: null, shopId: null, isAdmin: false };
  state.reviewStatus = 'pending';
  state.docRows = [{ businessDocPath: `shops/${SHOP}/doc.jpg` }];
  state.createSignedUploadUrl.mockImplementation(async (path: string) => ({
    data: { path, token: 'token-1', signedUrl: `https://storage.example/${path}?token=token-1` },
    error: null,
  }));
  state.createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://storage.example/doc?token=x' },
    error: null,
  });
});

describe('createShopImageUploadUrl', () => {
  it('본인 샵 폴더에 서명된 업로드 주소를 만든다', async () => {
    const result = await createShopImageUploadUrl({ shopId: SHOP, ...FILE });
    expect(state.bucket).toHaveBeenCalledWith('shop-images');
    expect(result.ok && result.data.path).toMatch(new RegExp(`^${SHOP}/[0-9a-f-]{36}\\.jpg$`));
    expect(result.ok && result.data.token).toBe('token-1');
  });

  it('본인 샵이 아니면 권한 실패를 그대로 돌려주고 주소를 만들지 않는다', async () => {
    state.ownerAuth = fail('FORBIDDEN', '접근 권한이 없어요');
    expect(await createShopImageUploadUrl({ shopId: SHOP, ...FILE })).toEqual(state.ownerAuth);
    expect(state.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['허용하지 않는 형식', { contentType: 'image/gif', size: 1000 }, 'INVALID_FILE_TYPE'],
    ['HTML', { contentType: 'text/html', size: 1000 }, 'INVALID_FILE_TYPE'],
    ['PDF(샵 사진은 사진만)', { contentType: 'application/pdf', size: 1000 }, 'INVALID_FILE_TYPE'],
    ['5MB 초과', { contentType: 'image/png', size: 5_000_001 }, 'FILE_TOO_LARGE'],
    ['크기 0', { contentType: 'image/png', size: 0 }, 'FILE_TOO_LARGE'],
  ])('%s → %s', async (_, file, code) => {
    const result = await createShopImageUploadUrl({ shopId: SHOP, ...file });
    expect(result.ok === false && result.error.code).toBe(code);
    expect(state.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('5MB 딱 맞으면 된다', async () => {
    const result = await createShopImageUploadUrl({
      shopId: SHOP,
      contentType: 'image/webp',
      size: 5_000_000,
    });
    expect(result.ok).toBe(true);
  });

  it('Storage가 주소를 못 만들면 UPLOAD_UNAVAILABLE', async () => {
    state.createSignedUploadUrl.mockResolvedValue({ data: null, error: new Error('down') });
    const result = await createShopImageUploadUrl({ shopId: SHOP, ...FILE });
    expect(result.ok === false && result.error.code).toBe('UPLOAD_UNAVAILABLE');
  });
});

describe('createBusinessDocUploadUrl', () => {
  it('가입 중(원장님 모드, 원장님 계정 없음)이면 본인 폴더에 만든다', async () => {
    const result = await createBusinessDocUploadUrl(FILE);
    expect(state.bucket).toHaveBeenCalledWith('business-docs');
    expect(result.ok && result.data.path).toMatch(/^users\/user-1\/[0-9a-f-]{36}\.jpg$/);
  });

  it('PDF도 받는다(10/28 결정)', async () => {
    const result = await createBusinessDocUploadUrl({ contentType: 'application/pdf', size: 1000 });
    expect(result.ok && result.data.path).toMatch(/^users\/user-1\/[0-9a-f-]{36}\.pdf$/);
  });

  it('사진·PDF가 아니거나 5MB를 넘으면 주소를 만들지 않는다', async () => {
    const gif = await createBusinessDocUploadUrl({ contentType: 'image/gif', size: 1000 });
    expect(gif).toEqual(fail('INVALID_FILE_TYPE', 'JPG·PNG·WEBP 사진이나 PDF만 올릴 수 있어요'));
    const big = await createBusinessDocUploadUrl({
      contentType: 'application/pdf',
      size: 5_000_001,
    });
    expect(big.ok === false && big.error.code).toBe('FILE_TOO_LARGE');
    expect(state.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('가입 중인데 로그인 안 함·고객 모드·이미 원장님 계정이 있으면 거절한다', async () => {
    const cases: [Partial<CurrentAccount> | null, string][] = [
      [null, 'UNAUTHENTICATED'],
      [{ userId: 'user-1', mode: 'customer', ownerId: null }, 'WRONG_MODE'],
      [{ userId: 'user-1', mode: 'owner', ownerId: 'owner-1', shopId: SHOP }, 'ALREADY_EXISTS'],
    ];
    for (const [account, code] of cases) {
      state.account = account;
      const result = await createBusinessDocUploadUrl(FILE);
      expect(result.ok === false && result.error.code).toBe(code);
    }
    expect(state.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('샵이 있으면 승인 전(승인 대기·반려)일 때만 그 샵 폴더에 만든다', async () => {
    for (const status of ['pending', 'rejected']) {
      state.reviewStatus = status;
      const result = await createBusinessDocUploadUrl({ shopId: SHOP, ...FILE });
      expect(result.ok && result.data.path).toMatch(new RegExp(`^shops/${SHOP}/`));
    }
    state.reviewStatus = 'approved';
    const approved = await createBusinessDocUploadUrl({ shopId: SHOP, ...FILE });
    expect(approved.ok === false && approved.error.code).toBe('INVALID_STATUS');
  });

  it('샵이 있는데 본인 샵이 아니면 권한 실패', async () => {
    state.ownerAuth = fail('FORBIDDEN', '접근 권한이 없어요');
    expect(await createBusinessDocUploadUrl({ shopId: SHOP, ...FILE })).toEqual(state.ownerAuth);
  });
});

describe('getBusinessDocUrl', () => {
  it('관리자는 어느 샵이든 5분짜리 주소를 받는다', async () => {
    state.account = { userId: 'admin-1', mode: 'customer', shopId: null, isAdmin: true };
    expect(await getBusinessDocUrl(SHOP)).toEqual(
      ok({
        url: 'https://storage.example/doc?token=x',
        expiresAt: new Date(NOW.getTime() + 300_000),
      }),
    );
    expect(state.bucket).toHaveBeenCalledWith('business-docs');
    expect(state.createSignedUrl).toHaveBeenCalledWith(`shops/${SHOP}/doc.jpg`, 300);
  });

  it('원장님은 원장님 모드로 들어온 본인 샵만 받는다', async () => {
    state.account = { userId: 'user-1', mode: 'owner', shopId: SHOP, isAdmin: false };
    expect((await getBusinessDocUrl(SHOP)).ok).toBe(true);

    state.account = { userId: 'user-1', mode: 'customer', shopId: SHOP, isAdmin: false };
    expect(await getBusinessDocUrl(SHOP)).toEqual(fail('FORBIDDEN', '접근 권한이 없어요'));

    state.account = { userId: 'user-2', mode: 'owner', shopId: 'other-shop', isAdmin: false };
    expect(await getBusinessDocUrl(SHOP)).toEqual(fail('FORBIDDEN', '접근 권한이 없어요'));
  });

  it('로그인 안 함 → UNAUTHENTICATED, 없는 샵 → SHOP_NOT_FOUND, 파일이 없으면 DOC_NOT_FOUND', async () => {
    state.account = null;
    expect((await getBusinessDocUrl(SHOP)).ok === false).toBe(true);

    state.account = { userId: 'admin-1', mode: 'customer', shopId: null, isAdmin: true };
    state.docRows = [];
    const missing = await getBusinessDocUrl(SHOP);
    expect(missing.ok === false && missing.error.code).toBe('SHOP_NOT_FOUND');
    const badId = await getBusinessDocUrl('not-a-uuid');
    expect(badId.ok === false && badId.error.code).toBe('SHOP_NOT_FOUND');

    state.docRows = [{ businessDocPath: 'seed/doc.pdf' }];
    state.createSignedUrl.mockResolvedValue({ data: null, error: new Error('Object not found') });
    const noFile = await getBusinessDocUrl(SHOP);
    expect(noFile.ok === false && noFile.error.code).toBe('DOC_NOT_FOUND');
  });
});
