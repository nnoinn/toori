import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SITE_NAME } from '@/lib/site';
import { CHECKOUT_CONSENT_VERSIONS } from '@/server/policy';

import {
  bookerInfoConsentLabel,
  bookerInfoRows,
  intermediaryNotice,
  REFUND_CONSENT_LABEL,
} from './checkout-texts';

// 화면 문구가 동의 문구 초안(docs/legal/consent-texts.md 3장)과 어긋나지 않는지 본다
const consentDoc = readFileSync(join(process.cwd(), 'docs/legal/consent-texts.md'), 'utf8');

describe('예약 확인 동의 문구 (동의 문구 3장)', () => {
  it('필수 동의 2개가 문서 문구와 같다', () => {
    expect(consentDoc).toContain(`[ ] ${REFUND_CONSENT_LABEL}`);
    expect(consentDoc).toContain(`[ ] ${bookerInfoConsentLabel('{샵 이름}')}`);
  });

  it('예약자 정보 제공 "보기" 표가 문서 3-1과 같다', () => {
    const row = bookerInfoRows('{샵 이름}')
      .map((item) => item.value)
      .join(' | ');
    expect(consentDoc).toContain(`| ${row} |`);
  });

  it('예약한 샵에는 이름·휴대폰 번호·예약 내용만 주고 닉네임은 주지 않는다(#375, 11/13)', () => {
    const items = bookerInfoRows('샘플 헤어').find((row) => row.label === '항목');
    expect(items?.value).toBe('이름, 휴대폰 번호, 예약 내용');
  });

  it('예약자 정보 항목이 바뀌었으니 동의 문구 버전을 올렸다(#375)', () => {
    expect(CHECKOUT_CONSENT_VERSIONS.bookerInfo).toBe('draft-2026-11');
  });

  it('통신판매중개자 안내에 서비스 이름과 샵 이름이 들어간다', () => {
    const notice = intermediaryNotice('샘플 헤어');
    expect(notice.startsWith(SITE_NAME)).toBe(true);
    expect(notice).toContain('서비스에 대한 책임은 샘플 헤어에 있어요.');
    expect(consentDoc).toContain(intermediaryNotice('{샵 이름}').replace(SITE_NAME, '투리'));
  });
});
