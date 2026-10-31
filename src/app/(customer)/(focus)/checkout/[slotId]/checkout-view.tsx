'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { ChevronDown, Clock, MapPin } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import { EmptyState } from '@/components/ui/state';
import { updateMyPhone } from '@/app/(customer)/(tabs)/me/actions';
import { customerPhoneSchema } from '@/app/(customer)/(tabs)/me/profile-rules';
import {
  formatDuration,
  refundPolicyLines,
  refundPolicyNotes,
} from '@/app/(customer)/(tabs)/slots/[slotId]/detail-format';
import type { SlotDetail } from '@/app/(customer)/(tabs)/slots/[slotId]/types';
import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import { loginPath } from '@/server/auth/paths';
import { releaseHold, startPayment } from '@/server/payments/checkout';
import { PAYMENT_ERRORS } from '@/server/payments/errors';
import type { MyHold } from '@/server/payments/types';
import { NO_SHOW_PENALTY_RATE, OWNER_FAULT_COUPON_AMOUNT, REFUND_BANDS } from '@/server/policy';

import {
  BOOKER_INFO_REFUSAL_NOTE,
  bookerInfoConsentLabel,
  bookerInfoRows,
  intermediaryNotice,
  REFUND_CONSENT_LABEL,
} from './checkout-texts';

const START_FAILED_MESSAGE = '결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요';

type CheckoutViewProps = {
  slot: SlotDetail;
  hold: MyHold;
  /** 저장된 연락처. 없으면 이 화면에서 받는다(C-401) */
  phone: string | null;
};

/**
 * 예약 확인 (J10, C-401·C-402·C-404).
 * 매물 요약, 결제 금액(서버 계산), 연락처, 전체 환불 규정, 결제 버튼 바로 위 필수 동의 2개(동의 문구 3장).
 * 오른쪽 위 10분 타이머는 서버가 준 홀딩 만료 시각 기준이고, 끝나면 결제할 수 없다고 안내한다.
 * '취소'는 홀딩을 바로 푼다. 뒤로가기로 나가면 홀딩은 남아서 상세의 '결제 이어서 하기'로 돌아올 수 있다(D12)
 */
export function CheckoutView({ slot, hold, phone: savedPhone }: CheckoutViewProps) {
  const router = useRouter();
  const [expired, setExpired] = useState(false);
  const [phone, setPhone] = useState(savedPhone);
  // 같은 홀딩으로 돌아왔는데 그사이 다른 화면(내 정보)에서 연락처가 바뀌었으면 서버 값으로 맞춘다
  const [serverPhone, setServerPhone] = useState(savedPhone);
  if (serverPhone !== savedPhone) {
    setServerPhone(savedPhone);
    setPhone(savedPhone);
  }
  const [refundAgreed, setRefundAgreed] = useState(false);
  const [bookerAgreed, setBookerAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, startPaying] = useTransition();
  const [cancelling, startCancelling] = useTransition();
  const { shop, menu } = slot;
  const detailPath = `/slots/${slot.slotId}`;
  const refundNotes = refundPolicyNotes(OWNER_FAULT_COUPON_AMOUNT);
  const canPay = refundAgreed && bookerAgreed && phone !== null && !expired && !paying;

  function pay() {
    setError(null);
    startPaying(async () => {
      try {
        const result = await startPayment({
          slotId: slot.slotId,
          refundPolicyAgreed: true,
          bookerInfoAgreed: true,
        });
        if (result.ok) {
          // TODO(J11): 포트원 브라우저 SDK(설치 전 확인, #19)를 붙이면 PortOne.requestPayment(result.data)로 결제창을 연다.
          // 지금은 결제가 가짜(#127)라 결제창 없이 복귀 화면으로 바로 간다(#121 강규민 안내)
          const { redirectUrl, paymentId } = result.data;
          const back = new URL(redirectUrl);
          back.searchParams.set('paymentId', paymentId);
          router.push(`${back.pathname}${back.search}`);
          return;
        }
        switch (result.error.code) {
          case 'UNAUTHENTICATED':
          case 'WRONG_MODE':
            router.push(loginPath('customer', `/checkout/${slot.slotId}`));
            return;
          case 'HOLD_EXPIRED':
          case 'NOT_HOLDER':
            setExpired(true);
            return;
          case 'PHONE_REQUIRED':
            setPhone(null);
            break;
        }
        setError(result.error.message);
      } catch (caught) {
        unstable_rethrow(caught);
        setError(START_FAILED_MESSAGE);
      }
    });
  }

  function cancel() {
    startCancelling(async () => {
      try {
        await releaseHold(slot.slotId);
      } catch (caught) {
        unstable_rethrow(caught);
        // 풀지 못해도 10분이 지나면 저절로 풀린다. 상세로는 보낸다
      }
      router.replace(detailPath);
    });
  }

  return (
    <section className="flex flex-1 flex-col gap-6 px-4 pt-2 pb-8">
      <div className="flex items-center justify-between">
        <BackButton className="-ml-2" />
        <div
          className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums"
          aria-label="결제 가능 남은 시간"
        >
          <Clock className="size-4 text-muted-foreground" aria-hidden />
          <Countdown
            targetAt={hold.holdExpiresAt}
            serverNow={hold.serverNow}
            variant="clock"
            onExpire={() => setExpired(true)}
          />
        </div>
      </div>

      <h1 className="text-2xl font-bold">예약 확인</h1>

      <div className="flex flex-col gap-1 rounded-xl border p-4">
        <p className="text-sm text-muted-foreground">{shop.name}</p>
        <p className="text-lg font-semibold">{menu.name}</p>
        <p className="text-sm">
          {formatKst(new Date(slot.startAt))} · {formatDuration(menu.durationMinutes)}
        </p>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          {shop.roadAddress}
          {shop.addressDetail ? ` ${shop.addressDetail}` : ''}
        </p>
      </div>

      <dl className="flex flex-col gap-2 text-sm" aria-label="결제 금액">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">판매가 ({slot.discountRate}% 할인)</dt>
          <dd>{formatWon(hold.salePrice)}</dd>
        </div>
        {hold.couponAmount > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">쿠폰</dt>
            <dd>−{formatWon(hold.couponAmount)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t pt-2 text-base font-bold">
          <dt>결제 금액</dt>
          <dd>{formatWon(hold.amount)}</dd>
        </div>
      </dl>

      {/* 연락처가 바뀌면(저장, 서버 값) 입력칸 상태도 새로 시작한다 */}
      <PhoneField key={phone ?? ''} phone={phone} onSaved={setPhone} />

      <section
        className="flex flex-col gap-2 rounded-xl bg-muted p-4 text-sm"
        aria-label="환불 규정"
      >
        <h2 className="font-semibold">환불 규정</h2>
        {refundNotes.before.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <ul className="flex flex-col gap-0.5 pl-1">
          {refundPolicyLines(REFUND_BANDS, NO_SHOW_PENALTY_RATE).map((line) => (
            <li key={line}>- {line}</li>
          ))}
        </ul>
        <p>{refundNotes.after}</p>
      </section>

      {expired ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive p-4">
          <p className="text-sm text-destructive">{PAYMENT_ERRORS.HOLD_EXPIRED}</p>
          <Link href={detailPath} className={buttonVariants({ variant: 'outline' })}>
            매물 다시 보기
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-primary"
              checked={refundAgreed}
              onChange={(e) => setRefundAgreed(e.target.checked)}
            />
            {REFUND_CONSENT_LABEL}
          </label>
          <BookerInfoConsent
            shopName={shop.name}
            checked={bookerAgreed}
            onChange={setBookerAgreed}
          />
          <p className="text-xs text-muted-foreground">{intermediaryNotice(shop.name)}</p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="h-12 text-base"
            disabled={!canPay}
            onClick={pay}
          >
            {paying ? '결제 준비 중…' : `${formatWon(hold.amount)} 결제하기`}
          </Button>
          {phone === null ? (
            <p className="text-center text-xs text-muted-foreground">
              휴대폰 번호를 저장하면 결제할 수 있어요.
            </p>
          ) : null}
          <Button type="button" variant="ghost" disabled={cancelling || paying} onClick={cancel}>
            {cancelling ? '취소하는 중…' : '취소'}
          </Button>
        </div>
      )}
    </section>
  );
}

/** 연락처 확인·입력(C-401). 저장된 번호가 있으면 보여 주고 바꿀 수 있다. 내 정보(J9)와 같은 규칙으로 저장한다 */
function PhoneField({
  phone,
  onSaved,
}: {
  phone: string | null;
  onSaved: (phone: string) => void;
}) {
  const [editing, setEditing] = useState(phone === null);
  const [value, setValue] = useState(phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const showInput = editing || phone === null;

  function save() {
    const parsed = customerPhoneSchema.safeParse(value);
    if (!parsed.success || parsed.data === null) {
      setError(parsed.success ? '휴대폰 번호를 입력해 주세요' : parsed.error.issues[0]?.message);
      return;
    }
    setError(null);
    startSaving(async () => {
      try {
        const result = await updateMyPhone(value);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setValue(result.data.phone);
        setEditing(false);
        onSaved(result.data.phone);
      } catch (caught) {
        unstable_rethrow(caught);
        setError('저장하지 못했어요. 잠시 후 다시 시도해 주세요');
      }
    });
  }

  return (
    <section className="flex flex-col gap-1.5" aria-label="연락처">
      <h2 className="text-sm font-semibold">연락처</h2>
      {showInput ? (
        <div className="flex gap-2">
          <input
            className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={value}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="010-1234-5678"
            aria-label="휴대폰 번호"
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="button" variant="outline" className="h-11" disabled={saving} onClick={save}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p>{phone}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            바꾸기
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">예약 확인과 노쇼 연락에만 써요.</p>
      )}
    </section>
  );
}

/** (필수) 예약자 정보 제공 동의 + "보기"(동의 문구 3-1) */
function BookerInfoConsent({
  shopName,
  checked,
  onChange,
}: {
  shopName: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3 text-sm">
        <label className="flex flex-1 items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
          {bookerInfoConsentLabel(shopName)}
        </label>
        <button
          type="button"
          className="flex shrink-0 items-center text-xs text-muted-foreground"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          보기
          <ChevronDown className={open ? 'size-4 rotate-180' : 'size-4'} aria-hidden />
        </button>
      </div>
      {open ? (
        <div className="ml-8 flex flex-col gap-2 rounded-lg border p-3 text-xs">
          <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1">
            {bookerInfoRows(shopName).map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground">{BOOKER_INFO_REFUSAL_NOTE}</p>
        </div>
      ) : null}
    </div>
  );
}

/** 내 홀딩이 아니거나 끝났을 때(만료, 취소, 다른 사람이 결제함) */
export function HoldEnded({ slotId }: { slotId: string }) {
  return (
    <section className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-8">
      <BackButton className="-ml-2 self-start" />
      <EmptyState
        title="결제할 수 있는 상태가 아니에요"
        description={PAYMENT_ERRORS.NOT_HOLDER}
        action={
          <Link href={`/slots/${slotId}`} className={buttonVariants({ variant: 'outline' })}>
            매물 다시 보기
          </Link>
        }
      />
    </section>
  );
}
