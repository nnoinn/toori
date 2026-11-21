// 운영자가 원장님에게 보여 줄 사유 목록(#489, 11/17 nnoinn 결정·11/18 승인). 화면·알림·DB check가 같이 쓴다.
// 운영자가 매물·시간대를 강제 마감하거나, 새 매물 게시를 멈추거나, 정산을 보류할 때 이 목록에서 하나를 꼭 고른다.
// 원장님에게는 고른 사유와 다음에 할 일만 보이고, 운영자가 직접 쓰는 메모는 지금처럼 숨긴다(손님 정보·내부 판단이 들어갈 수 있다).
// 코드는 DB(settlement_holds.reason_code, shops.publish_paused_code, slots·slot_windows.admin_close_code)에 저장한다(마이그레이션 0021).

import { SITE_NAME } from '@/lib/site';

/** 사유 코드 전체 */
export const ADMIN_NOTICE_CODES = [
  'listing_mismatch',
  'user_inquiry',
  'shop_info_check',
  'payment_check',
  'payout_info_check',
  'owner_request',
  'other',
] as const;
export type AdminNoticeCode = (typeof ADMIN_NOTICE_CODES)[number];

/** 운영자 마감(매물·시간대 매물 강제 마감)에서 고를 수 있는 코드 */
export const ADMIN_CLOSE_CODES = [
  'listing_mismatch',
  'user_inquiry',
  'owner_request',
  'other',
] as const satisfies readonly AdminNoticeCode[];
export type AdminCloseCode = (typeof ADMIN_CLOSE_CODES)[number];

/** 새 매물 게시 멈춤에서 고를 수 있는 코드 */
export const PUBLISH_PAUSE_CODES = [
  'user_inquiry',
  'shop_info_check',
  'owner_request',
  'other',
] as const satisfies readonly AdminNoticeCode[];
export type PublishPauseCode = (typeof PUBLISH_PAUSE_CODES)[number];

/** 정산 보류(거래 하나·샵 전체)에서 고를 수 있는 코드 */
export const SETTLEMENT_HOLD_CODES = [
  'user_inquiry',
  'payment_check',
  'payout_info_check',
  'owner_request',
  'other',
] as const satisfies readonly AdminNoticeCode[];
export type SettlementHoldCode = (typeof SETTLEMENT_HOLD_CODES)[number];

/** 사유를 쓰는 곳 */
export type AdminNoticeUse = 'close' | 'publish_pause' | 'settlement_hold';

/** 쓰는 곳마다 고를 수 있는 코드(화면의 고르기 목록 순서) */
export const ADMIN_NOTICE_CODES_BY_USE = {
  close: ADMIN_CLOSE_CODES,
  publish_pause: PUBLISH_PAUSE_CODES,
  settlement_hold: SETTLEMENT_HOLD_CODES,
} as const satisfies Record<AdminNoticeUse, readonly AdminNoticeCode[]>;

/** 0021 전에 걸린 보류·멈춤·운영자 마감은 이 코드로 채운다 */
export const ADMIN_NOTICE_FALLBACK_CODE = 'other' satisfies AdminNoticeCode;

const LABELS: Record<AdminNoticeCode, string> = {
  listing_mismatch: '매물 정보가 실제와 달라요(가격·시간·서비스)',
  user_inquiry: '이용자 문의를 확인하고 있어요',
  shop_info_check: '입점 정보 확인이 필요해요',
  payment_check: '결제·환불 내역을 확인하고 있어요',
  payout_info_check: '정산 계좌·사업자 정보 확인이 필요해요',
  owner_request: '원장님이 요청하셨어요',
  other: '기타',
};

/** 확인이 끝난 정산이 들어가는 때(정산 보류의 다음에 할 일) */
const NEXT_PAYOUT_STEP = '확인이 끝나면 돌아오는 지급일에 들어가요';

const NEXT_STEPS: Record<AdminNoticeCode, string | null> = {
  listing_mismatch: '정보를 고쳐서 다시 올려 주세요',
  user_inquiry: '확인이 끝나면 알려 드려요',
  shop_info_check: '내 계정에서 사업자 정보를 확인해 주세요',
  payment_check: NEXT_PAYOUT_STEP,
  payout_info_check: '정산 계좌를 확인해 주세요',
  owner_request: null,
  other: `자세한 내용은 ${SITE_NAME} 카카오톡 채널로 안내해 드려요`,
};

/**
 * 원장님에게 보여 줄 사유와 다음에 할 일. 다음에 할 일이 없으면(원장님 요청) null.
 * 이용자 문의는 정산 보류일 때만 "확인이 끝나면 돌아오는 지급일에 들어가요"다(#489)
 */
export function adminNoticeText(
  code: AdminNoticeCode,
  use: AdminNoticeUse,
): { label: string; nextStep: string | null } {
  const nextStep =
    code === 'user_inquiry' && use === 'settlement_hold' ? NEXT_PAYOUT_STEP : NEXT_STEPS[code];
  return { label: LABELS[code], nextStep };
}

/** 그 쓰는 곳에서 고를 수 있는 코드인지(서버가 받은 값을 확인할 때) */
export function isAdminNoticeCodeFor<U extends AdminNoticeUse>(
  use: U,
  value: unknown,
): value is (typeof ADMIN_NOTICE_CODES_BY_USE)[U][number] {
  return (ADMIN_NOTICE_CODES_BY_USE[use] as readonly unknown[]).includes(value);
}

/**
 * DB에서 읽은 글자를 그 쓰는 곳의 코드로 읽는다. DB check가 목록 안의 값만 받아서 보통 그대로이고,
 * 혹시 목록에 없으면 기타(other, 모든 곳에 있다)로 본다
 */
export function toAdminNoticeCode<U extends AdminNoticeUse>(
  use: U,
  raw: unknown,
): (typeof ADMIN_NOTICE_CODES_BY_USE)[U][number] {
  if (isAdminNoticeCodeFor(use, raw)) return raw;
  return ADMIN_NOTICE_FALLBACK_CODE;
}
