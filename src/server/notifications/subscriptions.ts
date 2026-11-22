'use server';

// 웹 푸시 구독 저장·지우기 (X-505-1, C-601·C-602 화면 정찬형 J14, S-404 화면 정민석 O12, 연결 #12 #131).
// 화면에서는 '@/server/notifications/subscriptions'에서 가져온다. 화면이 브라우저에서 푸시 권한을 받고
// PushManager.subscribe(VAPID 공개 키)로 만든 구독을 toJSON() 그대로 넘긴다. 실제 발송(notify)은 W16.
// 한 기기에서 켜 둔 계정의 알림을 모두 받는다(11/1 결정, 기술 가이드 7장). 브라우저 구독은 기기에 하나라 다른 계정도 같이 쓰므로,
// 알림을 꺼도 PushSubscription.unsubscribe()는 부르지 않고, 켜짐·꺼짐은 getPushSubscriptionStatus로 본다.
// 로그아웃하면 이 기기의 내 구독을 모두 지우고, 같은 사람이 다시 로그인하면 그때 켜져 있던 계정의 구독을 되살린다(11/23 nnoinn, 보통 앱처럼).

import { headers } from 'next/headers';
import { z } from 'zod';

import { getDb } from '@/db';
import type { AccountType } from '@/db/schema/accounts';
import { fail, ok, type Result } from '@/lib/result';
import { type AccountMode, AUTH_ERRORS, getCurrentAccount } from '@/server/auth';

import { NOTIFICATION_ERRORS } from './errors';
import {
  deleteDevicePushSubscriptions,
  deletePushSubscription,
  hasPushSubscription,
  upsertPushSubscription,
} from './subscription-store';

const endpointSchema = z
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'));

const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
});

/** 브라우저 PushSubscription.toJSON()의 모양 */
export type PushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

const USER_AGENT_MAX = 300;

/** 구독과 같이 남기는 기기 정보(브라우저 이름). 없으면 null, 길면 자른다 */
async function deviceUserAgent(): Promise<string | null> {
  return (await headers()).get('user-agent')?.slice(0, USER_AGENT_MAX) ?? null;
}

/** 알림을 받는 계정 종류. 운영자로 들어와 있으면 알림을 켤 계정이 없다(#372, 운영자 알림은 따로 없다) */
function pushAccountType(mode: AccountMode): 'customer' | 'owner' | null {
  return mode === 'admin' ? null : mode;
}

const ADMIN_MODE_PUSH_MESSAGE =
  '운영자로 들어와 있을 때는 알림을 켤 수 없어요. 고객·원장님으로 들어와 켜 주세요';

/**
 * 이 기기의 푸시 구독을 지금 모드(고객/원장님) 계정의 것으로 저장한다. 같은 기기·같은 계정 종류로 다시 부르면 덮어쓰고,
 * 내 다른 계정의 구독은 그대로 둔다. 같은 기기에 다른 로그인의 구독이 있으면 지운다
 */
export async function savePushSubscription(input: PushSubscriptionInput): Promise<Result<null>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  if (account.mode === 'customer' && !account.customerId) {
    return fail('NO_CUSTOMER_ACCOUNT', AUTH_ERRORS.NO_CUSTOMER_ACCOUNT);
  }
  if (account.mode === 'owner' && !account.ownerId) {
    return fail('NO_OWNER_ACCOUNT', AUTH_ERRORS.NO_OWNER_ACCOUNT);
  }
  const accountType = pushAccountType(account.mode);
  if (!accountType) return fail('WRONG_MODE', ADMIN_MODE_PUSH_MESSAGE);
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', NOTIFICATION_ERRORS.INVALID_INPUT);

  const userAgent = await deviceUserAgent();
  await getDb().transaction((tx) =>
    upsertPushSubscription(tx, {
      userId: account.userId,
      accountType,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
    }),
  );
  return ok(null);
}

/** 알림 끄기. 이 기기에서 지금 모드 계정의 구독만 지운다. 다른 계정의 구독은 그대로이고, 이미 없어도 성공 */
export async function removePushSubscription(endpoint: string): Promise<Result<null>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  const parsed = endpointSchema.safeParse(endpoint);
  const accountType = pushAccountType(account.mode);
  if (!parsed.success || !accountType) return ok(null);
  await deletePushSubscription(getDb(), {
    userId: account.userId,
    accountType,
    endpoint: parsed.data,
  });
  return ok(null);
}

/** 로그아웃 때 지운 이 기기의 구독. 기기가 기억했다가 같은 사람이 다시 로그인하면 되살린다(restoreDevicePushSubscriptions) */
export type DevicePushRemoval = { userId: string; accountTypes: AccountType[] };

/**
 * 로그아웃 직전에 부른다(signOut은 기기 주소를 모른다). 이 기기의 내 구독을 두 계정 모두 지우고(공용 기기에서 내 알림이 남지 않게),
 * 지운 구독의 계정 종류를 돌려준다. 이미 없거나 주소 모양이 틀려도 성공(빈 목록)
 */
export async function removeDevicePushSubscriptions(
  endpoint: string,
): Promise<Result<DevicePushRemoval>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return ok({ userId: account.userId, accountTypes: [] });
  const accountTypes = await deleteDevicePushSubscriptions(getDb(), {
    userId: account.userId,
    endpoint: parsed.data,
  });
  return ok({ userId: account.userId, accountTypes });
}

const restoreSchema = z.object({
  subscription: subscriptionSchema,
  userId: z.uuid(),
  accountTypes: z
    .array(z.enum(['customer', 'owner']))
    .min(1)
    .max(2),
});

/**
 * 로그아웃 때 지운 이 기기의 구독을, 같은 사람이 다시 로그인하면 되살린다(11/23 nnoinn). 로그아웃 때 받은 값(DevicePushRemoval)을
 * 기기가 기억했다가 지금 브라우저 구독과 같이 넘긴다. 지금 로그인한 사람이 다르면 되살리지 않는다(sameUser: false, 공용 기기).
 * 같은 사람이면 지금 모드와 상관없이 그 사람에게 지금 있는 계정의 구독만 되살린다. 알림을 꺼 둔 계정은 로그아웃 때 구독이 없어서
 * 넘어오지 않으므로 다시 켜지지 않는다
 */
export async function restoreDevicePushSubscriptions(input: {
  subscription: PushSubscriptionInput;
  userId: string;
  accountTypes: readonly string[];
}): Promise<Result<{ sameUser: boolean; restored: AccountType[] }>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', NOTIFICATION_ERRORS.INVALID_INPUT);
  if (parsed.data.userId !== account.userId) return ok({ sameUser: false, restored: [] });

  const restored = [...new Set(parsed.data.accountTypes)].filter((type) =>
    type === 'customer' ? account.customerId !== null : account.ownerId !== null,
  );
  if (restored.length > 0) {
    const { endpoint, keys } = parsed.data.subscription;
    const userAgent = await deviceUserAgent();
    await getDb().transaction(async (tx) => {
      for (const accountType of restored) {
        await upsertPushSubscription(tx, {
          userId: account.userId,
          accountType,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent,
        });
      }
    });
  }
  return ok({ sameUser: true, restored });
}

/** 이 기기에서 지금 모드 계정의 알림이 켜져 있는지. 다른 계정이 켠 구독은 켜진 것으로 치지 않는다 */
export async function getPushSubscriptionStatus(
  endpoint: string,
): Promise<Result<{ subscribed: boolean }>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  const parsed = endpointSchema.safeParse(endpoint);
  const accountType = pushAccountType(account.mode);
  if (!parsed.success || !accountType) return ok({ subscribed: false });
  const subscribed = await hasPushSubscription(getDb(), {
    userId: account.userId,
    accountType,
    endpoint: parsed.data,
  });
  return ok({ subscribed });
}
