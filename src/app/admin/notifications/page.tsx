import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { formatKstDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';
import { NOTIFICATION_INBOX_DAYS } from '@/server/policy';

import {
  labelPushErrors,
  NOTIFICATION_ISSUE_TAB_LABELS,
  NOTIFICATION_ISSUE_TABS,
  type NotificationIssueTab,
  notificationIssuesHref,
  RECIPIENT_ACCOUNT_LABELS,
  toNotificationIssueTab,
} from './format';
import {
  countNotificationIssues,
  type NotificationIssueRow,
  selectNotificationIssues,
} from './queries';
import { ResendAction } from './resend-action';

export const metadata: Metadata = { title: '알림 확인' };

type SearchParams = Promise<{ tab?: SearchValue; page?: SearchValue }>;

const HEAD_CELL = 'px-4 py-3 font-medium whitespace-nowrap';
const CELL = 'px-4 py-3';

const TAB_DESCRIPTIONS: Record<NotificationIssueTab, string> = {
  failed:
    '푸시 알림을 켠 기기로 보냈는데 한 기기도 받지 못한 알림이에요. 알림함에는 남아 있어요. 구독이 끝난 기기는 지웠어요.',
  no_device:
    '보낼 때 그 계정에 푸시 알림을 켠 기기가 없어서 알림함에만 남은 알림이에요. 그 뒤에 기기를 켰으면 다시 보낼 수 있어요.',
};

// 알림 확인 (#373 ⑤). 주소: /admin/notifications?tab=failed|no_device&page=
// 알림함 기간(최근 90일) 안에 보내지 못한 알림과 받을 기기가 없던 알림을 최신 순으로 20줄씩 보여 준다.
// [다시 보내기]는 지금 그 계정의 푸시 알림 기기로 푸시를 한 번 더 보낸다(사유 필수, 운영자 처리 기록)
export default function AdminNotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">알림 확인</h1>
        <p className="text-sm text-muted-foreground">
          최근 {NOTIFICATION_INBOX_DAYS}일 동안 푸시 알림이 가지 않은 알림이에요. 모든 알림은 받는
          계정의 알림함에 남아 있고, 여기서는 푸시만 다시 보내요.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Issues searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Issues({ searchParams }: { searchParams: SearchParams }) {
  const admin = await ensureAdminPage();
  const raw = await searchParams;
  const tab = toNotificationIssueTab(firstParam(raw.tab));
  const requestedPage = Number(firstParam(raw.page) ?? '1');
  await recordAdminAccess(admin.userId, {
    action: 'search',
    targetType: 'list',
    path: notificationIssuesHref({ tab, page: requestedPage }),
  });
  const db = getDb();
  const now = await getRequestNow();
  const counts = await countNotificationIssues(db, now);
  const result = await selectNotificationIssues(db, {
    tab,
    page: requestedPage,
    now,
    total: counts[tab],
  });

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="알림 종류" className="flex gap-2">
        {NOTIFICATION_ISSUE_TABS.map((item) => (
          <Link
            key={item}
            href={notificationIssuesHref({ tab: item })}
            aria-current={item === tab ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1 text-sm ring-1 ring-foreground/10',
              item === tab ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
            )}
          >
            {NOTIFICATION_ISSUE_TAB_LABELS[item]} {counts[item].toLocaleString('ko-KR')}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">{TAB_DESCRIPTIONS[tab]}</p>
      {result.rows.length > 0 ? (
        <IssuesTable tab={tab} rows={result.rows} />
      ) : (
        <EmptyState
          title={`${NOTIFICATION_ISSUE_TAB_LABELS[tab]} 알림이 없어요`}
          className="rounded-xl bg-card py-8"
        />
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        href={(page) => notificationIssuesHref({ tab, page })}
      />
    </div>
  );
}

function IssuesTable({ tab, rows }: { tab: NotificationIssueTab; rows: NotificationIssueRow[] }) {
  return (
    <div className="relative overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className={HEAD_CELL}>생긴 시각</th>
            <th className={HEAD_CELL}>받는 계정</th>
            <th className={HEAD_CELL}>알림</th>
            {tab === 'failed' ? <th className={HEAD_CELL}>이유</th> : null}
            <th className={HEAD_CELL}>알림함</th>
            <th className={HEAD_CELL}>지금 기기</th>
            <th className={HEAD_CELL}>
              <span className="sr-only">다시 보내기</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.notificationId} className="border-b align-top last:border-b-0">
              <td className={cn(CELL, 'whitespace-nowrap')}>{formatKstDateTime(row.createdAt)}</td>
              <td className={cn(CELL, 'whitespace-nowrap')}>
                <span className="text-muted-foreground">
                  {RECIPIENT_ACCOUNT_LABELS[row.accountType] ?? row.accountType}
                </span>{' '}
                {row.recipientName ?? '(계정 없음)'}
              </td>
              <td className={CELL}>
                <p className="font-medium">{row.title || '(제목 없음)'}</p>
                {row.body ? <p className="text-muted-foreground">{row.body}</p> : null}
              </td>
              {tab === 'failed' ? (
                <td className={cn(CELL, 'whitespace-nowrap')}>{labelPushErrors(row.error)}</td>
              ) : null}
              <td className={cn(CELL, 'whitespace-nowrap')}>{row.readAt ? '읽음' : '안 읽음'}</td>
              <td className={cn(CELL, 'whitespace-nowrap')}>
                {row.devices > 0 ? `${row.devices}대` : '없음'}
              </td>
              <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                {row.devices > 0 ? (
                  <ResendAction notificationId={row.notificationId} title={row.title} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    기기가 생기면 보낼 수 있어요
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
