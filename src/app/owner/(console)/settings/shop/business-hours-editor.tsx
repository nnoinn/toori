'use client';

// 샵 정보 > 영업시간 칸 (O2, S-103). 요일마다 [쉬는 날]과 여는·닫는 시각을 받는다.
// 값과 오류는 shop-profile-form.tsx가 갖고 저장할 때 한 번에 검사하므로, 여기는 한 줄씩 그리기만 한다.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import { errorA11y, FieldError } from '../../../form-field';
import { type HoursRow, type ShopProfileFieldErrors, WEEKDAY_LABELS } from './shop-profile';

export function BusinessHoursEditor({
  hours,
  errors,
  onChange,
}: {
  /** 일요일(0)부터 토요일(6)까지 7줄 */
  hours: HoursRow[];
  /** 샵 정보 칸 오류 전체. 이 중 `hours.{줄 번호}`만 쓴다 */
  errors: ShopProfileFieldErrors;
  /** index번째 줄에서 바뀐 값만 넘긴다 */
  onChange: (index: number, row: Partial<HoursRow>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>영업시간</CardTitle>
        <p className="text-sm text-muted-foreground">
          비워 둔 요일은 고객에게 &quot;정보 없음&quot;으로 보여요. 자정을 넘기는 시각은 넣을 수
          없어요.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {hours.map((row, index) => {
            // 오류는 칸이 아니라 요일 한 줄에 붙는다(예: 닫는 시각이 여는 시각보다 빠름)
            const field = `hours.${index}` as const;
            const label = WEEKDAY_LABELS[row.weekday];
            return (
              <li key={row.weekday} className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <span className="w-6 font-medium">{label}</span>
                  <label className="flex w-24 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.closed}
                      onChange={(event) => onChange(index, { closed: event.target.checked })}
                      className="size-4 accent-primary"
                    />
                    쉬는 날
                  </label>
                  <Input
                    type="time"
                    aria-label={`${label}요일 여는 시각`}
                    {...errorA11y(field, errors[field])}
                    value={row.open}
                    disabled={row.closed}
                    onChange={(event) => onChange(index, { open: event.target.value })}
                    className="w-32"
                  />
                  <span aria-hidden>~</span>
                  <Input
                    type="time"
                    aria-label={`${label}요일 닫는 시각`}
                    {...errorA11y(field, errors[field])}
                    value={row.close}
                    disabled={row.closed}
                    onChange={(event) => onChange(index, { close: event.target.value })}
                    className="w-32"
                  />
                </div>
                <FieldError id={field} error={errors[field]} className="pl-9" />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
