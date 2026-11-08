// 노쇼 안내 문구 (C-105). 내 정보의 노쇼 기록과 노쇼 예약 상세가 같이 쓴다. 화면과 서버 어디서나 쓴다.
// 숫자는 정책 값(NO_SHOW_PENALTY_RATE)으로 만들고, 서비스 이름은 SITE_NAME을 쓴다.

import { SITE_NAME } from '@/lib/site';
import { NO_SHOW_PENALTY_RATE } from '@/server/policy';

/** 노쇼 예약의 환불 안내. 위약금이 100%면 "환불되지 않아요"(S-406) */
export function noShowRefundNote(penaltyRate: number = NO_SHOW_PENALTY_RATE): string {
  return penaltyRate >= 100
    ? '노쇼로 처리된 예약은 환불되지 않아요'
    : `노쇼로 처리된 예약은 결제 금액의 ${100 - penaltyRate}%만 환불돼요`;
}

/**
 * 노쇼가 잘못 처리됐을 때 알리는 곳. 이의제기 처리 방식(A-104)이 정해지기 전까지
 * 원장님 화면의 문의와 같은 카카오톡 채널로 안내한다(11/4)
 */
export const NO_SHOW_DISPUTE_NOTE = `잘못 처리됐다면 예약번호와 함께 ${SITE_NAME} 카카오톡 채널로 알려 주세요`;
