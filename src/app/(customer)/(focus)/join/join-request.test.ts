import { describe, expect, it } from 'vitest';

import { TERMS_VERSIONS } from '@/server/policy';

import { EMPTY_AGREEMENTS } from './agreements';
import { buildJoinRequest } from './join-request';

const REQUIRED_ONLY = {
  ...EMPTY_AGREEMENTS,
  age14: true,
  service: true,
  privacy: true,
  location: true,
};

const NEXT = '/slots/abc';

describe('가입 요청 만들기 (C-104, 이름은 #375 11/13 결정)', () => {
  it('필수 동의·이름·휴대폰 번호가 다 있으면 이름 앞뒤 공백을 빼고, 번호는 하이픈 모양으로 보낸다', () => {
    expect(
      buildJoinRequest({
        agreements: REQUIRED_ONLY,
        name: '  정찬형 ',
        phone: '01012345678',
        next: NEXT,
      }),
    ).toEqual({
      agreements: {
        age14: true,
        service: true,
        privacy: true,
        location: true,
        interest_alert: false,
        marketing: false,
      },
      name: '정찬형',
      phone: '010-1234-5678',
      next: NEXT,
    });
  });

  it('이름이 빈칸이거나 공백뿐이면 보내지 않는다', () => {
    for (const name of ['', '   ']) {
      expect(
        buildJoinRequest({ agreements: REQUIRED_ONLY, name, phone: '01012345678', next: NEXT }),
      ).toBeNull();
    }
  });

  it('이름은 앞뒤 공백을 뺀 뒤 30자까지 보내고 31자는 보내지 않는다', () => {
    const request = (name: string) =>
      buildJoinRequest({ agreements: REQUIRED_ONLY, name, phone: '01012345678', next: NEXT });
    expect(request(` ${'가'.repeat(30)} `)?.name).toBe('가'.repeat(30));
    expect(request('가'.repeat(31))).toBeNull();
  });

  it('필수 동의가 빠졌거나 휴대폰 번호가 틀리면 보내지 않는다', () => {
    expect(
      buildJoinRequest({
        agreements: { ...REQUIRED_ONLY, location: false },
        name: '정찬형',
        phone: '01012345678',
        next: NEXT,
      }),
    ).toBeNull();
    for (const phone of ['', '031-123-4567', '0101234']) {
      expect(
        buildJoinRequest({ agreements: REQUIRED_ONLY, name: '정찬형', phone, next: NEXT }),
      ).toBeNull();
    }
  });
});

describe('가입 개인정보 동의 버전 (동의 문구 1-1)', () => {
  it('수집 항목에 이름을 넣었으니 개인정보 동의 버전을 올렸다(#375)', () => {
    expect(TERMS_VERSIONS.privacy).toBe('draft-2026-11');
  });
});
