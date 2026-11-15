import { describe, expect, it } from 'vitest';

import { SITE_NAME } from '@/lib/site';

import {
  formatKstDate,
  consentResultMessage,
  NICKNAME_MAX_LENGTH,
  profileSchema,
} from './profile-rules';

describe('연락처 형식 (공통 normalizePhone의 휴대폰만)', () => {
  it('휴대폰 번호는 010-1234-5678 모양으로 맞춰 저장한다', () => {
    for (const phone of ['01012345678', '010 1234 5678', '010-1234-5678']) {
      expect(profileSchema.parse({ name: '정찬형', nickname: '찬형', phone }).phone).toBe(
        '010-1234-5678',
      );
    }
  });

  it('지역번호·안심번호·대표번호는 고객 연락처로 받지 않는다', () => {
    for (const phone of ['031-123-4567', '0507-1234-5678', '1588-1234', '010-12-5678']) {
      expect(profileSchema.safeParse({ name: '정찬형', nickname: '찬형', phone }).success).toBe(
        false,
      );
    }
  });
});

describe('내 정보 입력', () => {
  it('앞뒤 공백을 지우고, 연락처를 비우면 null로 저장한다', () => {
    expect(profileSchema.parse({ name: ' 정찬형  ', nickname: '  찬형 ', phone: '' })).toEqual({
      name: '정찬형',
      nickname: '찬형',
      phone: null,
    });
    expect(
      profileSchema.parse({ name: '정찬형', nickname: '찬형', phone: '01012345678' }).phone,
    ).toBe('010-1234-5678');
  });

  it('닉네임이 비었거나 너무 길면, 연락처 형식이 틀리면 막는다', () => {
    expect(profileSchema.safeParse({ name: '정찬형', nickname: '   ', phone: '' }).success).toBe(
      false,
    );
    expect(
      profileSchema.safeParse({
        name: '정찬형',
        nickname: 'a'.repeat(NICKNAME_MAX_LENGTH + 1),
        phone: '',
      }).success,
    ).toBe(false);
    const wrongPhone = profileSchema.safeParse({ name: '정찬형', nickname: '찬형', phone: '1234' });
    expect(wrongPhone.success).toBe(false);
    expect(wrongPhone.error?.issues[0]?.message).toContain('휴대폰 번호');
  });
});

// 예약자 이름(#375, 11/13 nnoinn): 앞뒤 공백을 지우고 1~30자. 예약한 샵에 주는 이름이다
describe('내 정보 이름', () => {
  it('이름이 비었거나 공백뿐이면 막고, 이름 칸이 먼저 틀렸다고 알린다', () => {
    for (const name of ['', '   ']) {
      const parsed = profileSchema.safeParse({ name, nickname: '', phone: '1234' });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.path).toEqual(['name']);
      expect(parsed.error?.issues[0]?.message).toBe('이름을 입력해 주세요');
    }
  });

  it('앞뒤 공백을 뺀 뒤 30자까지 받고 31자는 막는다', () => {
    expect(
      profileSchema.parse({ name: ` ${'가'.repeat(30)} `, nickname: '찬형', phone: '' }).name,
    ).toBe('가'.repeat(30));
    const tooLong = profileSchema.safeParse({ name: '가'.repeat(31), nickname: '찬형', phone: '' });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]?.message).toBe('이름은 30자까지 쓸 수 있어요');
  });
});

describe('광고성 정보 수신 처리 결과 (동의 문구 6-1)', () => {
  it('한국 날짜로 동의/거부 결과를 알린다', () => {
    // 한국 시간 10/29 00:30 = UTC 10/28 15:30
    const at = new Date('2026-10-28T15:30:00Z');
    expect(formatKstDate(at)).toBe('2026년 10월 29일');
    expect(consentResultMessage('marketing', true, at)).toBe(
      `${SITE_NAME} · 2026년 10월 29일에 이벤트·혜택 소식 수신 동의 처리가 끝났어요.`,
    );
    expect(consentResultMessage('interest_alert', true, at)).toBe(
      `${SITE_NAME} · 2026년 10월 29일에 관심 동네·찜한 샵 새 매물 알림 수신 동의 처리가 끝났어요.`,
    );
    expect(consentResultMessage('marketing', false, at)).toContain('거부 처리가 끝났어요.');
  });
});
