'use client';

// 시간대 매물 ② 서비스 ③ 할인율 ④ 확인 카드와 등록 완료 카드 (#308, S-201 두 번째 방식).
// 고른 값과 단계 이동·등록은 window-form.tsx가 갖고, 여기는 받은 값으로 그리기만 한다.
// 할인가는 calcSalePrice, 정산 예정액은 previewSettlement 결과를 그대로 보여주고 화면에서 따로 계산하지 않는다.
// 등록한 뒤의 할인가·게시 시각은 서버(createSlotWindows)가 다시 계산한다.

import Link from 'next/link';
import { cn } from 'cn';
import { Check, CircleCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { formatDuration, formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import {
  calcSalePrice,
  DISCOUNT_RATE_OPTIONS,
  type DiscountRate,
  serviceTypeLabel,
} from '@/server/policy';
import { previewSettlement } from '@/server/settlements';
import type { CreatedSlotWindow } from '@/server/slot-windows/types';

import { dateKeyLabel } from '../slot-date-calendar';
import type { SlotMenuOption } from '../slot-form';
import { NewCustomerOnlyField } from '../slot-form-steps';
import { publishPlan, type TimeRange } from '../slot-time';
import { rangeLabel } from './window-cells';
import { commonRate, menuFit, type MenuRates } from './window-draft';

/** 짧은 묶음 이름들. 예: "10:00~12:00, 00:30(익일)~02:00(익일)" */
function rangesLabel(ranges: readonly TimeRange[], dateKey: string): string {
  return ranges.map((range) => rangeLabel(range, dateKey)).join(', ');
}

/**
 * ② 서비스 고르기(여러 개). 소요 시간이 가장 긴 묶음보다 긴 메뉴는 잠그고 이유를 적는다.
 * 짧은 묶음에만 안 들어가는 메뉴는 고를 수 있고, 그 묶음에서는 고객에게 보이지 않는다고 알려 준다
 */
export function ServicesStep({
  menus,
  ranges,
  dateKey,
  chosenIds,
  prefilled,
  onToggle,
}: {
  menus: SlotMenuOption[];
  ranges: TimeRange[];
  dateKey: string;
  /** 고른 서비스 중 지금 시간에 들어가는 것(fittingMenuIds) */
  chosenIds: readonly string[];
  /** 지난번 설정을 채워 열었는지 */
  prefilled: boolean;
  onToggle: (menuId: string) => void;
}) {
  const chosen = new Set(chosenIds);
  return (
    <Card>
      <CardHeader>
        <CardTitle>② 어떤 서비스를 올릴까요?</CardTitle>
        <p className="text-sm text-muted-foreground">
          여러 개 고를 수 있어요. 고객이 이 중에서 원하는 서비스와 시작 시각을 고르고, 끝나는 시각은
          소요 시간으로 정해져요.
        </p>
        {prefilled ? (
          <p className="text-sm font-medium text-primary">
            지난번에 올린 서비스·할인율을 채워 뒀어요. 바꿀 수 있어요.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {menus.map((item) => {
          const fit = menuFit(item.durationMinutes, ranges);
          const on = chosen.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              disabled={!fit.fits}
              onClick={() => onToggle(item.id)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted/40',
                on && 'border-primary bg-primary/10',
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <Badge variant="secondary" className="bg-accent text-accent-foreground">
                  {serviceTypeLabel(item.serviceType)}
                </Badge>
                {on ? <Check className="size-4 text-primary" aria-hidden /> : null}
              </span>
              <span className={cn('font-semibold', !fit.fits && 'text-muted-foreground')}>
                {item.name}
              </span>
              <span className="text-sm text-muted-foreground">
                정가 {formatWon(item.listPrice)} · {formatDuration(item.durationMinutes)}
              </span>
              {!fit.fits ? (
                <span className="text-xs text-muted-foreground">
                  고른 시간(가장 긴 {formatDuration(fit.longestMinutes)})보다 길어서 올릴 수 없어요
                </span>
              ) : fit.shortRanges.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {rangesLabel(fit.shortRanges, dateKey)}에는 들어가지 않아서 그 시간에는 고객에게
                  보이지 않아요
                </span>
              ) : null}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** 할인율 칩(10~50%) 한 줄. 고른 값이 없으면 아무것도 골라지지 않은 모양 */
function RateChips({
  label,
  value,
  size,
  onChoose,
}: {
  label: string;
  value: DiscountRate | null;
  size: 'default' | 'lg';
  onChoose: (rate: DiscountRate) => void;
}) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={label}>
      {DISCOUNT_RATE_OPTIONS.map((rate) => (
        <Button
          key={rate}
          type="button"
          role="radio"
          aria-checked={value === rate}
          variant={value === rate ? 'default' : 'outline'}
          size={size}
          onClick={() => onChoose(rate)}
        >
          {rate}%
        </Button>
      ))}
    </div>
  );
}

/**
 * ③ 할인율: 위의 "전체에 한 번에" 칩을 누르면 고른 서비스 모두 그 값이 되고, 아래에서 서비스마다 바꿀 수 있다.
 * 전체 칩은 모든 서비스가 같은 값일 때만 골라진 모양이다. 신규 고객 전용은 시간대 전체에 적용한다
 */
export function RatesStep({
  menus,
  rates,
  newCustomerOnly,
  onRateAll,
  onRate,
  onChangeNewCustomerOnly,
}: {
  /** 고른 서비스(메뉴 순서) */
  menus: SlotMenuOption[];
  rates: MenuRates;
  newCustomerOnly: boolean;
  onRateAll: (rate: DiscountRate) => void;
  onRate: (menuId: string, rate: DiscountRate) => void;
  onChangeNewCustomerOnly: (value: boolean) => void;
}) {
  const all = commonRate(
    rates,
    menus.map((item) => item.id),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>③ 얼마나 할인할까요?</CardTitle>
        <p className="text-sm text-muted-foreground">
          전체에 한 번에 고르고, 아래에서 서비스마다 바꿀 수 있어요. 할인가는 정가에서 할인율만큼 뺀
          금액 그대로예요(100원 단위로 올리지 않아요).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">전체에 한 번에</span>
          <RateChips label="전체 할인율" value={all} size="lg" onChoose={onRateAll} />
        </div>

        <ul className="flex flex-col divide-y rounded-lg border" aria-label="서비스별 할인율">
          {menus.map((item) => {
            const rate = rates[item.id];
            return (
              <li key={item.id} className="flex items-center gap-4 p-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    정가 {formatWon(item.listPrice)} · {formatDuration(item.durationMinutes)}
                  </span>
                </div>
                <RateChips
                  label={`${item.name} 할인율`}
                  value={rate ?? null}
                  size="default"
                  onChoose={(value) => onRate(item.id, value)}
                />
                <div className="flex w-36 justify-end">
                  {rate === undefined ? (
                    <span className="text-sm text-muted-foreground">할인율을 골라 주세요</span>
                  ) : (
                    <Price
                      listPrice={item.listPrice}
                      salePrice={calcSalePrice(item.listPrice, rate)}
                      discountRate={rate}
                      size="sm"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <NewCustomerOnlyField checked={newCustomerOnly} onChange={onChangeNewCustomerOnly} />
      </CardContent>
    </Card>
  );
}

/** 게시 안내. 예약대기면 언제부터 보이는지(S-205). 서버가 등록할 때 그때 시각으로 다시 정한다 */
function publishNote(start: Date, now: Date): string {
  const plan = publishPlan(start, now);
  return plan.status === 'scheduled'
    ? `예약대기 · ${formatKst(plan.publishAt)}부터 고객에게 보여요`
    : '등록하면 바로 고객에게 보여요';
}

/** ④ 확인: 묶음마다 시간대와 게시 안내, 서비스마다 할인가와 정산 예정액, 신규 고객 전용 */
export function ConfirmStep({
  dateKey,
  ranges,
  menus,
  rates,
  newCustomerOnly,
  now,
}: {
  dateKey: string;
  ranges: TimeRange[];
  /** 고른 서비스(메뉴 순서). 모두 할인율을 골랐다 */
  menus: SlotMenuOption[];
  rates: MenuRates;
  newCustomerOnly: boolean;
  now: Date;
}) {
  const rows = menus.flatMap((item) => {
    const rate = rates[item.id];
    if (rate === undefined) return [];
    return [
      {
        item,
        rate,
        preview: previewSettlement({ listPrice: item.listPrice, discountRate: rate }),
        shortRanges: menuFit(item.durationMinutes, ranges).shortRanges,
      },
    ];
  });
  const feeUnknown = rows.some((row) => row.preview.paymentFeeRate === null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>④ 이대로 올릴까요?</CardTitle>
        <p className="text-sm text-muted-foreground">
          올리기 전에 시간대·서비스·할인율을 확인해 주세요. 바꾸려면 위 단계 버튼을 눌러요.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section aria-label="시간대" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">
            {dateKeyLabel(dateKey)} 시간대 {ranges.length}개
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {ranges.map((range) => (
              <li
                key={range.start.toISOString()}
                className="flex items-center justify-between gap-4 rounded-lg bg-muted px-3 py-2"
              >
                <span className="font-medium">{rangeLabel(range, dateKey)}</span>
                <span className="text-muted-foreground">{publishNote(range.start, now)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="서비스" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">서비스 {rows.length}개</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-1 text-left font-normal">
                  서비스
                </th>
                <th scope="col" className="py-1 text-left font-normal">
                  고객 결제 금액(할인가)
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  정산 예정액
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ item, rate, preview, shortRanges }) => (
                <tr key={item.id}>
                  <td className="py-2 pr-4">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDuration(item.durationMinutes)}
                      {shortRanges.length > 0
                        ? ` · ${rangesLabel(shortRanges, dateKey)}에는 들어가지 않아요`
                        : null}
                    </p>
                  </td>
                  <td className="py-2">
                    <Price
                      listPrice={item.listPrice}
                      salePrice={preview.salePrice}
                      discountRate={rate}
                      size="sm"
                    />
                  </td>
                  <td className="py-2 text-right font-semibold">
                    {preview.payoutAmount === null ? '[미정]' : formatWon(preview.payoutAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            정산 예정액은 고객이 이용을 마친 뒤 받는 금액이에요. 수수료는 모두 VAT 별도예요.
            {feeUnknown ? ' 결제 수수료율은 결제 대행사 계약 뒤 정해져요.' : null}
          </p>
        </section>

        <p className="text-sm">
          신규 고객 전용: <strong>{newCustomerOnly ? '켬' : '끔'}</strong>{' '}
          <span className="text-muted-foreground">
            {newCustomerOnly
              ? '(우리 샵에서 결제하거나 이용한 적 없는 고객에게만 보여요)'
              : '(모든 고객에게 보여요)'}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

/** 등록 완료 카드에 보여줄 값. 시간대·게시 시각은 서버가 돌려준 값이다 */
export type SavedWindows = {
  dateKey: string;
  windows: CreatedSlotWindow[];
  menus: { menuId: string; name: string; discountRate: number }[];
  newCustomerOnly: boolean;
};

/** 등록 완료. [시간대 하나 더 올리기]는 서비스·할인율을 그대로 두고 ①부터 다시 고른다 */
export function SavedWindowsCard({ saved, onAgain }: { saved: SavedWindows; onAgain: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleCheck className="size-5 text-primary" aria-hidden />
          시간대 {saved.windows.length}개를 올렸어요
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          고객이 시간대 안에서 서비스와 시작 시각을 골라 예약해요. 한 고객이 예약해도 남은 시간은
          계속 팔려요.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-lg bg-muted p-3 text-sm">
          <ul className="flex flex-col gap-1">
            {saved.windows.map((window) => (
              <li key={window.windowId} className="flex justify-between gap-4">
                <span className="font-semibold">
                  {dateKeyLabel(saved.dateKey)}{' '}
                  {rangeLabel(
                    { start: new Date(window.startAt), end: new Date(window.endAt) },
                    saved.dateKey,
                  )}
                </span>
                <span className="text-muted-foreground">
                  {window.status === 'scheduled'
                    ? `예약대기 · ${formatKst(new Date(window.publishAt))}부터 고객에게 보여요`
                    : '게시중 · 지금 고객에게 보여요'}
                </span>
              </li>
            ))}
          </ul>
          <span>{saved.menus.map((item) => `${item.name} ${item.discountRate}%`).join(' · ')}</span>
          {saved.newCustomerOnly ? (
            <Badge variant="secondary" className="w-fit bg-accent text-accent-foreground">
              신규 고객 전용
            </Badge>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="lg">
            <Link href="/owner">대시보드로</Link>
          </Button>
          <Button type="button" size="lg" onClick={onAgain}>
            시간대 하나 더 올리기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
