import { describe, expect, it } from 'vitest';

import { fitLongSide, isAllowedImageType } from './resize-image';
import { SHOP_IMAGE_LIMITS, shopImageInputSchema, validateShopLinks } from './shop-images';

describe('외부 링크 검사 (S-105)', () => {
  it('둘 다 비워도 된다', () => {
    expect(validateShopLinks({ instagramUrl: '', naverPlaceUrl: '  ' })).toEqual({
      ok: true,
      data: { instagramUrl: null, naverPlaceUrl: null },
    });
    expect(validateShopLinks({})).toEqual({
      ok: true,
      data: { instagramUrl: null, naverPlaceUrl: null },
    });
  });

  it.each([
    ['instagramUrl', 'https://instagram.com/toori_shop'],
    ['instagramUrl', 'https://www.instagram.com/toori_shop/'],
    ['naverPlaceUrl', 'https://naver.me/abcd1234'],
    ['naverPlaceUrl', 'https://m.place.naver.com/hairshop/123/home'],
    ['naverPlaceUrl', 'https://map.naver.com/p/entry/place/123'],
  ])('%s에 %s는 받는다', (field, url) => {
    const result = validateShopLinks({ [field]: ` ${url} ` });
    expect(result.ok && result.data[field as 'instagramUrl' | 'naverPlaceUrl']).toBe(url);
  });

  it.each([
    ['http(https 아님)', 'instagramUrl', 'http://instagram.com/toori'],
    ['https 없이', 'instagramUrl', 'instagram.com/toori'],
    ['다른 사이트', 'instagramUrl', 'https://example.com/toori'],
    ['비슷한 가짜 도메인', 'instagramUrl', 'https://instagram.com.evil.example/toori'],
    ['칸이 바뀜', 'naverPlaceUrl', 'https://instagram.com/toori'],
    ['스크립트 주소', 'naverPlaceUrl', 'javascript:alert(1)'],
    ['너무 김', 'naverPlaceUrl', `https://naver.me/${'a'.repeat(300)}`],
  ])('%s → 칸별 오류', (_, field, url) => {
    const result = validateShopLinks({ [field]: url });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors[field as 'instagramUrl' | 'naverPlaceUrl']).toEqual(
      expect.any(String),
    );
  });
});

describe('사진 정보 입력 (S-104)', () => {
  it('대표·스타일만 받는다', () => {
    expect(shopImageInputSchema.safeParse({ kind: 'main', path: 'a/b.jpg' }).success).toBe(true);
    expect(shopImageInputSchema.safeParse({ kind: 'style', path: 'a/b.jpg' }).success).toBe(true);
    expect(shopImageInputSchema.safeParse({ kind: 'logo', path: 'a/b.jpg' }).success).toBe(false);
    expect(shopImageInputSchema.safeParse({ kind: 'main', path: '' }).success).toBe(false);
  });
});

describe('사진 줄이기 크기 (D6)', () => {
  const long = SHOP_IMAGE_LIMITS.longSide;

  it('긴 변을 기준에 맞추고 비율은 그대로', () => {
    expect(fitLongSide(4000, 3000)).toEqual({ width: long, height: 1200 });
    expect(fitLongSide(3000, 4000)).toEqual({ width: 1200, height: long });
  });

  it('이미 작으면 키우지 않는다', () => {
    expect(fitLongSide(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('JPG·PNG·WEBP만 올릴 수 있다', () => {
    expect(isAllowedImageType('image/jpeg')).toBe(true);
    expect(isAllowedImageType('image/heic')).toBe(false);
    expect(isAllowedImageType('application/pdf')).toBe(false);
  });
});
