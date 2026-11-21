// 운영자가 고른 사유를 원장님 화면에 보여 주는 한 줄(#499). 문구는 정책 adminNoticeText(#489 표) 그대로

import { describe, expect, it } from 'vitest';

import { adminNoticeLine } from './admin-notice-line';

describe('adminNoticeLine', () => {
  it('운영자 마감: "사유: 사유 · 다음에 할 일"', () => {
    expect(adminNoticeLine('listing_mismatch', 'close')).toBe(
      '사유: 매물 정보가 실제와 달라요(가격·시간·서비스) · 정보를 고쳐서 다시 올려 주세요',
    );
    expect(adminNoticeLine('user_inquiry', 'close')).toBe(
      '사유: 이용자 문의를 확인하고 있어요 · 확인이 끝나면 알려 드려요',
    );
  });

  it('다음에 할 일이 없으면(원장님 요청) 사유만', () => {
    expect(adminNoticeLine('owner_request', 'close')).toBe('사유: 원장님이 요청하셨어요');
  });

  it('위 문장이 이미 말한 다음에 할 일(omitNextStep)은 쓰지 않고, 다른 다음에 할 일은 그대로', () => {
    const step = '확인이 끝나면 돌아오는 지급일에 들어가요';
    expect(adminNoticeLine('user_inquiry', 'settlement_hold', { omitNextStep: step })).toBe(
      '사유: 이용자 문의를 확인하고 있어요',
    );
    expect(adminNoticeLine('user_inquiry', 'settlement_hold')).toBe(
      `사유: 이용자 문의를 확인하고 있어요 · ${step}`,
    );
    expect(adminNoticeLine('other', 'settlement_hold', { omitNextStep: step })).toBe(
      '사유: 기타 · 자세한 내용은 투리 카카오톡 채널로 안내해 드려요',
    );
  });
});
