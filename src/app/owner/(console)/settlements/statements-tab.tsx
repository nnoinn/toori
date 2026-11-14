// 원장님 정산 내역의 [정산서] 탭 (O15, S-501, 연결 #10·#20, #129 2장). 서버에서 그린다.
// 강규민님 getSettlementStatements 결과를 그대로 보여준다: 위 카드(이의제기로 보류 중·남은 패널티, 있을 때만),
// 지급일마다 한 장인 정산서 목록, 아래에 보류 중인 거래 줄. 화면에서 금액·지급일·보류를 계산하지 않는다.
// 기간은 지급일 기준이다. 이번 달을 볼 때는 다음 달 지급 예정 장도 같이 찾는다(statementQueryPeriod).

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { formatWon } from '@/lib/format';
import { SETTLEMENT_PAYOUT_WEEKDAY } from '@/server/policy';
import { getSettlementStatements } from '@/server/settlements/get-settlement-statements';
import type { SettlementStatementList } from '@/server/settlements/types';

import { WEEKDAY_LABELS } from '../settings/shop/shop-profile';
import { OutstandingPenaltyCard } from './settlement-cards';
import {
  HELD_NOTE,
  type SettlementPeriod,
  statementQueryPeriod,
  wonOrUnknown,
} from './settlement-format';
import { SettlementItemList } from './settlement-rows';
import { StatementList } from './statement-list';

const HELD_SECTION_ID = 'held-items';

export async function StatementsTab({
  shopId,
  period,
  thisMonth,
  openPayout,
}: {
  shopId: string;
  period: SettlementPeriod;
  thisMonth: string;
  /** 주소의 payout 값. 목록에 있는 지급일일 때만 그 장을 펼친다 */
  openPayout: string | undefined;
}) {
  const result = await getSettlementStatements({
    shopId,
    ...statementQueryPeriod(period, thisMonth),
  });
  if (!result.ok) {
    return (
      <Card>
        <ErrorState title="정산서를 불러오지 못했어요" description={result.error.message} />
      </Card>
    );
  }

  const list = result.data;
  const now = new Date(list.serverNow);
  const open =
    openPayout && list.statements.some((s) => s.payoutDate === openPayout) ? openPayout : null;
  const hasHeld = list.held.count > 0;
  // 남은 패널티는 0원보다 클 때만 보여준다(11/14 정민석, 거래 내역 탭과 같다)
  const hasPenalty = list.outstandingPenalty > 0;
  // 이번 달을 볼 때 넓혀 찾은 다음 달 지급 예정 장
  const hasNextMonth = list.statements.some((s) => s.payoutDate > period.to);

  return (
    <>
      {hasHeld || hasPenalty ? (
        <div className="grid gap-4 md:grid-cols-2">
          {hasHeld ? <HeldCard held={list.held} /> : null}
          {hasPenalty ? <OutstandingPenaltyCard amount={list.outstandingPenalty} /> : null}
        </div>
      ) : null}

      {list.statements.length > 0 ? (
        <div className="flex flex-col gap-2">
          {hasNextMonth ? (
            <p className="text-xs text-muted-foreground">
              이번 달을 볼 때는 다음 달 지급 예정 정산서도 같이 보여 드려요.
            </p>
          ) : null}
          <StatementList
            shopId={shopId}
            statements={list.statements}
            period={period}
            openPayout={open}
            now={now}
          />
        </div>
      ) : (
        <Card>
          <EmptyState
            title="이 기간에 지급하는 정산서가 없어요"
            description={`매주 ${WEEKDAY_LABELS[SETTLEMENT_PAYOUT_WEEKDAY]}요일(공휴일이면 다음 영업일)에 지급할 거래를 모아 정산서 한 장으로 보여 드려요`}
          />
        </Card>
      )}

      {hasHeld ? <HeldItemsSection held={list.held} now={now} /> : null}
    </>
  );
}

/** 이의제기로 보류 중인 거래 요약. 기간과 상관없이 지금 보류 중인 것 전부 */
function HeldCard({ held }: { held: SettlementStatementList['held'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>이의제기로 보류 중</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-bold text-warning-foreground">{held.count}건</p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">기준 금액</dt>
          <dd className="text-right tabular-nums">{formatWon(held.baseAmount)}</dd>
          <dt className="text-muted-foreground">정산액</dt>
          <dd className="text-right font-semibold tabular-nums">
            {wonOrUnknown(held.payoutAmount)}
          </dd>
        </dl>
        <p className="text-xs text-muted-foreground">{HELD_NOTE}</p>
        <a href={`#${HELD_SECTION_ID}`} className="text-sm font-medium underline">
          보류 중인 거래 보기
        </a>
      </CardContent>
    </Card>
  );
}

/** 보류 중인 거래 줄. 거래 내역(S-502)과 같은 모양이고, 펼치면 이의제기 접수일이 보인다 */
function HeldItemsSection({ held, now }: { held: SettlementStatementList['held']; now: Date }) {
  return (
    <section id={HELD_SECTION_ID} className="flex scroll-mt-4 flex-col gap-2">
      <h2 className="font-semibold">이의제기로 보류 중인 거래 {held.count}건</h2>
      <p className="text-sm text-muted-foreground">{HELD_NOTE}</p>
      <SettlementItemList items={held.items} now={now} />
    </section>
  );
}
