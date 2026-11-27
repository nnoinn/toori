// 매물 상세 화면의 표시용 함수 (J7, C-301~C-304). 화면과 서버 어디서나 쓴다.

import { z } from 'zod';

import { withNextDayMark } from '@/lib/time';
import type { ListItem } from '@/features/map/slot-list/types';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// shops.business_hours 한 줄(docs/schema-v1.md 2장). weekday 0=일 ~ 6=토, 한국 시간
const businessHourSchema = z.union([
  z.object({ weekday: z.number().int().min(0).max(6), closed: z.literal(true) }),
  z.object({ weekday: z.number().int().min(0).max(6), open: timeSchema, close: timeSchema }),
]);

export type BusinessHourRow = { weekday: number; label: string; text: string };

/**
 * 영업시간을 일~토 순서의 7줄로(캘린더처럼, 원장님 영업시간 표와 같은 순서. 11/15 nnoinn, #437). 원장님이 입력하지 않은 요일은 "정보 없음".
 * 모양이 틀린 줄은 버린다. 한 줄도 없으면 null(화면에서 영업시간 칸을 숨긴다).
 * 영업시간 규칙(11/11, 기술 가이드 7장): 닫는 시각이 여는 시각보다 이르면 다음 날 새벽까지라 닫는 시각에 (익일)을 붙이고
 * ("18:00 ~ 02:00(익일)", 자정 마감은 "18:00 ~ 00:00(익일)", 11/12 점검 1-6), 둘이 같으면 24시간 영업
 */
export function formatBusinessHours(raw: unknown): BusinessHourRow[] | null {
  if (!Array.isArray(raw)) return null;
  const byWeekday = new Map<number, string>();
  for (const item of raw) {
    const parsed = businessHourSchema.safeParse(item);
    if (!parsed.success || byWeekday.has(parsed.data.weekday)) continue;
    const row = parsed.data;
    byWeekday.set(row.weekday, 'closed' in row ? '휴무' : hoursText(row.open, row.close));
  }
  if (byWeekday.size === 0) return null;
  // 일요일(0)부터 토요일(6)까지 보여준다
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    label: WEEKDAY_LABELS[weekday],
    text: byWeekday.get(weekday) ?? '정보 없음',
  }));
}

function hoursText(open: string, close: string): string {
  if (open === close) return '24시간 영업';
  // "HH:MM" 글자는 그대로 비교해도 시각 순서와 같다
  return `${open} ~ ${close < open ? withNextDayMark(close) : close}`;
}

/**
 * 원장님이 입력한 외부 링크(인스타그램·네이버 플레이스)를 화면에 걸어도 되는지 본다.
 * https 주소만 받는다(javascript: 같은 위험한 주소 차단). 안 되면 null(링크를 숨긴다)
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * 매물 상세 사진(C-309 ②): 그 매물 메뉴의 시술 사진만. 원장님이 그 메뉴에 사진을 하나도 묶지 않았으면 샵 사진 전체.
 * 받은 순서(대표 먼저, 그다음 원장님이 정한 순서)를 그대로 둔다. 샵 소개·영업시간과 함께 샵 전체 사진은 샵 프로필에서 본다
 */
export function slotPhotoRows<T extends { menuId: string | null }>(
  rows: readonly T[],
  menuId: string | null,
): T[] {
  const own = menuId === null ? [] : rows.filter((row) => row.menuId === menuId);
  return own.length > 0 ? own : [...rows];
}

/** 사진 줄의 스크롤 위치로 지금 보이는 사진 번호(0부터)를 구한다. 칸 폭을 못 재면 첫 장 */
export function photoIndexAt(scrollLeft: number, slideWidth: number, count: number): number {
  if (slideWidth <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / slideWidth)));
}

/** 전화 걸기 링크용 숫자만. 예: "031-123-4567" → "tel:0311234567" */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.length >= 8 ? `tel:${digits}` : null;
}

type RefundBand = { minHoursLeft: number; penaltyRate: number };

/**
 * 환불 규정 구간 줄. 결제 동의 문구(docs/legal/consent-texts.md 3장)와 같은 모양이고,
 * 매물 상세(C-305)와 결제 화면(C-402)이 같이 쓴다. 숫자는 정책값(REFUND_BANDS 등, #48)에서만 온다.
 * 경계는 정책 그대로 "N시간 이상"이 위 구간이다(예: 딱 6시간 남으면 50% 환불).
 * 예: "24시간 이상 남음: 70% 환불(위약금 30%)", "6시간 이상 24시간 미만: 50% 환불(위약금 50%)", "6시간 미만·노쇼: 환불 없음"
 */
export function refundPolicyLines(
  bands: readonly RefundBand[],
  noShowPenaltyRate: number,
): string[] {
  return bands.map((band, index) => {
    const upper = index === 0 ? null : bands[index - 1].minHoursLeft;
    let when: string;
    if (upper === null) when = `${band.minHoursLeft}시간 이상 남음`;
    else if (band.minHoursLeft === 0) when = `${upper}시간 미만`;
    else when = `${band.minHoursLeft}시간 이상 ${upper}시간 미만`;
    // 노쇼는 마지막 구간과 같은 위약금이라 같은 줄에 적는다(S-406)
    if (index === bands.length - 1 && band.penaltyRate === noShowPenaltyRate) when += '·노쇼';
    const refundRate = 100 - band.penaltyRate;
    return refundRate === 0
      ? `${when}: 환불 없음`
      : `${when}: ${refundRate}% 환불(위약금 ${band.penaltyRate}%)`;
  });
}

/** 환불 규정 앞뒤 안내(결제 동의 문구 3장). 원장님 귀책 쿠폰 금액은 정책값으로 받는다 */
export function refundPolicyNotes(ownerFaultCouponAmount: number) {
  return {
    before: [
      '임박 특가 상품이라 결제 직후에도 무료 취소가 되지 않아요.',
      '서비스 시작까지 남은 시간에 따라 환불돼요.',
    ],
    after: `원장님 사정으로 취소되면 전액 환불하고 ${ownerFaultCouponAmount.toLocaleString('ko-KR')}원 쿠폰을 드려요.`,
  };
}

/** 매물 상세 "이 샵의 다른 매물"에 보여주는 수(11/18 회의 피드백 5번) */
export const OTHER_SLOT_COUNT = 5;

/** 이 샵의 다른 매물: 지금 보는 매물은 빼고, 받은 순서(시작이 가까운 순) 그대로 앞에서 count개. 시간대 매물도 넣는다 */
export function otherShopItems(
  items: readonly ListItem[],
  currentSlotId: string,
  count: number = OTHER_SLOT_COUNT,
): ListItem[] {
  return items
    .filter((item) => item.kind !== 'slot' || item.slotId !== currentSlotId)
    .slice(0, count);
}
