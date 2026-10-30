import { describe, expect, it } from 'vitest';

import {
  type HoursRow,
  type ShopProfileInput,
  toHoursRows,
  validateShopProfile,
} from './shop-profile';

const emptyHours = (): HoursRow[] => toHoursRows([]);

const valid = (overrides: Partial<ShopProfileInput> = {}): ShopProfileInput => ({
  name: '  투리 헤어  ',
  category: 'hair',
  phone: '031-123-4567',
  roadAddress: '경기 안산시 단원구 중앙대로 1',
  addressDetail: '2층',
  description: '커트 전문이에요',
  hours: emptyHours(),
  ...overrides,
});

/** 월요일(0번 줄)만 바꾼 영업시간 */
const withMonday = (row: Partial<HoursRow>): HoursRow[] => {
  const hours = emptyHours();
  hours[0] = { ...hours[0], ...row };
  return hours;
};

describe('toHoursRows', () => {
  it('저장된 영업시간을 월~일 7줄로 바꾸고, 없는 요일은 빈 줄로 둔다', () => {
    const rows = toHoursRows([
      { weekday: 1, open: '10:00', close: '20:00' },
      { weekday: 0, closed: true },
    ]);
    expect(rows.map((row) => row.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(rows[0]).toEqual({ weekday: 1, closed: false, open: '10:00', close: '20:00' });
    expect(rows[1]).toEqual({ weekday: 2, closed: false, open: '', close: '' });
    expect(rows[6]).toEqual({ weekday: 0, closed: true, open: '', close: '' });
  });
});

describe('validateShopProfile', () => {
  it('앞뒤 공백을 지우고, 빈 상세 주소·설명은 null로 저장한다', () => {
    const result = validateShopProfile(valid({ addressDetail: '  ', description: '' }));
    expect(result).toEqual({
      ok: true,
      data: {
        name: '투리 헤어',
        category: 'hair',
        phone: '031-123-4567',
        roadAddress: '경기 안산시 단원구 중앙대로 1',
        addressDetail: null,
        description: null,
        businessHours: [],
      },
    });
  });

  it('영업시간은 빈 요일을 빼고 일~토 순서로 저장한다', () => {
    const hours = emptyHours();
    hours[0] = { weekday: 1, closed: false, open: '10:00', close: '20:00' };
    hours[6] = { weekday: 0, closed: true, open: '', close: '' };
    const result = validateShopProfile(valid({ hours }));
    expect(result.ok && result.data.businessHours).toEqual([
      { weekday: 0, closed: true },
      { weekday: 1, open: '10:00', close: '20:00' },
    ]);
  });

  it('쉬는 날로 고르면 시각이 남아 있어도 쉬는 날로 저장한다', () => {
    const result = validateShopProfile(
      valid({ hours: withMonday({ closed: true, open: '10:00', close: '09:00' }) }),
    );
    expect(result.ok && result.data.businessHours).toEqual([{ weekday: 1, closed: true }]);
  });

  it.each([
    ['한쪽 시각만 고름', { open: '10:00', close: '' }, '여는 시각과 닫는 시각을 모두 골라 주세요'],
    [
      '시각 모양이 틀림',
      { open: '9:00', close: '20:00' },
      '여는 시각과 닫는 시각을 모두 골라 주세요',
    ],
    [
      '여는 시각과 닫는 시각이 같음',
      { open: '10:00', close: '10:00' },
      '닫는 시각은 여는 시각보다 늦어야 해요',
    ],
    ['자정을 넘김', { open: '18:00', close: '02:00' }, '닫는 시각은 여는 시각보다 늦어야 해요'],
  ])('영업시간 오류: %s', (_name, row, message) => {
    const result = validateShopProfile(valid({ hours: withMonday(row) }));
    expect(result).toEqual({ ok: false, fieldErrors: { 'hours.0': message } });
  });

  it('같은 요일이 두 번 오면 막는다', () => {
    const hours = emptyHours();
    hours[1] = { ...hours[0] };
    const result = validateShopProfile(valid({ hours }));
    expect(result).toEqual({ ok: false, fieldErrors: { 'hours.1': '같은 요일이 두 번 있어요' } });
  });

  it.each([
    ['031-123-4567', '031-123-4567'],
    ['02-123-4567', '02-123-4567'],
    ['010 1234 5678', '010-1234-5678'],
    ['0701234567', '070-123-4567'],
    ['050712345678', '0507-1234-5678'],
    ['1588-1234', '1588-1234'],
  ])('전화번호 %s는 %s 모양으로 저장한다(normalizePhone)', (phone, saved) => {
    const result = validateShopProfile(valid({ phone }));
    expect(result.ok && result.data.phone).toBe(saved);
  });

  it.each(['', '123-4567', '031-123-456a', '010-1234-56789', '1234-5678'])(
    '전화번호 "%s"는 막는다',
    (phone) => {
      const result = validateShopProfile(valid({ phone }));
      expect(!result.ok && result.fieldErrors.phone).toBe(
        '전화번호를 확인해 주세요. 예: 031-123-4567',
      );
    },
  );

  it('빈 칸·없는 업종·너무 긴 값은 칸마다 알려 준다', () => {
    const result = validateShopProfile(
      valid({
        name: ' ',
        category: 'massage',
        roadAddress: '',
        addressDetail: 'a'.repeat(101),
        description: 'a'.repeat(1001),
      }),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: '샵 이름을 입력해 주세요',
        category: '업종을 골라 주세요',
        roadAddress: '주소 찾기로 도로명 주소를 골라 주세요',
        addressDetail: '상세 주소는 100자까지 쓸 수 있어요',
        description: '서비스 설명은 1000자까지 쓸 수 있어요',
      },
    });
  });

  it('샵 이름은 40자까지 받는다', () => {
    expect(validateShopProfile(valid({ name: '가'.repeat(40) })).ok).toBe(true);
    const result = validateShopProfile(valid({ name: '가'.repeat(41) }));
    expect(!result.ok && result.fieldErrors.name).toBe('샵 이름은 40자까지 쓸 수 있어요');
  });

  it('모양이 틀린 입력은 저장하지 않는다', () => {
    expect(validateShopProfile({ name: 1 }).ok).toBe(false);
    expect(validateShopProfile(null).ok).toBe(false);
  });
});
