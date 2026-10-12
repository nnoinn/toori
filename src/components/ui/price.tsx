import { cn } from 'cn';

import { formatWon } from '@/lib/format';

type PriceProps = {
  /** 정가(원) */
  listPrice: number;
  /** 할인가(원). 서버가 계산한 값을 그대로 넘긴다 */
  salePrice: number;
  /** 할인율(%). 예: 30 */
  discountRate: number;
  size?: 'sm' | 'md';
  className?: string;
};

/** 가격 표시: "30% 23,450원 ~~33,500원~~". 금액은 계산하지 않고 받은 값만 보여준다 */
export function Price({ listPrice, salePrice, discountRate, size = 'md', className }: PriceProps) {
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5', className)}>
      <span className={cn('font-bold text-sale', size === 'md' ? 'text-lg' : 'text-base')}>
        {discountRate}%
      </span>
      <span className={cn('font-bold', size === 'md' ? 'text-lg' : 'text-base')}>
        {formatWon(salePrice)}
      </span>
      <span className="text-xs text-muted-foreground line-through">
        <span className="sr-only">정가 </span>
        {formatWon(listPrice)}
      </span>
    </span>
  );
}
