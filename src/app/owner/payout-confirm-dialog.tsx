'use client';

// 정산 계좌 저장 전 확인 창 (#163, S-101·S-107, 11/1 nnoinn 결정). 가입(/owner/join)과 매장 설정 > 정산 계좌가 같이 쓴다.
// 입력한 사람이 바로 보는 창이라 은행·계좌번호 전체·예금주를 보여준다. 저장한 뒤 화면에는 뒷자리만 보인다.
// 지급한 정산금은 회수하기 어려워서(토스페이먼츠 지급대행) 한 번 더 확인받는다.

import { TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { bankName } from '@/server/policy';

/** 확인 창에 보여줄 계좌(검사를 통과한 값). 가입은 createOwnerAccount 입력, 계좌 바꾸기는 validatePayoutInput 결과를 넘긴다 */
export type PayoutConfirmAccount = {
  bankCode: string;
  accountNumber: string;
  accountHolder: string;
};

/** 확인 창에서 같은 계좌인지 비교하는 값(검사를 통과한 값으로 만든다) */
export function payoutKey(values: PayoutConfirmAccount): string {
  return [values.bankCode, values.accountNumber, values.accountHolder].join('|');
}

export function PayoutConfirmDialog({
  account,
  description,
  confirmLabel,
  pendingLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  /** 확인할 계좌(검사를 통과한 값). null이면 창을 닫는다 */
  account: PayoutConfirmAccount | null;
  /** 이 계좌로 무엇을 하는지. 예: "다음 정산부터 이 계좌로 보내요." */
  description: string;
  /** 확인 버튼. 예: "맞아요, 바꾸기" */
  confirmLabel: string;
  /** 저장하는 동안 확인 버튼 글자. 예: "바꾸는 중…" */
  pendingLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={account !== null} onOpenChange={(open) => !open && !pending && onCancel()}>
      {account ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이 계좌가 맞나요?</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[5rem_1fr] items-baseline gap-y-2 rounded-lg bg-muted p-4 text-sm">
            <dt className="text-muted-foreground">은행</dt>
            <dd className="font-medium">{bankName(account.bankCode)}</dd>
            <dt className="text-muted-foreground">계좌번호</dt>
            <dd className="text-lg font-semibold tracking-wider tabular-nums">
              {account.accountNumber}
            </dd>
            <dt className="text-muted-foreground">예금주</dt>
            <dd className="font-medium">{account.accountHolder}</dd>
          </dl>
          <p className="flex items-start gap-2 text-sm text-warning-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            잘못 입력하면 정산금을 돌려받기 어려워요. 은행·계좌번호·예금주를 한 번 더 확인해 주세요.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onCancel}>
              다시 고치기
            </Button>
            <Button type="button" size="lg" disabled={pending} onClick={onConfirm}>
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
