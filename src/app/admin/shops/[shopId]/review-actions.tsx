'use client';

import { useState, useTransition } from 'react';

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

import { approveShopAction, rejectShopAction } from './actions';

// 승인 대기 샵의 승인·반려 버튼(A-101). 누르면 확인 창에서 한 번 더 확인한다.
// 성공하면 서버 함수가 화면을 새로 읽게 해서 상태가 바뀌고 이 버튼은 사라진다.
export function ReviewActions({ shopId, shopName }: { shopId: string; shopName: string }) {
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => ReturnType<typeof approveShopAction>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setOpen(null);
        setReason('');
      } else {
        setMessage(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button onClick={() => setOpen('approve')}>승인</Button>
        <Button variant="destructive" onClick={() => setOpen('reject')}>
          반려
        </Button>
      </div>
      {message && open === null ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <Dialog open={open === 'approve'} onOpenChange={(next) => (next ? null : setOpen(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>‘{shopName}’ 입점을 승인할까요?</DialogTitle>
            <DialogDescription>
              승인하면 원장님이 바로 매물을 올릴 수 있고, 고객 화면에 샵이 보여요. 승인은 되돌릴 수
              없어요.
            </DialogDescription>
          </DialogHeader>
          {message ? (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(null)} disabled={pending}>
              취소
            </Button>
            <Button disabled={pending} onClick={() => run(() => approveShopAction(shopId))}>
              승인하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open === 'reject'} onOpenChange={(next) => (next ? null : setOpen(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>‘{shopName}’ 입점을 반려할까요?</DialogTitle>
            <DialogDescription>
              반려 사유는 원장님 승인 대기 화면에 그대로 보여요. 원장님이 고쳐서 다시 신청할 수
              있어요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reject-reason">반려 사유</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="예: 사업자등록증 사진이 흐려서 내용을 확인할 수 없어요. 다시 올려 주세요"
              rows={4}
            />
          </div>
          {message ? (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(null)} disabled={pending}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={pending || reason.trim() === ''}
              onClick={() => run(() => rejectShopAction(shopId, reason))}
            >
              반려하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
