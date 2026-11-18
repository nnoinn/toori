// 입점 승인 상태 (연결 #13, Issue #50)와 새 매물 게시 멈춤(#373 ④). 서버에서만 쓴다.
// 예: import { assertShopApproved, assertShopCanPublish, customerVisibleShop } from '@/server/shops';
// 화면('use client')에서도 쓰는 것은 여기 말고 파일에서 직접 가져온다(이 파일은 server-only 파일을 같이 내보내서 화면에서 가져올 수 없다).
// - 상태 문구 SHOP_STATUS_LABELS: '@/server/shops/status'
// - getShopReviewStatus, resubmitShopForReview, approveShop, rejectShop: '@/server/shops/review'

export { assertShopCanPublish, readPublishPause, readPublishPausedAt } from './publish-pause';
export { PUBLISH_PAUSED_MESSAGE } from './publish-pause-message';
export { assertShopApproved, SHOP_REVIEW_ERRORS, type ShopReviewStatus } from './review-store';
export { SHOP_STATUS_LABELS, type ShopStatus } from './status';
export { customerVisibleShop } from './visibility';
