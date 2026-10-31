// 메뉴·가격표 입력값 검사 (O3, S-106). 화면('use client')과 서버 함수가 같이 쓴다.
// 서버 함수(actions.ts)도 저장 전에 이 검사를 다시 한다. 화면 검사는 바로 알려 주려는 것이라 믿지 않는다.

import { z } from 'zod';

import {
  SERVICE_TYPES_BY_CATEGORY,
  type ServiceType,
  type ShopCategory,
  MENU_DURATION_STEP_MINUTES,
} from '@/server/policy';

// 정가는 10원 단위로 받는다(정민석 결정 10/28). 할인가 = 정가 × (1 − 할인율)에 원 미만이 생기지 않는다
export const MENU_PRICE = { min: 1_000, max: 1_000_000, unit: 10 } as const;

// 소요 시간은 정책 단위(30분, #108 결정)로 받는다. 시작 시각도 30분 단위라 끝 시각이 그 간격에 딱 떨어진다
export const MENU_DURATION = { step: MENU_DURATION_STEP_MINUTES, max: 8 * 60 } as const;

export const MENU_LIMITS = { name: 40, description: 500 } as const;

/** 소요 시간 선택지(분). 예: 30분 간격이면 30, 60, …, 480 */
export const MENU_DURATION_OPTIONS: readonly number[] = Array.from(
  { length: MENU_DURATION.max / MENU_DURATION.step },
  (_, index) => (index + 1) * MENU_DURATION.step,
);

/** 소요 시간을 화면용으로. 예: 60 → "1시간", 90 → "1시간 30분", 40 → "40분" */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 그 업종에서 고를 수 있는 서비스 종류 */
export function serviceTypesOf(category: ShopCategory) {
  return SERVICE_TYPES_BY_CATEGORY[category];
}

/** 서비스 종류가 그 업종 목록에 있으면 true. 업종을 바꾼 뒤 숨겨진 옛 메뉴를 가려낸다 */
export function isServiceTypeOf(category: ShopCategory, serviceType: string): boolean {
  return serviceTypesOf(category).some((type) => type.key === serviceType);
}

/** 서비스 종류의 화면 이름. 목록에 없으면 key 그대로 */
export function serviceTypeLabel(serviceType: string): string {
  for (const types of Object.values(SERVICE_TYPES_BY_CATEGORY)) {
    const found = types.find((type) => type.key === serviceType);
    if (found) return found.label;
  }
  return serviceType;
}

export type MenuInput = {
  serviceType: string;
  name: string;
  /** 입력칸 그대로(문자열). 쉼표는 지운다 */
  listPrice: string;
  durationMinutes: number;
  description: string;
};

/** 검사를 통과한 값. DB menus에 그대로 넣는다 */
export type MenuValues = {
  serviceType: ServiceType;
  name: string;
  listPrice: number;
  durationMinutes: number;
  description: string | null;
};

export type MenuField = keyof MenuInput;
export type MenuFieldErrors = Partial<Record<MenuField, string>>;

const inputSchema = z.object({
  serviceType: z.string(),
  name: z.string().transform((value) => value.trim()),
  listPrice: z.string().transform((value) => value.replace(/[,\s]/g, '')),
  durationMinutes: z.number(),
  description: z.string().transform((value) => value.trim()),
});

/** 입력값을 검사해서 저장할 값으로 바꾼다. 서비스 종류는 지금 업종 목록 안에서만 받는다 */
export function validateMenu(
  category: ShopCategory,
  input: unknown,
): { ok: true; data: MenuValues } | { ok: false; fieldErrors: MenuFieldErrors } {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: { name: '입력값을 다시 확인해 주세요' } };
  const value = parsed.data;
  const errors: MenuFieldErrors = {};

  if (!isServiceTypeOf(category, value.serviceType))
    errors.serviceType = '서비스 종류를 골라 주세요';

  if (!value.name) errors.name = '서비스 이름을 입력해 주세요';
  else if (value.name.length > MENU_LIMITS.name)
    errors.name = `서비스 이름은 ${MENU_LIMITS.name}자까지 쓸 수 있어요`;

  const price = /^\d+$/.test(value.listPrice) ? Number(value.listPrice) : NaN;
  if (!Number.isSafeInteger(price) || price < MENU_PRICE.min || price > MENU_PRICE.max)
    errors.listPrice = '정가는 1,000원부터 1,000,000원까지 입력해 주세요';
  else if (price % MENU_PRICE.unit !== 0) errors.listPrice = '정가는 10원 단위로 입력해 주세요';

  if (!MENU_DURATION_OPTIONS.includes(value.durationMinutes))
    errors.durationMinutes = '소요 시간을 골라 주세요';

  if (value.description.length > MENU_LIMITS.description)
    errors.description = `상세 설명은 ${MENU_LIMITS.description}자까지 쓸 수 있어요`;

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  return {
    ok: true,
    data: {
      serviceType: value.serviceType as ServiceType,
      name: value.name,
      listPrice: price,
      durationMinutes: value.durationMinutes,
      description: value.description || null,
    },
  };
}
