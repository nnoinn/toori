import { cn } from 'cn';

// 예약번호 숫자 12자리(11/6 피드백). 4자리씩 끊어 "1234-5678-9012"로 보여 준다
const DIGIT_CODE = /^\d{12}$/;

/**
 * 예약번호를 화면 모양으로 나눈다. 숫자 12자리면 앞 "1234-5678-"과 맨 뒤 4자리 "9012"로,
 * 그 밖의 모양(예전 영문+숫자 8자리 등)은 나누지 않고 그대로 head에 둔다(tail은 빈 값)
 */
export function splitReservationCode(code: string): { head: string; tail: string } {
  if (!DIGIT_CODE.test(code)) return { head: code, tail: '' };
  return { head: `${code.slice(0, 4)}-${code.slice(4, 8)}-`, tail: code.slice(8) };
}

/** "123456789012" → "1234-5678-9012". 숫자 12자리가 아니면 그대로 */
export function formatReservationCode(code: string): string {
  const { head, tail } = splitReservationCode(code);
  return head + tail;
}

type ReservationCodeProps = {
  code: string;
  /**
   * 맨 뒤 4자리를 굵게, 앞자리는 흐리게. 원장님이 끝 4자리만 보고 맞춰 볼 수 있게
   * (고객 예약 상세의 '방문 확인' 칸, 원장님 예약 화면)
   */
  emphasizeTail?: boolean;
  className?: string;
};

/** 예약번호 표시: "1234-5678-9012". 글자 크기·색은 className으로 정한다 */
export function ReservationCode({ code, emphasizeTail = false, className }: ReservationCodeProps) {
  const { head, tail } = splitReservationCode(code);
  if (!emphasizeTail || !tail) {
    return <span className={cn('tabular-nums', className)}>{head + tail}</span>;
  }
  return (
    <span className={cn('tabular-nums', className)}>
      <span className="font-medium text-muted-foreground">{head}</span>
      <span className="font-bold text-foreground">{tail}</span>
    </span>
  );
}
