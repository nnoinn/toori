'use client';

// 매물 3탭 화면의 단계 버튼과 ①②③ 카드 (O4·O5·O10). 고른 값과 확인·저장은 slot-form.tsx가 갖고,
// 여기는 받은 값으로 그리기만 한다. ② 시간 카드는 달력(slot-date-calendar.tsx)에서 날짜를 고르면 그 아래에 시작 시각이 나온다(S-205, 14일).

import { cn } from 'cn';
import { Check } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import type { BusinessHours } from '@/db/schema/shops';
import { formatDuration, formatWon } from '@/lib/format';
import { formatKst, formatKstTime } from '@/lib/time';
import {
  ADVANCE_LISTING_DAYS,
  DISCOUNT_RATE_OPTIONS,
  type DiscountRate,
  PUBLISH_WINDOW_HOURS,
  serviceTypeLabel,
} from '@/server/policy';
import type { SettlementPreview } from '@/server/settlements';

import { withObjectParticle } from '../../korean';
import { dateKeyLabel, SlotDateCalendar } from './slot-date-calendar';
import type { SlotMenuOption } from './slot-form';
import {
  checkBusinessHours,
  rangesOverlap,
  slotEnd,
  type StartWindow,
  type TimeRange,
} from './slot-time';

export type StepNumber = 1 | 2 | 3;

/** 단계마다 다 골랐는지 */
export type StepDone = Record<StepNumber, boolean>;

const STEPS = ['서비스', '시간', '할인율'] as const;

/**
 * 그 단계로 갈 수 있는지. 앞 단계를 다 골라야 다음 단계를 열 수 있다.
 * 시간대 매물(window/window-form.tsx, 단계 4개)도 같이 쓴다
 */
export function canOpenStep<N extends number>(target: N, done: Record<N, boolean>): boolean {
  return target === 1 || done[(target - 1) as N] === true;
}

/**
 * 단계 버튼: 앞 단계를 다 고르면 눌러서 오갈 수 있다. 고른 단계는 브랜드 색으로 채우고 ✓를 붙인다.
 * labels를 주면 그 단계들로 그린다(시간대 매물: 시간·서비스·할인율·확인). 없으면 한 시술 매물 3단계
 */
export function StepNav<N extends number = StepNumber>({
  labels = STEPS,
  step,
  done,
  pending,
  onGoTo,
}: {
  labels?: readonly string[];
  step: N;
  done: Record<N, boolean>;
  pending: boolean;
  onGoTo: (target: N) => void;
}) {
  return (
    <ol className="flex gap-2" aria-label="등록 단계">
      {labels.map((label, index) => {
        const number = (index + 1) as N;
        const isDone = done[number];
        const current = step === number;
        return (
          <li key={label}>
            <button
              type="button"
              aria-current={current ? 'step' : undefined}
              disabled={!canOpenStep(number, done) || pending}
              onClick={() => onGoTo(number)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                isDone
                  ? 'border-transparent bg-primary/75 text-primary-foreground hover:bg-primary/65'
                  : 'bg-card hover:bg-muted',
                current && 'font-semibold ring-2 ring-primary/40 ring-offset-1',
                current && !isDone && 'border-primary',
              )}
            >
              {isDone ? <Check className="size-4" aria-hidden /> : <span>{number}</span>}
              {label}
              {isDone ? <span className="sr-only">(고름)</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** ① 메뉴 고르기 */
export function MenuStep({
  menus,
  menuId,
  onChoose,
}: {
  menus: SlotMenuOption[];
  menuId: string | null;
  onChoose: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>① 어떤 서비스를 올릴까요?</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {menus.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChoose(item.id)}
            aria-pressed={menuId === item.id}
            className={cn(
              'flex flex-col items-start gap-1 rounded-lg border p-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
              menuId === item.id && 'border-primary bg-primary/10',
            )}
          >
            <Badge variant="secondary" className="bg-accent text-accent-foreground">
              {serviceTypeLabel(item.serviceType)}
            </Badge>
            <span className="font-semibold">{item.name}</span>
            <span className="text-sm text-muted-foreground">
              정가 {formatWon(item.listPrice)} · {formatDuration(item.durationMinutes)}
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * ② 날짜와 시작 시각 고르기. 영업시간(입력한 요일만) 안에 끝나는 시각만 보여주고(정민석 결정 10/28),
 * 이미 올린 매물과 겹치는 시각은 줄을 긋고 잠근다. 서버도 [다음]에서 같은 것을 다시 확인한다
 */
export function TimeStep({
  menu,
  days,
  todayKey,
  startWindow,
  dateKey,
  businessHours,
  busyRanges,
  startIso,
  onChooseDate,
  onChooseStart,
}: {
  menu: SlotMenuOption;
  /** 고를 수 있는 시작 시각을 한국 날짜별로 묶은 것(가까운 날부터) */
  days: { dateKey: string; starts: Date[] }[];
  /** 오늘(한국 날짜, 서버 시각 기준). 달력 위에 알려 주고 그 칸을 표시한다 */
  todayKey: string;
  /** 고를 수 있는 범위. 새로 올리기·예약대기 수정은 14일, 게시중 매물 수정은 48시간 */
  startWindow: StartWindow;
  /** 고른 날짜. 아직 안 골랐으면 빈 값이고, 달력 아래 시작 시각을 보여주지 않는다 */
  dateKey: string;
  businessHours: BusinessHours;
  /** 같은 샵의 예약대기·게시중·예약됨 매물 시간 */
  busyRanges: TimeRange[];
  startIso: string | null;
  onChooseDate: (dateKey: string) => void;
  onChooseStart: (iso: string) => void;
}) {
  const day = days.find((item) => item.dateKey === dateKey) ?? null;
  const openStarts = (day?.starts ?? []).filter(
    (candidate) =>
      checkBusinessHours(
        { start: candidate, end: slotEnd(candidate, menu.durationMinutes) },
        businessHours,
      ) === null,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>② 언제 시작할까요?</CardTitle>
        <p className="text-sm text-muted-foreground">
          {startWindow === 'published'
            ? `고객에게 이미 보이는 매물이라 지금부터 ${PUBLISH_WINDOW_HOURS}시간 안의 시각으로만 바꿀 수 있어요.`
            : `지금부터 ${ADVANCE_LISTING_DAYS}일 안의 시각을 올릴 수 있어요. 고객에게는 시작 ${PUBLISH_WINDOW_HOURS}시간 전부터 보이고, 그 전에는 예약대기예요.`}{' '}
          끝 시각은 {menu.name} 소요 시간({formatDuration(menu.durationMinutes)})으로 정해져요.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SlotDateCalendar
          todayKey={todayKey}
          days={days}
          selectedKey={day?.dateKey ?? null}
          businessHours={businessHours}
          onChoose={onChooseDate}
        />
        {day ? (
          <section aria-label="시작 시각" className="flex flex-col gap-3 border-t pt-4">
            <h3 className="text-sm font-semibold">{dateKeyLabel(day.dateKey)} 시작 시각</h3>
            {openStarts.length === 0 ? (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                이 날은 영업시간 안에 {withObjectParticle(menu.name)} 끝낼 수 있는 시각이 없어요.
                다른 날을 골라 주세요.
              </p>
            ) : null}
            <div className="grid grid-cols-6 gap-2">
              {openStarts.map((candidate) => {
                const range = { start: candidate, end: slotEnd(candidate, menu.durationMinutes) };
                const blocked = busyRanges.some((busyRange) => rangesOverlap(range, busyRange));
                const selected = startIso === candidate.toISOString();
                return (
                  <Button
                    key={candidate.toISOString()}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    disabled={blocked}
                    title={blocked ? '이미 올린 매물과 시간이 겹쳐요' : undefined}
                    onClick={() => onChooseStart(candidate.toISOString())}
                    className={cn(blocked && 'line-through')}
                  >
                    {formatKstTime(candidate)}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              매장 설정의 영업시간 안에 끝나는 시각만 보여요. 줄이 그어진 시각은 이미 올린
              매물(예약대기·게시중·예약됨)과 시간이 겹쳐서 고를 수 없어요.
            </p>
          </section>
        ) : (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            달력에서 날짜를 고르면 그 날의 시작 시각이 나와요.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** ③ 할인율·신규 고객 전용 고르기와 가격 미리보기 */
export function DiscountStep({
  menu,
  discountRate,
  newCustomerOnly,
  preview,
  onChooseRate,
  onChangeNewCustomerOnly,
}: {
  menu: SlotMenuOption;
  discountRate: DiscountRate | null;
  newCustomerOnly: boolean;
  /** 할인율을 골랐을 때만 있다 */
  preview: SettlementPreview | null;
  onChooseRate: (rate: DiscountRate) => void;
  onChangeNewCustomerOnly: (value: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>③ 얼마나 할인할까요?</CardTitle>
        <p className="text-sm text-muted-foreground">
          할인가는 정가에서 할인율만큼 뺀 금액 그대로예요(100원 단위로 올리지 않아요).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2" role="radiogroup" aria-label="할인율">
          {DISCOUNT_RATE_OPTIONS.map((rate) => (
            <Button
              key={rate}
              type="button"
              role="radio"
              aria-checked={discountRate === rate}
              variant={discountRate === rate ? 'default' : 'outline'}
              size="lg"
              onClick={() => onChooseRate(rate)}
            >
              {rate}%
            </Button>
          ))}
        </div>

        <NewCustomerOnlyField checked={newCustomerOnly} onChange={onChangeNewCustomerOnly} />

        {preview && discountRate !== null ? (
          <PricePreview listPrice={menu.listPrice} discountRate={discountRate} preview={preview} />
        ) : (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            할인율을 고르면 할인가와 정산 예정액을 보여드려요.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** 신규 고객 전용 체크(S-207). 한 시술 매물과 시간대 매물(시간대 전체에 적용)이 같이 쓴다 */
export function NewCustomerOnlyField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="flex flex-col">
        <span className="font-medium">신규 고객 전용</span>
        <span className="text-muted-foreground">
          우리 샵에서 결제하거나 이용한 적 없는 고객에게만 보여요
        </span>
      </span>
    </label>
  );
}

/** 단계 카드 아래 고른 메뉴·시간 요약. 단계를 오가도 지금 무엇을 골랐는지 보인다 */
export function ChosenSummary({
  menu,
  start,
  publishNote,
}: {
  menu: SlotMenuOption;
  start: Date | null;
  /** 시각을 골랐으면 언제 고객에게 보이는지(S-205). 예: "예약대기로 올라가요. 11/18(수) 14:00부터 고객에게 보여요" */
  publishNote: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
      <span>
        <strong>{menu.name}</strong> · 정가 {formatWon(menu.listPrice)}
      </span>
      {start ? (
        <span>
          {formatKst(start)} ~ {formatKstTime(slotEnd(start, menu.durationMinutes))}
        </span>
      ) : (
        <span className="text-muted-foreground">시작 시각을 골라 주세요</span>
      )}
      {start && publishNote ? <span className="text-muted-foreground">{publishNote}</span> : null}
    </div>
  );
}

/** 가격 미리보기(S-203). previewSettlement 결과를 보여주기만 하고 화면에서 계산하지 않는다 */
function PricePreview({
  listPrice,
  discountRate,
  preview,
}: {
  listPrice: number;
  discountRate: number;
  preview: SettlementPreview;
}) {
  // 결제 수수료율은 PG 계약 뒤 정한다. 그 전에는 결제 수수료와 정산 예정액을 [미정]으로 둔다
  const unknown = '[미정]';
  /** 금액이 아직 정해지지 않았으면(null) [미정] */
  const won = (amount: number | null) => (amount === null ? unknown : formatWon(amount));
  const rows: [string, string][] = [
    [`플랫폼 수수료 (판매가의 ${preview.platformFeeRate}%)`, `− ${won(preview.platformFee)}`],
    ['플랫폼 수수료 VAT', `− ${won(preview.platformFeeVat)}`],
    [
      `결제 수수료 (판매가의 ${preview.paymentFeeRate === null ? unknown : `${preview.paymentFeeRate}%`})`,
      preview.paymentFee === null ? unknown : `− ${won(preview.paymentFee)}`,
    ],
    [
      '결제 수수료 VAT',
      preview.paymentFeeVat === null ? unknown : `− ${won(preview.paymentFeeVat)}`,
    ],
  ];
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">고객 결제 금액(할인가)</span>
        <Price listPrice={listPrice} salePrice={preview.salePrice} discountRate={discountRate} />
      </div>
      <dl className="flex flex-col gap-1 border-t pt-2 text-muted-foreground">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between border-t pt-2">
        <span className="font-semibold">정산 예정액</span>
        <span className="text-base font-bold">{won(preview.payoutAmount)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        수수료는 모두 VAT 별도예요. 정산 예정액은 고객이 이용을 마친 뒤 받는 금액이에요.
        {preview.paymentFeeRate === null ? ' 결제 수수료율은 결제 대행사 계약 뒤 정해져요.' : null}
      </p>
    </div>
  );
}
