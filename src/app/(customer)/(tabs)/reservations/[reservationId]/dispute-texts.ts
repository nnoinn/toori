// 내 예약 상세의 이의제기 칸 문구 (C-507, 연결 #20, #299). 숫자는 정책값에서, 서비스 이름은 SITE_NAME에서 가져온다.
// 화면은 시각을 비교하지 않고 서버가 준 state·deadline을 그대로 문구로 바꾼다.

import { SITE_NAME } from '@/lib/site';
import { formatKst } from '@/lib/time';
import type { DisputeView } from '@/server/disputes';
import {
  DISPUTE_CONTENT_MAX_LENGTH,
  DISPUTE_CONTENT_MIN_LENGTH,
  DISPUTE_DEADLINE_BUSINESS_HOURS,
} from '@/server/policy/dispute';

export type DisputeType = DisputeView['types'][number];

/** 고객이 고르는 종류 이름(#299 Q2). 이 예약에서 고를 수 있는 종류는 서버가 types로 준다 */
export const DISPUTE_TYPE_LABELS: Record<DisputeType, string> = {
  no_show: '노쇼 처리가 잘못됐어요',
  refund_exception: '환불이나 취소 금액에 문제가 있어요',
  after_start: '서비스를 받는 중에 문제가 있었어요',
};

/** 접수할 수 있는 때의 기한 안내. 원장님이 아직 방문·노쇼 처리를 안 했으면 기한이 정해지지 않아서 deadline이 null이다 */
export function disputeDeadlineText(deadline: string | null): string {
  return deadline
    ? `${formatKst(new Date(deadline))}까지 접수할 수 있어요.`
    : `원장님이 방문 처리한 뒤 영업일 기준 ${DISPUTE_DEADLINE_BUSINESS_HOURS}시간까지 접수할 수 있어요.`;
}

/** 기한이 지난 뒤. 기한은 정산 전에 투리가 조정하는 기한이라 문의는 계속 받는다(이용약관 제12조) */
export function disputeClosedText(deadline: string | null): string {
  const when = deadline ? `(${formatKst(new Date(deadline))})` : '';
  return `접수 기한${when}이 지났어요. 그래도 문의는 ${SITE_NAME} 카카오톡 채널로 받아요.`;
}

export function disputeSubmittedText(createdAt: string): string {
  return `${formatKst(new Date(createdAt))}에 접수했어요.`;
}

export const DISPUTE_IN_REVIEW = `${SITE_NAME}가 확인하고 있어요. 이어지는 대화는 카카오톡 채널에서 해요.`;
export const DISPUTE_RESOLVED = '확인을 마쳤어요. 자세한 내용은 카카오톡 채널에서 확인해 주세요.';
export const DISPUTE_FOLLOW_UP = `접수하면 ${SITE_NAME}가 확인하고 카카오톡 채널로 연락드려요.`;
export const DISPUTE_PRIVACY_NOTE = '전화번호 같은 개인정보는 적지 않아도 돼요.';
export const DISPUTE_CONTENT_HINT = `${DISPUTE_CONTENT_MIN_LENGTH}자 이상 ${DISPUTE_CONTENT_MAX_LENGTH}자 이하로 적어 주세요.`;
export const KAKAO_CHANNEL_LABEL = `${SITE_NAME} 카카오톡 채널 열기`;

/** 노쇼 예약 상세의 안내. 아래 이의제기 칸으로 이어 준다 */
export const NO_SHOW_DISPUTE_BELOW = '잘못 처리됐다면 아래 이의제기로 알려 주세요';

/** 내용 글자 수가 맞는지(서버와 같은 기준: 앞뒤 공백을 뺀 길이) */
export function isDisputeContentValid(content: string): boolean {
  const length = content.trim().length;
  return length >= DISPUTE_CONTENT_MIN_LENGTH && length <= DISPUTE_CONTENT_MAX_LENGTH;
}
