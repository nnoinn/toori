/**
 * 폰 알약을 눌러 연 창의 남은 시간(#566). 타이머(Countdown)는 처음 그릴 때 받은 서버 시각을 "지금"으로 본다.
 * 홀딩을 서버에서 받은 뒤 시간이 지나 창을 열면, 그동안 흐른 시간만큼 서버 시각을 앞으로 옮겨서 넘긴다
 * (창을 늦게 열어도 알약과 같은 남은 시간을 보여 준다)
 *
 * @param serverNow 홀딩을 받을 때 서버가 준 "지금"(ISO)
 * @param receivedAt 홀딩을 받은 이 기기의 시각(ms)
 * @param clientNow 창을 여는 이 기기의 시각(ms)
 */
export function serverNowAt(serverNow: string, receivedAt: number, clientNow: number): string {
  return new Date(Date.parse(serverNow) + (clientNow - receivedAt)).toISOString();
}
