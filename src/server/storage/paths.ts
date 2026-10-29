// Storage 저장 경로 (#47 6장). 서버에서만 부른다. 경로는 화면이 아니라 서버가 정하고, DB에 저장하기 전에 그 샵(또는 본인) 폴더인지 확인한다.
//   샵 사진   shop-images/{shopId}/{무작위}.{jpg|png|webp}
//   등록증    business-docs/users/{userId}/{무작위}.{jpg|png|webp|pdf}  가입 중(샵이 아직 없음)
//             business-docs/shops/{shopId}/…                           반려 뒤 다시 낼 때

import 'server-only';

import { fail, ok, type Result } from '@/lib/result';
import {
  type BusinessDocContentType,
  UPLOAD_MAX_BYTES,
  type UploadContentType,
} from '@/server/policy';

export const STORAGE_BUCKETS = {
  shopImages: 'shop-images',
  businessDocs: 'business-docs',
} as const;

export const STORAGE_ERRORS = {
  INVALID_FILE_TYPE: 'JPG·PNG·WEBP 사진만 올릴 수 있어요',
  /** 사업자등록증 형식이 틀렸을 때의 문구(코드는 INVALID_FILE_TYPE) */
  INVALID_DOC_FILE_TYPE: 'JPG·PNG·WEBP 사진이나 PDF만 올릴 수 있어요',
  FILE_TOO_LARGE: `${UPLOAD_MAX_BYTES / 1_000_000}MB 이하 파일만 올릴 수 있어요`,
  INVALID_PATH: '올린 파일을 다시 올려 주세요',
  UPLOAD_UNAVAILABLE: '파일을 올릴 준비를 하지 못했어요. 잠시 후 다시 시도해 주세요',
  DOC_NOT_FOUND: '사업자등록증 파일을 찾을 수 없어요',
} as const;

const EXTENSIONS: Record<BusinessDocContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** 서버가 만드는 파일 이름: 무작위 uuid + 확장자. 이 모양이 아니면 경로 확인에서 거절한다(../ 등) */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SHOP_IMAGE_NAME = new RegExp(`^${UUID}\\.(jpg|png|webp)$`);
const BUSINESS_DOC_NAME = new RegExp(`^${UUID}\\.(jpg|png|webp|pdf)$`);

export type BusinessDocOwner = { userId: string } | { shopId: string };

function fileName(contentType: BusinessDocContentType): string {
  return `${crypto.randomUUID()}.${EXTENSIONS[contentType]}`;
}

function businessDocFolder(owner: BusinessDocOwner): string {
  return 'shopId' in owner ? `shops/${owner.shopId}` : `users/${owner.userId}`;
}

/** 새 샵 사진 경로(shop-images 버킷 안) */
export function newShopImagePath(shopId: string, contentType: UploadContentType): string {
  return `${shopId}/${fileName(contentType)}`;
}

/** 새 사업자등록증 경로(business-docs 버킷 안) */
export function newBusinessDocPath(
  owner: BusinessDocOwner,
  contentType: BusinessDocContentType,
): string {
  return `${businessDocFolder(owner)}/${fileName(contentType)}`;
}

function isInFolder(folder: string, path: string, name: RegExp): boolean {
  return path.startsWith(`${folder}/`) && name.test(path.slice(folder.length + 1));
}

/**
 * 샵 사진 경로가 그 샵 폴더의 것인지(서버가 만든 모양인지). 사진 정보를 DB에 저장하기 전에 부른다(정민석 O6).
 * requireShopOwner 다음에 부른다
 */
export async function assertShopImagePath(shopId: string, path: string): Promise<Result<null>> {
  return isInFolder(shopId, path, SHOP_IMAGE_NAME)
    ? ok(null)
    : fail('INVALID_PATH', STORAGE_ERRORS.INVALID_PATH);
}

/**
 * 사업자등록증 경로가 본인(가입 중) 또는 그 샵 폴더의 것인지. 원장님 가입(createOwnerAccount)과
 * 반려 뒤 사업자 정보 저장(정민석) 때 DB에 저장하기 전에 부른다
 */
export async function assertBusinessDocPath(
  owner: BusinessDocOwner,
  path: string,
): Promise<Result<null>> {
  return isInFolder(businessDocFolder(owner), path, BUSINESS_DOC_NAME)
    ? ok(null)
    : fail('INVALID_PATH', STORAGE_ERRORS.INVALID_PATH);
}
