'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow, useRouter } from 'next/navigation';
import PortOne, { type PaymentResponse } from '@portone/browser-sdk/v2';
import { Check, ChevronDown, Clock, MapPin } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import { PhoneInput } from '@/components/ui/phone-input';
import { EmptyState } from '@/components/ui/state';
import {
  formatDuration,
  refundPolicyLines,
  refundPolicyNotes,
} from '@/app/(customer)/(tabs)/slots/[slotId]/detail-format';
import { COUPON_NOT_RETURNED_NOTE } from '@/app/(customer)/(tabs)/reservations/[reservationId]/cancel-texts';
import type { SlotDetail } from '@/app/(customer)/(tabs)/slots/[slotId]/types';
import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import { CUSTOMER_HOME, loginPath } from '@/server/auth/paths';
import type { MyCoupon } from '@/server/coupons';
import { getMyCoupons } from '@/server/coupons/coupons';
import { previewCheckoutAmount, releaseHold, startPayment } from '@/server/payments/checkout';
import { PAYMENT_ERRORS } from '@/server/payments/errors';
import type { CheckoutAmount, MyHold } from '@/server/payments/types';
import { NO_SHOW_PENALTY_RATE, OWNER_FAULT_COUPON_AMOUNT, REFUND_BANDS } from '@/server/policy';

import {
  BOOKER_INFO_REFUSAL_NOTE,
  bookerInfoConsentLabel,
  bookerInfoRows,
  HOLD_ENDED_HINT,
  intermediaryNotice,
  REFUND_CONSENT_LABEL,
} from './checkout-texts';
import { CouponPicker } from './coupon-picker';
import { couponResetText } from './coupon-texts';
import { paymentResultPath, toPortOneRequest } from './payment-window';
import { type PhoneAutoSave, usePhoneAutoSave } from './use-phone-auto-save';

const START_FAILED_MESSAGE = '결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요';
// 포트원 결제창 스크립트를 못 받았거나 결제창이 요청값을 거절했을 때. 홀딩은 그대로라 다시 누를 수 있다(누를 때마다 새 결제 번호)
const PAYMENT_WINDOW_FAILED_MESSAGE = '결제창을 열지 못했어요. 잠시 후 다시 시도해 주세요';
const PRICE_FAILED_MESSAGE = '금액을 다시 계산하지 못했어요. 잠시 후 다시 골라 주세요';

type CheckoutViewProps = {
  slot: SlotDetail;
  hold: MyHold;
  /** 저장된 연락처. 없으면 이 화면에서 받는다(C-401) */
  phone: string | null;
  /** 이 매물에 쓸 수 있는 쿠폰(할인 큰 순, 못 쓰는 쿠폰은 뒤에). 없으면 쿠폰 칸을 그리지 않는다(C-407) */
  coupons: MyCoupon[];
  /** 처음 골라 둘 쿠폰(서버가 정한 기본 쿠폰, 없으면 null)과 그 금액(previewCheckoutAmount) */
  initialCoupon: { couponId: string | null; amount: CheckoutAmount };
};

const isCouponFailure = (code: string) => code.startsWith('COUPON_');

/**
 * 예약 확인 (J10, C-401·C-402·C-404).
 * 매물 요약, 쿠폰 고르기(C-407, 기본 쿠폰을 골라 둔 채로), 결제 금액(서버 계산), 연락처, 전체 환불 규정,
 * 결제 버튼 바로 위 필수 동의 2개(동의 문구 3장).
 * 오른쪽 위 10분 타이머는 서버가 준 홀딩 만료 시각 기준이고, 끝나면 결제할 수 없다고 안내한다.
 * '취소'는 홀딩을 바로 푼다. 뒤로가기로 나가면 홀딩은 남아서 상세의 '결제 이어서 하기'로 돌아올 수 있다(D12)
 */
export function CheckoutView({
  slot,
  hold,
  phone: savedPhone,
  coupons: initialCoupons,
  initialCoupon,
}: CheckoutViewProps) {
  const router = useRouter();
  const [expired, setExpired] = useState(false);
  const phone = usePhoneAutoSave(savedPhone);
  const [refundAgreed, setRefundAgreed] = useState(false);
  const [bookerAgreed, setBookerAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, startPaying] = useTransition();
  const [cancelling, startCancelling] = useTransition();
  const [coupons, setCoupons] = useState(initialCoupons);
  const [couponId, setCouponId] = useState(initialCoupon.couponId);
  const [amount, setAmount] = useState(initialCoupon.amount);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [pricing, startPricing] = useTransition();
  const { shop, menu } = slot;
  const detailPath = `/slots/${slot.slotId}`;
  const refundNotes = refundPolicyNotes(OWNER_FAULT_COUPON_AMOUNT);
  // 주문은 저장된 연락처를 읽어서, 칸의 번호가 저장된 번호와 같고 저장이 끝났을 때만 결제한다(#183)
  const canPay = refundAgreed && bookerAgreed && phone.ready && !expired && !paying && !pricing;
  const noCouponAmount: CheckoutAmount = {
    salePrice: hold.salePrice,
    couponAmount: 0,
    amount: hold.amount,
  };

  /** 쿠폰 실패(COUPON_*)면 쿠폰 목록을 다시 불러오고 '쓰지 않음'으로 돌린다(#300) */
  async function resetCoupons(message: string) {
    setCouponId(null);
    const [list, price] = await Promise.all([
      getMyCoupons({ slotId: slot.slotId }),
      previewCheckoutAmount({ slotId: slot.slotId, couponId: null }),
    ]);
    if (list.ok) setCoupons(list.data.coupons);
    setAmount(price.ok ? price.data : noCouponAmount);
    setCouponMessage(couponResetText(message));
  }

  /** 쿠폰을 고르거나 바꿀 때마다 서버에서 금액을 다시 받는다. 화면은 계산하지 않는다 */
  function selectCoupon(next: string | null) {
    const prev = couponId;
    setCouponId(next);
    setCouponMessage(null);
    setError(null);
    startPricing(async () => {
      try {
        const result = await previewCheckoutAmount({ slotId: slot.slotId, couponId: next });
        if (result.ok) {
          setAmount(result.data);
          return;
        }
        const { code, message } = result.error;
        if (code === 'HOLD_EXPIRED' || code === 'NOT_HOLDER') {
          setExpired(true);
          return;
        }
        if (isCouponFailure(code)) {
          await resetCoupons(message);
          return;
        }
        setCouponId(prev);
        setCouponMessage(message);
      } catch (caught) {
        unstable_rethrow(caught);
        setCouponId(prev);
        setCouponMessage(PRICE_FAILED_MESSAGE);
      }
    });
  }

  function pay() {
    setError(null);
    startPaying(async () => {
      try {
        const result = await startPayment({
          slotId: slot.slotId,
          refundPolicyAgreed: true,
          bookerInfoAgreed: true,
          couponId,
        });
        if (result.ok) {
          // 토스페이먼츠 결제창(C-403). 폰은 결제 페이지로 이동했다가 포트원이 결과 화면(redirectUrl)으로 보내서 여기 오지 않는다.
          // PC는 화면 위 결제창이 닫히면 결과를 받아 같은 결과 화면으로 간다. 결과 확인은 그 화면이 서버로 한다
          const { redirectUrl, paymentId } = result.data;
          let response: PaymentResponse | undefined;
          try {
            response = await PortOne.requestPayment(toPortOneRequest(result.data));
          } catch {
            setError(PAYMENT_WINDOW_FAILED_MESSAGE);
            return;
          }
          if (response) {
            router.push(
              paymentResultPath(redirectUrl, {
                paymentId,
                code: response.code,
                message: response.message,
              }),
            );
          }
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
            phone.markMissing();
            break;
        }
        // 그 사이 쿠폰을 못 쓰게 됐으면(기한 지남 등) '쓰지 않음'으로 돌리고 바뀐 금액을 보고 다시 누르게 한다
        if (isCouponFailure(result.error.code)) {
          await resetCoupons(result.error.message);
          setError(couponResetText(result.error.message));
          return;
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
        <BackButton fallbackHref={CUSTOMER_HOME} className="-ml-2 max-md:size-10" />
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

      <CouponPicker
        coupons={coupons}
        selectedId={couponId}
        disabled={pricing || paying || expired}
        message={couponMessage}
        onSelect={selectCoupon}
      />

      <dl
        className="flex flex-col gap-2 text-sm"
        aria-label="결제 금액"
        aria-busy={pricing || undefined}
      >
        <div className="flex justify-between">
          <dt className="text-muted-foreground">판매가 ({slot.discountRate}% 할인)</dt>
          <dd>{formatWon(amount.salePrice)}</dd>
        </div>
        {amount.couponAmount > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">쿠폰</dt>
            <dd>−{formatWon(amount.couponAmount)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t pt-2 text-base font-bold">
          <dt>결제 금액</dt>
          <dd>{formatWon(amount.amount)}</dd>
        </div>
      </dl>

      <PhoneField phone={phone} />

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
        {/* 쿠폰이 골라진 채로 열릴 수 있어서, 쿠폰이 있으면 결제 동의 쪽에도 늘 보여준다(동의 문구 3장, 11/10 #300) */}
        {coupons.length > 0 ? <p>{COUPON_NOT_RETURNED_NOTE}</p> : null}
      </section>

      {expired ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive p-4">
          <p className="text-sm text-destructive">{PAYMENT_ERRORS.HOLD_EXPIRED}</p>
          <Link
            href={detailPath}
            className={buttonVariants({ variant: 'outline', className: 'max-md:h-10' })}
          >
            매물 다시 보기
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex items-start gap-3 text-sm max-md:min-h-10">
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
            {paying ? '결제 준비 중…' : `${formatWon(amount.amount)} 결제하기`}
          </Button>
          {!phone.ready ? (
            <p className="text-center text-xs text-muted-foreground">
              휴대폰 번호가 저장되면 결제할 수 있어요.
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            disabled={cancelling || paying}
            onClick={cancel}
          >
            {cancelling ? '취소하는 중…' : '취소'}
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * 연락처(C-401, #183). 저장된 번호가 미리 채워져 있고 그 칸을 바로 고친다. 번호를 끝까지 치면 저장된다(usePhoneAutoSave).
 * 내 정보(J9)와 같은 규칙으로 저장한다
 */
function PhoneField({ phone }: { phone: PhoneAutoSave }) {
  const helpId = useId();
  return (
    <section className="flex flex-col gap-1.5" aria-label="연락처">
      <h2 className="text-sm font-semibold">연락처</h2>
      <PhoneInput
        // 공통 Input은 h-9·text-sm이다. 내 정보 화면과 같게 조금 크게 쓴다
        className="h-11 text-base"
        value={phone.value}
        aria-label="휴대폰 번호"
        aria-describedby={helpId}
        aria-invalid={phone.invalid || undefined}
        onValueChange={phone.change}
        onBlur={phone.blur}
      />
      {phone.error ? (
        <p id={helpId} role="alert" className="text-sm text-destructive">
          {phone.error}
        </p>
      ) : (
        <p id={helpId} aria-live="polite" className="flex items-center gap-1 text-xs">
          {phone.saving ? (
            <span className="text-muted-foreground">저장하는 중…</span>
          ) : phone.justSaved ? (
            <span className="flex items-center gap-1 text-primary">
              <Check className="size-3.5" aria-hidden />
              저장했어요
            </span>
          ) : (
            <span className="text-muted-foreground">예약 확인과 노쇼 연락에만 써요.</span>
          )}
        </p>
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
          className="flex shrink-0 items-center text-xs text-muted-foreground max-md:-mr-2 max-md:min-h-10 max-md:px-2"
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
      {/* 결제 화면과 같은 화면 제목(화면 읽기 프로그램용) */}
      <h1 className="sr-only">예약 확인</h1>
      <BackButton fallbackHref={CUSTOMER_HOME} className="-ml-2 self-start max-md:size-10" />
      <EmptyState
        title="결제할 수 있는 상태가 아니에요"
        description={HOLD_ENDED_HINT}
        action={
          <Link
            href={`/slots/${slotId}`}
            className={buttonVariants({ variant: 'outline', className: 'max-md:h-10' })}
          >
            매물 다시 보기
          </Link>
        }
      />
    </section>
  );
}
