'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, CircleCheck } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { LoadingCards } from '@/components/ui/state';
import { loginPath } from '@/server/auth/paths';
import { confirmPayment } from '@/server/payments/checkout';
import { PAYMENT_ERRORS, type PaymentError } from '@/server/payments/errors';
import type { ConfirmedReservation } from '@/server/payments/types';

import { failureAction } from './result-rules';

type ResultState =
  | { kind: 'loading' }
  | { kind: 'done'; reservation: ConfirmedReservation }
  | { kind: 'failed'; error: PaymentError };

const CONFIRM_FAILED: PaymentError = {
  code: 'CONFIRM_FAILED',
  message: '결제 결과를 확인하지 못했어요. 잠시 후 내 예약에서 확인해 주세요',
};

/**
 * 결제 결과 (J11, C-403·C-405·C-406). 열리면 confirmPayment를 한 번 불러 예약을 확정한다(새로고침해도 같은 결과).
 * 성공: 예약번호와 예약 상세(/reservations/…) 연결(10/28 결정: 매물 상세가 아니라 예약 상세로).
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
  // 개발 모드에서 효과가 두 번 돌아도 확정은 한 번만 부른다(다시 불러도 같은 결과지만 요청을 줄인다)
  const requested = useRef(false);

  useEffect(() => {
    if (!paymentId || requested.current) return;
    requested.current = true;
    confirmPayment({
      paymentId,
      ...(code ? { code } : {}),
      ...(message ? { message } : {}),
    })
      .then((result) => {
        if (result.ok) {
          setState({ kind: 'done', reservation: result.data });
          return;
        }
        if (result.error.code === 'UNAUTHENTICATED' || result.error.code === 'WRONG_MODE') {
          router.replace(loginPath('customer', window.location.pathname + window.location.search));
          return;
        }
        setState({ kind: 'failed', error: result.error });
      })
      .catch(() => setState({ kind: 'failed', error: CONFIRM_FAILED }));
  }, [paymentId, code, message, router]);

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
      <section className="flex flex-1 flex-col items-center gap-6 px-4 py-12 text-center">
        <CircleCheck className="size-12 text-primary" aria-hidden />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">예약이 확정됐어요</h1>
          <p className="text-sm text-muted-foreground">
            예약번호 <span className="font-semibold text-foreground">{reservationCode}</span>
          </p>
        </div>
        {/* TODO(J11 2차): 결제가 진짜(W11)가 되면 예약 시간·샵 위치 지도·환불 규정 요약을 여기에 보여주고,
            "예약 알림 받기"로 푸시 권한을 처음 묻는다(J14) */}
        <div className="flex w-full flex-col gap-2">
          <Link
            href={`/reservations/${reservationId}`}
            className={buttonVariants({ size: 'lg', className: 'h-12 text-base' })}
          >
            예약 상세 보기
          </Link>
          <Link href="/" className={buttonVariants({ variant: 'ghost' })}>
            홈으로
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
        {action.href !== '/' ? (
          <Link href="/" className={buttonVariants({ variant: 'ghost' })}>
            홈으로
          </Link>
        ) : null}
      </div>
    </section>
  );
}
