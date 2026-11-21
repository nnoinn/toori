// 매물 등록·재등록의 게시 멈춤 안내 아래 운영자가 고른 사유 한 줄(#499 ②). 문구는 #489 표(정책 adminNoticeText) 그대로

import { describe, expect, it } from 'vitest';

import { publishPauseNoticeLine } from './publish-pause-notice';

describe('publishPauseNoticeLine', () => {
  it('게시 멈춤에서 고를 수 있는 사유마다 "사유 · 다음에 할 일"', () => {
    expect(publishPauseNoticeLine({ code: 'user_inquiry' })).toBe(
      '사유: 이용자 문의를 확인하고 있어요 · 확인이 끝나면 알려 드려요',
    );
    expect(publishPauseNoticeLine({ code: 'shop_info_check' })).toBe(
      '사유: 입점 정보 확인이 필요해요 · 내 계정에서 사업자 정보를 확인해 주세요',
    );
    expect(publishPauseNoticeLine({ code: 'other' })).toBe(
      '사유: 기타 · 자세한 내용은 투리 카카오톡 채널로 안내해 드려요',
    );
  });

  it('다음에 할 일이 없으면(원장님 요청) 사유만', () => {
    expect(publishPauseNoticeLine({ code: 'owner_request' })).toBe('사유: 원장님이 요청하셨어요');
  });

  it('게시를 멈추지 않았으면 없다', () => {
    expect(publishPauseNoticeLine(null)).toBeNull();
  });
});
