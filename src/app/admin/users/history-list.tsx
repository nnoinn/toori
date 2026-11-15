// 운영자 [이력 보기] 목록(#374, AUTH-13). 고객 이력·원장님 이력 화면이 같이 쓴다.
// 이력은 getAdminAccountHistory(볼 때마다 열람 기록을 남긴다)로 읽고, 문구는 historyText(원장님 계정 이력 화면과 같은 문구)로 만든다.
// 위에 기간(시작일~끝일, 최근 7·30·90일)과 종류 고르기, 아래에 쪽 번호(한 쪽 20줄)를 둔다(11/15 nnoinn). 고르면 주소가 바뀐다.

import Link from 'next/link';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { getRequestNow } from '@/lib/request-time';
import { formatKstDateTime, kstDateKey } from '@/lib/time';
import { cn } from '@/lib/utils';
import { getAdminAccountHistory } from '@/server/accounts/history';
import { HISTORY_CATEGORY_LABELS, historyText } from '@/server/accounts/history-texts';
import {
  ACCOUNT_HISTORY_CATEGORIES,
  type AccountHistoryQuery,
  type AccountType,
} from '@/server/accounts/history-types';

import { historyHref, QUICK_PERIOD_DAYS, recentPeriod } from './history-query';

export async function AdminHistoryList({
  accountType,
  accountId,
  query,
  path,
}: {
  accountType: AccountType;
  accountId: string;
  query: AccountHistoryQuery;
  /** 이 화면 주소(쪽 번호·기간 링크에 쓴다) */
  path: string;
}) {
  const [result, now] = await Promise.all([
    getAdminAccountHistory({ accountType, accountId, ...query }),
    getRequestNow(),
  ]);
  const filtered = Boolean(query.from || query.to || query.category);

  return (
    <div className="flex flex-col gap-4">
      <HistoryFilter
        accountType={accountType}
        query={query}
        path={path}
        today={kstDateKey(now)}
        filtered={filtered}
      />
      {!result.ok ? (
        <Card>
          <ErrorState title="이력을 불러오지 못했어요" description={result.error.message} />
        </Card>
      ) : result.data.events.length === 0 ? (
        <Card>
          <EmptyState
            title={filtered ? '고른 기간·종류에 맞는 이력이 없어요' : '아직 이력이 없어요'}
            description="메뉴·영업시간·사진 수정처럼 기록이 남지 않는 일은 보이지 않아요"
          />
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {filtered ? '고른 이력' : '전체 이력'} {result.data.total.toLocaleString('ko-KR')}건
          </p>
          <Card className="gap-0 py-0">
            <ol className="divide-y">
              {result.data.events.map((event) => {
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
          <Pagination
            page={result.data.page}
            pageCount={result.data.pageCount}
            href={(page) => historyHref(path, { ...query, page })}
          />
        </>
      )}
    </div>
  );
}

/** 기간·종류 고르기. 주소(GET)로 보내서 새로 고침해도 그대로다 */
function HistoryFilter({
  accountType,
  query,
  path,
  today,
  filtered,
}: {
  accountType: AccountType;
  query: AccountHistoryQuery;
  path: string;
  today: string;
  filtered: boolean;
}) {
  return (
    <form
      action={path}
      className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">기간</legend>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              name="from"
              defaultValue={query.from}
              max={today}
              aria-label="시작일"
              className="w-40"
            />
            <span aria-hidden className="text-muted-foreground">
              ~
            </span>
            <Input
              type="date"
              name="to"
              defaultValue={query.to}
              max={today}
              aria-label="끝일"
              className="w-40"
            />
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">종류</span>
          <select
            name="kind"
            defaultValue={query.category ?? ''}
            className={cn(NATIVE_SELECT_CLASS, 'w-40')}
          >
            <option value="">전체</option>
            {ACCOUNT_HISTORY_CATEGORIES[accountType].map((category) => (
              <option key={category} value={category}>
                {HISTORY_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="submit">검색</Button>
          {filtered ? (
            <Link href={path} className={buttonVariants({ variant: 'ghost' })}>
              초기화
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="빠른 기간">
        {QUICK_PERIOD_DAYS.map((days) => {
          const period = recentPeriod(today, days);
          const active = query.from === period.from && query.to === period.to;
          return (
            <Link
              key={days}
              href={historyHref(path, { ...period, category: query.category })}
              aria-current={active ? 'true' : undefined}
              className={buttonVariants({ variant: active ? 'default' : 'outline', size: 'sm' })}
            >
              최근 {days}일
            </Link>
          );
        })}
      </div>
    </form>
  );
}
