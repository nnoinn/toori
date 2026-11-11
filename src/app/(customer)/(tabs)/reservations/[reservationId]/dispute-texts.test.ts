import { describe, expect, it } from 'vitest';

import { DISPUTE_TYPES } from '@/db/schema/admin';
import { SITE_NAME } from '@/lib/site';

import {
  DISPUTE_CONTENT_HINT,
  DISPUTE_TYPE_LABELS,
  disputeClosedText,
  disputeDeadlineText,
  isDisputeContentValid,
} from './dispute-texts';

describe('이의제기 칸 문구', () => {
  it('서버가 줄 수 있는 종류마다 이름이 있다', () => {
    for (const type of DISPUTE_TYPES) expect(DISPUTE_TYPE_LABELS[type]).toBeTruthy();
  });

  it('기한이 정해졌으면 한국 시각으로, 방문 처리 전이면 처리 뒤 영업일 기준 48시간으로 안내한다', () => {
    // 2026-11-13(금) 18:00 KST
    expect(disputeDeadlineText('2026-11-13T09:00:00.000Z')).toContain(
      '18:00까지 접수할 수 있어요.',
    );
    expect(disputeDeadlineText(null)).toBe(
      '원장님이 방문 처리한 뒤 영업일 기준 48시간까지 접수할 수 있어요.',
    );
  });

  it('기한이 지나도 카카오톡 채널로 문의를 받는다고 알린다', () => {
    expect(disputeClosedText(null)).toBe(
      `접수 기한이 지났어요. 그래도 문의는 ${SITE_NAME} 카카오톡 채널로 받아요.`,
    );
    expect(disputeClosedText('2026-11-13T09:00:00.000Z')).toContain('18:00)이 지났어요.');
  });

  it('내용은 앞뒤 공백을 뺀 10~500자(서버와 같은 기준)', () => {
    expect(isDisputeContentValid('너무 짧아요')).toBe(false);
    expect(isDisputeContentValid('   원장님이 노쇼로 처리했어요   ')).toBe(true);
    expect(isDisputeContentValid('가'.repeat(500))).toBe(true);
    expect(isDisputeContentValid('가'.repeat(501))).toBe(false);
    expect(DISPUTE_CONTENT_HINT).toContain('10자 이상 500자 이하');
  });
});
