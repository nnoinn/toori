import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logLocationUse } from '@/server/auth/location-log';

import { saveMyLocation, selectRegion } from './location-actions';
import { LOCATION_COOKIE_MAX_AGE, LOCATION_COOKIES } from './location-config';

// 쿠키·화면 새로 그리기·위치 이용 기록(DB)은 흉내 낸다. 여기서는 "기록을 먼저 남기고, 실패하면 위치를 저장하지 않는다"를 본다
const cookieStore = { set: vi.fn(), delete: vi.fn() };
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/server/auth/location-log', () => ({ logLocationUse: vi.fn() }));

const logMock = vi.mocked(logLocationUse);

beforeEach(() => {
  vi.clearAllMocks();
  logMock.mockResolvedValue(undefined);
});

describe('saveMyLocation', () => {
  it('위치 이용 기록을 1번 남기고 내 위치를 하루짜리 쿠키에 저장한다', async () => {
    const result = await saveMyLocation({ lat: 37.298, lng: 126.834 });
    expect(result).toEqual({ ok: true, data: null });
    expect(logMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith('nearby_search');
    expect(cookieStore.set).toHaveBeenCalledWith(
      LOCATION_COOKIES.myLocation,
      '37.298,126.834',
      expect.objectContaining({ httpOnly: true, maxAge: LOCATION_COOKIE_MAX_AGE.myLocation }),
    );
  });

  it('기록을 남기지 못하면 위치를 저장하지 않고 동네 선택으로 안내한다', async () => {
    logMock.mockRejectedValueOnce(new Error('db down'));
    const result = await saveMyLocation({ lat: 37.298, lng: 126.834 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('LOCATION_LOG_FAILED');
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('좌표가 이상하면 기록도 저장도 하지 않는다', async () => {
    for (const point of [{ lat: 91, lng: 0 }, { lat: 'a', lng: 1 }, null]) {
      const result = await saveMyLocation(point);
      expect(!result.ok && result.error.code).toBe('INVALID_LOCATION');
    }
    expect(logMock).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

describe('selectRegion', () => {
  it('동네를 고르면 위치정보가 아니라 기록하지 않고, 내 위치 쿠키는 지운다', async () => {
    const result = await selectRegion('41273');
    expect(result.ok).toBe(true);
    expect(logMock).not.toHaveBeenCalled();
    expect(cookieStore.set).toHaveBeenCalledWith(
      LOCATION_COOKIES.region,
      '41273',
      expect.objectContaining({ maxAge: LOCATION_COOKIE_MAX_AGE.region }),
    );
    expect(cookieStore.delete).toHaveBeenCalledWith(LOCATION_COOKIES.myLocation);
  });

  it('목록에 없는 동네는 거절한다', async () => {
    const result = await selectRegion('99999');
    expect(!result.ok && result.error.code).toBe('INVALID_REGION');
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
