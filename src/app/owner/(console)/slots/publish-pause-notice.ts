// 새 매물 게시 멈춤(#373 ④) 안내 아래 운영자가 고른 사유 한 줄(#499 ②, 11/18 정민석 배치). 매물 등록·재등록 화면이 같이 쓴다.
// 문구는 정책 adminNoticeText(code, 'publish_pause') 그대로이고, 운영자가 직접 쓴 메모는 원장님에게 보이지 않는다

import type { PublishPauseCode } from '@/server/policy';

import { adminNoticeLine } from '../admin-notice-line';

/** 게시를 멈춘 샵이면 "사유: … · 다음에 할 일", 멈추지 않았으면 null. pause는 readPublishPause(@/server/shops) 결과 */
export function publishPauseNoticeLine(pause: { code: PublishPauseCode } | null): string | null {
  return pause ? adminNoticeLine(pause.code, 'publish_pause') : null;
}
