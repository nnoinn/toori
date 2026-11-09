import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/uuid';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';

import { labelReservation } from '../../../lookup';
import { type CustomerDetail, selectCustomerDetail } from '../../queries';

export const metadata: Metadata = { title: '고객 정보' };

type Params = Promise<{ customerId: string }>;

// 고객 상세 (A-102). 주소: /admin/users/customers/[customerId]. 전체 번호와 이메일은 여기서만 보여준다(조회만)
export default function AdminCustomerPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/admin/users" />
        <h1 className="text-xl font-bold">고객 정보</h1>
      </div>
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

function labelMarketing({ marketing }: CustomerDetail): string {
  if (marketing.agreedAt) return `동의(${formatKst(marketing.agreedAt)})`;
  if (marketing.withdrawnAt) return `철회(${formatKst(marketing.withdrawnAt)})`;
  return '동의 안 함';
}

async function Detail({ params }: { params: Params }) {
  const admin = await ensureAdminPage();
  const { customerId } = await params;
  if (!isUuid(customerId)) notFound();
  const detail = await selectCustomerDetail(getDb(), customerId);
  if (!detail) notFound();
  await recordAdminAccess(admin.userId, {
    action: 'view',
    targetType: 'customer',
    targetId: customerId,
    path: `/admin/users/customers/${customerId}`,
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{detail.nickname}</CardTitle>
        </CardHeader>
        <CardContent>
          <Fields
            rows={[
              ['이메일', detail.email],
              ['휴대폰', detail.phone ?? '-'],
              ['가입', formatKst(detail.createdAt)],
              ['탈퇴', detail.withdrawnAt ? formatKst(detail.withdrawnAt) : '-'],
              ['광고성 정보 수신', labelMarketing(detail)],
              [
                '이용 기록',
                `예약 ${detail.reservationCount}건 · 취소 ${detail.cancelCount}건 · 노쇼 ${detail.noShowCount}건`,
              ],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>최근 예약</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.reservations.length === 0 ? (
            <p className="text-sm text-muted-foreground">예약이 없어요</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">예약번호</th>
                    <th className="py-2 pr-4 font-medium">샵</th>
                    <th className="py-2 pr-4 font-medium">메뉴</th>
                    <th className="py-2 pr-4 font-medium">일시</th>
                    <th className="py-2 pr-4 font-medium">결제액</th>
                    <th className="py-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.reservations.map((row) => (
                    <tr key={row.reservationId} className="border-b last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap">{row.code}</td>
                      <td className="py-2 pr-4">{row.shopName}</td>
                      <td className="py-2 pr-4">{row.menuName}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatKst(row.startAt)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatWon(row.amount)}</td>
                      <td className="py-2 whitespace-nowrap">
                        {labelReservation(row.status, row.visitResult)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Fields({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
