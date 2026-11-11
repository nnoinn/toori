import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OwnerSignOutButton } from '@/components/ui/owner-nav';
import { LoadingCards } from '@/components/ui/state';
import { PushSwitch } from '@/features/push/push-switch';
import { OWNER_IOS_INSTALL_STEPS, OWNER_PUSH_DESCRIPTION } from '@/features/push/push-texts';
import { KAKAO_CHANNEL_URL, SITE_NAME } from '@/lib/site';
import { ensureOwnerPage, getCurrentAccount } from '@/server/auth';

import { OwnerPage } from '../owner-page';

export const metadata: Metadata = { title: '내 계정' };

const PAGE_PATH = '/owner/account';

// 원장님 내 계정 (#307, O12 원장님 알림 받기 S-404). 고객 화면의 '내 정보'처럼 계정과 설정을 한곳에서 다룬다.
// 로그인 계정, 이 기기에서 알림 받기, 고객센터(카카오톡 채널), 로그아웃.
// 계정 바꾸기 버튼은 두지 않는다(11/10 nnoinn): 같은 메일이어도 고객·원장님 계정은 별개라서,
// 다른 계정으로 가려면 로그아웃한 뒤 로그인 화면에서 고른다. PC 기준
export default function OwnerAccountPage() {
  return (
    <OwnerPage
      title="내 계정"
      width="narrow"
      description="로그인한 계정과 이 기기의 알림을 관리해요."
    >
      <Suspense fallback={<LoadingCards count={3} />}>
        <AccountContent />
      </Suspense>
    </OwnerPage>
  );
}

/** 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장). 원장님 가입 전이면 /owner/join 으로 보낸다 */
async function AccountContent() {
  await ensureOwnerPage(PAGE_PATH);
  const account = await getCurrentAccount();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>로그인 계정</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="font-medium">{account?.email}</p>
          <p className="text-muted-foreground">
            원장님 계정으로 들어와 있어요. 같은 메일의 고객 계정은 따로예요. 고객으로 쓰려면
            로그아웃한 뒤 로그인 화면에서 고객을 골라 주세요.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>알림</CardTitle>
        </CardHeader>
        <CardContent>
          <PushSwitch description={OWNER_PUSH_DESCRIPTION} installSteps={OWNER_IOS_INSTALL_STEPS} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>고객센터</CardTitle>
          <p className="text-sm text-muted-foreground">
            정산·이의제기·계정 문제는 {SITE_NAME} 카카오톡 채널로 문의해 주세요.
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href={KAKAO_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
              카카오톡 채널 열기
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </CardContent>
      </Card>

      <OwnerSignOutButton variant="page" />
    </div>
  );
}
