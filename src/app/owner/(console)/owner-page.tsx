import { cn } from 'cn';

import { BackButton } from '@/components/ui/back-button';

// 원장님 화면 틀(#23 디자인 A1~A3). 폭·제목·[←]·한 줄 설명을 화면마다 따로 적지 않고 여기서 맞춘다.
// 폭: 목록을 보는 화면(대시보드·예약 상세)은 넓게, 한 가지 일을 하는 화면(매장 설정·매물 등록·수정·재등록)은 좁게.
// [←]: 다른 화면을 거쳐 들어오는 화면에만 둔다. 왼쪽 메뉴에서 바로 여는 화면(대시보드·매물 등록·매장 설정)에는 두지 않는다.

const WIDTH_CLASS = {
  wide: 'max-w-4xl',
  narrow: 'max-w-3xl',
} as const;

type OwnerPageProps = {
  title: string;
  /** wide: 목록을 보는 화면, narrow: 한 가지 일을 하는 화면 */
  width: keyof typeof WIDTH_CLASS;
  /**
   * 제목 옆 [←]. 앞 화면이 있으면 그리로 돌아가고, 주소로 바로 들어와 앞 화면이 없으면 이 주소로 간다.
   * 없으면 [←]를 두지 않는다
   */
  backHref?: string;
  /** 제목 아래 한 줄 설명 */
  description?: string;
  children: React.ReactNode;
};

export function OwnerPage({ title, width, backHref, description, children }: OwnerPageProps) {
  return (
    <main className={cn('flex w-full flex-1 flex-col gap-4 p-6', WIDTH_CLASS[width])}>
      <div className="flex items-center gap-2">
        {backHref ? <BackButton fallbackHref={backHref} /> : null}
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </main>
  );
}
