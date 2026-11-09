// 가입 때 고른 선택 동의(관심 동네·찜한 샵 새 매물 알림, 이벤트·혜택)의 처리 결과를 가입 직후 처음 보이는 화면에 한 번 보여주기 위한 쿠키
// (동의 문구 6-1장, #47 4장, 10/27 결정, #267). 가입 저장(createCustomerAccount)이 남기고, takeConsentNotices가 읽으면서 지운다.
// 가입은 성공하면 바로 다음 화면으로 넘어가고 그 화면이 어디인지 정해져 있지 않아서, 주소 대신 쿠키로 넘긴다.

import 'server-only';

import { type ConsentNotice, isOptionalTerms } from './account-store';

/** 쿠키 이름은 광고성 동의 하나만 있던 때 그대로 둔다(로그아웃이 지우는 이름) */
export const CONSENT_NOTICE_COOKIE = 'marketing_consent_notice';
/** 예전 이름. 화면(consent-notice-gate.tsx)이 새 이름으로 바뀌면 지운다 */
export const MARKETING_NOTICE_COOKIE = CONSENT_NOTICE_COOKIE;

/**
 * 화면 스크립트가 읽지 못하게(httpOnly) 하고, 14일 뒤 사라진다. 법이 동의 처리 결과를 14일 안에 알리게 해서,
 * 가입 직후 창을 닫아도 14일 안에 다시 들어오면 안내를 볼 수 있게 한다(10/28 결정, #115 리뷰).
 * 사용자 id를 확인하고 로그아웃 때 지우므로 길게 둬도 남에게 보이지 않는다
 */
export const CONSENT_NOTICE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 14 * 24 * 60 * 60,
} as const;

/**
 * 쿠키 값: 누구의 동의인지와 동의마다의 종류·시각(`{userId}|interest_alert={시각}|marketing={시각}`).
 * 같은 브라우저에서 다른 사람이 로그인했을 때 남의 결과를 보여주지 않으려고 사용자 id를 같이 둔다
 */
export function encodeConsentNotices(userId: string, notices: readonly ConsentNotice[]): string {
  return [userId, ...notices.map((n) => `${n.type}=${n.agreedAt.toISOString()}`)].join('|');
}

/**
 * 지금 로그인한 사람의 값이면 처리 결과들, 아니면 빈 목록. 모양이 틀린 줄은 버린다.
 * 종류 없이 시각만 있는 줄은 광고성 동의 하나만 있던 때의 쿠키라 marketing으로 읽는다
 */
export function decodeConsentNotices(value: string, userId: string): ConsentNotice[] {
  const [owner, ...parts] = value.split('|');
  if (owner !== userId) return [];
  return parts.flatMap((part) => {
    const [type, iso] = part.includes('=') ? part.split('=') : ['marketing', part];
    if (!isOptionalTerms(type) || !iso) return [];
    const agreedAt = new Date(iso);
    return Number.isNaN(agreedAt.getTime()) ? [] : [{ type, agreedAt }];
  });
}
