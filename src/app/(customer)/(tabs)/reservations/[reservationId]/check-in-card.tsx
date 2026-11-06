import { CHECK_IN_GUIDE, CHECK_IN_TITLE } from '../check-in-texts';

/**
 * 예약 상세의 '방문 확인' 칸(C-504). 샵에서 원장님께 화면을 보여 주는 용도라 예약번호를 크게 쓴다.
 * 예약번호는 헷갈리는 0/O·1/I를 빼고 만들어서(reservation-code.ts) 원장님 화면과 같은 모양 그대로 보여 준다
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
      <p className="text-3xl font-bold tracking-widest">
        <span className="sr-only">예약번호 </span>
        {code}
      </p>
      <p className="text-sm text-muted-foreground">{CHECK_IN_GUIDE}.</p>
    </section>
  );
}
