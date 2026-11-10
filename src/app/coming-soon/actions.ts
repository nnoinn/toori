'use server';

// 잠금 화면의 팀원 입장(#303). 코드가 맞으면 입장 쿠키를 굽고 원래 가려던 화면으로 보낸다.
// 잠금 규칙과 쿠키 값은 src/lib/site-lock.ts에 있다. 팀 접속 코드 값은 Vercel 환경변수에만 있다.

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { fail, type Result } from '@/lib/result';
import {
  isTeamCode,
  SITE_ACCESS_COOKIE,
  SITE_ACCESS_COOKIE_OPTIONS,
  siteAccessToken,
  siteEntryNextPath,
  siteLockCode,
} from '@/lib/site-lock';

import { createAttemptLimiter } from './attempts';

// 틀렸을 때 바로 답하지 않고 이만큼 기다린다. 코드를 빠르게 이어 넣어 보지 못하게 한다
const WRONG_CODE_DELAY_MS = 1000;

const limiter = createAttemptLimiter();

const enterSchema = z.object({
  code: z.string().trim().min(1).max(200),
  next: z.string().nullish(),
});

/**
 * 팀 접속 코드로 입장한다. 맞으면 돌아오지 않고(redirect) 가려던 화면으로 간다.
 * 틀렸거나 여러 번 틀려서 막혔을 때만 실패 결과를 돌려준다
 */
export async function enterWithTeamCode(input: {
  code: string;
  next?: string | null;
}): Promise<Result<never>> {
  const parsed = enterSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', '팀 접속 코드를 입력해 주세요');
  const next = siteEntryNextPath(parsed.data.next);

  const code = siteLockCode();
  // 잠금이 꺼져 있으면 코드 없이 들어간다
  if (code === null) redirect(next);

  const where = clientKey(await headers());
  const now = Date.now();
  const blockedMs = limiter.blockedFor(where, now);
  if (blockedMs > 0) {
    const minutes = Math.ceil(blockedMs / 60_000);
    return fail(
      'TOO_MANY_ATTEMPTS',
      `여러 번 틀려서 잠시 막았어요. ${minutes}분 뒤에 다시 해 주세요`,
    );
  }
  if (!isTeamCode(parsed.data.code, code)) {
    limiter.recordWrong(where, now);
    await new Promise((resolve) => setTimeout(resolve, WRONG_CODE_DELAY_MS));
    return fail('WRONG_CODE', '코드가 맞지 않아요. 다시 확인해 주세요');
  }

  limiter.reset(where);
  (await cookies()).set(SITE_ACCESS_COOKIE, siteAccessToken(code), SITE_ACCESS_COOKIE_OPTIONS);
  redirect(next);
}

// 접속한 곳(IP). Vercel이 넣어 주는 값이라 브라우저가 바꿀 수 없다. 로컬에는 없어서 모두 한 곳으로 센다
function clientKey(requestHeaders: { get(name: string): string | null }): string {
  return (
    requestHeaders.get('x-real-ip') ??
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
