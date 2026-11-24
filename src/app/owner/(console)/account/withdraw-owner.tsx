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
import { getOwnerWithdrawalCheck, withdrawOwner } from '@/server/accounts/withdrawal';

import {
  afterCheck,
  afterWithdraw,
  type BlockerShortcut,
  OWNER_WITHDRAWAL_TEXT as TEXT,
} from './withdrawal-steps';

type View =
  | { kind: 'closed' }
  | { kind: 'blocked'; reasons: string[]; shortcuts: BlockerShortcut[] }
  | { kind: 'notice'; lines: string[]; confirm: string }
  | { kind: 'confirm'; confirm: string };

/**
 * 원장님 내 계정 > [원장님 탈퇴] (#154). 누르면 서버에 탈퇴할 수 있는지 먼저 묻는다(getOwnerWithdrawalCheck).
 * 막는 이유가 있으면 모두 보여 주고, 없으면 확인 창 두 번(탈퇴하면 이렇게 돼요 → 정말 탈퇴할까요?) 뒤 탈퇴한다(withdrawOwner).
 * 탈퇴 함수가 판매 전 매물 일괄 마감과 로그아웃까지 하므로, 성공하면 로그아웃처럼 첫 화면을 새로 연다(AFTER_SIGN_OUT_PATH).
 * 고객 [회원 탈퇴](정찬형)와 같은 순서다. PC 기준
 */
export function WithdrawOwner({ hasCustomerAccount }: { hasCustomerAccount: boolean }) {
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
        const outcome = afterCheck(await getOwnerWithdrawalCheck(), hasCustomerAccount);
        if (outcome.kind === 'error') setCheckError(outcome.message);
        else setView(outcome);
      } catch (caught) {
        unstable_rethrow(caught);
        setCheckError(TEXT.failed);
      }
    });
  }

  function withdraw() {
    setWithdrawError(null);
    startWithdraw(async () => {
      try {
        const outcome = afterWithdraw(await withdrawOwner());
        if (outcome.kind === 'done') {
          setLeaving(true);
          // 지금 화면은 기록에서 빼서 뒤로 가기로 내 계정이 다시 보이지 않게 한다(useSignOut과 같다)
          window.location.replace(AFTER_SIGN_OUT_PATH);
        } else if (outcome.kind === 'blocked') {
          setView(outcome);
        } else {
          setWithdrawError(outcome.message);
        }
      } catch (caught) {
        unstable_rethrow(caught);
        setWithdrawError(TEXT.failed);
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
        size="lg"
        className="w-fit text-muted-foreground"
        disabled={checking}
        onClick={check}
      >
        {checking ? TEXT.checking : TEXT.button}
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
                <DialogTitle>{TEXT.blockedTitle}</DialogTitle>
                <DialogDescription>{TEXT.blockedDescription}</DialogDescription>
              </DialogHeader>
              <ul className="flex list-disc flex-col gap-1.5 rounded-lg bg-muted py-3 pr-3 pl-7">
                {view.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  {TEXT.close}
                </Button>
                {view.shortcuts.map((shortcut) => (
                  <Link key={shortcut.href} href={shortcut.href} className={buttonVariants()}>
                    {shortcut.label}
                  </Link>
                ))}
              </div>
            </>
          ) : null}
          {view.kind === 'notice' ? (
            <>
              <DialogHeader>
                <DialogTitle>{TEXT.noticeTitle}</DialogTitle>
                <DialogDescription>{TEXT.noticeDescription}</DialogDescription>
              </DialogHeader>
              <ul className="flex list-disc flex-col gap-1.5 pl-5">
                {view.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  {TEXT.cancel}
                </Button>
                <Button
                  type="button"
                  onClick={() => setView({ kind: 'confirm', confirm: view.confirm })}
                >
                  {TEXT.next}
                </Button>
              </div>
            </>
          ) : null}
          {view.kind === 'confirm' ? (
            <>
              <DialogHeader>
                <DialogTitle>{TEXT.confirmTitle}</DialogTitle>
                <DialogDescription>{view.confirm}</DialogDescription>
              </DialogHeader>
              {withdrawError ? (
                <p role="alert" className="text-sm text-destructive">
                  {withdrawError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={close}>
                  {TEXT.cancel}
                </Button>
                <Button type="button" variant="destructive" disabled={busy} onClick={withdraw}>
                  {busy ? TEXT.withdrawing : TEXT.confirm}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
