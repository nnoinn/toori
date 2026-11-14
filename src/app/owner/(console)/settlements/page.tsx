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
import { currentMonth, resolveSettlementPeriod } from './settlement-format';
import { SettlementItemList } from './settlement-rows';

export const metadata: Metadata = { title: '정산 내역' };

const PAGE_PATH = '/owner/settlements';

type SearchParams = Promise<{ month?: SearchValue; from?: SearchValue; to?: SearchValue }>;

// 원장님 정산 내역 (O15, S-502 거래별 상세, 연결 #10·#20, #129). 주소: /owner/settlements?month=YYYY-MM 또는 ?from=&to=
// 강규민님 getSettlementItems 결과(거래 줄·합계·다음 지급·남은 패널티)를 그대로 보여준다. 화면에서 금액을 계산하지 않는다.
// 정산서(S-501, 지급일 하나에 한 장)는 정산서 함수(#129 2장)가 들어오면 이 화면에 더한다. PC 기준
export default function OwnerSettlementsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerPage
      title="정산 내역"
      width="wide"
      description="방문·노쇼를 처리하거나 취소한 날짜로 거래를 찾아요. 줄을 누르면 금액이 어떻게 나왔는지 볼 수 있어요."
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
  const period = resolveSettlementPeriod(
    {
      month: firstParam(params.month),
      from: firstParam(params.from),
      to: firstParam(params.to),
    },
    now,
  );
  const [result, account] = await Promise.all([
    getSettlementItems({ shopId: auth.shopId, from: period.from, to: period.to }),
    // 받는 계좌는 지금 등록된 계좌(은행·끝 4자리, 11/13 nnoinn). 계좌 없이 만든 원장님이면 null
    selectPayoutAccount(getDb(), auth.shopId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PeriodPicker period={period} thisMonth={currentMonth(now)} />
      {result.ok ? (
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
      ) : (
        <Card>
          <ErrorState title="정산 내역을 불러오지 못했어요" description={result.error.message} />
        </Card>
      )}
    </div>
  );
}
