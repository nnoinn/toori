'use server';

// 고객 가입 저장과 광고성 정보 수신 동의 (C-104, C-601, #47 4·5장).
// 약관 동의 화면(/join, 정찬형), 내 정보(J9)·관심 동네(J14)에서 부른다. 화면에서는 '@/server/auth/customer-account'에서 가져온다.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getDb } from '@/db';
import { fail, ok, type Result } from '@/lib/result';
import { safeNextPath } from '@/lib/safe-next';

import { ACCOUNT_MODE_COOKIE, ACCOUNT_MODE_COOKIE_OPTIONS } from './account-mode';
import {
  CUSTOMER_REQUIRED_TERMS,
  DEFAULT_CUSTOMER_NICKNAME,
  type MarketingConsent,
  readMarketingConsent,
  saveCustomerAccount,
  writeMarketingConsent,
} from './account-store';
import { getSessionUser } from './current-account';
import { DEFAULT_NEXT } from './paths';
import { AUTH_ERRORS, requireCustomer } from './require';

const createSchema = z.object({
  agreements: z.object({
    age14: z.boolean(),
    service: z.boolean(),
    privacy: z.boolean(),
    location: z.boolean(),
    marketing: z.boolean(),
  }),
  next: z.string().optional(),
});

/**
 * 고객 계정을 만들고 약관 동의를 기록한다(첫 로그인 뒤 /join). 닉네임은 카카오·구글 프로필 이름으로 시작한다.
 * 성공하면 돌아오지 않고 next(안전한 주소만, 없으면 홈)로 보낸다. 실패했을 때만 결과를 돌려준다
 */
export async function createCustomerAccount(input: {
  agreements: { age14: true; service: true; privacy: true; location: true; marketing: boolean };
  next?: string;
}): Promise<Result<never>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', '동의 항목을 다시 확인해 주세요');
  const { agreements } = parsed.data;
  if (CUSTOMER_REQUIRED_TERMS.some((type) => !agreements[type])) {
    return fail('REQUIRED_TERMS_MISSING', '필수 항목에 모두 동의해 주세요');
  }
  const user = await getSessionUser();
  if (!user) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);

  const customerId = await getDb().transaction((tx) =>
    saveCustomerAccount(tx, {
      userId: user.userId,
      nickname: user.name ?? DEFAULT_CUSTOMER_NICKNAME,
      marketing: agreements.marketing,
    }),
  );
  if (!customerId) return fail('ALREADY_EXISTS', '이미 가입한 계정이에요');

  // 가입한 계정으로 바로 쓰도록 고객 모드로 둔다(원장님 모드에서 /join에 들어온 경우)
  (await cookies()).set(ACCOUNT_MODE_COOKIE, 'customer', ACCOUNT_MODE_COOKIE_OPTIONS);
  redirect(safeNextPath(parsed.data.next, DEFAULT_NEXT.customer));
}

/**
 * 광고성 정보 수신 동의를 켜거나 끈다(내 정보 알림 설정, 관심 동네 설정).
 * 화면은 돌려받은 시각으로 "{날짜}에 광고성 정보 수신 {동의/거부} 처리가 끝났어요"를 바로 보여준다(동의 문구 6-1)
 */
export async function setMarketingConsent(agree: boolean): Promise<Result<MarketingConsent>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = z.boolean().safeParse(agree);
  if (!parsed.success) return fail('INVALID_INPUT', '알림 설정을 다시 골라 주세요');

  const consent = await getDb().transaction((tx) =>
    writeMarketingConsent(tx, auth.data.userId, 'customer', parsed.data),
  );
  // TODO(#15 W16): 푸시를 구독한 고객에게는 처리 결과를 notify로도 알린다
  return ok(consent);
}

/** 광고성 정보 수신 동의 상태 */
export async function getMarketingConsent(): Promise<Result<MarketingConsent>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  return ok(await readMarketingConsent(getDb(), auth.data.userId, 'customer'));
}
