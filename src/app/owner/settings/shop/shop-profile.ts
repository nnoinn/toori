// 원장님 프로필(샵 정보) 입력값 검사와 영업시간 변환 (O2, S-103). 화면('use client')과 서버 함수가 같이 쓴다.
// 서버 함수(actions.ts)도 저장 전에 이 검사를 다시 한다. 화면 검사는 바로 알려 주려는 것이라 믿지 않는다.

import { z } from 'zod';

import type { BusinessHours } from '@/db/schema/shops';
import { SHOP_CATEGORY_KEYS, type ShopCategory } from '@/server/policy/catalog';

export const SHOP_PROFILE_LIMITS = {
  name: 40,
  roadAddress: 200,
  addressDetail: 100,
  description: 1000,
} as const;

/** 화면 표시 순서(월요일부터). weekday 0=일 ~ 6=토 */
export const WEEKDAYS_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 영업시간 입력 한 줄. 여는·닫는 시각을 둘 다 비우면 그 요일은 저장하지 않는다(고객 화면에 "정보 없음") */
export type HoursRow = { weekday: number; closed: boolean; open: string; close: string };

export type ShopProfileInput = {
  name: string;
  category: string;
  phone: string;
  roadAddress: string;
  addressDetail: string;
  description: string;
  hours: HoursRow[];
};

/** 검사를 통과한 값. DB shops에 그대로 넣는다 */
export type ShopProfileValues = {
  name: string;
  category: ShopCategory;
  phone: string;
  roadAddress: string;
  addressDetail: string | null;
  description: string | null;
  businessHours: BusinessHours;
};

export type ShopProfileField = Exclude<keyof ShopProfileInput, 'hours'> | `hours.${number}`;
export type ShopProfileFieldErrors = Partial<Record<ShopProfileField, string>>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// 하이픈·띄어쓰기를 뺀 숫자: 0으로 시작하는 9~11자리(지역번호·휴대폰·070) 또는 15xx·16xx·18xx 대표번호 8자리
const PHONE_DIGITS = /^(0\d{8,10}|1[5-8]\d{6})$/;

/** 저장된 영업시간을 월~일 7줄 입력값으로. 저장 안 된 요일은 빈 줄 */
export function toHoursRows(stored: BusinessHours): HoursRow[] {
  return WEEKDAYS_FROM_MONDAY.map((weekday) => {
    const saved = stored.find((item) => item.weekday === weekday);
    if (!saved) return { weekday, closed: false, open: '', close: '' };
    if ('closed' in saved) return { weekday, closed: true, open: '', close: '' };
    return { weekday, closed: false, open: saved.open, close: saved.close };
  });
}

/** 영업시간 한 줄의 문제. 없으면 null */
function checkHoursRow(row: HoursRow): string | null {
  if (row.closed) return null;
  if (!row.open && !row.close) return null;
  if (!TIME.test(row.open) || !TIME.test(row.close))
    return '여는 시각과 닫는 시각을 모두 골라 주세요';
  // 자정을 넘기는 영업시간은 받지 않는다(정민석 결정)
  if (row.open >= row.close) return '닫는 시각은 여는 시각보다 늦어야 해요';
  return null;
}

const textSchema = z.string().transform((value) => value.trim());

const inputSchema = z.object({
  name: textSchema,
  category: z.string(),
  phone: textSchema,
  roadAddress: textSchema,
  addressDetail: textSchema,
  description: textSchema,
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        closed: z.boolean(),
        open: z.string(),
        close: z.string(),
      }),
    )
    .max(7),
});

/** 입력값을 검사해서 저장할 값으로 바꾼다. 틀린 칸마다 화면 문구를 돌려준다 */
export function validateShopProfile(
  input: unknown,
): { ok: true; data: ShopProfileValues } | { ok: false; fieldErrors: ShopProfileFieldErrors } {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: { name: '입력값을 다시 확인해 주세요' } };
  const value = parsed.data;
  const errors: ShopProfileFieldErrors = {};

  if (!value.name) errors.name = '샵 이름을 입력해 주세요';
  else if (value.name.length > SHOP_PROFILE_LIMITS.name)
    errors.name = `샵 이름은 ${SHOP_PROFILE_LIMITS.name}자까지 쓸 수 있어요`;

  if (!(SHOP_CATEGORY_KEYS as readonly string[]).includes(value.category))
    errors.category = '업종을 골라 주세요';

  if (!PHONE_DIGITS.test(value.phone.replace(/[\s-]/g, '')))
    errors.phone = '전화번호를 확인해 주세요. 예: 031-123-4567';

  if (!value.roadAddress) errors.roadAddress = '주소 찾기로 도로명 주소를 골라 주세요';
  else if (value.roadAddress.length > SHOP_PROFILE_LIMITS.roadAddress)
    errors.roadAddress = '주소가 너무 길어요';

  if (value.addressDetail.length > SHOP_PROFILE_LIMITS.addressDetail)
    errors.addressDetail = `상세 주소는 ${SHOP_PROFILE_LIMITS.addressDetail}자까지 쓸 수 있어요`;

  if (value.description.length > SHOP_PROFILE_LIMITS.description)
    errors.description = `서비스 설명은 ${SHOP_PROFILE_LIMITS.description}자까지 쓸 수 있어요`;

  const weekdays = new Set<number>();
  value.hours.forEach((row, index) => {
    const problem = weekdays.has(row.weekday) ? '같은 요일이 두 번 있어요' : checkHoursRow(row);
    weekdays.add(row.weekday);
    if (problem) errors[`hours.${index}`] = problem;
  });

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  return {
    ok: true,
    data: {
      name: value.name,
      category: value.category as ShopCategory,
      phone: value.phone,
      roadAddress: value.roadAddress,
      addressDetail: value.addressDetail || null,
      description: value.description || null,
      businessHours: toBusinessHours(value.hours),
    },
  };
}

/** 검사를 통과한 입력 줄을 DB 형식으로. 빈 줄은 빼고 일~토 순서로 저장한다 */
function toBusinessHours(rows: HoursRow[]): BusinessHours {
  return rows
    .filter((row) => row.closed || (row.open && row.close))
    .sort((a, b) => a.weekday - b.weekday)
    .map((row) =>
      row.closed
        ? { weekday: row.weekday, closed: true as const }
        : { weekday: row.weekday, open: row.open, close: row.close },
    );
}
