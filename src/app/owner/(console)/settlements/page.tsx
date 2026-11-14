import { Suspense } from 'react';
import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { ensureOwnerPage } from '@/server/auth';
import { getSettlementItems } from '@/server/settlements/get-settlement-items';

import { OwnerPage } from '../owner-page';
import { selectPayoutAccount } from '../settings/payout/payout-store';
import { PeriodPicker } from './period-picker';
import { SettlementSummaryCards } from './settlement-cards';
import {
  currentMonth,
  resolveSettlementPeriod,
  resolveSettlementView,
  type SettlementPeriod,
} from './settlement-format';
import { SettlementItemList } from './settlement-rows';
import { SettlementTabs } from './settlement-tabs';
import { StatementsTab } from './statements-tab';

export const metadata: Metadata = { title: '정산 내역' };

const PAGE_PATH = '/owner/settlements';

type SearchParams = Promise<{
  view?: SearchValue;
  month?: SearchValue;
  from?: SearchValue;
  to?: SearchValue;
  payout?: SearchValue;
}>;

// 원장님 정산 내역 (O15, 연결 #10·#20, #129). 탭 두 개(11/14 정민석):
// - [정산서] S-501: 지급일마다 한 장. 주소 /owner/settlements?month=YYYY-MM(또는 ?from=&to=)&payout=펼친 지급일
// - [거래 내역] S-502: 거래 하나하나. 주소 /owner/settlements?view=items&month=YYYY-MM(또는 ?from=&to=)
// 강규민님 함수 결과를 그대로 보여주고 화면에서 금액을 계산하지 않는다. PC 기준
export default function OwnerSettlementsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerPage
      title="정산 내역"
      width="wide"
      description="정산서는 지급일마다 받을 돈을 한 장으로 모았어요. 거래 내역에서는 거래 하나하나를 볼 수 있어요. 줄을 누르면 금액이 어떻게 나왔는지 보여요."
    >
      <Suspense fallback={<LoadingCards count={3} />}>
        <SettlementsContent searchParams={searchParams} />
      </Suspense>
    </OwnerPage>
  );
}

async function SettlementsContent({ searchParams }: { searchParams: SearchParams }) {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const params = await searchParams;
  const now = await getRequestNow();
  const view = resolveSettlementView(firstParam(params.view));
  const period = resolveSettlementPeriod(
    {
      month: firstParam(params.month),
      from: firstParam(params.from),
      to: firstParam(params.to),
    },
    now,
  );
  const thisMonth = currentMonth(now);

  return (
    <div className="flex flex-col gap-4">
      <SettlementTabs view={view} period={period} />
      <PeriodPicker view={view} period={period} thisMonth={thisMonth} />
      {view === 'items' ? (
        <ItemsTab shopId={auth.shopId} period={period} />
      ) : (
        <StatementsTab
          shopId={auth.shopId}
          period={period}
          thisMonth={thisMonth}
          openPayout={firstParam(params.payout)}
        />
      )}
    </div>
  );
}

/** [거래 내역] 탭 (S-502). 기간은 방문·노쇼 처리나 취소한 한국 날짜 기준 */
async function ItemsTab({ shopId, period }: { shopId: string; period: SettlementPeriod }) {
  const [result, account] = await Promise.all([
    getSettlementItems({ shopId, from: period.from, to: period.to }),
    // 받는 계좌는 지금 등록된 계좌(은행·끝 4자리, 11/13 nnoinn). 계좌 없이 만든 원장님이면 null
    selectPayoutAccount(getDb(), shopId),
  ]);

  if (!result.ok) {
    return (
      <Card>
        <ErrorState title="정산 내역을 불러오지 못했어요" description={result.error.message} />
      </Card>
    );
  }
  return (
    <>
      <SettlementSummaryCards
        list={result.data}
        from={period.from}
        to={period.to}
        account={account}
      />
      {result.data.items.length > 0 ? (
        <SettlementItemList items={result.data.items} now={new Date(result.data.serverNow)} />
      ) : (
        <Card>
          <EmptyState
            title="이 기간에 정산할 거래가 없어요"
            description="방문·노쇼를 처리하거나 취소한 예약이 여기에 나와요"
          />
        </Card>
      )}
    </>
  );
}
