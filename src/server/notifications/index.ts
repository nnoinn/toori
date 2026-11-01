// 알림 (연결 #12, #131). 서버 코드용. 예: import { readInterestAreas } from '@/server/notifications';
// 화면('use client')에서 쓰는 것은 여기 말고 파일에서 직접 가져온다(이 파일은 server-only 파일을 같이 내보내서 화면에서 가져올 수 없다).
// - 푸시 구독 저장·지우기(savePushSubscription, removePushSubscription): '@/server/notifications/subscriptions'
// - 관심 동네(getInterestAreas, setInterestAreas): '@/server/notifications/interest-areas'

export { NOTIFICATION_ERRORS } from './errors';
export { readInterestAreas, replaceInterestAreas } from './interest-store';
export {
  deletePushSubscription,
  type NewPushSubscription,
  upsertPushSubscription,
} from './subscription-store';
