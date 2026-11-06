import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refresh } from 'next/cache';
import { fail, ok } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import { setFavorite } from './actions';
import { addFavorite, removeFavorite } from './store';

// 로그인 확인·DB 저장·화면 새로 그리기는 흉내 낸다. 여기서는 "본인 고객 계정의 찜만 바꾸고, 입력·실패를 어떻게 돌려주는지"를 본다.
// 실제 저장(store.ts)은 store.db.test.ts에서 본다
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/db', () => ({ getDb: vi.fn(() => 'db') }));
vi.mock('@/server/auth', () => ({ requireCustomer: vi.fn() }));
vi.mock('./store', () => ({ addFavorite: vi.fn(), removeFavorite: vi.fn() }));

const SHOP_ID = '6f2c1d8e-3b4a-4c5d-9e7f-0a1b2c3d4e5f';
const authMock = vi.mocked(requireCustomer);
const addMock = vi.mocked(addFavorite);
const removeMock = vi.mocked(removeFavorite);

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(ok({ userId: 'user-1', customerId: 'customer-1' }));
  addMock.mockResolvedValue(true);
  removeMock.mockResolvedValue(undefined);
});

describe('setFavorite', () => {
  it('찜하면 내 고객 계정으로 저장하고 화면을 다시 그린다', async () => {
    expect(await setFavorite({ shopId: SHOP_ID, favorite: true })).toEqual(ok({ favorite: true }));
    expect(addMock).toHaveBeenCalledWith('db', 'customer-1', SHOP_ID);
    expect(removeMock).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('찜을 풀면 내 고객 계정의 찜을 지운다', async () => {
    expect(await setFavorite({ shopId: SHOP_ID, favorite: false })).toEqual(
      ok({ favorite: false }),
    );
    expect(removeMock).toHaveBeenCalledWith('db', 'customer-1', SHOP_ID);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('고객으로 로그인하지 않았으면 저장하지 않고 그 이유를 그대로 돌려준다', async () => {
    authMock.mockResolvedValueOnce(fail('UNAUTHENTICATED', '로그인해 주세요'));
    const result = await setFavorite({ shopId: SHOP_ID, favorite: true });
    expect(!result.ok && result.error.code).toBe('UNAUTHENTICATED');
    expect(addMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('샵 ID가 이상하거나 값이 빠지면 저장하지 않는다', async () => {
    for (const input of [
      { shopId: 'not-a-uuid', favorite: true },
      { shopId: SHOP_ID },
      { shopId: SHOP_ID, favorite: 'yes' },
      null,
    ]) {
      const result = await setFavorite(input);
      expect(!result.ok && result.error.code).toBe('INVALID_INPUT');
    }
    expect(addMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('찜할 수 없는 샵(없거나 볼 수 없는 샵)이면 알려 준다', async () => {
    addMock.mockResolvedValueOnce(false);
    const result = await setFavorite({ shopId: SHOP_ID, favorite: true });
    expect(!result.ok && result.error.code).toBe('SHOP_NOT_FOUND');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('저장이 실패하면 다시 시도하라고 알리고, 로그에는 오류 이름만 남긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    addMock.mockRejectedValueOnce(new TypeError(`fetch failed for ${SHOP_ID}`));
    const result = await setFavorite({ shopId: SHOP_ID, favorite: true });
    expect(!result.ok && result.error.code).toBe('SAVE_FAILED');
    expect(log).toHaveBeenCalledWith('[setFavorite] 저장 실패:', 'TypeError');
    expect(refresh).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
