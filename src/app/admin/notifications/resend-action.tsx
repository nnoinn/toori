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
import { resendNotification } from '@/server/admin/notification-resend';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

import { RESEND_RESULT_TEXT } from './format';

// 알림 확인 목록 한 줄의 [다시 보내기](#373 ⑤). 사유(필수)를 받고 확인 창에서 한 번 더 확인한다.
// 결과는 창 안에 보여 주고, [닫기]를 누를 때 목록을 새로 읽는다(결제·환불 확인과 같은 방식)
export function ResendAction({
  notificationId,
  title,
}: {
  notificationId: string;
  /** 확인 창 설명에 넣을 알림 제목 */
  title: string;
}) {
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await resendNotification({ notificationId, reason });
        if (result.ok) setDone(RESEND_RESULT_TEXT[result.data.result]);
        else setError(result.error.message);
      } catch {
        setError('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
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
        다시 보내기
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>알림을 다시 보낼까요?</DialogTitle>
            <DialogDescription>
              &quot;{title}&quot; 알림을 지금 그 계정의 푸시 알림 기기로 다시 보내요. 알림함에는
              이미 남아 있어서 푸시만 다시 가요.
            </DialogDescription>
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
                placeholder="예: 손님이 푸시 알림을 켰다고 연락함, 예약 확정 알림을 못 받았다는 문의"
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
                  다시 보내기
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
