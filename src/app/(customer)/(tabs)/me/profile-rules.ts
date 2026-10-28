// 내 정보 입력 규칙과 문구 (J9, C-103). 화면과 서버 함수가 같이 쓴다.
// 연락처는 예약 확인·노쇼 연락용이고, 인증 없이 형식만 검사한다(#17 Q6). 로그에 남기지 않는다.
// 예약 확인 화면(C-401)에서 연락처를 받을 때도 이 규칙을 쓴다.

import { z } from 'zod';

import { SITE_NAME } from '@/lib/site';
import { utcToKst } from '@/lib/time';

/** 닉네임 최대 글자 수 */
export const NICKNAME_MAX_LENGTH = 20;

/**
 * 휴대폰 번호를 "010-1234-5678" 모양으로. 숫자 사이의 띄어쓰기·하이픈은 무시한다.
 * 010·011·016·017·018·019로 시작하는 10~11자리만 받는다. 아니면 null
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  const match = /^(01[016789])(\d{3,4})(\d{4})$/.exec(digits);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export const profileSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1, '닉네임을 입력해 주세요')
    .max(NICKNAME_MAX_LENGTH, `닉네임은 ${NICKNAME_MAX_LENGTH}자까지 쓸 수 있어요`),
  // 비우면 연락처를 지운다(예약 전에 다시 받는다)
  phone: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === '') return null;
      const phone = normalizePhone(value);
      if (!phone) {
        ctx.addIssue({ code: 'custom', message: '휴대폰 번호를 확인해 주세요. 예: 010-1234-5678' });
        return z.NEVER;
      }
      return phone;
    }),
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
