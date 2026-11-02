// 화면 표시용 형식 함수. 금액·시간을 화면마다 다르게 쓰지 않도록 여기서만 만든다.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 원 단위 금액. 예: 28000 → "28,000원" */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** 남은 시간을 짧게. 예: "2일 3시간", "5시간 12분", "12분", "1분 미만". 지났으면 "0분" */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return '0분';
  if (ms < MINUTE_MS) return '1분 미만';

  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);

  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  return `${minutes}분`;
}

/**
 * 소요 시간. 예: 60 → "1시간", 90 → "1시간 30분", 45 → "45분". 0 이하이거나 숫자가 아니면 빈 문자열.
 * 원장님 메뉴·매물·예약 상세가 쓴다. 고객 쪽 detail-format.ts의 같은 함수를 여기로 모으는 중이다(#182 리뷰)
 */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 시계 모양 남은 시간(10분 홀딩 타이머용). 예: "09:41", 1시간 이상이면 "1:02:03". 지났으면 "00:00" */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}
