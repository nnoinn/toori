// 내 정보 입력 규칙과 문구 (J9, C-103). 화면과 서버 함수가 같이 쓴다.
// 연락처는 예약 확인·노쇼 연락용이고, 인증 없이 형식만 검사한다(#17 Q6). 로그에 남기지 않는다.
// 예약 확인 화면(C-401)에서 연락처를 받을 때도 이 규칙을 쓴다.

import { z } from 'zod';

import { normalizePhone } from '@/lib/phone';
import { SITE_NAME } from '@/lib/site';
import { utcToKst } from '@/lib/time';

/** 닉네임 최대 글자 수 */
export const NICKNAME_MAX_LENGTH = 20;

export const PHONE_FORMAT_MESSAGE = '휴대폰 번호를 확인해 주세요. 예: 010-1234-5678';

/**
 * 고객 연락처. 비우면 null(지운다). 휴대폰만 받고(#19 D31) 저장 모양은 고객·원장님·샵 공통(010-1234-5678, 10/28 결정).
 * 내 정보(J9)와 예약 확인 화면(J10, C-401)이 같이 쓴다
 */
export const customerPhoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === '') return null;
    const phone = normalizePhone(value, 'mobile');
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: PHONE_FORMAT_MESSAGE });
      return z.NEVER;
    }
    return phone;
  });

export const profileSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1, '닉네임을 입력해 주세요')
    .max(NICKNAME_MAX_LENGTH, `닉네임은 ${NICKNAME_MAX_LENGTH}자까지 쓸 수 있어요`),
  // 비우면 연락처를 지운다(예약 전에 다시 받는다)
  phone: customerPhoneSchema,
});

export type ProfileInput = z.input<typeof profileSchema>;
export type Profile = z.output<typeof profileSchema>;

/** "2026년 10월 28일" (한국 시간) */
export function formatKstDate(date: Date): string {
  const t = utcToKst(date);
  return `${t.year}년 ${t.month}월 ${t.day}일`;
}

/**
 * 광고성 정보 수신 동의·철회 처리 결과 (동의 문구 6-1, docs/legal/consent-texts.md).
 * 예: "투리 · 2026년 10월 28일에 광고성 정보 수신 동의 처리가 끝났어요."
 */
export function marketingResultMessage(agreed: boolean, processedAt: Date): string {
  return `${SITE_NAME} · ${formatKstDate(processedAt)}에 광고성 정보 수신 ${agreed ? '동의' : '거부'} 처리가 끝났어요.`;
}
