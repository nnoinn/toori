'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  checkRefundReview,
  retryStuckCancel,
  retryStuckOrder,
} from '@/server/admin/payment-issues';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

import {
  CANCEL_RETRY_TEXT,
  ISSUE_ACTION_TEXT,
  type IssueActionKind,
  ORDER_RETRY_TEXT,
  REVIEW_CHECKED_TEXT,
} from './format';

type Outcome = { ok: true; message: string } | { ok: false; message: string };

async function runAction(kind: IssueActionKind, targetId: string, reason: string) {
  if (kind === 'order') {
    const result = await retryStuckOrder({ orderId: targetId, reason });
    return result.ok
      ? { ok: true as const, message: ORDER_RETRY_TEXT[result.data.result] }
      : { ok: false as const, message: result.error.message };
  }
  if (kind === 'cancel') {
    const result = await retryStuckCancel({ reservationId: targetId, reason });
    return result.ok
      ? { ok: true as const, message: CANCEL_RETRY_TEXT[result.data.result] }
      : { ok: false as const, message: result.error.message };
  }
  const result = await checkRefundReview({ refundId: targetId, reason });
  return result.ok
    ? { ok: true as const, message: REVIEW_CHECKED_TEXT }
    : { ok: false as const, message: result.error.message };
}

// 결제·환불 확인 목록 한 줄의 [다시 시도]·[확인함](#373 ①). 사유(필수)를 받고 확인 창에서 한 번 더 확인한다.
// 결과는 창 안에 보여 주고, [닫기]를 누를 때 목록을 새로 읽는다(바로 새로 읽으면 정리된 줄과 함께 결과 안내도 사라져서)
export function IssueAction({
  kind,
  targetId,
  label,
}: {
  kind: IssueActionKind;
  targetId: string;
  /** 확인 창 제목에 넣을 대상 이름(결제 번호·예약번호) */
  label: string;
}) {
  const router = useRouter();
  const reasonId = useId();
  const text = ISSUE_ACTION_TEXT[kind];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      let outcome: Outcome;
      try {
        outcome = await runAction(kind, targetId, reason);
      } catch {
        outcome = { ok: false, message: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.' };
      }
      if (outcome.ok) setDone(outcome.message);
      else setError(outcome.message);
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
    if (done) {
      setDone(null);
      setReason('');
      router.refresh();
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {text.button}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.title(label)}</DialogTitle>
            <DialogDescription>{text.description}</DialogDescription>
          </DialogHeader>
          {done ? (
            <p role="status" className="text-sm">
              {done}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={reasonId}>사유</Label>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={ADMIN_REASON_LIMIT}
                rows={3}
                placeholder="예: 손님 문의로 확인, 포트원 콘솔에서 결제 상태 확인함"
              />
              <p className="text-xs text-muted-foreground">
                사유는 운영자 처리 기록에 남아요. 손님·원장님에게는 보이지 않아요.
              </p>
            </div>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            {done ? (
              <Button onClick={close}>닫기</Button>
            ) : (
              <>
                <Button variant="outline" onClick={close} disabled={pending}>
                  취소
                </Button>
                <Button onClick={submit} disabled={pending || reason.trim() === ''}>
                  {text.submit}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
