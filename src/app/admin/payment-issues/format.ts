// 운영자 결제·환불 확인 화면(#373 ①)의 이름표와 결과 문구. 화면 코드에서만 쓴다.

import type { CancelRetryResult, OrderRetryResult } from '@/server/admin/payment-issues-types';

export const PAYMENT_ISSUES_PATH = '/admin/payment-issues';

/** 꼬인 주문의 상태 */
export const STUCK_ORDER_LABELS: Record<'pending' | 'paid', string> = {
  paid: '결제됨, 예약 안 됨',
  pending: '결과 모름',
};

/** 주문에 남은 실패 코드. 모르는 코드는 그대로 보여준다 */
const FAILURE_CODE_LABELS: Record<string, string> = {
  AMOUNT_MISMATCH: '결제 금액이 주문과 다름',
};

export function labelFailureCode(code: string | null): string | null {
  if (!code) return null;
  return Object.hasOwn(FAILURE_CODE_LABELS, code) ? FAILURE_CODE_LABELS[code] : code;
}

/** 주문 [다시 시도] 뒤에 보여줄 결과. left면 목록에 그대로 남는다 */
export const ORDER_RETRY_TEXT: Record<OrderRetryResult, string> = {
  confirmed: '포트원에서 결제를 확인하고 예약을 확정했어요. 손님·원장님에게 확정 알림이 갔어요.',
  autoCancelled: '결제를 취소했어요(자동 취소). 손님에게 자동 취소 알림이 갔어요.',
  failed: '포트원에서 결제가 안 된 것으로 확인해서 실패로 정리했어요.',
  abandoned: '결제창에서 결제하지 않은 주문이라 실패로 정리했어요.',
  left: '이번에도 정하지 못했어요. 포트원이 응답하지 않았거나 결제사가 아직 처리 중이에요. 포트원 콘솔에서 결제 번호로 확인해 주세요.',
};

/** 환불 [다시 시도] 뒤에 보여줄 결과. left면 목록에 그대로 남는다 */
export const CANCEL_RETRY_TEXT: Record<CancelRetryResult, string> = {
  finished: '포트원 환불을 확인하고 취소를 끝냈어요. 알림도 평소처럼 갔어요.',
  cleared:
    '포트원에 환불이 없어서 진행 표시만 지웠어요. 예약은 그대로이고 손님이 다시 취소할 수 있어요(합의 후 취소면 요청이 답을 기다리는 상태로 돌아가요).',
  left: '포트원이 아직 환불을 처리 중이거나 응답하지 않았어요. 조금 뒤 다시 시도하거나 포트원 콘솔에서 확인해 주세요.',
};

export const REVIEW_CHECKED_TEXT = '확인했다고 기록했어요. 이 환불은 목록에서 빠져요.';

/** [다시 시도]·[확인함] 확인 창의 안내 */
export const ISSUE_ACTION_TEXT = {
  order: {
    button: '다시 시도',
    title: (label: string) => `결제 번호 ${label} 주문을 다시 정리할까요?`,
    description:
      '결제 정리 작업과 같은 처리를 한 번 더 해요. 결제가 됐는데 예약이 안 된 주문은 결제를 취소하고, 결과를 모르는 주문은 포트원에 물어 예약을 확정하거나 정리해요. 손님 알림은 결과에 따라 평소처럼 가요.',
    submit: '다시 시도',
  },
  cancel: {
    button: '다시 시도',
    title: (label: string) => `예약 ${label}의 환불을 다시 정리할까요?`,
    description:
      '취소 정리 작업과 같은 처리를 한 번 더 해요. 포트원에 환불이 있으면 취소를 끝내고, 없으면 진행 표시를 지워서 손님이 다시 취소할 수 있게 해요.',
    submit: '다시 시도',
  },
  review: {
    button: '확인함',
    title: (label: string) => `${label} 환불을 확인했다고 기록할까요?`,
    description:
      '금액과 환불은 바꾸지 않아요. 포트원 콘솔에서 실제 환불액을 확인한 뒤 눌러 주세요. 확인한 환불은 목록에서 빠져요.',
    submit: '확인함',
  },
} as const;

export type IssueActionKind = keyof typeof ISSUE_ACTION_TEXT;
