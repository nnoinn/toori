// 샵 사진·사업자등록증 저장소 (#47 6장). 서버에서만 쓴다. 예: import { assertShopImagePath } from '@/server/storage';
// 화면('use client')에서도 쓰는 것은 여기 말고 파일에서 직접 가져온다(이 파일은 server-only 파일을 같이 내보내서 화면에서 가져올 수 없다).
// - 업로드 주소·등록증 열람(createShopImageUploadUrl, createBusinessDocUploadUrl, getBusinessDocUrl): '@/server/storage/upload'
// - 브라우저 업로드·사진 주소(uploadToSignedUrl, shopImageUrl): '@/server/storage/browser'

export {
  assertBusinessDocPath,
  assertShopImagePath,
  type BusinessDocOwner,
  STORAGE_BUCKETS,
  STORAGE_ERRORS,
} from './paths';
