'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { cn } from 'cn';

import {
  countMyUnreadNotifications,
  listMyNotifications,
  markNotificationsRead,
} from '@/server/notifications/inbox';
import {
  type MyNotification,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationAccount,
} from '@/server/notifications/inbox-types';

import { Button } from './button';
import {
  NOTIFICATION_INBOX_TEXTS as TEXTS,
  notificationHref,
  notificationTimeText,
} from './notification-inbox-rules';
import { Skeleton } from './skeleton';
import { EmptyState, ErrorState } from './state';

// 알림함 목록 (#371). 원장님 알림함(/owner/notifications, 11/17 정민석)이 쓰고, 고객 알림함과 같은 동작이다.
// 최근 90일, 최신 순 20개씩, 아래 [더 보기]. 안 읽은 알림은 초록 점과 굵은 제목.
// 줄을 누르면 읽음으로 바꾸고 바로 그 화면(예약 상세 등)으로 간다(읽음 처리가 실패해도 이동한다).
// 제목 줄과 바깥 틀은 화면마다 다르게 그리게 frame으로 받는다(원장님은 OwnerPage 틀). 화면에 다시 들어올 때마다 새로 불러온다.
// 고객 알림함(/notifications)도 이 부품을 쓴다(11/20 정찬형). 폰에서는 버튼을 누르기 쉽게 40px 높이로 둔다

type Inbox = {
  items: MyNotification[];
  nextCursor: string | null;
  /** 시각 문구("3분 전")의 기준. 처음 불러올 때의 서버 시각 */
  serverNow: string;
  /** 안 읽은 수(아직 불러오지 않은 아래쪽 알림 포함). [모두 읽음]을 누를 수 있는지 정한다 */
  unread: number;
};

type InboxState =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; inbox: Inbox };

/** 종에게 안 읽은 수를 다시 물으라고 알린다 */
function tellBell() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

async function loadInbox(account: NotificationAccount): Promise<InboxState> {
  try {
    const [list, count] = await Promise.all([
      listMyNotifications(undefined, account),
      countMyUnreadNotifications(account),
    ]);
    if (!list.ok) return { kind: 'error', message: list.error.message };
    const unread =
      count.ok && count.data !== null
        ? count.data
        : list.data.items.filter((item) => item.readAt === null).length;
    return { kind: 'ready', inbox: { ...list.data, unread } };
  } catch {
    return { kind: 'error', message: TEXTS.LOAD_FAILED };
  }
}

type NotificationInboxProps = {
  /** 알림함을 보는 계정 종류. 지금 들어와 있는 계정 모드와 같아야 알림이 온다 */
  account: NotificationAccount;
  /** 알림이 없을 때 제목 아래 설명. 예: "새 예약, 예약 취소 … 알림이 여기에 쌓여요." */
  emptyHelp: string;
  /**
   * 바깥 틀. markAll은 제목 줄에 둘 [모두 읽음] 버튼(알림이 없으면 null), body는 목록이다.
   * 예: (markAll, body) => <OwnerPage title="알림" action={markAll}>{body}</OwnerPage>
   */
  frame: (markAll: React.ReactNode, body: React.ReactNode) => React.ReactNode;
};

export function NotificationInbox({ account, emptyHelp, frame }: NotificationInboxProps) {
  const [state, setState] = useState<InboxState>({ kind: 'loading' });
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle');
  const [markError, setMarkError] = useState<string | null>(null);
  const [marking, startMarking] = useTransition();

  useEffect(() => {
    let ignore = false;
    void loadInbox(account).then((next) => {
      if (!ignore) setState(next);
    });
    return () => {
      ignore = true;
    };
  }, [account]);

  function update(change: (inbox: Inbox) => Inbox) {
    setState((prev) =>
      prev.kind === 'ready' ? { kind: 'ready', inbox: change(prev.inbox) } : prev,
    );
  }

  function retry() {
    setState({ kind: 'loading' });
    void loadInbox(account).then(setState);
  }

  function open(item: MyNotification) {
    if (item.readAt !== null) return;
    const readAt = new Date().toISOString();
    update((inbox) => ({
      ...inbox,
      items: inbox.items.map((it) => (it.id === item.id ? { ...it, readAt } : it)),
      unread: Math.max(0, inbox.unread - 1),
    }));
    // 이동을 막지 않는다. 실패해도 다음에 들어올 때 다시 안 읽음으로 보일 뿐이다
    markNotificationsRead({ ids: [item.id] }, account)
      .then(tellBell)
      .catch(() => {});
  }

  function markAll() {
    setMarkError(null);
    startMarking(async () => {
      try {
        const result = await markNotificationsRead({ all: true }, account);
        if (!result.ok) {
          setMarkError(result.error.message);
          return;
        }
        const readAt = new Date().toISOString();
        update((inbox) => ({
          ...inbox,
          items: inbox.items.map((it) => (it.readAt === null ? { ...it, readAt } : it)),
          unread: 0,
        }));
        tellBell();
      } catch {
        setMarkError(TEXTS.MARK_ALL_FAILED);
      }
    });
  }

  async function loadMore(cursor: string) {
    setMore('loading');
    try {
      const result = await listMyNotifications({ cursor }, account);
      if (!result.ok) {
        setMore('error');
        return;
      }
      update((inbox) => {
        const seen = new Set(inbox.items.map((it) => it.id));
        return {
          ...inbox,
          items: [...inbox.items, ...result.data.items.filter((it) => !seen.has(it.id))],
          nextCursor: result.data.nextCursor,
        };
      });
      setMore('idle');
    } catch {
      setMore('error');
    }
  }

  const inbox = state.kind === 'ready' ? state.inbox : null;
  const markAllButton =
    inbox && inbox.items.length > 0 ? (
      <Button
        type="button"
        variant="ghost"
        className="text-muted-foreground max-md:h-10"
        disabled={inbox.unread === 0 || marking}
        onClick={markAll}
      >
        {marking ? TEXTS.MARKING_ALL : TEXTS.MARK_ALL}
      </Button>
    ) : null;

  const body = (
    <>
      {markError ? (
        <p role="alert" className="text-sm text-destructive">
          {markError}
        </p>
      ) : null}
      {state.kind === 'loading' ? (
        <NotificationRowsSkeleton />
      ) : state.kind === 'error' ? (
        <ErrorState
          description={state.message}
          action={
            <Button type="button" variant="outline" className="max-md:h-10" onClick={retry}>
              {TEXTS.RETRY}
            </Button>
          }
        />
      ) : state.inbox.items.length === 0 ? (
        <EmptyState title={TEXTS.EMPTY} description={emptyHelp} />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="divide-y rounded-2xl border bg-card">
            {state.inbox.items.map((item) => (
              <li key={item.id}>
                <NotificationRow
                  item={item}
                  serverNow={state.inbox.serverNow}
                  onOpen={() => open(item)}
                />
              </li>
            ))}
          </ul>
          {state.inbox.nextCursor ? (
            <div className="flex flex-col items-center gap-2 pb-4">
              {more === 'error' ? (
                <p role="alert" className="text-sm text-destructive">
                  {TEXTS.MORE_FAILED}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10 px-8"
                disabled={more === 'loading'}
                onClick={() => {
                  if (state.inbox.nextCursor) void loadMore(state.inbox.nextCursor);
                }}
              >
                {more === 'loading' ? TEXTS.LOADING : TEXTS.MORE}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  return frame(markAllButton, body);
}

function NotificationRow({
  item,
  serverNow,
  onOpen,
}: {
  item: MyNotification;
  serverNow: string;
  onOpen: () => void;
}) {
  const unread = item.readAt === null;
  const href = notificationHref(item.url);
  const className =
    'flex w-full gap-3 px-4 py-4 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60';
  const content = (
    <>
      <span
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          unread ? 'bg-primary' : 'bg-transparent',
        )}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn('text-sm', unread ? 'font-semibold' : 'text-foreground/80')}>
            {unread ? <span className="sr-only">{TEXTS.UNREAD}, </span> : null}
            {item.title}
          </span>
          <time dateTime={item.createdAt} className="shrink-0 text-xs text-muted-foreground">
            {notificationTimeText(item.createdAt, serverNow)}
          </time>
        </span>
        <span className="line-clamp-2 text-sm text-muted-foreground">{item.body}</span>
      </span>
    </>
  );
  // 투리 안 주소가 아니면 이동하지 않고 읽음으로만 바꾼다
  return href ? (
    <Link href={href} className={className} onClick={onOpen}>
      {content}
    </Link>
  ) : (
    <button type="button" className={className} onClick={onOpen}>
      {content}
    </button>
  );
}

/** 불러오는 동안 보이는 알림 줄 모양. 화면의 <Suspense> 대기 화면에도 쓴다 */
export function NotificationRowsSkeleton() {
  return (
    <div className="divide-y rounded-2xl border bg-card" aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3 px-4 py-4">
          <Skeleton className="mt-1.5 size-2 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
