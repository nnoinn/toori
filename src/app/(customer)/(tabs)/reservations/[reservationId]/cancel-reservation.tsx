'use client';

import { useLayoutEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatWon } from '@/lib/format';
import { cancelReservation } from '@/server/refunds/cancel';
import type { RefundErrorCode } from '@/server/refunds/errors';
import type { RefundPreview } from '@/server/refunds/types';

import { tabHref } from '../reservation-tabs';
import { appliedRefundRule, cancelDoneText, COUPON_NOT_RETURNED_NOTE } from './cancel-texts';

// 다시 눌러도 결과가 같은 실패. '예약 취소하기'를 막고, 창을 닫으면 상세를 새로 읽는다
const FINAL_FAILURES: readonly string[] = [
  'NOT_REFUNDABLE',
  'ALREADY_CANCELLED',
  'RESERVATION_NOT_FOUND',
] satisfies RefundErrorCode[];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

/**
 * 예약 취소 (J13, C-503). '예약 취소'를 누르면 확인 창에 서버가 계산한 환불액·위약금을 보여주고, 확인하면 취소한다.
 * 금액은 화면에서 계산하지 않는다. 그사이 구간이 바뀌면 서버가 새 미리보기를 주고, 바뀐 금액으로 다시 확인받는다(#128).
 */
export function CancelReservation({ preview: initialPreview }: { preview: RefundPreview }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(initialPreview);
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [done, setDone] = useState<{ refundAmount: number } | null>(null);
  const [pending, startTransition] = useTransition();

  // 떠났다 돌아오면 Next.js가 이 화면을 상태 그대로 다시 보여준다(Activity). 열려 있던 창은 닫아 둔다
  useLayoutEffect(() => () => setOpen(false), []);

  function openDialog() {
    // 지난번 일시적인 실패 문구(환불 실패 등)는 지우고, 다시 눌러도 같은 실패는 남겨 둔다
    if (!blocked) setMessage(null);
    setOpen(true);
  }

  function handleOpenChange(next: boolean) {
    if (next) return openDialog();
    if (pending) return;
    setOpen(false);
    // 취소했거나 상태가 바뀐 예약이면 상세를 새로 읽는다(취소 표시·환불 내역, 또는 취소 대신 안내)
    if (done || blocked) router.refresh();
  }

  function handleCancel() {
    setMessage(null);
    startTransition(async () => {
      const result = await cancelReservation({
        reservationId: preview.reservationId,
        expectedRefundAmount: preview.refundAmount,
      });
      if (result.ok) {
        setDone({ refundAmount: result.data.refundAmount });
        return;
      }
      const { error } = result;
      // 미리보기 뒤 구간이 바뀌었으면 바뀐 금액을 보여주고 다시 확인받는다
      if (error.code === 'REFUND_CHANGED' && error.preview) setPreview(error.preview);
      if (FINAL_FAILURES.includes(error.code)) setBlocked(true);
      setMessage(error.message);
    });
  }

  const rule = appliedRefundRule(preview.penaltyRate);

  return (
    <>
      <Button variant="outline" className="self-start" onClick={openDialog}>
        예약 취소
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={!pending}>
          {done ? (
            <>
              <DialogHeader>
                <DialogTitle>예약을 취소했어요</DialogTitle>
                <DialogDescription>{cancelDoneText(done.refundAmount)}</DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
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
                <DialogTitle>예약을 취소할까요?</DialogTitle>
                <DialogDescription>
                  서비스 시작까지 남은 시간에 따라 위약금을 빼고 환불해요. 취소하면 되돌릴 수
                  없어요.
                </DialogDescription>
              </DialogHeader>
              <dl className="flex flex-col gap-1">
                <Row label="결제 금액" value={formatWon(preview.paidAmount)} />
                <Row
                  label={`위약금(${preview.penaltyRate}%)`}
                  value={`−${formatWon(preview.penaltyAmount)}`}
                />
                <Row
                  label="돌려받을 금액"
                  value={<strong>{formatWon(preview.refundAmount)}</strong>}
                />
              </dl>
              {rule ? <p className="text-xs text-muted-foreground">환불 규정 · {rule}</p> : null}
              {preview.couponAmount > 0 ? (
                <p className="text-xs text-muted-foreground">{COUPON_NOT_RETURNED_NOTE}</p>
              ) : null}
              {message ? (
                <p role="alert" className="text-sm text-destructive">
                  {message}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={pending}
                >
                  닫기
                </Button>
                <Button variant="destructive" onClick={handleCancel} disabled={pending || blocked}>
                  {pending ? '취소하는 중…' : '예약 취소하기'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
