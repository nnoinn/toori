import { formatWon } from '@/lib/format';
import { SITE_NAME } from '@/lib/site';

import { savedAmountNote } from './profile-rules';
import type { SavedAmount } from './saved-amount';

/** 내 정보 맨 위 "투리로 아낀 금액"(C-108). 계산은 saved-amount.ts */
export function SavedAmountCard({ saved }: { saved: SavedAmount }) {
  const title = `${SITE_NAME}로 아낀 금액`;
  return (
    <section aria-label={title} className="flex flex-col gap-1 rounded-xl bg-muted/60 p-4">
      <h2 className="text-sm text-muted-foreground">{title}</h2>
      <p className="text-2xl font-bold tabular-nums">{formatWon(saved.total)}</p>
      <p className="text-xs text-muted-foreground">{savedAmountNote(saved.visits)}</p>
    </section>
  );
}
