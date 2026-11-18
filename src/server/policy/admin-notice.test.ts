// 원장님에게 보여 줄 운영자 사유 목록(#489). 쓰는 곳별 목록, 문구, 받은 값 확인을 본다.
// 기댓값의 출처: #489 1장 표(11/17 nnoinn 결정), 11/18 승인한 칸 제안(쓰는 곳별 코드)

import { describe, expect, it } from 'vitest';

import { SITE_NAME } from '@/lib/site';

import {
  ADMIN_NOTICE_CODES,
  ADMIN_NOTICE_CODES_BY_USE,
  ADMIN_NOTICE_FALLBACK_CODE,
  adminNoticeText,
  type AdminNoticeUse,
  isAdminNoticeCodeFor,
  toAdminNoticeCode,
} from './admin-notice';

const USES: AdminNoticeUse[] = ['close', 'publish_pause', 'settlement_hold'];

describe('쓰는 곳별 목록', () => {
  it('#489 표의 "쓰는 곳"과 같다', () => {
    expect(ADMIN_NOTICE_CODES_BY_USE).toEqual({
      close: ['listing_mismatch', 'user_inquiry', 'owner_request', 'other'],
      publish_pause: ['user_inquiry', 'shop_info_check', 'owner_request', 'other'],
      settlement_hold: [
        'user_inquiry',
        'payment_check',
        'payout_info_check',
        'owner_request',
        'other',
      ],
    });
  });

  it('모든 코드가 어느 한 곳에서는 쓰이고, 원장님 요청·기타·채우는 코드(other)는 모든 곳에 있다', () => {
    const used = new Set(USES.flatMap((use) => ADMIN_NOTICE_CODES_BY_USE[use]));
    expect([...used].sort()).toEqual([...ADMIN_NOTICE_CODES].sort());
    for (const use of USES) {
      expect(ADMIN_NOTICE_CODES_BY_USE[use]).toContain('owner_request');
      expect(ADMIN_NOTICE_CODES_BY_USE[use]).toContain('other');
      expect(ADMIN_NOTICE_CODES_BY_USE[use]).toContain(ADMIN_NOTICE_FALLBACK_CODE);
    }
  });
});

describe('adminNoticeText', () => {
  it('#489 표의 사유와 다음에 할 일', () => {
    expect(adminNoticeText('listing_mismatch', 'close')).toEqual({
      label: '매물 정보가 실제와 달라요(가격·시간·서비스)',
      nextStep: '정보를 고쳐서 다시 올려 주세요',
    });
    expect(adminNoticeText('shop_info_check', 'publish_pause')).toEqual({
      label: '입점 정보 확인이 필요해요',
      nextStep: '내 계정에서 사업자 정보를 확인해 주세요',
    });
    expect(adminNoticeText('payment_check', 'settlement_hold')).toEqual({
      label: '결제·환불 내역을 확인하고 있어요',
      nextStep: '확인이 끝나면 돌아오는 지급일에 들어가요',
    });
    expect(adminNoticeText('payout_info_check', 'settlement_hold')).toEqual({
      label: '정산 계좌·사업자 정보 확인이 필요해요',
      nextStep: '정산 계좌를 확인해 주세요',
    });
  });

  it('이용자 문의는 정산 보류일 때만 다음에 할 일이 지급일 안내다', () => {
    expect(adminNoticeText('user_inquiry', 'close').nextStep).toBe('확인이 끝나면 알려 드려요');
    expect(adminNoticeText('user_inquiry', 'publish_pause').nextStep).toBe(
      '확인이 끝나면 알려 드려요',
    );
    expect(adminNoticeText('user_inquiry', 'settlement_hold')).toEqual({
      label: '이용자 문의를 확인하고 있어요',
      nextStep: '확인이 끝나면 돌아오는 지급일에 들어가요',
    });
  });

  it('원장님 요청은 다음에 할 일이 없고, 기타는 카카오톡 채널로 안내한다(어느 곳이든 같다)', () => {
    for (const use of USES) {
      expect(adminNoticeText('owner_request', use)).toEqual({
        label: '원장님이 요청하셨어요',
        nextStep: null,
      });
      expect(adminNoticeText('other', use)).toEqual({
        label: '기타',
        nextStep: `자세한 내용은 ${SITE_NAME} 카카오톡 채널로 안내해 드려요`,
      });
    }
  });

  it('모든 곳·코드에 빈 사유가 없고, 문구에 "궁금하면"을 쓰지 않는다(11/17 nnoinn)', () => {
    for (const use of USES) {
      for (const code of ADMIN_NOTICE_CODES_BY_USE[use]) {
        const { label, nextStep } = adminNoticeText(code, use);
        expect(label.trim()).not.toBe('');
        expect(`${label} ${nextStep ?? ''}`).not.toContain('궁금하면');
      }
    }
  });
});

describe('isAdminNoticeCodeFor / toAdminNoticeCode', () => {
  it('그 곳의 목록에 있는 코드만 받는다', () => {
    expect(isAdminNoticeCodeFor('close', 'listing_mismatch')).toBe(true);
    expect(isAdminNoticeCodeFor('publish_pause', 'listing_mismatch')).toBe(false);
    expect(isAdminNoticeCodeFor('settlement_hold', 'shop_info_check')).toBe(false);
    expect(isAdminNoticeCodeFor('close', 'payment_check')).toBe(false);
    for (const value of ['', 'nope', 'OTHER', null, undefined, 1, {}]) {
      expect(isAdminNoticeCodeFor('settlement_hold', value)).toBe(false);
    }
  });

  it('DB에서 읽은 값이 목록에 없으면 기타로 본다', () => {
    expect(toAdminNoticeCode('settlement_hold', 'payment_check')).toBe('payment_check');
    expect(toAdminNoticeCode('settlement_hold', 'listing_mismatch')).toBe('other');
    expect(toAdminNoticeCode('publish_pause', null)).toBe('other');
  });
});
