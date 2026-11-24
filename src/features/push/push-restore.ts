// 로그아웃 뒤 다시 로그인하면 이 기기의 푸시 알림을 되살리는 규칙(11/23 nnoinn). 화면에서 쓴다. 브라우저 값은 받아서 판단만 한다(테스트할 수 있게).
// 보통 앱처럼 로그아웃하면 이 기기로 가는 내 알림을 끊고(공용 기기에서 남에게 보이지 않게), 같은 사람이 다시 로그인하면
// 그때 켜 두었던 계정의 알림을 다시 켠다. 알림을 꺼 둔 계정은 로그아웃 때 구독이 없었으므로 다시 켜지지 않는다.
// 기억은 이 기기(localStorage)에만 둔다. 서버(restoreDevicePushSubscriptions)가 지금 로그인한 사람과 같은지 다시 확인한다.
// 회원 탈퇴도 로그아웃까지 하므로 같은 순서를 쓴다(withdrawWithPushCleanup, 11/24 nnoinn).

import type { AccountType } from '@/db/schema/accounts';
import type { Result } from '@/lib/result';

/** 기억해 두는 곳(localStorage) */
export const PUSH_RESTORE_KEY = 'toori:push-restore';

/** 이보다 오래된 기억은 버린다(오래 쓰지 않은 기기에서 다시 로그인했을 때 예전 설정이 갑자기 살아나지 않게) */
export const PUSH_RESTORE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 로그아웃 때 지운 이 기기의 구독(removeDevicePushSubscriptions가 돌려준 값)과 그때의 브라우저 구독 주소 */
export type PushRestoreMemory = {
  userId: string;
  endpoint: string;
  accountTypes: AccountType[];
  savedAt: number;
};

const ACCOUNT_TYPE_VALUES: readonly string[] = ['customer', 'owner'];

/** 기억해 둔 값(localStorage)을 읽는다. 모양이 틀리거나 되살릴 계정이 없으면 null */
export function parsePushRestore(raw: string | null): PushRestoreMemory | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { userId, endpoint, accountTypes, savedAt } = value as Record<string, unknown>;
    if (typeof userId !== 'string' || userId === '') return null;
    if (typeof endpoint !== 'string' || endpoint === '') return null;
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null;
    if (!Array.isArray(accountTypes)) return null;
    const types = [
      ...new Set(
        accountTypes.filter(
          (type): type is AccountType =>
            typeof type === 'string' && ACCOUNT_TYPE_VALUES.includes(type),
        ),
      ),
    ];
    return types.length > 0 ? { userId, endpoint, accountTypes: types, savedAt } : null;
  } catch {
    return null;
  }
}

/**
 * 로그인한 화면이 열렸을 때 기억을 어떻게 할지.
 * restore: 서버에 되살려 달라고 한다 / clear: 버린다(PUSH_RESTORE_DAYS일이 지남, 알림 허용이 풀림, 이 기기의 브라우저 구독이 없거나 바뀜)
 */
export function pushRestoreAction(
  memory: PushRestoreMemory,
  env: {
    now: number;
    permission: NotificationPermission | 'unsupported';
    endpoint: string | null;
  },
): 'restore' | 'clear' {
  if (env.now - memory.savedAt > PUSH_RESTORE_DAYS * DAY_MS) return 'clear';
  if (env.permission !== 'granted') return 'clear';
  if (env.endpoint === null || env.endpoint !== memory.endpoint) return 'clear';
  return 'restore';
}

/**
 * 서버 답을 받은 뒤 기억을 남길지. 로그인하지 않은 화면(로그아웃 직후의 첫 화면 등)이면 남겨서 로그인한 뒤 다시 한다.
 * 같은 사람이면 되살렸으니 버리고, 다른 사람이 로그인했으면 버린다(공용 기기에서 남의 알림을 되살리지 않는다). 입력이 틀려도 버린다
 */
export function keepPushRestore(result: Result<unknown>): boolean {
  return !result.ok && result.error.code === 'UNAUTHENTICATED';
}

/** 탈퇴한 계정을 기억에서 뺀다(되살려도 꺼진 알림은 돌아오지 않는다, #154 3장). 남는 계정이 없으면 null(기억을 버린다) */
export function withoutAccountType(
  memory: PushRestoreMemory,
  accountType: AccountType,
): PushRestoreMemory | null {
  const accountTypes = memory.accountTypes.filter((type) => type !== accountType);
  return accountTypes.length > 0 ? { ...memory, accountTypes } : null;
}

/** 탈퇴 순서에서 이 기기에 하는 일. 브라우저 일이라 받아서 쓴다(테스트할 수 있게) */
export type WithdrawalDevicePush = {
  /** 이 기기의 내 구독(고객·원장님)을 지우고 기억한다(clearDevicePushSubscriptions) */
  clear: () => Promise<void>;
  /** 탈퇴한 계정을 기억에서 뺀다 */
  forget: () => void;
  /** 방금 지운 구독을 되살린다(restorePushAfterSignIn) */
  restore: () => Promise<void>;
};

/**
 * 회원 탈퇴(고객·원장님)의 이 기기 푸시 알림 순서(11/24 nnoinn, NOTI-09). 탈퇴 함수는 로그아웃까지 하므로, 로그아웃(useSignOut)처럼
 * 로그인이 풀리기 전에 이 기기의 내 구독을 모두 지우고 기억한다(같이 쓰는 기기에서 남은 계정의 알림이 오지 않게).
 * 탈퇴했으면 탈퇴한 계정을 기억에서 뺀다(남은 계정은 같은 사람이 다시 로그인하면 되살아난다).
 * 탈퇴하지 못했으면(막힘·실패·오류) 아직 로그인한 상태라 방금 지운 구독을 바로 되살린다
 */
export async function withdrawWithPushCleanup<T extends { ok: boolean }>(
  withdraw: () => Promise<T>,
  device: WithdrawalDevicePush,
): Promise<T> {
  await device.clear();
  let result: T;
  try {
    result = await withdraw();
  } catch (error) {
    await device.restore();
    throw error;
  }
  if (result.ok) device.forget();
  else await device.restore();
  return result;
}
