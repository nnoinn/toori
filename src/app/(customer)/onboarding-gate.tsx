import { getDb } from '@/db';
import { getCurrentAccount } from '@/server/auth';

import { OnboardingAuto } from './onboarding-auto';
import { selectOnboardingSeen } from './onboarding-store';

/**
 * 고객 계정으로 들어왔고 아직 첫 로그인 안내(C-107)를 보지 않았으면 안내 창을 연다. 로그인하지 않았거나 원장님 모드면 아무것도 없다.
 * 로그인 쿠키를 읽으므로 화면 틀에서 <Suspense> 안에 둔다(Cache Components)
 */
export async function OnboardingGate() {
  const account = await getCurrentAccount();
  if (account?.mode !== 'customer' || !account.customerId) return null;
  if (await selectOnboardingSeen(getDb(), account.customerId)) return null;
  return <OnboardingAuto />;
}
