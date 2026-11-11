// 원장님 예약 상세의 [예약 취소] 카드와 합의 후 취소 안내 창의 문구·규칙 (S-410, 연결 #19, #301). 서버와 화면이 같이 쓴다.
// 안내 창 문구는 동의 문구 8-1장이고, 50%·24시간은 정책값에서 가져온다.
// 원장님 기준 금액(판매가 × 50%)은 화면에서 계산하지 않고 getAgreedCancelStatus의 baseAmount를 그대로 쓴다.

import { formatWon } from '@/lib/format';
import { SITE_NAME } from '@/lib/site';
import { formatKst } from '@/lib/time';
import { AGREED_CANCEL_REFUND_RATE, AGREED_CANCEL_RESPONSE_HOURS } from '@/server/policy/refund';
import type { AgreedCancelErrorCode } from '@/server/refunds/agreed-cancel-errors';
import {
  AGREED_CANCEL_REASON_LABELS,
  AGREED_CANCEL_REASON_TEXT_MAX,
  AGREED_CANCEL_REASONS,
  type AgreedCancelReason,
  type AgreedCancelStatus,
} from '@/server/refunds/agreed-cancel-types';

/** 원장님이 정산받는 비율(판매가 기준). 손님 환불율의 나머지다(agreed-cancel-rules.ts와 같은 계산) */
const OWNER_RATE = 100 - AGREED_CANCEL_REFUND_RATE;

export const CANCEL_CARD_TITLE = '예약 취소';
export const CANCEL_CARD_DESCRIPTION =
  '원장님 사정이나 손님과의 합의로 이 예약을 취소해야 할 때 눌러 주세요.';
/** 요청 기록만 보여줄 때(취소·방문·노쇼 처리 뒤) 카드 제목 */
export const AGREED_CANCEL_HISTORY_TITLE = '합의 후 취소 요청';
/** 요청 상태를 읽지 못했을 때 */
export const AGREED_CANCEL_LOAD_FAILED =
  '합의 후 취소 요청 상태를 불러오지 못했어요. 화면을 새로 고쳐 주세요.';

/** [예약 취소]를 누르면 여는 고르기 창 */
export const CANCEL_CHOOSER_TITLE = '어떻게 취소할까요?';
export const CANCEL_METHODS = {
  /** S-409. 처리 함수(X-207)가 생기면 연다 */
  ownerFault: {
    title: '원장님 사정으로 취소',
    description: '원장님 사정으로 시술할 수 없을 때 써요.',
    notReady: '준비 중',
  },
  agreed: {
    title: '손님과 합의 후 취소',
    description: '손님 쪽 사정으로 시술하지 않기로 손님과 합의했을 때 써요.',
  },
} as const;

/** 안내 창(동의 문구 8-1장) "이럴 때 써요". 첫 줄 아래에 먼저 안내할 대안을 붙인다 */
export const AGREED_CANCEL_USE_WHEN = [
  '손님이 원하는 스타일이 예약한 서비스로는 안 될 때(예: 커트로 예약했는데 펌이 필요한 스타일)',
  '손님이 그 방법들을 원하지 않고 시술을 받지 않기로 했을 때',
] as const;
export const AGREED_CANCEL_ALTERNATIVES =
  '먼저 손님께 바꾼 서비스의 정가에서 할인가를 뺀 차액을 내고 서비스를 바꾸거나, 예약한 서비스대로 받는 방법을 안내해 주세요';

/** "이럴 때는 쓰지 않아요" */
export const AGREED_CANCEL_NOT_FOR = [
  '원장님 사정으로 시술할 수 없을 때 → 원장님 사정으로 취소',
  '손님이 오지 않았을 때 → 노쇼',
] as const;

/** "이렇게 처리돼요". 원장님 금액은 서버가 준 baseAmount */
export function agreedCancelOutcomes(baseAmount: number): string[] {
  return [
    `손님: 결제한 금액의 ${AGREED_CANCEL_REFUND_RATE}%를 환불받아요(쓴 쿠폰은 돌려드리지 않아요)`,
    `원장님: 판매가의 ${OWNER_RATE}%(${formatWon(baseAmount)})를 정산받아요(수수료는 정산 규정대로). 패널티는 없어요`,
    `손님이 ${SITE_NAME} 앱에서 동의해야 취소돼요. ${AGREED_CANCEL_RESPONSE_HOURS}시간 안에 동의하지 않으면 요청이 사라져요`,
  ];
}

/** 사유 칩. 고른 사유와 기타 내용은 손님 요청 카드(C-506)에도 보인다 */
export const AGREED_CANCEL_REASON_CHIPS = AGREED_CANCEL_REASONS.map((key) => ({
  key,
  label: AGREED_CANCEL_REASON_LABELS[key],
}));
export const AGREED_CANCEL_REASON_VISIBLE = '고른 사유와 적은 내용은 손님에게도 보여요.';

export const AGREED_CANCEL_CONFIRM_LABEL = `손님께 ${AGREED_CANCEL_REFUND_RATE}% 환불을 설명했고, 손님도 시술을 받지 않기로 했어요`;
export const AGREED_CANCEL_SUBMIT = '합의 후 취소 요청하기';
export const AGREED_CANCEL_REQUEST_FAILED = '요청하지 못했어요. 잠시 후 다시 시도해 주세요';

/** 입력이 다 됐는지: 사유를 골랐고(기타면 내용 1~100자), 손님께 설명했다는 확인에 체크 */
export function canSubmitAgreedCancel({
  reason,
  reasonText,
  confirmed,
}: {
  reason: AgreedCancelReason | null;
  reasonText: string;
  confirmed: boolean;
}): boolean {
  if (!reason || !confirmed) return false;
  if (reason !== 'other') return true;
  const text = reasonText.trim();
  return text.length > 0 && text.length <= AGREED_CANCEL_REASON_TEXT_MAX;
}

/** 사유 한 줄. 기타면 원장님이 적은 내용을 같이 보여준다 */
export function agreedCancelReasonText(
  reason: AgreedCancelReason,
  reasonText: string | null,
): string {
  const label =
    reason === 'other' && reasonText ? `기타: ${reasonText}` : AGREED_CANCEL_REASON_LABELS[reason];
  return `사유: ${label}`;
}

/** 요청을 보낸 뒤 안내 */
export const AGREED_CANCEL_SENT_TITLE = '요청을 보냈어요';
export function agreedCancelSentText(expiresAt: string): string {
  return `${formatKst(new Date(expiresAt))}까지 손님이 동의하면 취소돼요.`;
}
export const AGREED_CANCEL_ASK_CUSTOMER = `손님께 ${SITE_NAME} 앱 > 내 예약에서 동의해 달라고 말씀해 주세요.`;

/** 가장 최근 요청의 상태 문구. 기준 금액은 동의했을 때만 쓴다 */
export function agreedCancelStatusText(
  status: Exclude<AgreedCancelStatus, 'none'>,
  baseAmount: number,
): { title: string; body: string } {
  switch (status) {
    case 'requested':
      return {
        title: '손님 동의를 기다리는 중이에요',
        body: `${AGREED_CANCEL_ASK_CUSTOMER} 손님이 동의하지 않거나 ${AGREED_CANCEL_RESPONSE_HOURS}시간 안에 답하지 않으면 예약은 그대로예요.`,
      };
    case 'agreed':
      return {
        title: '손님이 동의해서 합의 후 취소됐어요',
        body: `판매가의 ${OWNER_RATE}%(${formatWon(baseAmount)})를 정산받아요(수수료는 정산 규정대로).`,
      };
    case 'declined':
      return { title: '손님이 동의하지 않았어요', body: '예약은 그대로예요.' };
    case 'expired':
      return {
        title: `${AGREED_CANCEL_RESPONSE_HOURS}시간 안에 손님 답이 없어 요청이 끝났어요`,
        body: '예약은 그대로예요.',
      };
    case 'closed':
      return {
        title: '요청이 끝났어요',
        body: '손님이 답하기 전에 예약이 취소됐거나 방문·노쇼로 처리됐어요.',
      };
  }
}

/** 거절·만료 뒤 다시 요청할 수 있을 때 붙이는 안내(11/10, 횟수 제한 없음) */
export const AGREED_CANCEL_CAN_RETRY = '손님과 다시 이야기했다면 다시 요청할 수 있어요.';

/** 요청 기록 한 줄. 예: "요청 11/1(토) 14:00 · 사유: 원하는 시술이 예약한 서비스와 달라요" */
export function agreedCancelRequestedLine(
  requestedAt: string,
  reason: AgreedCancelReason,
  reasonText: string | null,
): string {
  return `요청 ${formatKst(new Date(requestedAt))} · ${agreedCancelReasonText(reason, reasonText)}`;
}

/** 답을 기다리는 동안의 기한 */
export function agreedCancelDeadlineText(expiresAt: string): string {
  return `${formatKst(new Date(expiresAt))}까지`;
}

/** 요청이 막혔을 때 화면을 지금 상태로 다시 받을지: 그 사이 다른 요청이 생겼거나 예약이 바뀐 경우 */
export function agreedCancelFailShowsNewState(code: string): boolean {
  const stale: AgreedCancelErrorCode[] = ['ALREADY_REQUESTED', 'NOT_REQUESTABLE'];
  return (stale as string[]).includes(code);
}

/** 다시 눌러도 결과가 같은 실패. [합의 후 취소 요청하기]를 잠근다(입력값 오류는 고치면 다시 누를 수 있다) */
export function agreedCancelFailIsFinal(code: string): boolean {
  const final: AgreedCancelErrorCode[] = [
    'ALREADY_REQUESTED',
    'NOT_REQUESTABLE',
    'RESERVATION_NOT_FOUND',
  ];
  return (final as string[]).includes(code);
}
