// 사업자등록증 올리기 (O7 ①, #23 D3, #47 6장). 브라우저('use client')에서만 쓴다.
// 사진은 O6 사진과 같이 줄여서(긴 변 1600px JPG, 위치 정보 지움) 올리고, PDF는 그대로 올린다.
// 강규민님 업로드 주소(createBusinessDocUploadUrl)로 비공개 버킷에 직접 올리고, 경로를 돌려준다.
// 가입 중이면 business-docs/users/{내 id}/, 승인 전 매장 설정(O7 ②)에서 다시 올리면 shopId를 넘겨 business-docs/shops/{shopId}/에 올린다.

import { BUSINESS_DOC_ALLOWED_TYPES, UPLOAD_MAX_BYTES } from '@/server/policy';
import { uploadToSignedUrl } from '@/server/storage/browser';
import { createBusinessDocUploadUrl } from '@/server/storage/upload';

import { isAllowedImageType, resizeImage } from '../(console)/settings/images/resize-image';

export const BUSINESS_DOC_ACCEPT = BUSINESS_DOC_ALLOWED_TYPES.join(',');

/** 등록증 파일을 올린다. 성공하면 경로, 실패하면 보여줄 문구. shopId는 이미 샵이 있을 때(매장 설정)만 넘긴다 */
export async function uploadBusinessDoc(
  file: File,
  shopId?: string,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  let blob: Blob;
  if (file.type === 'application/pdf') {
    blob = file;
  } else if (isAllowedImageType(file.type)) {
    const resized = await resizeImage(file);
    if (!resized) return { ok: false, message: '사진을 열 수 없어요. 다른 파일을 골라 주세요' };
    blob = resized;
  } else {
    return { ok: false, message: 'JPG·PNG·WEBP 사진이나 PDF만 올릴 수 있어요' };
  }
  if (blob.size > UPLOAD_MAX_BYTES) {
    return { ok: false, message: `${UPLOAD_MAX_BYTES / 1_000_000}MB 이하 파일만 올릴 수 있어요` };
  }

  const signed = await createBusinessDocUploadUrl({
    ...(shopId ? { shopId } : {}),
    contentType: blob.type,
    size: blob.size,
  });
  if (!signed.ok) return { ok: false, message: signed.error.message };
  const uploaded = await uploadToSignedUrl({
    bucket: 'business-docs',
    path: signed.data.path,
    token: signed.data.token,
    file: blob,
  });
  if (!uploaded.ok) return { ok: false, message: uploaded.error.message };
  return { ok: true, path: signed.data.path };
}
