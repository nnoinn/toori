// 사진 줄이기 (O6, #23 D6). 브라우저('use client')에서만 쓴다. 새 패키지 없이 브라우저 기본 기능(canvas)으로 한다.
// 긴 변을 SHOP_IMAGE_LIMITS.longSide 이하로 줄이고 JPG로 다시 저장한다. 다시 저장하면서 사진 속 위치 정보(EXIF)도 빠진다.

import { UPLOAD_ALLOWED_TYPES } from '@/server/policy';

import { SHOP_IMAGE_LIMITS } from './shop-images';

const OUTPUT_TYPE = 'image/jpeg';
const OUTPUT_QUALITY = 0.85;

/** 줄일 크기. 긴 변이 기준보다 작으면 그대로 */
export function fitLongSide(
  width: number,
  height: number,
  longSide: number = SHOP_IMAGE_LIMITS.longSide,
): { width: number; height: number } {
  const scale = Math.min(1, longSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function isAllowedImageType(type: string): boolean {
  return (UPLOAD_ALLOWED_TYPES as readonly string[]).includes(type);
}

/** 사진을 줄여 JPG로 돌려준다. 열 수 없는 파일이면 null */
export async function resizeImage(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    // 휴대폰 사진의 회전 정보(EXIF)를 반영해서 연다
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const size = fitLongSide(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return null;
  }
  // 투명한 PNG는 JPG로 바꾸면 검게 나오므로 흰 바탕을 깐다
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, OUTPUT_TYPE, OUTPUT_QUALITY));
}
