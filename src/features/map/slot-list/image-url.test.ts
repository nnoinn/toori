import { describe, expect, it } from 'vitest';

import { shopImageUrl } from './image-url';

const SUPABASE = 'https://example.supabase.co';

describe('샵 이미지 주소', () => {
  it('공개 버킷 경로를 공개 주소로 바꾼다', () => {
    expect(shopImageUrl('shop-1/main.jpg', SUPABASE)).toBe(
      'https://example.supabase.co/storage/v1/object/public/shop-images/shop-1/main.jpg',
    );
  });

  it('경로의 한글·공백은 주소에 맞게 바꾸고, 앞뒤 빗금은 하나로 맞춘다', () => {
    expect(shopImageUrl('/샵 1/대표.jpg', `${SUPABASE}/`)).toBe(
      'https://example.supabase.co/storage/v1/object/public/shop-images/%EC%83%B5%201/%EB%8C%80%ED%91%9C.jpg',
    );
  });

  it('경로나 Supabase 주소가 없으면 null(빈 이미지 칸)', () => {
    expect(shopImageUrl(null, SUPABASE)).toBeNull();
    expect(shopImageUrl('a.jpg', '')).toBeNull();
    expect(shopImageUrl('a.jpg', undefined)).toBeNull();
  });
});
