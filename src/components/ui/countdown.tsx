'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from 'cn';

import { formatClock, formatRemaining } from '@/lib/format';

type CountdownProps = {
  /** 목표 시각(ISO 문자열). 서비스 시작 시각이나 홀딩 만료 시각 */
  targetAt: string;
  /** 서버가 준 "지금"(ISO 문자열). 폰 시계가 틀려도 서버 시각 기준으로 계산한다(getRequestNow) */
  serverNow: string;
  /** remaining: "2시간 13분 남음"(C-203) / clock: "09:41"(10분 홀딩 타이머, C-404) */
  variant?: 'remaining' | 'clock';
  /** 시간이 다 되면 한 번 부른다(홀딩 만료 안내 등) */
  onExpire?: () => void;
  className?: string;
};

/** 남은 시간 타이머. 계산은 서버 시각 기준이고, 화면에서 1초(clock) 또는 30초(remaining)마다 갱신한다 */
export function Countdown({
  targetAt,
  serverNow,
  variant = 'remaining',
  onExpire,
  className,
}: CountdownProps) {
  const [remainingMs, setRemainingMs] = useState(
    () => Date.parse(targetAt) - Date.parse(serverNow),
  );
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    // 서버 시각과 이 기기 시계의 차이를 한 번 재서, 이후에는 그 차이만큼 보정한다
    const offset = Date.parse(serverNow) - Date.now();
    const id = setInterval(
      () => setRemainingMs(Date.parse(targetAt) - (Date.now() + offset)),
      variant === 'clock' ? 1000 : 30_000,
    );
    return () => clearInterval(id);
  }, [targetAt, serverNow, variant]);

  const expired = remainingMs <= 0;
  useEffect(() => {
    if (expired) onExpireRef.current?.();
  }, [expired]);

  const text =
    variant === 'clock'
      ? formatClock(remainingMs)
      : expired
        ? '시작 시간이 지났어요'
        : `${formatRemaining(remainingMs)} 남음`;

  return (
    <span className={cn('tabular-nums', className)} role="timer" aria-live="off">
      {text}
    </span>
  );
}
