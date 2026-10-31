import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { formatKst } from '@/lib/time';
import { ensureAdminPage } from '@/server/auth';
import { getBusinessDocUrl } from '@/server/storage/upload';

import {
  formatBusinessNumber,
  labelBank,
  labelCategory,
  labelPgSellerStatus,
  labelReviewAction,
} from '../format';
import { selectShopForReview, type ShopReviewDetail } from '../queries';
import { StatusBadge } from '../status-badge';
import { ReviewActions } from './review-actions';

export const metadata: Metadata = { title: '입점 심사' };

type Params = Promise<{ shopId: string }>;

// 입점 심사 상세 (A-101). 주소: /admin/shops/[shopId]. 승인 대기면 승인·반려 버튼. PC 기준
export default function AdminShopReviewPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/admin/shops" />
        <h1 className="text-xl font-bold">입점 심사</h1>
      </div>
      <Suspense fallback={<DetailSkeleton />}>
        <ReviewDetail params={params} />
      </Suspense>
    </main>
  );
}

async function ReviewDetail({ params }: { params: Params }) {
  await ensureAdminPage();
  const { shopId } = await params;
  if (!z.uuid().safeParse(shopId).success) notFound();
  const detail = await selectShopForReview(getDb(), shopId);
  if (!detail) notFound();
  // 비공개 버킷이라 5분 동안만 열리는 주소를 화면을 열 때마다 새로 받는다(#116)
  const doc = await getBusinessDocUrl(shopId);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{detail.shop.name}</CardTitle>
            <StatusBadge status={detail.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Fields
            rows={[
              ['신청', formatKst(detail.appliedAt)],
              ['심사', detail.reviewedAt ? formatKst(detail.reviewedAt) : '-'],
              ...(detail.rejectionReason
                ? ([['반려 사유', detail.rejectionReason]] as [string, string][])
                : []),
            ]}
          />
          {detail.status === 'pending' ? (
            <ReviewActions shopId={detail.shopId} shopName={detail.shop.name} />
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="사업자 정보">
          <Fields
            rows={[
              ['상호', detail.business.businessName],
              ['대표자', detail.business.representativeName],
              ['사업자등록번호', formatBusinessNumber(detail.business.businessRegistrationNumber)],
              ['개업일자', detail.business.openedOn],
            ]}
          />
          {doc.ok ? (
            <a
              href={doc.data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              사업자등록증 열기
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">{doc.error.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            등록증 주소는 5분 동안만 열려요. 지나면 화면을 새로 고쳐 주세요.
          </p>
        </Section>

        <Section title="원장님">
          <Fields
            rows={[
              ['이름', detail.owner.name],
              ['연락처', detail.owner.phone],
            ]}
          />
        </Section>

        <Section title="샵">
          <Fields
            rows={[
              ['샵 이름', detail.shop.name],
              ['업종', labelCategory(detail.shop.category)],
              ['전화', detail.shop.phone],
              [
                '주소',
                [detail.shop.roadAddress, detail.shop.addressDetail].filter(Boolean).join(' '),
              ],
              ['지역', `${detail.shop.sido} ${detail.shop.sigungu}`],
            ]}
          />
        </Section>

        <Section title="정산 계좌">
          <PayoutFields payout={detail.payout} />
        </Section>
      </div>

      <Section title="심사 기록">
        {detail.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 심사 기록이 없어요</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {detail.history.map((item, index) => (
              <li key={index} className="flex gap-3">
                <span className="w-28 shrink-0 text-muted-foreground">
                  {formatKst(item.createdAt)}
                </span>
                <span className="font-medium">{labelReviewAction(item.action)}</span>
                {item.memo ? <span className="text-muted-foreground">{item.memo}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function PayoutFields({ payout }: { payout: ShopReviewDetail['payout'] }) {
  if (!payout) return <p className="text-sm text-muted-foreground">등록된 정산 계좌가 없어요</p>;
  return (
    <Fields
      rows={[
        ['은행', labelBank(payout.bankCode)],
        ['계좌번호', `뒷자리 ${payout.accountLast4}`],
        ['예금주', payout.accountHolder],
        ['PG 셀러', labelPgSellerStatus(payout.pgSellerStatus)],
      ]}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function Fields({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
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
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
