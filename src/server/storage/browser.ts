// Storage 화면 도우미 (#47 6장). 화면('use client')에서 쓴다. 서버 전용 값은 쓰지 않는다.

import { createBrowserClient } from '@supabase/ssr';

import { fail, ok, type Result } from '@/lib/result';

type Bucket = 'shop-images' | 'business-docs';

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL이 없어요. .env.local을 확인해 주세요.');
  return url;
}

/**
 * 서버에서 받은 서명된 업로드 주소로 파일을 Storage에 직접 올린다.
 * 예: const signed = await createShopImageUploadUrl({ shopId, contentType: file.type, size: file.size });
 *     if (signed.ok) await uploadToSignedUrl({ bucket: 'shop-images', ...signed.data, file });
 */
export async function uploadToSignedUrl(input: {
  bucket: Bucket;
  path: string;
  token: string;
  file: Blob;
}): Promise<Result<{ path: string }>> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key)
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 없어요. .env.local을 확인해 주세요.');
  const { error } = await createBrowserClient(supabaseUrl(), key)
    .storage.from(input.bucket)
    .uploadToSignedUrl(input.path, input.token, input.file, { contentType: input.file.type });
  if (error) return fail('UPLOAD_FAILED', '파일을 올리지 못했어요. 다시 시도해 주세요');
  return ok({ path: input.path });
}

/** 샵 사진(공개 버킷)의 주소. next/image의 src에 바로 넣는다(next.config.ts에서 허용한 주소) */
export function shopImageUrl(path: string): string {
  return `${supabaseUrl()}/storage/v1/object/public/shop-images/${path}`;
}
