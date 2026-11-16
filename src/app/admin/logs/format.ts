// 운영자 기록 화면 표시 모양 (#372 5장, 점검 8-2). 화면 코드에서만 쓰는 이름 바꾸기·주소 만들기라 이 폴더에 둔다.

import { z } from 'zod';

import { kstToUtc } from '@/lib/time';

/** 탭: 처리 기록(admin_actions) / 열람 기록(admin_access_logs). 주소 ?tab= 값 */
export const LOG_TABS = ['actions', 'access'] as const;
export type LogTab = (typeof LOG_TABS)[number];

export const LOG_TAB_LABELS: Record<LogTab, string> = {
  actions: '처리 기록',
  access: '열람 기록',
};

/** 정렬. 주소 ?sort= 값 */
export const LOG_SORTS = ['new', 'old'] as const;
export type LogSort = (typeof LOG_SORTS)[number];

export const LOG_SORT_LABELS: Record<LogSort, string> = {
  new: '최근 순',
  old: '오래된 순',
};

/** 처리 기록의 한 일(admin_actions.action). 모르는 값은 그대로 보여준다 */
export const ACTION_LABELS: Record<string, string> = {
  'shop.approve': '입점 승인',
  'shop.reject': '입점 반려',
  'shop.business_update': '사업자 정보 수정',
  'dispute.register': '이의제기 등록(카카오톡 채널)',
  'dispute.resolve': '이의제기 결론',
  'visit.override': '방문으로 바꿈(노쇼 취소)',
  'refund.exception': '환불 예외',
  'reservation.void': '예약 무효',
  'settlement.payout_request': '지급 요청',
  'settlement.payout_retry': '지급 다시 요청',
  'notification.resend': '알림 다시 보내기',
  'payment.retry': '결제 다시 시도',
  'refund.retry': '환불 다시 시도',
  'refund.review_check': '환불 금액 확인함',
};

/** 열람 기록의 한 일(admin_access_logs.action) */
export const ACCESS_ACTION_LABELS: Record<string, string> = {
  view: '상세 보기',
  search: '목록·검색',
};

/** 대상 종류(target_type). 모르는 값은 그대로 보여준다 */
export const TARGET_TYPE_LABELS: Record<string, string> = {
  shop: '샵',
  reservation: '예약',
  dispute: '이의제기',
  customer: '고객',
  owner: '원장님',
  settlement: '정산',
  notification: '알림',
  order: '주문',
  refund: '환불',
  list: '목록',
};

/** 이름표. 모르는 값이면 값 그대로 */
export function labelOf(labels: Record<string, string>, value: string): string {
  return Object.hasOwn(labels, value) ? labels[value] : value;
}

/** 대상 이름을 고르는 데 쓰는 값. 대상 종류에 맞는 것만 채워진다 */
export type TargetNames = {
  shopName: string | null;
  reservationCode: string | null;
  disputeReservationCode: string | null;
  customerName: string | null;
  ownerName: string | null;
  settlementShopName: string | null;
  settlementPayoutDate: string | null;
};

/** 대상 이름. 예: 샵 이름, 예약번호, 회원 이름, "샵 이름 11/19 정산". 없으면(목록·지운 대상) null */
export function targetLabel(targetType: string, names: TargetNames): string | null {
  switch (targetType) {
    case 'shop':
      return names.shopName;
    case 'reservation':
      return names.reservationCode;
    case 'dispute':
      return names.disputeReservationCode;
    case 'customer':
      return names.customerName;
    case 'owner':
      return names.ownerName;
    case 'settlement':
      return names.settlementShopName && names.settlementPayoutDate
        ? `${names.settlementShopName} ${names.settlementPayoutDate} 정산`
        : null;
    default:
      return null;
  }
}

/** 대상의 운영자 화면 주소. 화면이 없는 종류(원장님·목록 등)는 null */
export function targetHref(targetType: string, targetId: string | null): string | null {
  if (!targetId) return null;
  switch (targetType) {
    case 'shop':
      return `/admin/shops/${targetId}`;
    case 'reservation':
      return `/admin/reservations/${targetId}`;
    case 'dispute':
      return `/admin/disputes/${targetId}`;
    case 'customer':
      return `/admin/users/customers/${targetId}`;
    case 'settlement':
      return `/admin/settlements/${targetId}`;
    default:
      return null;
  }
}

export type LogParams = {
  tab: LogTab;
  sort: LogSort;
  /** 운영자(profiles.id). 없으면 모두 */
  admin: string | null;
  /** 한 일(action). 없으면 모두 */
  kind: string | null;
  /** 대상 종류(target_type). 없으면 모두 */
  target: string | null;
  /** 기간(한국 날짜, 둘 다 포함). 없으면 거르지 않는다 */
  from: string | null;
  to: string | null;
  /** 쪽(1부터, 한 쪽 20줄) */
  page: number;
};

const dateSchema = z.iso.date();
const uuidSchema = z.uuid();
/** 한 일·대상 종류 값 모양(소문자·점·밑줄). 이상한 값은 거르지 않는다 */
const codeSchema = z.string().regex(/^[a-z_.]{1,40}$/);

const parseOr = <T>(schema: z.ZodType<T>, value: string | undefined): T | null => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** 쪽 번호 모양(1 이상의 정수) */
const pageSchema = z.coerce.number().int().min(1);

/** 주소 값 읽기. 모르는 탭은 처리 기록, 모르는 정렬은 최근 순, 모양이 틀린 값은 거르지 않고, 틀린 쪽은 1쪽 */
export function toLogParams(input: {
  tab?: string;
  sort?: string;
  admin?: string;
  kind?: string;
  target?: string;
  from?: string;
  to?: string;
  page?: string;
}): LogParams {
  return {
    tab: LOG_TABS.find((tab) => tab === input.tab) ?? 'actions',
    sort: LOG_SORTS.find((sort) => sort === input.sort) ?? 'new',
    admin: parseOr(uuidSchema, input.admin),
    kind: parseOr(codeSchema, input.kind),
    target: parseOr(codeSchema, input.target),
    from: parseOr(dateSchema, input.from),
    to: parseOr(dateSchema, input.to),
    page: parseOr(pageSchema, input.page) ?? 1,
  };
}

/** 기록 화면 주소. 기본값(처리 기록, 최근 순, 빈 거르기, 1쪽)은 주소에 넣지 않는다 */
export function logsHref(params: Partial<LogParams> & { tab: LogTab }): string {
  const search = new URLSearchParams();
  if (params.tab !== 'actions') search.set('tab', params.tab);
  if (params.sort && params.sort !== 'new') search.set('sort', params.sort);
  for (const key of ['admin', 'kind', 'target', 'from', 'to'] as const) {
    const value = params[key];
    if (value) search.set(key, value);
  }
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const text = search.toString();
  return text ? `/admin/logs?${text}` : '/admin/logs';
}

// 한국은 서머타임이 없어서 하루는 늘 24시간이다
const DAY_MS = 24 * 60 * 60 * 1000;

/** 기간(한국 날짜) → [시작일 0시, 끝일 다음 날 0시). 없는 쪽은 null */
export function toKstRange(
  from: string | null,
  to: string | null,
): { start: Date | null; end: Date | null } {
  const midnight = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return kstToUtc({ year, month, day, hour: 0, minute: 0 });
  };
  return {
    start: from ? midnight(from) : null,
    end: to ? new Date(midnight(to).getTime() + DAY_MS) : null,
  };
}
