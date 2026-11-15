import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AGREEMENT_ITEMS,
  allRequiredChecked,
  EMPTY_AGREEMENTS,
  formatMonthsLabel,
  toAgreementsInput,
  toggleAll,
} from './agreements';

const REQUIRED_ONLY = {
  ...EMPTY_AGREEMENTS,
  age14: true,
  service: true,
  privacy: true,
  location: true,
};

describe('고객 약관 동의', () => {
  it('필수 4개(만 14세·이용약관·개인정보·위치기반), 선택 2개(관심 동네·찜한 샵 알림이 위)', () => {
    expect(AGREEMENT_ITEMS.filter((item) => item.required).map((item) => item.key)).toEqual([
      'age14',
      'service',
      'privacy',
      'location',
    ]);
    expect(AGREEMENT_ITEMS.filter((item) => !item.required).map((item) => item.key)).toEqual([
      'interest_alert',
      'marketing',
    ]);
  });

  it('만 14세 확인에는 약관 본문 "보기"가 없다', () => {
    expect(AGREEMENT_ITEMS.find((item) => item.key === 'age14')?.hasDocument).toBe(false);
  });

  it('처음에는 모두 해제라 시작할 수 없다', () => {
    expect(allRequiredChecked(EMPTY_AGREEMENTS)).toBe(false);
    expect(toAgreementsInput(EMPTY_AGREEMENTS)).toBeNull();
  });

  it('필수만 체크하면 시작할 수 있고 선택 동의는 둘 다 false로 넘긴다', () => {
    expect(toAgreementsInput(REQUIRED_ONLY)).toEqual({
      age14: true,
      service: true,
      privacy: true,
      location: true,
      interest_alert: false,
      marketing: false,
    });
  });

  it('선택 동의는 고른 것만 true로 넘긴다', () => {
    expect(toAgreementsInput({ ...REQUIRED_ONLY, interest_alert: true })).toMatchObject({
      interest_alert: true,
      marketing: false,
    });
  });

  it('만 14세 확인이 빠지면 시작할 수 없다', () => {
    expect(toAgreementsInput({ ...REQUIRED_ONLY, age14: false })).toBeNull();
  });

  it('전체 동의는 모두 켜고, 다시 누르면 모두 끈다', () => {
    const on = toggleAll(EMPTY_AGREEMENTS);
    expect(Object.values(on).every(Boolean)).toBe(true);
    expect(toAgreementsInput(on)).toMatchObject({ interest_alert: true, marketing: true });
    expect(toggleAll(on)).toEqual(EMPTY_AGREEMENTS);
  });

  it('일부만 켜져 있을 때 전체 동의를 누르면 모두 켠다', () => {
    expect(Object.values(toggleAll({ ...EMPTY_AGREEMENTS, service: true })).every(Boolean)).toBe(
      true,
    );
  });
});

describe('문구 안의 시각·기간', () => {
  it('기간', () => {
    expect(formatMonthsLabel(24)).toBe('2년');
    expect(formatMonthsLabel(6)).toBe('6개월');
  });

  it('관심 동네·찜한 샵 알림 설명에 정책값 시각이 들어간다(오후 1시, 밤 9시~아침 8시, 2년)', () => {
    const text = AGREEMENT_ITEMS.find((item) => item.key === 'interest_alert')?.description?.join(
      ' ',
    );
    expect(text).toContain('오후 1시');
    expect(text).toContain('밤 9시부터 아침 8시까지');
    expect(text).toContain('2년마다');
    expect(text).toContain('받는 정보: 관심 동네와 찜한 샵의 새 할인 매물 소식(광고성 정보)');
  });

  it('이벤트·혜택 동의 설명은 무엇을 보내는지 따로 알린다', () => {
    const text = AGREEMENT_ITEMS.find((item) => item.key === 'marketing')?.description?.join(' ');
    expect(text).toContain('받는 정보: 할인 이벤트, 쿠폰 같은 혜택 소식');
    expect(text).toContain('밤 9시부터 아침 8시까지');
    expect(text).toContain('2년마다');
  });
});

// 화면 항목이 동의 문구 초안(docs/legal/consent-texts.md 1장 화면 모양)과 어긋나지 않는지 본다
describe('가입 동의 항목과 동의 문구 1장', () => {
  const consentDoc = readFileSync(join(process.cwd(), 'docs/legal/consent-texts.md'), 'utf8');
  const screen = consentDoc.split('## 1. 고객 가입 약관 동의')[1].split('```')[1];
  const lines = screen.split('\n').filter((line) => line.startsWith('[ ] ('));

  it('항목 이름·필수 여부·순서가 같다', () => {
    expect(lines.map((line) => line.replace(/\s+보기 >$/, ''))).toEqual(
      AGREEMENT_ITEMS.map((item) => `[ ] (${item.required ? '필수' : '선택'}) ${item.label}`),
    );
  });

  it('본문이 있는 항목에만 "보기"가 있다', () => {
    expect(lines.map((line) => line.endsWith('보기 >'))).toEqual(
      AGREEMENT_ITEMS.map((item) => item.hasDocument),
    );
  });

  it('선택 동의 설명이 문서 7장(관심 동네·찜한 샵 알림)·1-2(이벤트·혜택)와 줄마다 같다', () => {
    // 문서는 "- " 목록이고 끝에 마침표가 없다. 화면은 줄마다 마침표로 끝난다
    const block = (heading: string) =>
      consentDoc.split(heading)[1].split('```')[1].split('\n').slice(1).filter(Boolean);
    const plain = (line: string) => line.replace(/^- /, '').replace(/\.$/, '');
    const description = (key: string) =>
      AGREEMENT_ITEMS.find((item) => item.key === key)?.description?.map(plain);
    expect(description('interest_alert')).toEqual(block('## 7. ').map(plain));
    expect(description('marketing')).toEqual(block('### 1-2. ').map(plain));
  });
});
