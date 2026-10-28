import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from './cursor';
import { formatDistance } from './distance';
import { applySortToSearch, DEFAULT_SORT, parseSort } from './sort';

const ID = '3f1c2b9e-8a4d-4c1e-9b2f-1a2b3c4d5e6f';

describe('정렬', () => {
  it('기본은 거리순, 목록에 없는 값도 거리순', () => {
    expect(DEFAULT_SORT).toBe('near');
    expect(parseSort(undefined)).toBe('near');
    expect(parseSort('price')).toBe('near');
  });

  it('할인율순·임박순을 읽는다', () => {
    expect(parseSort('discount')).toBe('discount');
    expect(parseSort(['imminent', 'near'])).toBe('imminent');
  });

  it('기본 정렬이면 주소창에서 지우고, 다른 값은 그대로 둔다', () => {
    expect(
      applySortToSearch(new URLSearchParams('sort=discount&category=hair'), 'near').toString(),
    ).toBe('category=hair');
    expect(applySortToSearch(new URLSearchParams('category=hair'), 'imminent').toString()).toBe(
      'category=hair&sort=imminent',
    );
  });
});

describe('거리 글자', () => {
  it('1km 미만은 10m 단위', () => {
    expect(formatDistance(0)).toBe('10m');
    expect(formatDistance(347)).toBe('350m');
    expect(formatDistance(994)).toBe('990m');
  });

  it('반올림해서 1000m가 되면 km로', () => {
    expect(formatDistance(996)).toBe('1.0km');
  });

  it('1km 이상은 소수 한 자리, 10km 이상은 정수', () => {
    expect(formatDistance(1234)).toBe('1.2km');
    expect(formatDistance(9960)).toBe('10.0km');
    expect(formatDistance(12_400)).toBe('12km');
  });

  it('거리를 모르면 표시하지 않는다', () => {
    for (const value of [null, undefined, Number.NaN, -1])
      expect(formatDistance(value)).toBeUndefined();
  });
});

describe('커서', () => {
  it('만들고 읽으면 같은 값', () => {
    for (const cursor of [
      { sort: 'near', value: 532.7, id: ID },
      { sort: 'discount', value: 40, id: ID },
      { sort: 'imminent', value: '2026-10-25T05:00:00.000Z', id: ID },
    ] as const) {
      expect(decodeCursor(encodeCursor(cursor), cursor.sort)).toEqual(cursor);
    }
  });

  it('지금 정렬과 다른 커서는 버린다(처음부터)', () => {
    const raw = encodeCursor({ sort: 'near', value: 100, id: ID });
    expect(decodeCursor(raw, 'discount')).toBeNull();
  });

  it('모양이 이상하면 버린다', () => {
    const bad = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const cases = [
      [undefined, 'near'],
      ['', 'near'],
      ['not-base64-json', 'near'],
      ['a'.repeat(600), 'near'],
      [bad({ sort: 'near', value: -5, id: ID }), 'near'],
      [bad({ sort: 'near', value: 1, id: 'abc' }), 'near'],
      [bad({ sort: 'discount', value: 33.3, id: ID }), 'discount'],
      [bad({ sort: 'discount', value: 120, id: ID }), 'discount'],
      [bad({ sort: 'imminent', value: 'tomorrow', id: ID }), 'imminent'],
    ] as const;
    for (const [raw, sort] of cases) expect(decodeCursor(raw, sort)).toBeNull();
  });
});
