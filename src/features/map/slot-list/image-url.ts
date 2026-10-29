// 샵 이미지 주소 (J4 목록 카드, J7 상세). 이미지는 Supabase Storage 공개 버킷 shop-images에 있고 DB에는 경로만 있다.
// next.config.ts가 우리 Supabase 주소의 공개 이미지만 next/image로 허용한다.

/** 공개 버킷 이름(src/db/schema/shops.ts shop_images.storage_path 주석) */
export const SHOP_IMAGE_BUCKET = 'shop-images';

/** 버킷 안 경로 → 공개 주소. 경로가 없거나 Supabase 주소 설정이 없으면 null(카드는 빈 이미지 칸) */
export function shopImageUrl(
  storagePath: string | null,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!storagePath || !supabaseUrl) return null;
  const path = storagePath.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${SHOP_IMAGE_BUCKET}/${path}`;
}
