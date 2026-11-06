import { ReservationCode } from '@/components/ui/reservation-code';

import { CHECK_IN_GUIDE, CHECK_IN_TITLE } from '../check-in-texts';

/**
 * 예약 상세의 '방문 확인' 칸(C-504). 샵에서 원장님께 화면을 보여 주는 용도라 예약번호를 크게 쓴다.
 * 숫자 12자리 번호는 "1234-5678-9012"로 끊고 맨 뒤 4자리를 굵게 보여 줘서, 원장님이 끝자리만 보고 맞춰 볼 수 있다(11/6 피드백).
 * 표시 모양은 공통 UI ReservationCode라 원장님 화면과 같다
 */
export function CheckInCard({ code }: { code: string }) {
  return (
    <section
      aria-labelledby="check-in-title"
      className="mx-4 flex flex-col items-center gap-1 rounded-xl border bg-card p-4 text-center"
    >
      <h3 id="check-in-title" className="text-sm font-semibold text-muted-foreground">
        {CHECK_IN_TITLE}
      </h3>
      <p className="text-3xl tracking-wider">
        <span className="sr-only">예약번호 </span>
        <ReservationCode code={code} emphasizeTail className="font-bold" />
      </p>
      <p className="text-sm text-muted-foreground">{CHECK_IN_GUIDE}.</p>
    </section>
  );
}
