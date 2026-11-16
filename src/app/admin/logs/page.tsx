import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { DetailLink, SelectableRow, SelectableRows } from '@/components/ui/selectable-rows';
import { Skeleton } from '@/components/ui/skeleton';
import { SortSelect } from '@/components/ui/sort-select';
import { EmptyState } from '@/components/ui/state';
import { getDb } from '@/db';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { formatKstDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { recordAdminAccess } from '@/server/admin/access-log';
import { FALLBACK_ADMIN_NAME } from '@/server/admin/admin-profile';
import { ensureAdminPage } from '@/server/auth';

import {
  ACCESS_ACTION_LABELS,
  ACTION_LABELS,
  LOG_SORT_LABELS,
  LOG_SORTS,
  LOG_TAB_LABELS,
  LOG_TABS,
  labelOf,
  logsHref,
  TARGET_TYPE_LABELS,
  targetHref,
  toLogParams,
} from './format';
import {
  type AccessLogRow,
  type ActionLogRow,
  selectAccessLogs,
  selectActionLogs,
  selectAdminsForFilter,
} from './queries';

export const metadata: Metadata = { title: '운영자 기록' };

type SearchParams = Promise<
  Record<'tab' | 'sort' | 'admin' | 'kind' | 'target' | 'from' | 'to' | 'page', SearchValue>
>;

const HEAD_CELL = 'px-4 py-3 font-medium';
const CELL = 'px-4 py-3';

// 운영자 기록 (#372 5장, 점검 8-2 "열람 기록은 어디서 보나"). 주소: /admin/logs?tab=actions|access&sort=new|old&admin=&kind=&target=&from=&to=&page=
// 운영자 목록 방식(기술 가이드 7장): 줄을 한 번 누르면 선택, 두 번 누르거나 Enter·[상세]면 대상 화면. 한 쪽 20줄, 아래에 쪽 번호
// 처리 기록(누가 무엇을 바꿨는지, 사유)과 열람 기록(누가 개인정보를 봤는지, 접속 IP)을 본다. 두 기록 모두 앱에서 고치거나 지울 수 없다(DB 트리거).
// 접속 IP가 보여서 이 화면을 연 것도 열람 기록에 남긴다
export default function AdminLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">운영자 기록</h1>
        <p className="text-sm text-muted-foreground">
          운영자가 처리한 일과 개인정보를 본 기록이에요. 기록은 고치거나 지울 수 없고, 이 화면을 연
          것도 열람 기록에 남아요.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Logs searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Logs({ searchParams }: { searchParams: SearchParams }) {
  const admin = await ensureAdminPage();
  const raw = await searchParams;
  const params = toLogParams({
    tab: firstParam(raw.tab),
    sort: firstParam(raw.sort),
    admin: firstParam(raw.admin),
    kind: firstParam(raw.kind),
    target: firstParam(raw.target),
    from: firstParam(raw.from),
    to: firstParam(raw.to),
    page: firstParam(raw.page),
  });
  await recordAdminAccess(admin.userId, {
    action: 'search',
    targetType: 'list',
    path: logsHref(params),
  });
  const db = getDb();
  const [admins, result] = await Promise.all([
    selectAdminsForFilter(db),
    params.tab === 'actions' ? selectActionLogs(db, params) : selectAccessLogs(db, params),
  ]);
  const kindLabels = params.tab === 'actions' ? ACTION_LABELS : ACCESS_ACTION_LABELS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="기록 종류" className="flex gap-2">
          {LOG_TABS.map((tab) => (
            <Link
              key={tab}
              href={logsHref({ tab })}
              aria-current={tab === params.tab ? 'page' : undefined}
              className={chipClass(tab === params.tab)}
            >
              {LOG_TAB_LABELS[tab]}
            </Link>
          ))}
        </nav>
        <SortSelect
          value={params.sort}
          options={LOG_SORTS.map((sort) => ({
            value: sort,
            label: LOG_SORT_LABELS[sort],
            href: logsHref({ ...params, sort, page: 1 }),
          }))}
        />
      </div>

      <form action="/admin/logs" className="flex flex-wrap items-end gap-2">
        {params.tab !== 'actions' ? <input type="hidden" name="tab" value={params.tab} /> : null}
        {params.sort !== 'new' ? <input type="hidden" name="sort" value={params.sort} /> : null}
        <FilterField label="운영자">
          <select name="admin" defaultValue={params.admin ?? ''} className={NATIVE_SELECT_CLASS}>
            <option value="">모든 운영자</option>
            {admins.map((option) => (
              <option key={option.adminId} value={option.adminId}>
                {option.name ?? FALLBACK_ADMIN_NAME}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="한 일">
          <select name="kind" defaultValue={params.kind ?? ''} className={NATIVE_SELECT_CLASS}>
            <option value="">모두</option>
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="대상">
          <select name="target" defaultValue={params.target ?? ''} className={NATIVE_SELECT_CLASS}>
            <option value="">모두</option>
            {Object.entries(TARGET_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="기간 시작">
          <Input type="date" name="from" defaultValue={params.from ?? ''} className="w-40" />
        </FilterField>
        <FilterField label="기간 끝">
          <Input type="date" name="to" defaultValue={params.to ?? ''} className="w-40" />
        </FilterField>
        <Button type="submit" variant="outline">
          보기
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {result.total > 0 ? `고른 기록 ${result.total.toLocaleString('ko-KR')}건` : null}
      </p>
      {result.rows.length === 0 ? (
        <EmptyState title="맞는 기록이 없어요" className="rounded-xl bg-card" />
      ) : params.tab === 'actions' ? (
        <ActionTable rows={result.rows as ActionLogRow[]} />
      ) : (
        <AccessTable rows={result.rows as AccessLogRow[]} />
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        href={(page) => logsHref({ ...params, page })}
      />
    </div>
  );
}

function ActionTable({ rows }: { rows: ActionLogRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className={HEAD_CELL}>시각</th>
            <th className={HEAD_CELL}>운영자</th>
            <th className={HEAD_CELL}>한 일</th>
            <th className={HEAD_CELL}>대상</th>
            <th className={HEAD_CELL}>사유</th>
            <th className={HEAD_CELL}>
              <span className="sr-only">상세</span>
            </th>
          </tr>
        </thead>
        <SelectableRows>
          {rows.map((row) => (
            <SelectableRow
              key={row.id}
              id={row.id}
              href={targetHref(row.targetType, row.targetId)}
              className="align-top"
            >
              <td className={cn(CELL, 'whitespace-nowrap')}>{formatKstDateTime(row.createdAt)}</td>
              <td className={cn(CELL, 'whitespace-nowrap')}>
                {row.adminName ?? FALLBACK_ADMIN_NAME}
              </td>
              <td className={cn(CELL, 'whitespace-nowrap')}>
                {labelOf(ACTION_LABELS, row.action)}
              </td>
              <td className={CELL}>
                <Target type={row.targetType} id={row.targetId} label={row.targetLabel} />
              </td>
              <td className={cn(CELL, 'break-all whitespace-pre-wrap')}>{row.memo ?? '-'}</td>
              <td className={cn(CELL, 'text-right')}>
                <RowDetail type={row.targetType} id={row.targetId} label={row.targetLabel} />
              </td>
            </SelectableRow>
          ))}
        </SelectableRows>
      </table>
    </div>
  );
}

function AccessTable({ rows }: { rows: AccessLogRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className={HEAD_CELL}>시각</th>
            <th className={HEAD_CELL}>운영자</th>
            <th className={HEAD_CELL}>한 일</th>
            <th className={HEAD_CELL}>대상</th>
            <th className={HEAD_CELL}>화면</th>
            <th className={HEAD_CELL}>검색어</th>
            <th className={cn(HEAD_CELL, 'whitespace-nowrap')}>접속 IP</th>
            <th className={HEAD_CELL}>
              <span className="sr-only">상세</span>
            </th>
          </tr>
        </thead>
        <SelectableRows>
          {rows.map((row) => (
            <SelectableRow
              key={row.id}
              id={row.id}
              href={targetHref(row.targetType, row.targetId)}
              className="align-top"
            >
              <td className={cn(CELL, 'whitespace-nowrap')}>{formatKstDateTime(row.createdAt)}</td>
              <td className={cn(CELL, 'whitespace-nowrap')}>
                {row.adminName ?? FALLBACK_ADMIN_NAME}
              </td>
              <td className={cn(CELL, 'whitespace-nowrap')}>
                {labelOf(ACCESS_ACTION_LABELS, row.action)}
              </td>
              <td className={CELL}>
                <Target type={row.targetType} id={row.targetId} label={row.targetLabel} />
              </td>
              <td className={cn(CELL, 'break-all text-muted-foreground')}>{row.path}</td>
              <td className={cn(CELL, 'break-all')}>{row.query ?? '-'}</td>
              <td className={cn(CELL, 'whitespace-nowrap')}>{row.ip ?? '-'}</td>
              <td className={cn(CELL, 'text-right')}>
                <RowDetail type={row.targetType} id={row.targetId} label={row.targetLabel} />
              </td>
            </SelectableRow>
          ))}
        </SelectableRows>
      </table>
    </div>
  );
}

/** 대상: 종류와 이름. 대상 화면은 줄을 두 번 누르거나 끝 칸 [상세]로 연다(글자 링크는 두지 않는다, 11/15 nnoinn) */
function Target({ type, label }: { type: string; id: string | null; label: string | null }) {
  const name = label ?? (type === 'list' ? null : '이름 없음');
  return (
    <span>
      <span className="text-muted-foreground">{labelOf(TARGET_TYPE_LABELS, type)}</span>
      {name ? ` ${name}` : null}
    </span>
  );
}

/** 끝 칸 [상세]: 운영자 화면이 있는 대상만 */
function RowDetail({ type, id, label }: { type: string; id: string | null; label: string | null }) {
  const href = targetHref(type, id);
  if (!href) return null;
  return (
    <DetailLink href={href} label={`${labelOf(TARGET_TYPE_LABELS, type)} ${label ?? ''} 상세`} />
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function chipClass(active: boolean) {
  return cn(
    'rounded-full px-3 py-1 text-sm ring-1 ring-foreground/10',
    active ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
