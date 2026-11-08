'use client';

// 매물 저장 완료 카드 (O5 등록, O10 수정). 등록이면 [매물 하나 더 올리기]와 [대시보드로],
// 수정이면 [대시보드로]만 보여준다. 저장한 값은 서버가 돌려준 할인가를 쓴다(화면에서 계산하지 않는다).

import Link from 'next/link';
import { CircleCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { formatKst, formatKstTime } from '@/lib/time';

/** 완료 카드에 보여줄 저장한 매물 */
export type SavedSummary = {
  menuName: string;
  start: Date;
  end: Date;
  listPrice: number;
  /** 서버가 계산해 돌려준 할인가 */
  salePrice: number;
  discountRate: number;
  newCustomerOnly: boolean;
};

/** 저장 완료. 수정이면 대시보드로 돌아가고, 등록이면 하나 더 올리거나 대시보드로 간다 */
export function SavedCard({
  saved,
  edited,
  onAgain,
}: {
  saved: SavedSummary;
  edited: boolean;
  onAgain: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleCheck className="size-5 text-primary" aria-hidden />
          {edited ? '매물을 고쳤어요' : '매물을 올렸어요'}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {edited
            ? '고친 내용이 바로 고객 화면에 보여요.'
            : '지금부터 고객 화면에 게시중으로 보여요.'}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
          <span className="font-semibold">{saved.menuName}</span>
          <span>
            {formatKst(saved.start)} ~ {formatKstTime(saved.end)}
          </span>
          <Price
            listPrice={saved.listPrice}
            salePrice={saved.salePrice}
            discountRate={saved.discountRate}
            size="sm"
          />
          {saved.newCustomerOnly ? (
            <Badge variant="secondary" className="w-fit bg-accent text-accent-foreground">
              신규 고객 전용
            </Badge>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button asChild variant={edited ? 'default' : 'outline'} size="lg">
            <Link href="/owner">대시보드로</Link>
          </Button>
          {edited ? null : (
            <Button type="button" size="lg" onClick={onAgain}>
              매물 하나 더 올리기
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
