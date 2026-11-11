'use client';

import { useLayoutEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { ExternalLink, MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KAKAO_CHANNEL_URL } from '@/lib/site';
import { respondAgreedCancel } from '@/server/refunds/agreed-cancel';
import type { AgreedCancelErrorCode } from '@/server/refunds/agreed-cancel-errors';
import type { PendingAgreedCancel } from '@/server/refunds/agreed-cancel-types';

import { tabHref } from '../reservation-tabs';
import {
  AGREED_CANCEL_CHANNEL_LABEL,
  AGREED_CANCEL_CONFIRM_TITLE,
  AGREED_CANCEL_DECLINED,
  AGREED_CANCEL_EXPIRED,
  AGREED_CANCEL_GUIDE,
  AGREED_CANCEL_TITLE,
  agreedCancelConfirmText,
  agreedCancelDeadlineText,
  agreedCancelReasonText,
  agreedCancelRefundText,
} from './agreed-cancel-texts';
import { cancelDoneText } from './cancel-texts';

const RESPOND_FAILED_MESSAGE = '처리하지 못했어요. 잠시 후 다시 시도해 주세요';

// 다시 눌러도 결과가 같은 실패. 버튼을 막는다(환불 실패·마무리 중은 다시 누를 수 있다)
const FINAL_FAILURES: readonly string[] = [
  'REQUEST_NOT_FOUND',
  'REQUEST_EXPIRED',
  'ALREADY_RESPONDED',
  'RESERVATION_CHANGED',
] satisfies AgreedCancelErrorCode[];

/**
 * 합의 후 취소 요청 카드 (C-506, 연결 #19, #301). 원장님이 요청했고 손님 답을 기다리는 동안 내 예약 상세 맨 위에 보여준다.
 * [동의하지 않아요]는 바로 답하고(예약 그대로), [동의하고 취소할게요]는 확인 창에서 한 번 더 묻는다(11/10 Q1).
 * 환불액은 서버가 준 refundAmount(실제 결제액 × 50%)를 그대로 쓴다. 남은 시간은 서버 시각 기준이다.
 * 답을 기다리는 동안에도 고객 직접 취소(C-503)는 그대로 둔다(Q2)
 */
export function AgreedCancelCard({ request }: { request: PendingAgreedCancel }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [expired, setExpired] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [done, setDone] = useState<{ refundAmount: number } | null>(null);
  const [pending, startTransition] = useTransition();

  // 떠났다 돌아오면 Next.js가 이 화면을 상태 그대로 다시 보여준다(Activity). 열려 있던 창은 닫아 둔다
  useLayoutEffect(() => () => setConfirmOpen(false), []);

  function respond(agree: boolean) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await respondAgreedCancel({ requestId: request.requestId, agree });
        if (result.ok) {
          if (result.data.agreed) setDone({ refundAmount: result.data.refundAmount });
          else setDeclined(true);
          return;
        }
        if (FINAL_FAILURES.includes(result.error.code)) setBlocked(true);
        setMessage(result.error.message);
      } catch (caught) {
        unstable_rethrow(caught);
        setMessage(RESPOND_FAILED_MESSAGE);
      }
    });
  }

  function closeConfirm() {
    if (pending) return;
    setConfirmOpen(false);
    // 취소했으면 상세를 새로 읽어 취소 표시와 환불 내역을 보여준다
    if (done) router.refresh();
  }

  if (declined) {
    return (
      <section className="mx-4 rounded-xl border bg-card p-4 text-sm" aria-label="합의 후 취소">
        <p role="status">{AGREED_CANCEL_DECLINED}</p>
      </section>
    );
  }

  const locked = blocked || expired || pending;

  return (
    <section
      className="mx-4 flex flex-col gap-3 rounded-xl border border-primary/40 bg-card p-4"
      aria-label="합의 후 취소"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{AGREED_CANCEL_TITLE}</h2>
        <p className="text-sm">{agreedCancelReasonText(request.reason, request.reasonText)}</p>
      </div>
      <p className="text-sm">
        {agreedCancelRefundText(request.refundAmount, request.couponAmount)}
      </p>
      <p className="text-sm text-muted-foreground">{AGREED_CANCEL_GUIDE}</p>
      <a
        href={KAKAO_CHANNEL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 self-start text-sm font-medium max-md:min-h-10"
      >
        <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
        {AGREED_CANCEL_CHANNEL_LABEL}
        <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
      </a>
      {expired ? (
        <p role="status" className="text-sm text-muted-foreground">
          {AGREED_CANCEL_EXPIRED}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {agreedCancelDeadlineText(request.expiresAt)}{' '}
          <Countdown
            targetAt={request.expiresAt}
            serverNow={request.serverNow}
            className="font-medium text-foreground"
            onExpire={() => setExpired(true)}
          />
        </p>
      )}
      {message && !confirmOpen ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={locked} onClick={() => respond(false)}>
          동의하지 않아요
        </Button>
        <Button
          disabled={locked}
          onClick={() => {
            setMessage(null);
            setConfirmOpen(true);
          }}
        >
          동의하고 취소할게요
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => (open ? null : closeConfirm())}>
        <DialogContent showCloseButton={!pending}>
          {done ? (
            <>
              <DialogHeader>
                <DialogTitle>예약을 취소했어요</DialogTitle>
                <DialogDescription>{cancelDoneText(done.refundAmount)}</DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeConfirm}>
                  닫기
                </Button>
                <Button asChild>
                  <Link href={tabHref('cancelled')}>취소한 예약 보기</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{AGREED_CANCEL_CONFIRM_TITLE}</DialogTitle>
                <DialogDescription>
                  {agreedCancelConfirmText(request.refundAmount)}
                </DialogDescription>
              </DialogHeader>
              {message ? (
                <p role="alert" className="text-sm text-destructive">
                  {message}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeConfirm} disabled={pending}>
                  닫기
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => respond(true)}
                  disabled={pending || blocked}
                >
                  {pending ? '취소하는 중…' : '동의하고 취소하기'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
