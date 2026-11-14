// 원장님 정산 내역 기간 고르기 (O15, S-502). 서버에서 그리는 부품이라 상태가 없다(주소 값으로 기간을 바꾼다).
// 처음에는 이번 달. [◀ 2026년 11월 ▶]로 달을 옮기고, 시작일·끝일 칸으로 원하는 기간(최대 1년)도 본다(11/14 정민석).
// 기간은 방문·노쇼 처리나 취소한 한국 날짜 기준이다. 맞는 기간인지(거꾸로·1년 넘음)는 서버 함수가 보고 안내한다.

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  monthLabel,
  periodLabel,
  type SettlementPeriod,
  settlementsHref,
  shiftMonth,
} from './settlement-format';

export function PeriodPicker({
  period,
  thisMonth,
}: {
  period: SettlementPeriod;
  /** 지금(서버 시각)의 한국 달 'YYYY-MM'. 이번 달보다 뒤로는 옮기지 않는다 */
  thisMonth: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {period.kind === 'month' ? (
        <MonthNav month={period.month} thisMonth={thisMonth} />
      ) : (
        <div className="flex items-center gap-3">
          <span className="font-semibold">{periodLabel(period.from, period.to)}</span>
          <Button asChild variant="outline" size="sm">
            <Link href={settlementsHref({ month: thisMonth })}>이번 달로</Link>
          </Button>
        </div>
      )}
      <form
        action="/owner/settlements"
        className="flex items-center gap-2"
        aria-label="기간 직접 고르기"
      >
        <Input
          type="date"
          name="from"
          defaultValue={period.from}
          required
          aria-label="시작일"
          className="w-40"
        />
        <span className="text-muted-foreground">~</span>
        <Input
          type="date"
          name="to"
          defaultValue={period.to}
          required
          aria-label="끝일"
          className="w-40"
        />
        <Button type="submit" variant="outline">
          기간 보기
        </Button>
      </form>
    </div>
  );
}

function MonthNav({ month, thisMonth }: { month: string; thisMonth: string }) {
  // 'YYYY-MM'은 글자 순서가 달 순서와 같다
  const canGoNext = month < thisMonth;
  return (
    <nav aria-label="달 고르기" className="flex items-center gap-2">
      <Button asChild variant="outline" size="icon">
        <Link href={settlementsHref({ month: shiftMonth(month, -1) })} aria-label="지난 달">
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
      </Button>
      <span className="min-w-28 text-center font-semibold">{monthLabel(month)}</span>
      {canGoNext ? (
        <Button asChild variant="outline" size="icon">
          <Link href={settlementsHref({ month: shiftMonth(month, 1) })} aria-label="다음 달">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" disabled aria-label="다음 달">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      )}
      {month === thisMonth ? null : (
        <Button asChild variant="ghost" size="sm">
          <Link href={settlementsHref({ month: thisMonth })}>이번 달</Link>
        </Button>
      )}
    </nav>
  );
}
