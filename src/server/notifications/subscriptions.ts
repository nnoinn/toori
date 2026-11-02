'use server';

// 웹 푸시 구독 저장·지우기 (X-505-1, C-601·C-602 화면 정찬형 J14, S-404 화면 정민석 O12, 연결 #12 #131).
// 화면에서는 '@/server/notifications/subscriptions'에서 가져온다. 화면이 브라우저에서 푸시 권한을 받고
// PushManager.subscribe(VAPID 공개 키)로 만든 구독을 toJSON() 그대로 넘긴다. 실제 발송(notify)은 W16.
// 한 기기에서 켜 둔 계정의 알림을 모두 받는다(11/1 결정, 기술 가이드 7장). 브라우저 구독은 기기에 하나라 다른 계정도 같이 쓰므로,
// 알림을 꺼도 PushSubscription.unsubscribe()는 부르지 않고, 켜짐·꺼짐은 getPushSubscriptionStatus로 본다.

import { headers } from 'next/headers';
import { z } from 'zod';

import { getDb } from '@/db';
import { fail, ok, type Result } from '@/lib/result';
import { AUTH_ERRORS, getCurrentAccount } from '@/server/auth';

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
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', NOTIFICATION_ERRORS.INVALID_INPUT);

  const userAgent = (await headers()).get('user-agent')?.slice(0, USER_AGENT_MAX) ?? null;
  await getDb().transaction((tx) =>
    upsertPushSubscription(tx, {
      userId: account.userId,
      accountType: account.mode,
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
  if (!parsed.success) return ok(null);
  await deletePushSubscription(getDb(), {
    userId: account.userId,
    accountType: account.mode,
    endpoint: parsed.data,
  });
  return ok(null);
}

/** 로그아웃 직전에 부른다(signOut은 기기 주소를 모른다). 이 기기의 내 구독을 두 계정 모두 지운다. 이미 없어도 성공 */
export async function removeDevicePushSubscriptions(endpoint: string): Promise<Result<null>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return ok(null);
  await deleteDevicePushSubscriptions(getDb(), { userId: account.userId, endpoint: parsed.data });
  return ok(null);
}

/** 이 기기에서 지금 모드 계정의 알림이 켜져 있는지. 다른 계정이 켠 구독은 켜진 것으로 치지 않는다 */
export async function getPushSubscriptionStatus(
  endpoint: string,
): Promise<Result<{ subscribed: boolean }>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return ok({ subscribed: false });
  const subscribed = await hasPushSubscription(getDb(), {
    userId: account.userId,
    accountType: account.mode,
    endpoint: parsed.data,
  });
  return ok({ subscribed });
}
