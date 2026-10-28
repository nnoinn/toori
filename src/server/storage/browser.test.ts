// 화면용 Storage 도우미. 사진 주소가 next.config.ts에서 허용한 공개 버킷 주소 모양인지 확인한다.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { shopImageUrl } from './browser';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('shopImageUrl', () => {
  it('공개 버킷 shop-images의 주소를 만든다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    expect(shopImageUrl('shop-1/photo.jpg')).toBe(
      'https://abc.supabase.co/storage/v1/object/public/shop-images/shop-1/photo.jpg',
    );
  });
});
