'use client';

// 매물 3탭 등록 ① 서비스 ② 시간 (O4) ③ 할인율·확인 (O5). 고를 수 없는 시각(지난 시각·48시간 밖·겹침)은 화면에서 막고,
// [다음]을 누르면 서버가 다시 확인한다. [등록하기]를 누르면 서버가 ①②③을 다시 검증하고 저장한다.

import { useMemo, useState, useTransition } from 'react';
import { cn } from 'cn';
import { Check, CircleCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import type { BusinessHours } from '@/db/schema/shops';
import { formatWon } from '@/lib/format';
import { formatKst, utcToKst } from '@/lib/time';
import { DISCOUNT_RATE_OPTIONS, type DiscountRate, PUBLISH_WINDOW_HOURS } from '@/server/policy';
import { previewSettlement, type SettlementPreview } from '@/server/settlements';

import { formatMinutes, serviceTypeLabel } from '../../settings/menu/menu';
import { checkSlotDraft, createSlot } from './actions';
import {
  checkBusinessHours,
  groupByKstDate,
  rangesOverlap,
  slotEnd,
  startCandidates,
} from './slot-time';

type MenuOption = {
  id: string;
  serviceType: string;
  name: string;
  listPrice: number;
  durationMinutes: number;
};

const STEPS = ['서비스', '시간', '할인율'] as const;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function SlotCreateForm({
  shopId,
  nowIso,
  businessHours,
  menus,
  busy,
}: {
  shopId: string;
  nowIso: string;
  /** 샵 영업시간(O2). 입력하지 않은 요일은 24시간 다 보여준다 */
  businessHours: BusinessHours;
  menus: MenuOption[];
  /** 같은 샵의 예약대기·게시중·예약됨 매물 시간(ISO) */
  busy: { start: string; end: string }[];
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const busyRanges = useMemo(
    () => busy.map((range) => ({ start: new Date(range.start), end: new Date(range.end) })),
    [busy],
  );
  const days = useMemo(() => groupByKstDate(startCandidates(now)), [now]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  // 처음에는 쉬는 날이 아닌 첫 날을 보여준다
  const [dateKey, setDateKey] = useState(
    () =>
      (days.find((item) => !isClosedDay(item.starts[0], businessHours)) ?? days[0])?.dateKey ?? '',
  );
  const [startIso, setStartIso] = useState<string | null>(null);
  const [discountRate, setDiscountRate] = useState<DiscountRate | null>(null);
  const [newCustomerOnly, setNewCustomerOnly] = useState(false);
  // 저장한 매물(완료 카드에 보여준다)
  const [created, setCreated] = useState<CreatedSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const menu = menus.find((item) => item.id === menuId) ?? null;
  const start = startIso ? new Date(startIso) : null;
  const preview =
    menu && discountRate !== null
      ? previewSettlement({ listPrice: menu.listPrice, discountRate })
      : null;
  const day = days.find((item) => item.dateKey === dateKey) ?? days[0];
  // 영업시간(입력한 요일만) 안에 끝나는 시작 시각만 보여준다(정민석 결정 10/28)
  const openStarts = menu
    ? (day?.starts ?? []).filter(
        (candidate) =>
          checkBusinessHours(
            { start: candidate, end: slotEnd(candidate, menu.durationMinutes) },
            businessHours,
          ) === null,
      )
    : [];

  function chooseMenu(id: string) {
    setMenuId(id);
    // 메뉴가 바뀌면 소요 시간이 달라져서 고른 시각을 다시 고르게 한다
    setStartIso(null);
    setMessage(null);
  }

  // 고른 단계. 앞 단계를 다 골라야 다음 단계 버튼을 누를 수 있다
  const stepDone = {
    1: menu !== null,
    2: menu !== null && start !== null,
    3: menu !== null && start !== null && discountRate !== null,
  } as const;
  const canOpen = (target: 1 | 2 | 3) =>
    target === 1 || (target === 2 && stepDone[1]) || (target === 3 && stepDone[2]);

  /** 단계 버튼. ③으로 갈 때는 [다음]처럼 서버가 ①② 값을 다시 확인한다 */
  function goTo(target: 1 | 2 | 3) {
    if (!canOpen(target) || target === step) return;
    setMessage(null);
    if (target === 3) next();
    else setStep(target);
  }

  function next() {
    if (!menu || !start) return;
    setMessage(null);
    startTransition(async () => {
      const result = await checkSlotDraft(shopId, {
        menuId: menu.id,
        startAt: start.toISOString(),
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setStep(3);
    });
  }

  function submit() {
    if (!menu || !start || discountRate === null || !preview) return;
    setMessage(null);
    startTransition(async () => {
      const result = await createSlot(shopId, {
        menuId: menu.id,
        startAt: start.toISOString(),
        discountRate,
        newCustomerOnly,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setCreated({
        menuName: menu.name,
        start,
        end: slotEnd(start, menu.durationMinutes),
        listPrice: menu.listPrice,
        salePrice: result.data.salePrice,
        discountRate,
        newCustomerOnly,
      });
    });
  }

  /** 완료 카드에서 하나 더 올리기. 고른 메뉴는 남기고 시각·할인율부터 다시 고른다 */
  function startOver() {
    setCreated(null);
    setStartIso(null);
    setDiscountRate(null);
    setNewCustomerOnly(false);
    setMessage(null);
    setStep(2);
  }

  if (created) return <CreatedCard created={created} onAgain={startOver} />;

  return (
    <div className="flex flex-col gap-4">
      {/* 단계 버튼: 앞 단계를 다 고르면 눌러서 오갈 수 있다. 고른 단계는 브랜드 색으로 채우고 ✓를 붙인다 */}
      <ol className="flex gap-2" aria-label="등록 단계">
        {STEPS.map((label, index) => {
          const number = (index + 1) as 1 | 2 | 3;
          const done = stepDone[number];
          const current = step === number;
          return (
            <li key={label}>
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                disabled={!canOpen(number) || pending}
                onClick={() => goTo(number)}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                  done
                    ? 'border-transparent bg-primary/75 text-primary-foreground hover:bg-primary/65'
                    : 'bg-card hover:bg-muted',
                  current && 'font-semibold ring-2 ring-primary/40 ring-offset-1',
                  current && !done && 'border-primary',
                )}
              >
                {done ? <Check className="size-4" aria-hidden /> : <span>{number}</span>}
                {label}
                {done ? <span className="sr-only">(고름)</span> : null}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>① 어떤 서비스를 올릴까요?</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {menus.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseMenu(item.id)}
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
                  정가 {formatWon(item.listPrice)} · {formatMinutes(item.durationMinutes)}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {step === 2 && menu ? (
        <Card>
          <CardHeader>
            <CardTitle>② 언제 시작할까요?</CardTitle>
            <p className="text-sm text-muted-foreground">
              지금부터 {PUBLISH_WINDOW_HOURS}시간 안의 시각만 올릴 수 있어요. 끝 시각은 {menu.name}{' '}
              소요 시간({formatMinutes(menu.durationMinutes)})으로 정해져요.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-2" role="tablist" aria-label="날짜">
              {days.map((item, index) => {
                const closed = isClosedDay(item.starts[0], businessHours);
                return (
                  <Button
                    key={item.dateKey}
                    type="button"
                    role="tab"
                    aria-selected={item.dateKey === day?.dateKey}
                    variant={item.dateKey === day?.dateKey ? 'default' : 'outline'}
                    disabled={closed}
                    onClick={() => setDateKey(item.dateKey)}
                  >
                    {dayLabel(item.starts[0], index)}
                    {closed ? ' 휴무' : ''}
                  </Button>
                );
              })}
            </div>
            {openStarts.length === 0 ? (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                이 날은 영업시간 안에 {menu.name}을(를) 끝낼 수 있는 시각이 없어요. 다른 날을 골라
                주세요.
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
                    onClick={() => {
                      setStartIso(candidate.toISOString());
                      setMessage(null);
                    }}
                    className={cn(blocked && 'line-through')}
                  >
                    {timeLabel(candidate)}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              매장 설정의 영업시간 안에 끝나는 시각만 보여요. 줄이 그어진 시각은 이미 올린
              매물(예약대기·게시중·예약됨)과 시간이 겹쳐서 고를 수 없어요.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 && menu && start ? (
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
                  onClick={() => {
                    setDiscountRate(rate);
                    setMessage(null);
                  }}
                >
                  {rate}%
                </Button>
              ))}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={newCustomerOnly}
                onChange={(event) => setNewCustomerOnly(event.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="flex flex-col">
                <span className="font-medium">신규 고객 전용</span>
                <span className="text-muted-foreground">
                  우리 샵에서 결제하거나 이용한 적 없는 고객에게만 보여요
                </span>
              </span>
            </label>

            {preview && discountRate !== null ? (
              <PricePreview
                listPrice={menu.listPrice}
                discountRate={discountRate}
                preview={preview}
              />
            ) : (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                할인율을 고르면 할인가와 정산 예정액을 보여드려요.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {menu ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
          <span>
            <strong>{menu.name}</strong> · 정가 {formatWon(menu.listPrice)}
          </span>
          {start ? (
            <span>
              {formatKst(start)} ~ {timeLabel(slotEnd(start, menu.durationMinutes))}
            </span>
          ) : (
            <span className="text-muted-foreground">시작 시각을 골라 주세요</span>
          )}
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setStep(step === 3 ? 2 : 1)}
            disabled={pending}
          >
            이전
          </Button>
        ) : null}
        {step === 1 ? (
          <Button type="button" size="lg" disabled={!menu} onClick={() => setStep(2)}>
            다음
          </Button>
        ) : null}
        {step === 2 ? (
          <Button type="button" size="lg" disabled={!start || pending} onClick={next}>
            {pending ? '확인 중…' : '다음'}
          </Button>
        ) : null}
        {step === 3 ? (
          <Button type="button" size="lg" disabled={!stepDone[3] || pending} onClick={submit}>
            {pending ? '등록 중…' : '등록하기'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

type CreatedSummary = {
  menuName: string;
  start: Date;
  end: Date;
  listPrice: number;
  salePrice: number;
  discountRate: number;
  newCustomerOnly: boolean;
};

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

/** 저장 완료. 대시보드(O9)가 생기면 그쪽으로 보낸다 */
function CreatedCard({ created, onAgain }: { created: CreatedSummary; onAgain: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleCheck className="size-5 text-primary" aria-hidden />
          매물을 올렸어요
        </CardTitle>
        <p className="text-sm text-muted-foreground">지금부터 고객 화면에 게시중으로 보여요.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
          <span className="font-semibold">{created.menuName}</span>
          <span>
            {formatKst(created.start)} ~ {timeLabel(created.end)}
          </span>
          <Price
            listPrice={created.listPrice}
            salePrice={created.salePrice}
            discountRate={created.discountRate}
            size="sm"
          />
          {created.newCustomerOnly ? (
            <Badge variant="secondary" className="w-fit bg-accent text-accent-foreground">
              신규 고객 전용
            </Badge>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button type="button" size="lg" onClick={onAgain}>
            매물 하나 더 올리기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** 그 날짜(한국 요일)를 쉬는 날로 입력했으면 true */
function isClosedDay(date: Date | undefined, hours: BusinessHours): boolean {
  if (!date) return false;
  const weekday = utcToKst(date).weekday;
  return hours.some((item) => item.weekday === weekday && 'closed' in item);
}

/** 날짜 버튼. 예: "10/31(금) 오늘" */
function dayLabel(date: Date, index: number): string {
  const t = utcToKst(date);
  const suffix = ['오늘', '내일', '모레'][index] ?? '';
  return `${t.month}/${t.day}(${WEEKDAYS[t.weekday]}) ${suffix}`.trim();
}

/** 시각. 예: "14:00" */
function timeLabel(date: Date): string {
  const t = utcToKst(date);
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}
