import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refresh } from 'next/cache';
import { fail, ok } from '@/lib/result';
import { getMarketingConsent } from '@/server/auth/customer-account';
import { getInterestAreas, setInterestAreas } from '@/server/notifications/interest-areas';

import { watchListArea } from './actions';

// 관심 동네 읽기·저장(강규민님 함수)과 동의 읽기는 흉내 낸다.
// 여기서는 "있던 관심 동네를 지우지 않고 하나 더하는지, 동의 여부를 어떻게 돌려주는지"를 본다
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/server/auth/customer-account', () => ({ getMarketingConsent: vi.fn() }));
vi.mock('@/server/notifications/interest-areas', () => ({
  getInterestAreas: vi.fn(),
  setInterestAreas: vi.fn(),
}));

const getAreasMock = vi.mocked(getInterestAreas);
const setAreasMock = vi.mocked(setInterestAreas);
const consentMock = vi.mocked(getMarketingConsent);

const consent = (agreed: boolean) =>
  ok({ agreed, agreedAt: agreed ? new Date() : null, withdrawnAt: null });

beforeEach(() => {
  vi.clearAllMocks();
  getAreasMock.mockResolvedValue(ok({ sigunguCodes: ['41273'] }));
  setAreasMock.mockImplementation(async (codes) => ok({ sigunguCodes: codes }));
  consentMock.mockResolvedValue(consent(true));
});

describe('watchListArea', () => {
  it('있던 관심 동네는 그대로 두고 이 동네를 더한다', async () => {
    expect(await watchListArea('41271')).toEqual(ok({ marketingAgreed: true }));
    expect(setAreasMock).toHaveBeenCalledWith(['41273', '41271']);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('이미 관심 동네면 다시 저장하지 않는다', async () => {
    expect(await watchListArea('41273')).toEqual(ok({ marketingAgreed: true }));
    expect(setAreasMock).not.toHaveBeenCalled();
  });

  it('광고성 정보 수신에 동의하지 않았으면 동네는 저장하고 동의 안 함을 알려 준다(동의는 화면에서 따로)', async () => {
    consentMock.mockResolvedValueOnce(consent(false));
    expect(await watchListArea('41271')).toEqual(ok({ marketingAgreed: false }));
    expect(setAreasMock).toHaveBeenCalledTimes(1);
  });

  it('동의 여부를 읽지 못해도 저장은 성공으로 두고, 동의 안 함으로 본다', async () => {
    consentMock.mockResolvedValueOnce(fail('LOAD_FAILED', '불러오지 못했어요'));
    expect(await watchListArea('41271')).toEqual(ok({ marketingAgreed: false }));
  });

  it('관심 동네를 읽지 못하면(로그인 안 함 등) 저장하지 않고 그 이유를 돌려준다', async () => {
    getAreasMock.mockResolvedValueOnce(fail('UNAUTHENTICATED', '로그인해 주세요'));
    const result = await watchListArea('41271');
    expect(!result.ok && result.error.code).toBe('UNAUTHENTICATED');
    expect(setAreasMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('저장이 거절되면(동네 목록에 없는 코드, 개수 초과 등) 그 이유를 그대로 돌려준다', async () => {
    setAreasMock.mockResolvedValueOnce(fail('INVALID_INPUT', '동네를 다시 골라 주세요'));
    const result = await watchListArea('99999');
    expect(!result.ok && result.error.code).toBe('INVALID_INPUT');
    expect(refresh).not.toHaveBeenCalled();
  });
});
