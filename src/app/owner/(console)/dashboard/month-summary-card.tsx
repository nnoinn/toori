// 대시보드 맨 위 "이번 달 투리" 카드(S-504 월별 통계). 서버에서 그리는 부품이라 상태가 없다.
// 살린 시간(방문 완료 시술 시간 합)과 추가 수입(수수료를 뗀 정산액 합). 계산과 문구는 month-summary.ts

import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { monthLabel, settlementsHref } from '../settlements/settlement-format';
import {
  type MonthPayout,
  monthPayoutCaption,
  monthPayoutText,
  monthSummaryNotes,
  type MonthVisitTime,
  savedTimeText,
} from './month-summary';

export function MonthSummaryCard({
  month,
  visit,
  payout,
}: {
  /** 'YYYY-MM'(한국 달) */
  month: string;
  visit: MonthVisitTime;
  payout: MonthPayout;
}) {
  const notes = monthSummaryNotes(payout);
  return (
    <Card>
      <CardHeader>
        <CardTitle>이번 달 투리</CardTitle>
        <p className="text-xs text-muted-foreground">
          {monthLabel(month)} · 방문·노쇼 처리일이나 취소일 기준
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">살린 시간</dt>
            <dd className="text-2xl font-bold tabular-nums">{savedTimeText(visit.minutes)}</dd>
            <dd className="text-xs text-muted-foreground">방문 완료 {visit.visitCount}건</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">추가 수입</dt>
            <dd className="text-2xl font-bold tabular-nums">{monthPayoutText(payout)}</dd>
            <dd className="text-xs text-muted-foreground">{monthPayoutCaption(payout)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-end justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">{notes.join(' ')}</p>
          <Link
            href={settlementsHref({ month }, { view: 'items' })}
            className="text-sm font-medium underline"
          >
            정산 내역 보기
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
