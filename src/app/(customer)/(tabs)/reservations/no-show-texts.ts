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
 * 노쇼가 잘못 처리됐을 때 알리는 곳. 예약 상세의 이의제기(C-507)와 카카오톡 채널 둘 다 받는다(11/9).
 * 예약 상세에서는 바로 아래 이의제기 칸으로 이어 준다(NO_SHOW_DISPUTE_BELOW)
 */
export const NO_SHOW_DISPUTE_NOTE = `잘못 처리됐다면 그 예약 상세의 이의제기나 ${SITE_NAME} 카카오톡 채널로 알려 주세요`;
