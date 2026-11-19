import { Suspense } from 'react';
import type { Metadata } from 'next';

import { AccountHistoryList } from '@/components/ui/account-history-list';
import {
  type AccountHistorySearch,
  readAccountHistorySearch,
} from '@/components/ui/account-history-query';
import { LoadingCards } from '@/components/ui/state';
import { getRequestNow } from '@/lib/request-time';
import { kstDateKey } from '@/lib/time';
import { getOwnerAccountHistory } from '@/server/accounts/history';
import { ensureOwnerPage } from '@/server/auth';

import { OwnerPage } from '../../owner-page';

export const metadata: Metadata = { title: '계정 이력' };

const PAGE_PATH = '/owner/account/history';

type SearchParams = Promise<AccountHistorySearch>;

// 원장님 계정 이력 (#374, 11/13 nnoinn, AUTH-13). 주소: /owner/account/history?from=…&to=…&kind=…&page=…
// 지금 들어온 원장님 계정(그 샵)에서 있었던 일을 최신 순으로 한 쪽 20줄씩 보여 준다(getOwnerAccountHistory).
// 자주 쓰는 화면이 아니라서 왼쪽 메뉴에는 두지 않고 내 계정에서 들어온다. 운영자 [이력 보기]와 같은 공통 목록·문구를 쓴다.
// 새 표 없이 지금 남는 기록을 모은 것이라 기록이 남지 않는 일(메뉴·영업시간·사진 수정)은 보이지 않는다. PC 기준
export default function OwnerAccountHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerPage
      title="계정 이력"
      width="wide"
      backHref="/owner/account"
      description="내 샵에서 있었던 일을 최신 순으로 보여줘요. 예약이 있는 줄을 누르면 예약 상세로 가요."
    >
      <Suspense fallback={<LoadingCards count={1} />}>
        <HistoryContent searchParams={searchParams} />
      </Suspense>
    </OwnerPage>
  );
}

/** 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장). 원장님 가입 전이면 /owner/join 으로 보낸다 */
async function HistoryContent({ searchParams }: { searchParams: SearchParams }) {
  await ensureOwnerPage(PAGE_PATH);
  const query = readAccountHistorySearch(await searchParams, 'owner');
  const [result, now] = await Promise.all([getOwnerAccountHistory(query), getRequestNow()]);
  return (
    <AccountHistoryList
      result={result}
      accountType="owner"
      audience="owner"
      query={query}
      path={PAGE_PATH}
      today={kstDateKey(now)}
    />
  );
}
