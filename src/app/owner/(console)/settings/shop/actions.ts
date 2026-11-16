'use server';

// 원장님 프로필(샵 정보) 저장 서버 함수 (O2, S-103). 화면(shop-profile-form.tsx)에서 부른다.
// 승인 전에도 고칠 수 있다(#23 D11). 사업자 정보는 여기서 고치지 않는다(D19).
// 업종은 게시예정·게시중·예약됨 매물이 없을 때만 바꿀 수 있고, 바꾸면 메뉴를 초기화한다(category-change-store.ts, 10/29 결정).
// 화면에서 2단계로 확인받은 뒤에만 한다.
// 영업시간을 바꿔서 영업시간 밖이 되는 매물이 있으면 바로 저장하지 않고 HOURS_CHANGE_NOT_CONFIRMED로 그 목록을 돌려준다.
// 원장님이 확인 창에서 [네]를 누르면 그 매물을 마감(사유 '기타')하고 같은 트랜잭션에서 저장한다(hours-change.ts, 11/16 정민석).

import { TransactionRollbackError } from 'drizzle-orm';
import { refresh } from 'next/cache';

import { getDb } from '@/db';
import { type GeocodeCandidate, geocodeAddress } from '@/features/map/geocode';
import { getRequestNow } from '@/lib/request-time';
import { fail, ok, type Result, type ResultError } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';

import {
  type CategoryChangeImpact,
  resetMenusForCategoryChange,
  selectCategoryChangeImpact,
} from './category-change-store';
import { type HoursChangeImpact, hoursChangeImpact, isHoursChangeConfirmed } from './hours-change';
import { closeForHoursChange, selectHoursChangeCandidates } from './hours-change-store';
import {
  CATEGORY_CHANGE_BLOCKED_MESSAGE,
  type ShopProfileFieldErrors,
  validateShopProfile,
} from './shop-profile';
import { selectShopProfile, updateShopProfile } from './shop-profile-store';

const SHOP_NOT_FOUND = { code: 'SHOP_NOT_FOUND', message: '샵을 찾을 수 없어요' };
const ACTIVE_SLOTS = { code: 'ACTIVE_SLOTS', message: CATEGORY_CHANGE_BLOCKED_MESSAGE };

/** 영업시간 밖이 되는 매물을 원장님이 아직 확인하지 않았다. 화면은 hoursImpact로 확인 창을 띄운다 */
const hoursNotConfirmed = (hoursImpact: HoursChangeImpact): SaveShopProfileError => ({
  code: 'HOURS_CHANGE_NOT_CONFIRMED',
  message: '바꾼 영업시간 밖이 되는 매물을 확인해 주세요',
  hoursImpact,
});

/** 공통 실패 형태에 칸별 문구와 주소 후보, 영업시간 밖이 되는 매물만 더했다 */
export type SaveShopProfileError = ResultError & {
  fieldErrors?: ShopProfileFieldErrors;
  /** ADDRESS_AMBIGUOUS일 때 고를 주소 후보. 고르면 그 도로명 주소로 다시 저장한다 */
  candidates?: GeocodeCandidate[];
  /** HOURS_CHANGE_NOT_CONFIRMED일 때 확인 창에 보여줄 매물 */
  hoursImpact?: HoursChangeImpact;
};

export type SaveShopProfileResponse =
  | {
      ok: true;
      data: {
        resetMenus: number;
        /** 영업시간을 바꾸면서 마감한 매물·시간대 수, 그사이 결제·예약이 시작돼 마감하지 못한 수 */
        closedSlots: number;
        closedWindows: number;
        skipped: number;
      };
    }
  | { ok: false; error: SaveShopProfileError };

/** 업종을 바꾸기 전에 확인 창에 보여줄 수(막는 매물, 초기화될 메뉴) */
export async function getCategoryChangeImpact(
  shopId: string,
): Promise<Result<CategoryChangeImpact>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const db = getDb();
  const current = await selectShopProfile(db, shopId);
  if (!current) return { ok: false, error: SHOP_NOT_FOUND };
  return ok(await selectCategoryChangeImpact(db, shopId, current.category, await getRequestNow()));
}

/**
 * 샵 정보를 저장한다. 주소가 바뀌었을 때만 좌표·지역을 다시 만든다.
 * 업종이 바뀌었으면 confirmCategoryChange가 true일 때만 저장한다. 막는 매물이 있으면 ACTIVE_SLOTS로 거절하고,
 * 없으면 메뉴를 초기화하고 같이 저장한다.
 * 영업시간을 바꿔서 영업시간 밖이 되는 매물이 있으면 confirmHoursClose(확인 창에서 본 마감할 매물 id)가 그 매물을 모두 담을 때만
 * 마감하고 저장한다. 아니면 HOURS_CHANGE_NOT_CONFIRMED로 지금 목록을 돌려준다
 */
export async function saveShopProfile(
  shopId: string,
  input: unknown,
  options: { confirmCategoryChange?: boolean; confirmHoursClose?: string[] } = {},
): Promise<SaveShopProfileResponse> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;

  const checked = validateShopProfile(input);
  if (!checked.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: '입력한 내용을 다시 확인해 주세요',
        fieldErrors: checked.fieldErrors,
      },
    };
  }
  const values = checked.data;

  const db = getDb();
  const current = await selectShopProfile(db, shopId);
  if (!current) return { ok: false, error: SHOP_NOT_FOUND };

  const categoryChanged = values.category !== current.category;
  if (categoryChanged && options.confirmCategoryChange !== true) {
    return fail('CATEGORY_CHANGE_NOT_CONFIRMED', '업종 변경을 확인해 주세요');
  }

  const now = await getRequestNow();
  const confirmHoursClose = Array.isArray(options.confirmHoursClose)
    ? options.confirmHoursClose.filter((id): id is string => typeof id === 'string')
    : undefined;
  /** 지금 DB 기준으로 영업시간 밖이 되는 매물 */
  const readHoursImpact = async (reader: Parameters<typeof selectHoursChangeCandidates>[0]) =>
    hoursChangeImpact({
      ...(await selectHoursChangeCandidates(reader, shopId, now)),
      before: current.businessHours,
      after: values.businessHours,
      now,
    });
  // 확인 창을 띄울지 먼저 본다(주소 좌표를 만들기 전에 묻는다). 저장할 때 트랜잭션 안에서 한 번 더 본다
  const hoursImpact = await readHoursImpact(db);
  if (!isHoursChangeConfirmed(hoursImpact, confirmHoursClose)) {
    return { ok: false, error: hoursNotConfirmed(hoursImpact) };
  }

  let location = null;
  if (values.roadAddress !== current.roadAddress) {
    const geocoded = await geocodeAddress(values.roadAddress);
    // 좌표를 만들지 못하면 저장하지 않는다(지도·거리 계산이 틀어진다, #51)
    if (!geocoded.ok) {
      return {
        ok: false,
        error: { ...geocoded.error, fieldErrors: { roadAddress: geocoded.error.message } },
      };
    }
    location = geocoded.data;
  }

  // 실패하면 tx.rollback()으로 메뉴 초기화·매물 마감까지 모두 되돌리고, 이유는 failure에 남긴다
  let failure = null as SaveShopProfileError | null;
  let changed = { resetMenus: 0, closedSlots: 0, closedWindows: 0, skipped: 0 };
  try {
    await db.transaction(async (tx) => {
      // 확인 창을 띄운 뒤에 새로 올린 매물이 영업시간 밖이면, 원장님이 보지 않은 매물이라 마감하지 않고 다시 묻는다
      const latest = await readHoursImpact(tx);
      if (!isHoursChangeConfirmed(latest, confirmHoursClose)) {
        failure = hoursNotConfirmed(latest);
        tx.rollback();
        return;
      }
      if (latest.close.length > 0) {
        changed = { ...changed, ...(await closeForHoursChange(tx, shopId, latest.close, now)) };
      }
      if (categoryChanged) {
        const reset = await resetMenusForCategoryChange(tx, shopId, current.category, now);
        if (!reset.ok) {
          failure = ACTIVE_SLOTS;
          tx.rollback();
          return;
        }
        changed = { ...changed, resetMenus: reset.resetMenus };
      }
      if (!(await updateShopProfile(tx, shopId, values, location))) {
        failure = SHOP_NOT_FOUND;
        tx.rollback();
      }
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
  if (failure) return { ok: false, error: failure };

  refresh();
  return { ok: true, data: changed };
}
