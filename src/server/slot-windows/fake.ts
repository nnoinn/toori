// 시간대 매물 가짜 결과 버전의 데이터와 스위치 (#308). 서버에서만 부른다. 진짜 버전 ②③이 오면 가짜 데이터를 지운다.
// 원장님 등록·지난 설정·마감은 진짜 버전이라(①) 가짜 데이터를 쓰지 않고, 실패 흉내 스위치만 쓴다.
//
// - DEV_FAKE_SLOT_WINDOWS=on: 고객 목록·상세·[예약하기]에만 쓴다. 로컬 개발(NODE_ENV=development)에서만 켜진다. 켜면 범위 안 진짜 승인된 샵마다
//   "내일 13:00~18:00(한국 시간), 그 샵의 숨기지 않은 진짜 메뉴, 할인 30%" 시간대가 하나씩 있는 것처럼 보인다.
//   시간대 id는 샵 id와 같다. 시작 가능 시각은 그 샵의 진짜 매물 시간과 겹치지 않게 진짜 계산(windowStarts)으로 만든다.
//   꺼져 있으면(배포 주소·테스트 포함) 시간대가 하나도 없는 것처럼 보인다
// - DEV_FAKE_SLOT_WINDOWS_FAILURE=<함수>:<코드>: 그 함수가 그 실패를 돌려준다. 예: holdWindowSlot:TIME_TAKEN

import 'server-only';

import { kstToUtc, utcToKst } from '@/lib/time';
import type { getDb } from '@/db';
import type { ResultError } from '@/lib/result';
import { PAYMENT_ERRORS } from '@/server/payments/errors';
import { calcSalePrice } from '@/server/policy';

import { SLOT_WINDOW_ERRORS } from './errors';
import { type Range, windowStarts } from './starts';
import { readOccupiedRanges, readWindowShop } from './store';
import type { SlotWindowMenu } from './types';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 가짜 시간대의 할인율 */
const FAKE_DISCOUNT_RATE = 30;

/** 가짜 시간대 데이터를 켰는지 */
export function fakeWindowsOn(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.DEV_FAKE_SLOT_WINDOWS === 'on';
}

/** 가짜 시간대 범위: 내일 13:00~18:00(한국 시간) */
export function fakeWindowRange(now: Date): Range {
  const today = utcToKst(now);
  const tomorrowNoon = kstToUtc({ ...today, hour: 12, minute: 0 });
  const tomorrow = utcToKst(new Date(tomorrowNoon.getTime() + 24 * 60 * 60 * 1000));
  const day = { year: tomorrow.year, month: tomorrow.month, day: tomorrow.day };
  return {
    start: kstToUtc({ ...day, hour: 13, minute: 0 }),
    end: kstToUtc({ ...day, hour: 18, minute: 0 }),
  };
}

/** 가짜 시간대의 서비스 하나: 화면에 줄 값과 계산용 시작 시각 */
export type FakeWindowMenu = { menu: SlotWindowMenu; startRanges: Range[] };

/** 가짜 시간대 하나(시간대 id = 샵 id). 샵이 없으면 null */
export async function buildFakeWindow(
  db: DbReader,
  shopId: string,
  now: Date,
): Promise<{ range: Range; menus: FakeWindowMenu[] } | null> {
  const shop = await readWindowShop(db, shopId);
  if (!shop) return null;
  const range = fakeWindowRange(now);
  const occupied = await readOccupiedRanges(db, { shopId, from: range.start, to: range.end, now });
  const menus = shop.menus
    .filter((menu) => !menu.hidden)
    .map((menu) => {
      const startRanges = windowStarts({
        window: range,
        durationMinutes: menu.durationMinutes,
        occupied,
        now,
      });
      return {
        menu: {
          menuId: menu.id,
          serviceType: menu.serviceType,
          name: menu.name,
          description: menu.description,
          durationMinutes: menu.durationMinutes,
          listPrice: menu.listPrice,
          discountRate: FAKE_DISCOUNT_RATE,
          salePrice: calcSalePrice(menu.listPrice, FAKE_DISCOUNT_RATE),
          starts: startRanges.map((start) => ({
            startAt: start.start.toISOString(),
            endAt: start.end.toISOString(),
          })),
        },
        startRanges,
      };
    });
  return { range, menus };
}

const SWITCHABLE = {
  createSlotWindows: [
    'INVALID_INPUT',
    'MENU_NOT_FOUND',
    'MENU_TOO_LONG',
    'WINDOW_OVERLAP',
    'PAST',
    'TOO_FAR',
    'OUTSIDE_HOURS',
    'CLOSED_DAY',
  ],
  closeSlotWindow: ['WINDOW_NOT_FOUND', 'WINDOW_CLOSED'],
  holdWindowSlot: ['SLOT_NOT_AVAILABLE', 'ALREADY_HOLDING', 'NEW_CUSTOMER_ONLY', 'TIME_TAKEN'],
} as const;

/** DEV_FAKE_SLOT_WINDOWS_FAILURE가 이 함수를 가리키면 그 실패, 아니면 null */
export function fakeWindowFailure(
  fn: keyof typeof SWITCHABLE,
): { ok: false; error: ResultError } | null {
  if (process.env.NODE_ENV !== 'development') return null;
  const [target, code = ''] = (process.env.DEV_FAKE_SLOT_WINDOWS_FAILURE ?? '').split(':');
  if (target !== fn) return null;
  const allowed: readonly string[] = SWITCHABLE[fn];
  if (!allowed.includes(code)) {
    console.warn(`[slot-windows] ${fn}에서 흉내 낼 수 없는 실패 코드예요: ${code}`);
    return null;
  }
  const messages: Record<string, string> = { ...SLOT_WINDOW_ERRORS, ...PAYMENT_ERRORS };
  return { ok: false, error: { code, message: messages[code] } };
}
