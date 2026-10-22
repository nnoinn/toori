import { describe, expect, it } from 'vitest';

import {
  SERVICE_TYPE_KEYS,
  SERVICE_TYPES_BY_CATEGORY,
  SHOP_CATEGORIES,
  SHOP_CATEGORY_KEYS,
} from './catalog';

describe('업종·서비스 종류 목록 (schema-v1 2장, #48)', () => {
  it('업종은 미용실과 네일·속눈썹 2개다', () => {
    expect(SHOP_CATEGORY_KEYS).toEqual(['hair', 'nail_lash']);
    expect(SHOP_CATEGORIES.map((c) => c.label)).toEqual(['미용실', '네일·속눈썹']);
  });

  it('모든 업종에 서비스 종류 목록이 있다', () => {
    for (const key of SHOP_CATEGORY_KEYS) {
      expect(SERVICE_TYPES_BY_CATEGORY[key].length).toBeGreaterThan(0);
    }
  });

  it('서비스 종류 key는 11개이고 겹치지 않는다(DB check에 그대로 들어간다)', () => {
    expect(SERVICE_TYPE_KEYS).toHaveLength(11);
    expect(new Set(SERVICE_TYPE_KEYS).size).toBe(SERVICE_TYPE_KEYS.length);
  });
});
