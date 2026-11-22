// 원장님 예약 상세의 이의제기 안내 (S-407, 연결 #20). 서버와 화면이 같이 쓴다.
// 이의제기는 그 예약의 손님만 신청하고 투리(운영자)가 처리한다(11/13 nnoinn). 원장님에게는 접수한 때와 확인 상태,
// 결론만 원장님 말로 보여주고(11/21 정민석), 손님이 고른 종류·쓴 내용과 운영자 결론 메모는 보여주지 않는다.
// 확인 중이면 그 예약의 정산이 보류된다(hasOpenDispute, S-501). 문의는 투리 카카오톡 채널로 받는다(#20 R9)

import type { DisputeOutcome } from '@/db/schema';
import { SITE_NAME } from '@/lib/site';
import { formatKst } from '@/lib/time';

/**
 * 원장님에게 보여주는 그 예약의 이의제기. 한 예약에 이의제기는 하나다(disputes_reservation_id_unique).
 * receivedAt은 접수 시각(카카오톡 채널 건은 채널에서 받은 시각), handledAt은 운영자가 결론을 기록한 시각
 */
export type OwnerReservationDispute =
  | { status: 'open'; receivedAt: Date }
  | { status: 'resolved'; receivedAt: Date; outcome: DisputeOutcome; handledAt: Date | null };

/**
 * 결론을 원장님 말로. 운영자 화면 이름(DISPUTE_OUTCOME_LABELS)과 같은 결론을 원장님이 무엇이 바뀌었는지 알 수 있게 쓴다.
 * 환불 예외·무효·원장님 사정 취소로 바꿈은 처리 기능이 생기면 운영자가 고를 수 있다(READY_DISPUTE_OUTCOMES)
 */
export const DISPUTE_OUTCOME_OWNER_TEXTS: Record<DisputeOutcome, string> = {
  no_show_confirmed: '노쇼 처리가 맞다고 확인했어요',
  no_show_reversed: '노쇼를 방문 완료로 바꿨어요',
  refund_exception: '고객에게 환불 예외를 적용했어요',
  voided: '예약을 무효로 처리했어요',
  owner_fault_cancel: '원장님 사정 취소로 바꿨어요',
  no_change: '바꾼 것 없이 확인을 마쳤어요',
};

const ASK_CHANNEL = `궁금한 점은 ${SITE_NAME} 카카오톡 채널로 문의해 주세요.`;

/** 예약 상세 맨 위 안내 상자의 제목과 설명. 확인 중이면 정산 보류를, 결론이 났으면 결론 한 줄을 알린다 */
export function disputeNotice(dispute: OwnerReservationDispute): {
  title: string;
  description: string;
} {
  if (dispute.status === 'open') {
    return {
      title: '고객이 이의제기했어요',
      description: `${formatKst(dispute.receivedAt)} 접수 · ${SITE_NAME}가 확인하고 있어요. 확인이 끝날 때까지 이 예약의 정산은 보류돼요. ${ASK_CHANNEL}`,
    };
  }
  return {
    title: `${SITE_NAME}가 이의제기 확인을 마쳤어요`,
    description: `결론: ${DISPUTE_OUTCOME_OWNER_TEXTS[dispute.outcome]}. ${ASK_CHANNEL}`,
  };
}
