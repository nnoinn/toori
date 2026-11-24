'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OwnerSignOutButton } from '@/components/ui/owner-nav';
import { restoreOwner } from '@/server/accounts/withdrawal';
import { OWNER_JOIN_PATH } from '@/server/auth/paths';

import {
  AFTER_RESTORE_PATH,
  afterRestore,
  RESTORE_NOTES,
  RESTORE_TEXT,
  type RestoreOutcome,
} from './restore-rules';

/**
 * 원장님 [계정 되살리기] (#154 3장). 누르면 restoreOwner를 부르고, 되살리면 원장님 대시보드를 새로 연다
 * (원장님 화면 묶음이 새 계정 상태를 처음부터 읽게). 기한이 지났으면 [새로 가입하기], 되살릴 계정이 없으면 [계속하기].
 * 다른 로그인으로 가려면 [로그아웃]. 고객 되살리기(정찬형)와 같은 순서다. PC 기준
 */
export function OwnerRestoreForm({
  description,
  withdrawnAt,
  until,
}: {
  description: string;
  withdrawnAt: string;
  until: string;
}) {
  const [outcome, setOutcome] = useState<Exclude<RestoreOutcome, { kind: 'done' }> | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [restoring, startRestore] = useTransition();
  const busy = restoring || leaving;

  function restore() {
    setOutcome(null);
    startRestore(async () => {
      try {
        const result = afterRestore(await restoreOwner());
        if (result.kind === 'done') {
          setLeaving(true);
          // 되살리기 화면은 기록에서 빼서 뒤로 가기로 다시 보이지 않게 한다
          window.location.replace(AFTER_RESTORE_PATH);
        } else {
          setOutcome(result);
        }
      } catch (caught) {
        unstable_rethrow(caught);
        setOutcome({ kind: 'error', message: RESTORE_TEXT.failed });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{RESTORE_TEXT.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted px-4 py-3 text-sm">
          <dt className="text-muted-foreground">{RESTORE_TEXT.withdrawnAt}</dt>
          <dd className="font-medium">{withdrawnAt}</dd>
          <dt className="text-muted-foreground">{RESTORE_TEXT.restorableUntil}</dt>
          <dd className="font-medium">{until}</dd>
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
        <div className="flex flex-wrap items-start gap-2">
          {outcome?.kind === 'expired' ? (
            <Link href={OWNER_JOIN_PATH} className={buttonVariants({ size: 'lg' })}>
              {RESTORE_TEXT.join}
            </Link>
          ) : outcome?.kind === 'gone' ? (
            <Link href={AFTER_RESTORE_PATH} className={buttonVariants({ size: 'lg' })}>
              {RESTORE_TEXT.continue}
            </Link>
          ) : (
            <Button type="button" size="lg" disabled={busy} onClick={restore}>
              {busy ? RESTORE_TEXT.restoring : RESTORE_TEXT.restore}
            </Button>
          )}
          <OwnerSignOutButton variant="page" />
        </div>
      </CardContent>
    </Card>
  );
}
