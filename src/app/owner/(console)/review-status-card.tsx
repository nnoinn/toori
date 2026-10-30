import Link from 'next/link';
import { Clock, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatKst } from '@/lib/time';
import type { ShopReviewStatus } from '@/server/shops';

// 원장님 화면(/owner) 위쪽 입점 상태 안내 (O7 ②, S-102). 승인 대기·반려일 때만 보여준다. 승인되면 대시보드(O9)가 들어온다.

const WHILE_WAITING = [
  { href: '/owner/settings/shop', label: '샵 정보·영업시간' },
  { href: '/owner/settings/menu', label: '메뉴·가격표' },
  { href: '/owner/settings/images', label: '사진·링크' },
] as const;

export function ReviewStatusCard({ review }: { review: ShopReviewStatus }) {
  if (review.status === 'approved') return null;

  if (review.status === 'rejected') {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="size-5" aria-hidden />
            입점 신청이 반려됐어요
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">반려 사유</p>
            <p className="whitespace-pre-line">{review.rejectionReason ?? '-'}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            사유에 맞게 사업자 정보를 고친 뒤 다시 신청해 주세요. 다시 신청하면 운영팀이 다시
            확인해요.
          </p>
          <Button asChild size="lg" className="self-start">
            <Link href="/owner/settings/business">사업자 정보 고치고 다시 신청하기</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5 text-primary" aria-hidden />
          입점 승인을 기다리고 있어요
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          운영팀이 사업자 정보를 확인하고 있어요. 승인되면 매물을 올릴 수 있어요. 신청일{' '}
          {formatKst(review.appliedAt)}
        </p>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">기다리는 동안 미리 입력해 두세요</p>
          <div className="flex flex-wrap gap-2">
            {WHILE_WAITING.map((item) => (
              <Button key={item.href} asChild variant="outline">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
