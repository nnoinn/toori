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

/** 전화 걸기 링크용 숫자만. 예: "031-123-4567" → "tel:0311234567" */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.length >= 8 ? `tel:${digits}` : null;
}

type RefundBand = { minHoursLeft: number; penaltyRate: number };

/**
 * 환불 규정 안내 줄(C-305 펼친 내용). 정책값 REFUND_BANDS(#48)로 만들고 숫자를 직접 쓰지 않는다.
 * 예: "시작 24시간 전까지: 70% 환불(위약금 30%)", "24~6시간 전: 50% 환불(위약금 50%)", "6시간 이내: 환불 불가"
 */
export function refundPolicyLines(bands: readonly RefundBand[]): string[] {
  return bands.map((band, index) => {
    const upper = index === 0 ? null : bands[index - 1].minHoursLeft;
    const when =
      upper === null
        ? `시작 ${band.minHoursLeft}시간 전까지`
        : band.minHoursLeft === 0
          ? `${upper}시간 이내`
          : `${upper}~${band.minHoursLeft}시간 전`;
    const refundRate = 100 - band.penaltyRate;
    return refundRate === 0
      ? `${when}: 환불 불가`
      : `${when}: ${refundRate}% 환불(위약금 ${band.penaltyRate}%)`;
  });
}
