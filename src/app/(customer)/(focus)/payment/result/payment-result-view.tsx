'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';

import { CHECK_IN_GUIDE } from '@/app/(customer)/(tabs)/reservations/check-in-texts';
import { Button, buttonVariants } from '@/components/ui/button';
import { ReservationCode } from '@/components/ui/reservation-code';
import { LoadingCards } from '@/components/ui/state';
import { CUSTOMER_HOME, loginPath } from '@/server/auth/paths';
import { confirmPayment } from '@/server/payments/checkout';
import { PAYMENT_ERRORS, type PaymentError } from '@/server/payments/errors';
import type { ConfirmedReservation } from '@/server/payments/types';

import { CompletedReservationDetails } from './completed-reservation';
import { ReservationAlerts } from './reservation-alerts';
import { canRecheck, CONFIRM_FAILED, failureAction } from './result-rules';

type ResultState =
  | { kind: 'loading' }
  | { kind: 'done'; reservation: ConfirmedReservation }
  | { kind: 'failed'; error: PaymentError };

/**
 * 결제 결과 (J11, C-403·C-405·C-406). 열리면 confirmPayment를 한 번 불러 예약을 확정한다(새로고침해도 같은 결과).
 * 성공: 예약 완료(C-405). 예약번호, 예약 시간·샵 위치·환불 규정 요약, 예약 상세(/reservations/…) 연결(10/28 결정: 매물 상세가 아니라 예약 상세로).
 * 아직 모름(결제사 처리 중 등, #155): '다시 확인'으로 다시 부른다.
 * 실패: 결제창을 닫았고 홀딩이 남았으면 예약 확인으로 돌아가 다시 결제(D12), 자동 취소면 환불 안내.
 */
export function PaymentResultView({
  paymentId,
  code,
  message,
}: {
  paymentId: string | null;
  code: string | null;
  message: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<ResultState>(() =>
    paymentId
      ? { kind: 'loading' }
      : {
          kind: 'failed',
          error: { code: 'PAYMENT_NOT_FOUND', message: PAYMENT_ERRORS.PAYMENT_NOT_FOUND },
        },
  );
  const [rechecking, startRecheck] = useTransition();
  // 개발 모드에서 효과가 두 번 돌아도 확정은 한 번만 부른다(다시 불러도 같은 결과지만 요청을 줄인다)
  const requested = useRef(false);

  /** 결제를 확인하고 다음 화면 상태를 돌려준다. 로그인이 풀렸으면 로그인 화면으로 보내고 null */
  const check = useCallback(
    async (id: string): Promise<ResultState | null> => {
      try {
        const result = await confirmPayment({
          paymentId: id,
          ...(code ? { code } : {}),
          ...(message ? { message } : {}),
        });
        if (result.ok) return { kind: 'done', reservation: result.data };
        if (result.error.code === 'UNAUTHENTICATED' || result.error.code === 'WRONG_MODE') {
          router.replace(loginPath('customer', window.location.pathname + window.location.search));
          return null;
        }
        return { kind: 'failed', error: result.error };
      } catch {
        return { kind: 'failed', error: CONFIRM_FAILED };
      }
    },
    [code, message, router],
  );

  useEffect(() => {
    if (!paymentId || requested.current) return;
    requested.current = true;
    void check(paymentId).then((next) => {
      if (next) setState(next);
    });
  }, [paymentId, check]);

  function recheck() {
    if (!paymentId) return;
    startRecheck(async () => {
      const next = await check(paymentId);
      if (next) setState(next);
    });
  }

  if (state.kind === 'loading') {
    return (
      <section className="flex flex-1 flex-col gap-4 px-4 py-12" aria-busy>
        <p className="text-center font-semibold">결제를 확인하고 있어요</p>
        <LoadingCards count={1} />
      </section>
    );
  }

  if (state.kind === 'done') {
    const { reservationId, reservationCode } = state.reservation;
    return (
      <section className="flex flex-1 flex-col items-center gap-6 px-4 py-10 text-center">
        <div className="flex flex-col items-center gap-2">
          <CircleCheck className="size-12 text-primary" aria-hidden />
          <h1 className="text-2xl font-bold">예약이 확정됐어요</h1>
          <p className="text-sm text-muted-foreground">
            예약번호{' '}
            <ReservationCode code={reservationCode} className="font-semibold text-foreground" />
          </p>
          {/* 번호를 어디에 쓰는지 처음 받을 때 알려 준다(C-504 방문 확인). 내 예약 상세에도 크게 나온다 */}
          <p className="text-sm text-muted-foreground">{CHECK_IN_GUIDE}.</p>
        </div>
        <CompletedReservationDetails reservationId={reservationId} />
        {/* 푸시 권한은 여기서 처음 묻는다(J14, C-602, 기술 가이드 연결 지점) */}
        <ReservationAlerts />
        <div className="flex w-full flex-col gap-2">
          <Link
            href={`/reservations/${reservationId}`}
            className={buttonVariants({ size: 'lg', className: 'h-12 text-base' })}
          >
            예약 상세 보기
          </Link>
          <Link href={CUSTOMER_HOME} className={buttonVariants({ variant: 'ghost' })}>
            홈으로
          </Link>
        </div>
      </section>
    );
  }

  if (canRecheck(state.error)) {
    return (
      <section className="flex flex-1 flex-col items-center gap-6 px-4 py-12 text-center">
        <Clock className="size-12 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">아직 확인 중이에요</h1>
          <p role="status" className="text-sm text-muted-foreground">
            {state.error.message}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button size="lg" className="h-12 text-base" onClick={recheck} disabled={rechecking}>
            {rechecking ? '확인하는 중…' : '다시 확인'}
          </Button>
          <Link href="/reservations" className={buttonVariants({ variant: 'ghost' })}>
            내 예약 보기
          </Link>
        </div>
      </section>
    );
  }

  const action = failureAction(state.error);
  return (
    <section className="flex flex-1 flex-col items-center gap-6 px-4 py-12 text-center">
      <CircleAlert className="size-12 text-destructive" aria-hidden />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">
          {state.error.autoCancelled ? '결제를 취소했어요' : '예약하지 못했어요'}
        </h1>
        <p role="alert" className="text-sm text-muted-foreground">
          {state.error.message}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Link
          href={action.href}
          className={buttonVariants({ size: 'lg', className: 'h-12 text-base' })}
        >
          {action.label}
        </Link>
        {action.href !== CUSTOMER_HOME ? (
          <Link href={CUSTOMER_HOME} className={buttonVariants({ variant: 'ghost' })}>
            홈으로
          </Link>
        ) : null}
      </div>
    </section>
  );
}
