// 운영자 [이력 보기] 목록(#374, AUTH-13). 고객 이력·원장님 이력 화면이 같이 쓴다.
// 이력은 getAdminAccountHistory(볼 때마다 열람 기록을 남긴다)로 읽고, 문구는 historyText(원장님 계정 이력 화면과 같은 문구)로 만든다.
// [더보기]는 같은 화면 주소에 ?before=(이번 쪽 마지막 일의 시각)를 붙인다.

import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { formatKstDateTime } from '@/lib/time';
import { getAdminAccountHistory } from '@/server/accounts/history';
import { historyText } from '@/server/accounts/history-texts';
import type { AccountType } from '@/server/accounts/history-types';

export async function AdminHistoryList({
  accountType,
  accountId,
  before,
  path,
}: {
  accountType: AccountType;
  accountId: string;
  before: string | undefined;
  /** 이 화면 주소([더보기] 링크에 쓴다) */
  path: string;
}) {
  const result = await getAdminAccountHistory({ accountType, accountId, before });
  if (!result.ok) {
    return (
      <Card>
        <ErrorState title="이력을 불러오지 못했어요" description={result.error.message} />
      </Card>
    );
  }
  const { events, nextBefore } = result.data;
  if (events.length === 0) {
    return (
      <Card>
        <EmptyState
          title={before ? '더 앞선 이력이 없어요' : '아직 이력이 없어요'}
          description="메뉴·영업시간·사진 수정처럼 기록이 남지 않는 일은 보이지 않아요"
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="gap-0 py-0">
        <ol className="divide-y">
          {events.map((event) => {
            const text = historyText(event, { audience: 'admin', accountType });
            const body = (
              <>
                <span className="w-36 shrink-0 text-sm whitespace-nowrap text-muted-foreground">
                  {formatKstDateTime(new Date(event.at))}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{text.title}</span>
                  {text.detail ? (
                    <span className="text-sm text-muted-foreground">{text.detail}</span>
                  ) : null}
                </span>
              </>
            );
            return (
              <li key={event.key}>
                {text.href ? (
                  <Link href={text.href} className="flex gap-4 px-4 py-3 hover:bg-muted/50">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-4 px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
      {nextBefore ? (
        <Link
          href={`${path}?before=${encodeURIComponent(nextBefore)}`}
          className={buttonVariants({ variant: 'outline', className: 'self-center' })}
        >
          더보기
        </Link>
      ) : null}
    </div>
  );
}
