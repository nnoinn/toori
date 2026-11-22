// 쿠폰함(#480, C-407) 규칙과 문구. 11/20 정찬형 1안: 지금 쓸 수 있는 쿠폰만, 쿠폰마다 금액·기한·남은 날.
// 쿠폰 목록은 getMyCoupons()(매물 없이)가 기한 빠른 순으로 준다. 쿠폰 규칙 안내는 예약 확인의 쿠폰 고르기와 같은 문구(동의 문구 4장)다

import { startOfKstDay } from '@/lib/time';

/** 쿠폰함 주소. 내 정보의 쿠폰 줄을 누르면 열린다 */
export const COUPON_BOX_PATH = '/me/coupons';

/** 남은 날이 이만큼 이하이면 남은 날을 빨간 글씨로 보여 준다(화면 설정값, 11/20 정찬형) */
export const COUPON_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 쓸 수 있는 마지막 날까지 남은 날(한국 날짜 기준). 오늘이 마지막 날이면 0.
 * expiresAt은 "이 시각부터 쓸 수 없다"라서, 마지막으로 쓸 수 있는 순간(1ms 전)의 날짜로 센다(자정에 끝나면 그 전날이 마지막 날)
 */
export function couponDaysLeft(expiresAt: string, now: Date): number {
  const lastUsable = new Date(new Date(expiresAt).getTime() - 1);
  return Math.round((startOfKstDay(lastUsable).getTime() - startOfKstDay(now).getTime()) / DAY_MS);
}

/** 남은 날 문구와 강조 여부. 예: "6일 남음"(강조), "56일 남음", 마지막 날이면 "오늘까지"(강조) */
export function couponLeftText(daysLeft: number): { text: string; soon: boolean } {
  return {
    text: daysLeft <= 0 ? '오늘까지' : `${daysLeft}일 남음`,
    soon: daysLeft <= COUPON_SOON_DAYS,
  };
}

/** 쿠폰이 없을 때 설명 */
export const COUPON_BOX_EMPTY_HELP = '원장님 사정으로 예약이 취소되면 보상 쿠폰을 드려요.';
