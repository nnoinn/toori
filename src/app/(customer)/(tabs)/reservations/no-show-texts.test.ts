import { describe, expect, it } from 'vitest';

import { SITE_NAME } from '@/lib/site';
import { NO_SHOW_PENALTY_RATE } from '@/server/policy';

import { NO_SHOW_DISPUTE_NOTE, noShowRefundNote } from './no-show-texts';

describe('노쇼 안내 문구', () => {
  it('위약금 100%면 환불되지 않는다고 안내한다', () => {
    expect(noShowRefundNote(100)).toBe('노쇼로 처리된 예약은 환불되지 않아요');
  });

  it('위약금이 100%보다 작으면 환불 비율을 정책 값으로 만든다', () => {
    expect(noShowRefundNote(70)).toBe('노쇼로 처리된 예약은 결제 금액의 30%만 환불돼요');
  });

  it('기본값은 정책의 노쇼 위약금 비율이다', () => {
    expect(noShowRefundNote()).toBe(noShowRefundNote(NO_SHOW_PENALTY_RATE));
  });

  it('잘못 처리됐을 때 서비스 이름의 카카오톡 채널로 안내한다', () => {
    expect(NO_SHOW_DISPUTE_NOTE).toContain(`${SITE_NAME} 카카오톡 채널`);
  });
});
