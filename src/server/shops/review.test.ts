// 입점 심사 서버 함수 (#50 2장). 권한·입력 확인과 어떤 값을 넘기는지만 본다. 로그인·DB는 가짜로 바꿔서 DB 없이 돈다.
// DB에 실제로 바뀌는 모양은 review-store.test.ts가 확인한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import { approveShop, getShopReviewStatus, rejectShop, resubmitShopForReview } from './review';

const SHOP_ID = '2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091';

const state = vi.hoisted(() => ({
  ownerAuth: null as unknown,
  adminAuth: null as unknown,
  requireShopOwner: vi.fn(),
  reviewShop: vi.fn(),
  resubmitShop: vi.fn(),
  readShopReviewStatus: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('@/server/auth', () => ({
  requireShopOwner: state.requireShopOwner,
  requireAdmin: async () => state.adminAuth,
}));
vi.mock('./review-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./review-store')>();
  return {
    SHOP_REVIEW_ERRORS: actual.SHOP_REVIEW_ERRORS,
    reviewShop: state.reviewShop,
    resubmitShop: state.resubmitShop,
    readShopReviewStatus: state.readShopReviewStatus,
  };
});

const FORBIDDEN = fail('FORBIDDEN', '접근 권한이 없어요');

beforeEach(() => {
  vi.clearAllMocks();
  state.requireShopOwner.mockImplementation(async () => state.ownerAuth);
  state.ownerAuth = ok({ userId: 'user-1', ownerId: 'owner-1', shopId: SHOP_ID });
  state.adminAuth = ok({ userId: 'admin-1' });
  state.reviewShop.mockResolvedValue(ok(null));
  state.resubmitShop.mockResolvedValue(ok(null));
});

describe('원장님: getShopReviewStatus·resubmitShopForReview', () => {
  it('본인 샵인지 먼저 확인하고 심사 상태를 돌려준다', async () => {
    const review = {
      status: 'rejected',
      rejectionReason: '등록증이 흐려요',
      appliedAt: new Date('2026-10-20T00:00:00Z'),
      reviewedAt: new Date('2026-10-21T00:00:00Z'),
    };
    state.readShopReviewStatus.mockResolvedValue(review);
    expect(await getShopReviewStatus(SHOP_ID)).toEqual(ok(review));
    expect(state.requireShopOwner).toHaveBeenCalledWith(SHOP_ID);
  });

  it('다시 신청은 본인 샵 확인 뒤 저장 결과를 그대로 돌려준다', async () => {
    state.resubmitShop.mockResolvedValue(fail('INVALID_STATUS', '지금은 이 작업을 할 수 없어요'));
    expect(await resubmitShopForReview(SHOP_ID)).toEqual(
      fail('INVALID_STATUS', '지금은 이 작업을 할 수 없어요'),
    );
    expect(state.resubmitShop).toHaveBeenCalledWith(expect.anything(), SHOP_ID);
  });

  it('본인 샵이 아니면 권한 실패를 그대로 돌려주고 DB를 보지 않는다', async () => {
    state.ownerAuth = FORBIDDEN;
    expect(await getShopReviewStatus(SHOP_ID)).toEqual(FORBIDDEN);
    expect(await resubmitShopForReview(SHOP_ID)).toEqual(FORBIDDEN);
    expect(state.readShopReviewStatus).not.toHaveBeenCalled();
    expect(state.resubmitShop).not.toHaveBeenCalled();
  });
});

describe('운영자: approveShop·rejectShop', () => {
  it('승인은 관리자 id와 함께 트랜잭션 안에서 저장한다', async () => {
    expect(await approveShop(SHOP_ID)).toEqual(ok(null));
    expect(state.reviewShop).toHaveBeenCalledWith('tx', {
      shopId: SHOP_ID,
      adminId: 'admin-1',
      decision: 'approve',
    });
  });

  it('반려 사유는 앞뒤 공백을 지워서 저장한다', async () => {
    expect(await rejectShop(SHOP_ID, '  등록증이 흐려요 ')).toEqual(ok(null));
    expect(state.reviewShop).toHaveBeenCalledWith('tx', {
      shopId: SHOP_ID,
      adminId: 'admin-1',
      decision: 'reject',
      reason: '등록증이 흐려요',
    });
  });

  it.each(['', '   '])('반려 사유가 비어 있으면(%j) REASON_REQUIRED', async (reason) => {
    expect(await rejectShop(SHOP_ID, reason)).toEqual(
      fail('REASON_REQUIRED', '반려 사유를 입력해 주세요'),
    );
    expect(state.reviewShop).not.toHaveBeenCalled();
  });

  it('샵 id 모양이 틀리면 SHOP_NOT_FOUND이고 DB를 보지 않는다', async () => {
    const notFound = fail('SHOP_NOT_FOUND', '샵을 찾을 수 없어요');
    expect(await approveShop('not-a-uuid')).toEqual(notFound);
    expect(await rejectShop('not-a-uuid', '사유')).toEqual(notFound);
    expect(state.reviewShop).not.toHaveBeenCalled();
  });

  it('관리자가 아니면 권한 실패를 그대로 돌려준다', async () => {
    state.adminAuth = FORBIDDEN;
    expect(await approveShop(SHOP_ID)).toEqual(FORBIDDEN);
    expect(await rejectShop(SHOP_ID, '사유')).toEqual(FORBIDDEN);
    expect(state.reviewShop).not.toHaveBeenCalled();
  });
});
