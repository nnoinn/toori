'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AFTER_SIGN_OUT_PATH } from '@/components/ui/use-sign-out';
import { getCustomerWithdrawalCheck, withdrawCustomer } from '@/server/accounts/withdrawal';

import { afterCheck, afterWithdraw, WITHDRAWAL_TEXT } from './withdrawal-steps';

type View =
  | { kind: 'closed' }
  | { kind: 'blocked'; reasons: string[] }
  | { kind: 'notice'; lines: string[] }
  | { kind: 'confirm' };

/**
 * 내 정보 > [회원 탈퇴] (C-106, #154). 누르면 서버에 탈퇴할 수 있는지 먼저 묻는다(getCustomerWithdrawalCheck).
 * 막는 이유가 있으면 모두 보여 주고, 없으면 확인 창 두 번(탈퇴하면 이렇게 돼요 → 정말 탈퇴할까요?) 뒤 탈퇴한다(withdrawCustomer).
 * 탈퇴 함수가 로그아웃까지 하므로, 성공하면 로그아웃처럼 첫 화면을 새로 연다(AFTER_SIGN_OUT_PATH)
 */
export function WithdrawAccount({ hasOwnerAccount }: { hasOwnerAccount: boolean }) {
  const [view, setView] = useState<View>({ kind: 'closed' });
  const [checkError, setCheckError] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [checking, startCheck] = useTransition();
  const [withdrawing, startWithdraw] = useTransition();
  const busy = withdrawing || leaving;

  function check() {
    setCheckError(null);
    startCheck(async () => {
      try {
        const outcome = afterCheck(await getCustomerWithdrawalCheck(), hasOwnerAccount);
        if (outcome.kind === 'error') setCheckError(outcome.message);
        else setView(outcome);
      } catch (caught) {
        unstable_rethrow(caught);
        setCheckError(WITHDRAWAL_TEXT.failed);
      }
    });
  }

  function withdraw() {
    setWithdrawError(null);
    startWithdraw(async () => {
      try {
        const outcome = afterWithdraw(await withdrawCustomer());
        if (outcome.kind === 'done') {
          setLeaving(true);
          // 지금 화면은 기록에서 빼서 뒤로 가기로 내 정보가 다시 보이지 않게 한다(useSignOut과 같다)
          window.location.replace(AFTER_SIGN_OUT_PATH);
        } else if (outcome.kind === 'blocked') {
          setView(outcome);
        } else {
          setWithdrawError(outcome.message);
        }
      } catch (caught) {
        unstable_rethrow(caught);
        setWithdrawError(WITHDRAWAL_TEXT.failed);
      }
    });
  }

  function close() {
    if (busy) return;
    setView({ kind: 'closed' });
    setWithdrawError(null);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-muted-foreground max-md:h-10"
        disabled={checking}
        onClick={check}
      >
        {checking ? WITHDRAWAL_TEXT.checking : WITHDRAWAL_TEXT.button}
      </Button>
      {checkError ? (
        <p role="alert" className="basis-full text-sm text-destructive">
          {checkError}
        </p>
      ) : null}
      <Dialog open={view.kind !== 'closed'} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent showCloseButton={!busy}>
          {view.kind === 'blocked' ? (
            <>
              <DialogHeader>
                <DialogTitle>{WITHDRAWAL_TEXT.blockedTitle}</DialogTitle>
                <DialogDescription>{WITHDRAWAL_TEXT.blockedDescription}</DialogDescription>
              </DialogHeader>
              <ul className="flex list-disc flex-col gap-1.5 rounded-lg bg-muted py-3 pr-3 pl-7">
                {view.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="flex justify-end gap-2 max-md:*:h-10">
                <Button type="button" variant="outline" onClick={close}>
                  {WITHDRAWAL_TEXT.close}
                </Button>
                <Link href="/reservations" className={buttonVariants()}>
                  {WITHDRAWAL_TEXT.reservations}
                </Link>
              </div>
            </>
          ) : null}
          {view.kind === 'notice' ? (
            <>
              <DialogHeader>
                <DialogTitle>{WITHDRAWAL_TEXT.noticeTitle}</DialogTitle>
                <DialogDescription>{WITHDRAWAL_TEXT.noticeDescription}</DialogDescription>
              </DialogHeader>
              <ul className="flex list-disc flex-col gap-1.5 pl-5">
                {view.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="flex justify-end gap-2 max-md:*:h-10">
                <Button type="button" variant="outline" onClick={close}>
                  {WITHDRAWAL_TEXT.cancel}
                </Button>
                <Button type="button" onClick={() => setView({ kind: 'confirm' })}>
                  {WITHDRAWAL_TEXT.next}
                </Button>
              </div>
            </>
          ) : null}
          {view.kind === 'confirm' ? (
            <>
              <DialogHeader>
                <DialogTitle>{WITHDRAWAL_TEXT.confirmTitle}</DialogTitle>
                <DialogDescription>{WITHDRAWAL_TEXT.confirmDescription}</DialogDescription>
              </DialogHeader>
              {withdrawError ? (
                <p role="alert" className="text-sm text-destructive">
                  {withdrawError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 max-md:*:h-10">
                <Button type="button" variant="outline" disabled={busy} onClick={close}>
                  {WITHDRAWAL_TEXT.cancel}
                </Button>
                <Button type="button" variant="destructive" disabled={busy} onClick={withdraw}>
                  {busy ? WITHDRAWAL_TEXT.withdrawing : WITHDRAWAL_TEXT.confirm}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
