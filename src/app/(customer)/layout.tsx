import { Suspense } from 'react';

import { NotificationToaster } from '@/components/ui/notification-toast';
import { PushRestorer } from '@/features/push/push-restorer';

import { NOTIFICATIONS_PATH } from './(tabs)/notifications/notification-rules';
import { ConsentNoticeGate } from './consent-notice-gate';

// 고객 화면 공통 틀. 화면은 정찬형 담당, 틀은 현동훈 담당(공통 UI).
// 폰은 최대 폭 480px 한 줄, PC(md 이상, 768px)는 화면 전체를 쓴다(10/25 결정, 원장님 화면과 같은 기준).
// 아래 메뉴가 있는 화면은 (tabs)/, 메뉴 없이 한 가지 일을 끝내는 화면은 (focus)/에 둔다(#71).
// 괄호 폴더는 주소에 나타나지 않는다. 두 묶음에 같은 주소를 두지 않는다(겹치면 빌드 오류).
// ConsentNoticeGate: 가입 직후 처음 보이는 고객 화면에 광고성 동의 처리 결과를 한 번 보여준다(정찬형, #115).
// NotificationToaster: 투리를 보고 있을 때 새 알림을 화면 위 가운데에 5초 동안 보여준다(화면 안내, #371). 고객 모드일 때만 확인한다.
// PushRestorer: 로그아웃 뒤 같은 사람이 다시 로그인하면 이 기기에서 켜 두었던 푸시 알림을 되살린다(11/23).
export default function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col md:max-w-none">
      {children}
      <NotificationToaster account="customer" inboxHref={NOTIFICATIONS_PATH} />
      <PushRestorer />
      <Suspense fallback={null}>
        <ConsentNoticeGate />
      </Suspense>
    </div>
  );
}
