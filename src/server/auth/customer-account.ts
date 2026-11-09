'use server';

// 고객 가입 저장과 선택 동의 (C-104, C-601, #47 4·5장, #267).
// 선택 동의는 둘이다: 관심 동네·찜한 샵 새 매물 알림(interest_alert), 이벤트·혜택 소식(marketing). 따로 받고 따로 철회한다.
// 약관 동의 화면(/join, 정찬형), 가입 직후 처음 보이는 화면, 내 정보(J9)·관심 동네(J14)·찜 버튼에서 부른다.
// 화면에서는 '@/server/auth/customer-account'에서 가져온다.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getDb } from '@/db';
import { normalizePhone, PHONE_FORMAT_MESSAGE } from '@/lib/phone';
import { fail, ok, type Result } from '@/lib/result';
import { safeNextPath } from '@/lib/safe-next';

import { ACCOUNT_MODE_COOKIE, ACCOUNT_MODE_COOKIE_OPTIONS } from './account-mode';
import {
  type ConsentNotice,
  CUSTOMER_REQUIRED_TERMS,
  DEFAULT_CUSTOMER_NICKNAME,
  type MarketingConsent,
  OPTIONAL_CUSTOMER_TERMS,
  type OptionalConsent,
  type OptionalConsents,
  type OptionalTerms,
  readOptionalConsents,
  saveCustomerAccount,
  writeOptionalConsent,
} from './account-store';
import {
  CONSENT_NOTICE_COOKIE,
  CONSENT_NOTICE_COOKIE_OPTIONS,
  decodeConsentNotices,
  encodeConsentNotices,
} from './consent-notice';
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
    // 화면이 아직 보내지 않으면 동의하지 않은 것으로 본다(#267 화면이 붙기 전)
    interest_alert: z.boolean().optional(),
  }),
  phone: z.string().optional(),
  next: z.string().optional(),
});

/**
 * 고객 계정을 만들고 약관 동의와 휴대폰 번호를 저장한다(첫 로그인 뒤 /join, C-104). 닉네임은 카카오·구글 프로필 이름으로 시작한다.
 * 번호는 인증 없이 모양만 보고 하이픈 넣은 모양으로 맞춰 저장한다. 다른 고객과 같은 번호여도 막지 않는다(#183).
 * 성공하면 돌아오지 않고 next(안전한 주소만, 없으면 홈)로 보낸다. 실패했을 때만 결과를 돌려준다
 */
export async function createCustomerAccount(input: {
  agreements: {
    age14: true;
    service: true;
    privacy: true;
    location: true;
    marketing: boolean;
    interest_alert?: boolean;
  };
  phone: string;
  next?: string;
}): Promise<Result<never>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', '동의 항목을 다시 확인해 주세요');
  const { agreements } = parsed.data;
  if (CUSTOMER_REQUIRED_TERMS.some((type) => !agreements[type])) {
    return fail('REQUIRED_TERMS_MISSING', '필수 항목에 모두 동의해 주세요');
  }
  // 화면을 거치지 않은 요청이 번호를 보내지 않아도 같은 실패로 막는다
  if (!parsed.data.phone?.trim()) {
    return fail('PHONE_REQUIRED', '휴대폰 번호를 입력해 주세요');
  }
  const phone = normalizePhone(parsed.data.phone, 'mobile');
  if (!phone) return fail('INVALID_INPUT', PHONE_FORMAT_MESSAGE);
  const user = await getSessionUser();
  if (!user) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);

  const saved = await getDb().transaction((tx) =>
    saveCustomerAccount(tx, {
      userId: user.userId,
      nickname: user.name ?? DEFAULT_CUSTOMER_NICKNAME,
      phone,
      optionalTerms: OPTIONAL_CUSTOMER_TERMS.filter((type) => agreements[type] === true),
    }),
  );
  if (!saved) return fail('ALREADY_EXISTS', '이미 가입한 계정이에요');

  const store = await cookies();
  // 가입한 계정으로 바로 쓰도록 고객 모드로 둔다(원장님 모드에서 /join에 들어온 경우)
  store.set(ACCOUNT_MODE_COOKIE, 'customer', ACCOUNT_MODE_COOKIE_OPTIONS);
  // 선택 동의 처리 결과는 다음 화면에서 한 번 보여준다(takeConsentNotices)
  if (saved.consentNotices.length > 0) {
    store.set(
      CONSENT_NOTICE_COOKIE,
      encodeConsentNotices(user.userId, saved.consentNotices),
      CONSENT_NOTICE_COOKIE_OPTIONS,
    );
  }
  redirect(safeNextPath(parsed.data.next, DEFAULT_NEXT.customer));
}

/** 쿠키에 남은 처리 결과를 읽으면서 지운다. 없거나 남의 값이면 빈 목록 */
async function takeNotices(): Promise<ConsentNotice[]> {
  const store = await cookies();
  const value = store.get(CONSENT_NOTICE_COOKIE)?.value;
  if (value === undefined) return [];
  store.delete(CONSENT_NOTICE_COOKIE);

  const user = await getSessionUser();
  return user ? decodeConsentNotices(value, user.userId) : [];
}

/**
 * 가입 때 고른 선택 동의의 처리 결과(동의 문구 6-1장). 가입 직후 처음 보이는 화면이 열릴 때 부른다.
 * 읽으면서 지우므로 한 번만 나오고, 가입 때 고른 선택 동의가 없거나 이미 보여줬으면 빈 목록이다.
 * 화면은 동의마다 한 줄씩 "{날짜}에 {동의 이름} 처리가 끝났어요"를 보여준다. 순서는 관심 동네·찜한 샵 알림, 이벤트·혜택
 */
export async function takeConsentNotices(): Promise<Result<ConsentNotice[]>> {
  return ok(await takeNotices());
}

/**
 * 예전 함수: 가입 때 고른 광고성 정보 수신(marketing) 동의의 처리 결과만. 없으면 null.
 * 화면이 takeConsentNotices로 바뀌면 지운다(#267). 같은 쿠키를 지우므로 둘 중 하나만 부른다
 */
export async function takeMarketingConsentNotice(): Promise<Result<{ agreedAt: Date } | null>> {
  const marketing = (await takeNotices()).find((notice) => notice.type === 'marketing');
  return ok(marketing ? { agreedAt: marketing.agreedAt } : null);
}

const setSchema = z.object({ type: z.enum(OPTIONAL_CUSTOMER_TERMS), agree: z.boolean() });

/**
 * 선택 동의 하나를 켜거나 끈다(내 정보 알림 설정, 빈 동네 알림 상자, 찜 버튼).
 * 화면은 돌려받은 시각으로 "{날짜}에 {동의 이름} {동의/거부} 처리가 끝났어요"를 바로 보여준다(동의 문구 6-1)
 */
export async function setOptionalConsent(
  type: OptionalTerms,
  agree: boolean,
): Promise<Result<OptionalConsent>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = setSchema.safeParse({ type, agree });
  if (!parsed.success) return fail('INVALID_INPUT', '알림 설정을 다시 골라 주세요');

  const consent = await getDb().transaction((tx) =>
    writeOptionalConsent(tx, auth.data.userId, 'customer', parsed.data.type, parsed.data.agree),
  );
  // TODO(#15 W16): 푸시를 구독한 고객에게는 처리 결과를 notify로도 알린다
  return ok(consent);
}

/** 두 선택 동의의 상태(관심 동네·찜한 샵 알림, 이벤트·혜택). 각각 동의 여부와 처리 시각 */
export async function getOptionalConsents(): Promise<Result<OptionalConsents>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  return ok(await readOptionalConsents(getDb(), auth.data.userId, 'customer'));
}

/** 예전 함수: 광고성 정보 수신(marketing) 동의를 켜거나 끈다. 화면이 setOptionalConsent로 바뀌면 지운다(#267) */
export async function setMarketingConsent(agree: boolean): Promise<Result<MarketingConsent>> {
  return setOptionalConsent('marketing', agree);
}

/** 예전 함수: 광고성 정보 수신(marketing) 동의 상태. 화면이 getOptionalConsents로 바뀌면 지운다(#267) */
export async function getMarketingConsent(): Promise<Result<MarketingConsent>> {
  const consents = await getOptionalConsents();
  return consents.ok ? ok(consents.data.marketing) : consents;
}
