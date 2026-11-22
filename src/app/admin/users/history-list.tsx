// 운영자 [이력 보기] 목록(#374, AUTH-13). 고객 이력·원장님 이력 화면이 같이 쓴다.
// 이력은 getAdminAccountHistory(볼 때마다 열람 기록을 남긴다)로 읽고, 화면은 원장님 내 계정 이력과 같은 공통 목록
// AccountHistoryList(#496)로 그린다(11/22 nnoinn: 같은 화면을 한 벌의 코드로). 기간·종류 고르기와 쪽 번호도 공통 목록에 있다.

import { AccountHistoryList } from '@/components/ui/account-history-list';
import { getRequestNow } from '@/lib/request-time';
import { kstDateKey } from '@/lib/time';
import { getAdminAccountHistory } from '@/server/accounts/history';
import type { AccountHistoryQuery, AccountType } from '@/server/accounts/history-types';

export async function AdminHistoryList({
  accountType,
  accountId,
  query,
  path,
}: {
  accountType: AccountType;
  accountId: string;
  query: AccountHistoryQuery;
  /** 이 화면 주소(쪽 번호·기간 링크에 쓴다) */
  path: string;
}) {
  const [result, now] = await Promise.all([
    getAdminAccountHistory({ accountType, accountId, ...query }),
    getRequestNow(),
  ]);
  return (
    <AccountHistoryList
      result={result}
      accountType={accountType}
      audience="admin"
      query={query}
      path={path}
      today={kstDateKey(now)}
    />
  );
}
