// 매물 상세 화면의 표시용 함수 (J7, C-301~C-304). 화면과 서버 어디서나 쓴다.

import { z } from 'zod';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// shops.business_hours 한 줄(docs/schema-v1.md 2장). weekday 0=일 ~ 6=토, 한국 시간
const businessHourSchema = z.union([
  z.object({ weekday: z.number().int().min(0).max(6), closed: z.literal(true) }),
  z.object({ weekday: z.number().int().min(0).max(6), open: timeSchema, close: timeSchema }),
]);

export type BusinessHourRow = { weekday: number; label: string; text: string };

/**
 * 영업시간을 월~일 순서의 7줄로. 원장님이 입력하지 않은 요일은 "정보 없음".
 * 모양이 틀린 줄은 버린다. 한 줄도 없으면 null(화면에서 영업시간 칸을 숨긴다)
 */
export function formatBusinessHours(raw: unknown): BusinessHourRow[] | null {
  if (!Array.isArray(raw)) return null;
  const byWeekday = new Map<number, string>();
  for (const item of raw) {
    const parsed = businessHourSchema.safeParse(item);
    if (!parsed.success || byWeekday.has(parsed.data.weekday)) continue;
    const row = parsed.data;
    byWeekday.set(row.weekday, 'closed' in row ? '휴무' : `${row.open} ~ ${row.close}`);
  }
  if (byWeekday.size === 0) return null;
  // 월요일부터 보여준다
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    label: WEEKDAY_LABELS[weekday],
    text: byWeekday.get(weekday) ?? '정보 없음',
  }));
}

/** 소요 시간. 예: 60 → "1시간", 90 → "1시간 30분", 45 → "45분" */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
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

/** 카카오맵에서 샵 위치 크게 보기(새 창). 이름의 쉼표 등은 주소에 맞게 바꾼다 */
export function kakaoMapLink(name: string, lat: number, lng: number): string {
  return `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;
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
