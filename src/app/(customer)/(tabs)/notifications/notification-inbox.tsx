'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { cn } from 'cn';

import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { CUSTOMER_HOME } from '@/server/auth/paths';

// 지금은 가짜 결과 버전(#371). 진짜 함수가 들어오면 이 import만 바꾼다
import {
  countMyUnreadNotifications,
  listMyNotifications,
  markNotificationsRead,
} from './fake-actions';
import {
  type MyNotification,
  NOTIFICATION_TEXTS,
  NOTIFICATIONS_READ_EVENT,
  notificationHref,
  notificationTimeText,
} from './notification-rules';

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

/** 종(위쪽 메뉴)에게 안 읽은 수를 다시 물으라고 알린다 */
function tellBell() {
  window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
}

async function loadInbox(): Promise<InboxState> {
  try {
    const [list, count] = await Promise.all([listMyNotifications(), countMyUnreadNotifications()]);
    if (!list.ok) return { kind: 'error', message: list.error.message };
    const unread =
      count.ok && count.data !== null
        ? count.data
        : list.data.items.filter((item) => item.readAt === null).length;
    return { kind: 'ready', inbox: { ...list.data, unread } };
  } catch {
    return { kind: 'error', message: NOTIFICATION_TEXTS.LOAD_FAILED };
  }
}

/**
 * 고객 알림함 (#371, 11/13 nnoinn). 주소: /notifications. 최근 90일, 최신 순 20개씩, 아래 [더 보기].
 * 안 읽은 알림은 초록 점과 굵은 제목. 줄을 누르면 읽음으로 바꾸고 바로 그 화면(예약 상세 등)으로 간다(읽음 처리가 실패해도 이동한다).
 * 화면에 다시 들어올 때마다 새로 불러온다(떠났다 와도 남는 화면, Activity)
 */
export function NotificationInbox() {
  const [state, setState] = useState<InboxState>({ kind: 'loading' });
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle');
  const [markError, setMarkError] = useState<string | null>(null);
  const [marking, startMarking] = useTransition();

  useEffect(() => {
    let ignore = false;
    void loadInbox().then((next) => {
      if (!ignore) setState(next);
    });
    return () => {
      ignore = true;
    };
  }, []);

  function update(change: (inbox: Inbox) => Inbox) {
    setState((prev) =>
      prev.kind === 'ready' ? { kind: 'ready', inbox: change(prev.inbox) } : prev,
    );
  }

  function retry() {
    setState({ kind: 'loading' });
    void loadInbox().then(setState);
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
    markNotificationsRead({ ids: [item.id] })
      .then(tellBell)
      .catch(() => {});
  }

  function markAll() {
    setMarkError(null);
    startMarking(async () => {
      try {
        const result = await markNotificationsRead({ all: true });
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
        setMarkError(NOTIFICATION_TEXTS.MARK_ALL_FAILED);
      }
    });
  }

  async function loadMore(cursor: string) {
    setMore('loading');
    try {
      const result = await listMyNotifications({ cursor });
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

  return (
    <main className="flex flex-1 flex-col md:mx-auto md:w-full md:max-w-3xl md:px-6 md:py-6">
      <div className="flex items-center gap-1 px-2 py-2 md:px-0 md:pt-0">
        <BackButton fallbackHref={CUSTOMER_HOME} className="md:hidden" />
        <h1 className="flex-1 px-2 text-xl font-bold md:px-0">{NOTIFICATION_TEXTS.TITLE}</h1>
        {inbox && inbox.items.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground max-md:h-10"
            disabled={inbox.unread === 0 || marking}
            onClick={markAll}
          >
            {marking ? NOTIFICATION_TEXTS.MARKING_ALL : NOTIFICATION_TEXTS.MARK_ALL}
          </Button>
        ) : null}
      </div>
      {markError ? (
        <p role="alert" className="px-4 pb-2 text-sm text-destructive md:px-0">
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
              {NOTIFICATION_TEXTS.RETRY}
            </Button>
          }
        />
      ) : state.inbox.items.length === 0 ? (
        <EmptyState title={NOTIFICATION_TEXTS.EMPTY} description={NOTIFICATION_TEXTS.EMPTY_HELP} />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="divide-y bg-card md:rounded-2xl md:border">
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
            <div className="flex flex-col items-center gap-2 px-4 pb-4">
              {more === 'error' ? (
                <p role="alert" className="text-sm text-destructive">
                  {NOTIFICATION_TEXTS.MORE_FAILED}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full md:w-auto md:px-8"
                disabled={more === 'loading'}
                onClick={() => {
                  if (state.inbox.nextCursor) void loadMore(state.inbox.nextCursor);
                }}
              >
                {more === 'loading' ? NOTIFICATION_TEXTS.LOADING_MORE : NOTIFICATION_TEXTS.MORE}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
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
  const className = 'flex w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/60';
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
            {unread ? <span className="sr-only">{NOTIFICATION_TEXTS.UNREAD}, </span> : null}
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

/** 불러오는 동안 보이는 알림 줄 모양 */
export function NotificationRowsSkeleton() {
  return (
    <div
      className="divide-y bg-card md:rounded-2xl md:border"
      aria-busy="true"
      aria-label="불러오는 중"
    >
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
