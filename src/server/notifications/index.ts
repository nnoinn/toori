// 알림 (연결 #12, #131). 서버 코드용. 예: import { readInterestAreas } from '@/server/notifications';
// 화면('use client')에서 쓰는 것은 여기 말고 파일에서 직접 가져온다(이 파일은 server-only 파일을 같이 내보내서 화면에서 가져올 수 없다).
// - 푸시 구독 저장·지우기·조회(savePushSubscription, removePushSubscription, removeDevicePushSubscriptions, getPushSubscriptionStatus): '@/server/notifications/subscriptions'
// - 관심 동네(getInterestAreas, setInterestAreas): '@/server/notifications/interest-areas'
// 이벤트 알림은 다른 서버 함수가 '@/server/notifications/alerts'에서 가져온다

export { type DigestSummary, sendSlotDigest } from './digest';
export { NOTIFICATION_ERRORS } from './errors';
export { type NewNotification, notify } from './notify';
export { readInterestAreas, replaceInterestAreas } from './interest-store';
export { type ReminderSummary, sendDueReminders } from './reminders';
export {
  deleteDevicePushSubscriptions,
  deletePushSubscription,
  hasPushSubscription,
  type NewPushSubscription,
  upsertPushSubscription,
} from './subscription-store';
