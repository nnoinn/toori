import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NO_SHOW_PENALTY_RATE, OWNER_FAULT_COUPON_AMOUNT, REFUND_BANDS } from '@/server/policy';

import {
  formatBusinessHours,
  formatDuration,
  kakaoDirectionsLink,
  kakaoMapLink,
  photoIndexAt,
  refundPolicyLines,
  refundPolicyNotes,
  safeExternalUrl,
  telHref,
} from './detail-format';

describe('사진 번호', () => {
  it('스크롤 위치에서 가장 가까운 사진', () => {
    expect(photoIndexAt(0, 600, 3)).toBe(0);
    expect(photoIndexAt(600, 600, 3)).toBe(1);
    expect(photoIndexAt(1190, 600, 3)).toBe(2);
    expect(photoIndexAt(280, 600, 3)).toBe(0);
  });

  it('범위를 벗어나지 않는다(화면 끝에서 튕길 때)', () => {
    expect(photoIndexAt(-30, 600, 3)).toBe(0);
    expect(photoIndexAt(2000, 600, 3)).toBe(2);
  });

  it('칸 폭을 못 재거나 사진이 없으면 첫 장', () => {
    expect(photoIndexAt(300, 0, 3)).toBe(0);
    expect(photoIndexAt(300, 600, 0)).toBe(0);
  });
});

describe('영업시간', () => {
  it('월요일부터 7줄, 입력 안 한 요일은 "정보 없음"', () => {
    const rows = formatBusinessHours([
      { weekday: 1, open: '10:00', close: '20:00' },
      { weekday: 0, closed: true },
    ]);
    expect(rows?.map((row) => `${row.label} ${row.text}`)).toEqual([
      '월 10:00 ~ 20:00',
      '화 정보 없음',
      '수 정보 없음',
      '목 정보 없음',
      '금 정보 없음',
      '토 정보 없음',
      '일 휴무',
    ]);
  });

  it('비어 있거나 모양이 틀리면 null(칸 숨김)', () => {
    expect(formatBusinessHours([])).toBeNull();
    expect(formatBusinessHours(null)).toBeNull();
    expect(formatBusinessHours([{ weekday: 9, open: '10:00', close: '20:00' }])).toBeNull();
    expect(formatBusinessHours([{ weekday: 1, open: '25:00', close: '20:00' }])).toBeNull();
  });

  it('같은 요일이 두 번 있으면 앞의 것만', () => {
    const rows = formatBusinessHours([
      { weekday: 2, open: '09:00', close: '18:00' },
      { weekday: 2, closed: true },
    ]);
    expect(rows?.find((row) => row.weekday === 2)?.text).toBe('09:00 ~ 18:00');
  });

  it('새벽 영업은 그대로, 여는·닫는 시각이 같으면 24시간 영업, 00:00 마감은 그대로', () => {
    const rows = formatBusinessHours([
      { weekday: 1, open: '18:00', close: '02:00' },
      { weekday: 2, open: '00:00', close: '00:00' },
      { weekday: 3, open: '09:00', close: '09:00' },
      { weekday: 4, open: '18:00', close: '00:00' },
    ]);
    expect(rows?.slice(0, 4).map((row) => row.text)).toEqual([
      '18:00 ~ 02:00',
      '24시간 영업',
      '24시간 영업',
      '18:00 ~ 00:00',
    ]);
  });
});

describe('소요 시간', () => {
  it('시간·분으로 보여준다', () => {
    expect(formatDuration(45)).toBe('45분');
    expect(formatDuration(60)).toBe('1시간');
    expect(formatDuration(90)).toBe('1시간 30분');
    expect(formatDuration(0)).toBe('');
  });
});

describe('외부 링크', () => {
  it('https 주소만 받는다', () => {
    expect(safeExternalUrl('https://instagram.com/toori_shop')).toBe(
      'https://instagram.com/toori_shop',
    );
    expect(safeExternalUrl(' https://naver.me/abc ')).toBe('https://naver.me/abc');
  });

  it('위험하거나 이상한 주소는 숨긴다', () => {
    for (const value of [
      'javascript:alert(1)',
      'http://instagram.com/x',
      'data:text/html,hi',
      'instagram.com/x',
      '',
      null,
      undefined,
    ]) {
      expect(safeExternalUrl(value)).toBeNull();
    }
  });
});

describe('전화 링크', () => {
  it('숫자만 남긴다', () => {
    expect(telHref('031-123-4567')).toBe('tel:0311234567');
    expect(telHref('123')).toBeNull();
  });
});

describe('환불 규정 안내', () => {
  it('정책값으로 만든 3구간이 결제 동의 문구(consent-texts.md 3장)와 글자까지 같다', () => {
    expect(refundPolicyLines(REFUND_BANDS, NO_SHOW_PENALTY_RATE)).toEqual([
      '24시간 이상 남음: 70% 환불(위약금 30%)',
      '6시간 이상 24시간 미만: 50% 환불(위약금 50%)',
      '6시간 미만·노쇼: 환불 없음',
    ]);
  });

  it('경계는 "N시간 이상"이 위 구간이다(딱 6시간 남으면 50% 환불)', () => {
    const [, middle, last] = refundPolicyLines(REFUND_BANDS, NO_SHOW_PENALTY_RATE);
    expect(middle.startsWith('6시간 이상')).toBe(true);
    expect(last.startsWith('6시간 미만')).toBe(true);
    // 정책값의 구간 경계와 문구가 같은 숫자를 쓴다
    expect(REFUND_BANDS.map((band) => band.minHoursLeft)).toEqual([24, 6, 0]);
  });

  it('정책값이 바뀌면 문구도 바뀐다. 노쇼 위약금과 다르면 "·노쇼"를 붙이지 않는다', () => {
    expect(
      refundPolicyLines(
        [
          { minHoursLeft: 48, penaltyRate: 10 },
          { minHoursLeft: 12, penaltyRate: 40 },
          { minHoursLeft: 0, penaltyRate: 100 },
        ],
        90,
      ),
    ).toEqual([
      '48시간 이상 남음: 90% 환불(위약금 10%)',
      '12시간 이상 48시간 미만: 60% 환불(위약금 40%)',
      '12시간 미만: 환불 없음',
    ]);
  });

  it('문서(docs/legal/consent-texts.md)가 바뀌어 코드와 어긋나면 알려 준다', () => {
    const doc = readFileSync(join(process.cwd(), 'docs/legal/consent-texts.md'), 'utf8');
    const notes = refundPolicyNotes(OWNER_FAULT_COUPON_AMOUNT);
    for (const line of refundPolicyLines(REFUND_BANDS, NO_SHOW_PENALTY_RATE)) {
      expect(doc).toContain(`- ${line}`);
    }
    for (const line of [...notes.before, notes.after]) expect(doc).toContain(line);
  });

  it('앞뒤 안내 문구는 결제 동의 문구 3장과 같고, 쿠폰 금액은 정책값', () => {
    expect(refundPolicyNotes(OWNER_FAULT_COUPON_AMOUNT)).toEqual({
      before: [
        '임박 특가 상품이라 결제 직후에도 무료 취소가 되지 않아요.',
        '서비스 시작까지 남은 시간에 따라 환불돼요.',
      ],
      after: '원장님 사정으로 취소되면 전액 환불하고 3,000원 쿠폰을 드려요.',
    });
  });
});

describe('카카오맵 길찾기 링크 (C-307)', () => {
  it('도착지에 샵 이름과 좌표를 넣는다', () => {
    expect(kakaoDirectionsLink('샘플 헤어, 2층', 37.3, 126.8)).toBe(
      'https://map.kakao.com/link/to/%EC%83%98%ED%94%8C%20%ED%97%A4%EC%96%B4%2C%202%EC%B8%B5,37.3,126.8',
    );
  });
});

describe('카카오맵 크게 보기 링크', () => {
  it('샵 이름과 좌표를 넣고, 이름의 쉼표·공백은 주소에 맞게 바꾼다', () => {
    expect(kakaoMapLink('샘플 헤어, 2층', 37.3, 126.8)).toBe(
      'https://map.kakao.com/link/map/%EC%83%98%ED%94%8C%20%ED%97%A4%EC%96%B4%2C%202%EC%B8%B5,37.3,126.8',
    );
  });
});
