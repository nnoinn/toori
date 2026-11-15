import { cn } from 'cn';
import { CircleAlert, Inbox } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';

// 목록·상세 화면의 세 상태(로딩 중, 데이터 없음, 오류)를 화면마다 같은 모양으로 보여준다(conventions).

type StateProps = {
  title: string;
  description?: string;
  /** 버튼 등. 예: <Button>다시 시도</Button> */
  action?: React.ReactNode;
  className?: string;
};

/** 데이터 없음. 예: title="주변에 매물이 없어요" */
export function EmptyState({ title, description, action, className }: StateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-semibold">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** 오류. 서버 함수 결과의 error.message를 description으로 넘긴다 */
export function ErrorState({
  title = '문제가 생겼어요',
  description,
  action,
  className,
}: Partial<StateProps>) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}
    >
      <CircleAlert className="size-8 text-destructive" aria-hidden />
      <p className="font-semibold">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * 로딩 중. 위에 사진이 있는 카드(SlotCard tile) 모양의 회색 틀을 count개 보여준다. 기본 2칸이고,
 * 칸 수는 className으로 바꾼다. 예: className="md:grid-cols-3 lg:grid-cols-4"
 */
export function LoadingTiles({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-3', className)}
      aria-busy="true"
      aria-label="불러오는 중"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col rounded-xl ring-1 ring-foreground/10">
          <Skeleton className="aspect-square w-full rounded-b-none md:aspect-[4/3]" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 로딩 중. 매물 카드 모양의 회색 틀을 count개 보여준다 */
export function LoadingCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-xl p-3 ring-1 ring-foreground/10">
          <Skeleton className="size-22 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
