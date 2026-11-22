import { describe, expect, it } from 'vitest';

import { DISPUTE_OUTCOMES } from '@/db/schema';

import { DISPUTE_OUTCOME_OWNER_TEXTS, disputeNotice } from './reservation-dispute';

const receivedAt = new Date('2026-11-15T14:30:00+09:00');
const handledAt = new Date('2026-11-17T10:00:00+09:00');

describe('원장님 예약 상세의 이의제기 안내 (S-407)', () => {
  it('확인 중이면 접수한 때와 정산 보류, 카카오톡 채널 문의를 알린다', () => {
    expect(disputeNotice({ status: 'open', receivedAt })).toEqual({
      title: '고객이 이의제기했어요',
      description:
        '11/15(일) 14:30 접수 · 투리가 확인하고 있어요. 확인이 끝날 때까지 이 예약의 정산은 보류돼요. 궁금한 점은 투리 카카오톡 채널로 문의해 주세요.',
    });
  });

  it('결론이 나면 결론을 원장님 말로 한 줄 보여주고, 정산 보류는 말하지 않는다', () => {
    const notice = disputeNotice({
      status: 'resolved',
      receivedAt,
      outcome: 'no_show_reversed',
      handledAt,
    });
    expect(notice).toEqual({
      title: '투리가 이의제기 확인을 마쳤어요',
      description:
        '결론: 노쇼를 방문 완료로 바꿨어요. 궁금한 점은 투리 카카오톡 채널로 문의해 주세요.',
    });
    expect(notice.description).not.toContain('보류');
  });

  it('결론 종류마다 원장님 문구가 있고, 서로 다르다', () => {
    const texts = DISPUTE_OUTCOMES.map((outcome) => DISPUTE_OUTCOME_OWNER_TEXTS[outcome]);
    for (const text of texts) expect(text).toBeTruthy();
    expect(new Set(texts).size).toBe(DISPUTE_OUTCOMES.length);
    // 기록 시각을 몰라도 결론은 보여준다(기록 시각은 기록 카드에만 쓴다)
    expect(
      disputeNotice({ status: 'resolved', receivedAt, outcome: 'no_change', handledAt: null })
        .description,
    ).toBe('결론: 바꾼 것 없이 확인을 마쳤어요. 궁금한 점은 투리 카카오톡 채널로 문의해 주세요.');
  });
});
