import { describe, expect, it } from 'vitest';

import { DISPUTE_TYPES } from '@/db/schema/admin';
import { SITE_NAME } from '@/lib/site';

import {
  DISPUTE_CONTENT_LIMIT_NOTE,
  DISPUTE_CONTENT_PLACEHOLDER,
  DISPUTE_TYPE_LABELS,
  disputeClosedText,
  disputeContentError,
  disputeDeadlineText,
  disputeSubmittedText,
  reachedContentLimit,
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

  it('접수한 시각은 한국 시각으로 알린다', () => {
    // 2026-11-13(금) 18:00 KST
    expect(disputeSubmittedText('2026-11-13T09:00:00.000Z')).toBe('11/13(금) 18:00에 접수했어요.');
  });

  it('기한이 지나도 카카오톡 채널로 문의를 받는다고 알린다', () => {
    expect(disputeClosedText(null)).toBe(
      `접수 기한이 지났어요. 그래도 문의는 ${SITE_NAME} 카카오톡 채널로 받아요.`,
    );
    expect(disputeClosedText('2026-11-13T09:00:00.000Z')).toContain('18:00)이 지났어요.');
  });

  // 기댓값 출처: 11/13 nnoinn 결정(#359 4번, 기술 가이드 7장 "이의제기 내용", DISPUTE-07)
  it('내용은 빈칸(공백만 있는 것 포함)만 막고 글자 수 하한은 없다', () => {
    expect(disputeContentError('')).toBe('내용을 적어 주세요');
    expect(disputeContentError('   \n  ')).toBe('내용을 적어 주세요');
    expect(disputeContentError('가')).toBeNull();
    expect(disputeContentError('   노쇼가 아니에요   ')).toBeNull();
  });

  it('보이지 않는 상한은 5,000자(앞뒤 공백 뺀 길이)', () => {
    expect(disputeContentError('가'.repeat(5000))).toBeNull();
    expect(disputeContentError(' ' + '가'.repeat(5000) + ' ')).toBeNull();
    expect(disputeContentError('가'.repeat(5001))).toBe('5,000자까지 쓸 수 있어요');
  });

  it('5,000자에 닿았을 때만 상한 안내를 보여준다', () => {
    expect(reachedContentLimit('가'.repeat(4999))).toBe(false);
    expect(reachedContentLimit('가'.repeat(5000))).toBe(true);
    expect(DISPUTE_CONTENT_LIMIT_NOTE).toBe('5,000자까지 쓸 수 있어요');
  });

  it('칸 안 안내 문구', () => {
    expect(DISPUTE_CONTENT_PLACEHOLDER).toBe('최대한 상세하게 설명해주세요');
  });
});
