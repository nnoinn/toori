'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';

import { BackButton } from '@/components/ui/back-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { useSignOut } from '@/components/ui/use-sign-out';
import { restoreCustomer } from '@/server/accounts/withdrawal';
import type { RestorableAccount } from '@/server/accounts/withdrawal-types';

import {
  afterRestore,
  afterRestorePath,
  RESTORE_NOTES,
  RESTORE_TEXT,
  restoreDates,
  restoreDescription,
  type RestoreOutcome,
} from './restore-rules';

type RestoreFormProps = {
  /** 되살릴 수 있는 탈퇴 계정(getRestorableAccount) */
  account: RestorableAccount;
  /** 되살리기 기간(일, 정책값) */
  restoreDays: number;
  /** 되살린 뒤 돌아갈 곳(로그인 콜백이 넘겨준 안전한 주소) */
  next: string;
};

/**
 * 탈퇴한 고객 계정 되살리기 (#154 3장). 탈퇴한 날·기한과 돌아오지 않는 것을 알리고 [계정 되살리기](restoreCustomer).
 * 되살리면 돌아갈 곳을 화면 전체로 새로 연다(계정 모드가 바뀌어서). 다른 계정으로 가려면 [로그아웃]
 */
export function RestoreForm({ account, restoreDays, next }: RestoreFormProps) {
  const [outcome, setOutcome] = useState<Exclude<RestoreOutcome, { kind: 'done' }> | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const signOut = useSignOut();
  const busy = pending || leaving || signOut.pending;
  const dates = restoreDates(account);

  function restore() {
    setOutcome(null);
    startTransition(async () => {
      try {
        const result = afterRestore(await restoreCustomer());
        if (result.kind === 'done') {
          setLeaving(true);
          window.location.replace(afterRestorePath(next));
          return;
        }
        setOutcome(result);
      } catch (caught) {
        unstable_rethrow(caught);
        setOutcome({ kind: 'error', message: RESTORE_TEXT.failed });
      }
    });
  }

  return (
    <section className="flex flex-1 flex-col gap-6 px-4 pt-2 pb-8">
      <BackButton className="-ml-2 self-start max-md:size-10" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{RESTORE_TEXT.title}</h1>
        <p className="text-sm text-muted-foreground">{restoreDescription(restoreDays)}</p>
      </div>

      <dl className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{RESTORE_TEXT.withdrawnAt}</dt>
          <dd>{dates.withdrawnAt}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{RESTORE_TEXT.restorableUntil}</dt>
          <dd className="font-semibold">{dates.until}</dd>
        </div>
      </dl>

      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
        {RESTORE_NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>

      {outcome ? (
        <p role="alert" className="text-sm text-destructive">
          {outcome.message}
        </p>
      ) : null}
      {signOut.error ? (
        <p role="alert" className="text-sm text-destructive">
          {signOut.error}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 *:h-11">
        {/* 기한이 지났거나 되살릴 계정이 없으면 [계정 되살리기] 대신 다음 갈 곳을 준다 */}
        {outcome?.kind === 'expired' ? (
          <Link href={`/join?next=${encodeURIComponent(next)}`} className={buttonVariants()}>
            {RESTORE_TEXT.join}
          </Link>
        ) : outcome?.kind === 'gone' ? (
          <Link href={afterRestorePath(next)} className={buttonVariants()}>
            {RESTORE_TEXT.continue}
          </Link>
        ) : (
          <Button type="button" disabled={busy} onClick={restore}>
            {pending || leaving ? RESTORE_TEXT.restoring : RESTORE_TEXT.restore}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={busy} onClick={signOut.signOutNow}>
          {signOut.pending ? '로그아웃 중…' : '로그아웃'}
        </Button>
      </div>
    </section>
  );
}
