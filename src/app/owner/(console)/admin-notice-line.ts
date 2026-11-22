// 운영자가 목록에서 고른 사유(#489)를 원장님 화면에 보여 주는 작은 글씨 한 줄(#499, 11/18 정민석 배치).
// 대시보드의 "운영자 마감" 아래, 정산 내역의 "운영자가 확인 중이에요" 아래에 쓴다. 화면과 서버 어디서나 가져올 수 있다.
// 문구는 정책 adminNoticeText(강규민 #501) 그대로이고 화면에서 고치지 않는다. 운영자가 직접 쓴 메모는 원장님에게 보이지 않는다

import { type AdminNoticeCode, type AdminNoticeUse, adminNoticeText } from '@/server/policy';

/**
 * "사유: 이용자 문의를 확인하고 있어요 · 확인이 끝나면 알려 드려요". 다음에 할 일이 없으면 사유만.
 * omitNextStep과 같은 다음에 할 일은 바로 위 문장이 이미 말하고 있어서 쓰지 않는다
 */
export function adminNoticeLine(
  code: AdminNoticeCode,
  use: AdminNoticeUse,
  { omitNextStep }: { omitNextStep?: string | null } = {},
): string {
  const { label, nextStep } = adminNoticeText(code, use);
  return nextStep && nextStep !== omitNextStep ? `사유: ${label} · ${nextStep}` : `사유: ${label}`;
}
