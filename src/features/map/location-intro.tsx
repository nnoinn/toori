'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SITE_NAME } from '@/lib/site';

import { LOCATION_COOKIE_MAX_AGE, MY_LOCATION_ENABLED } from './location-config';
import { RegionPicker } from './region-picker';
import { useMyLocation } from './use-my-location';

/** 내 위치를 기억하는 기간을 문구로. 하루면 "하루", 아니면 "N시간" */
function keepPeriodLabel(seconds: number): string {
  const hours = Math.round(seconds / 3600);
  return hours === 24 ? '하루' : `${hours}시간`;
}

const MY_LOCATION_KEEP = keepPeriodLabel(LOCATION_COOKIE_MAX_AGE.myLocation);

/**
 * 처음 들어온 고객(위치·동네 쿠키 없음)에게 보여주는 화면 (C-102).
 * 위치 권한을 묻기 전에 왜 필요한지 먼저 알리고, 거부·실패하면 동네 선택으로 넘어간다.
 */
export function LocationIntro() {
  const { status, message, requestLocation } = useMyLocation();
  const [showRegions, setShowRegions] = useState(!MY_LOCATION_ENABLED);

  const regionStep = showRegions || status === 'failed';

  return (
    // PC에서는 버튼·동네 목록이 화면 폭만큼 늘어나지 않게 가운데 좁은 칸에 모은다
    <section className="flex flex-1 flex-col gap-6 px-4 py-10 md:mx-auto md:w-full md:max-w-md md:py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <MapPin className="size-10 text-primary" aria-hidden />
        <h1 className="text-xl font-bold">
          {regionStep ? '어느 동네에서 찾을까요?' : '내 주변 할인을 찾아 드릴게요'}
        </h1>
        {regionStep ? (
          <p className="text-sm text-muted-foreground">
            {message ??
              `고른 동네의 ${SITE_NAME} 매물을 보여 드려요. 나중에 홈 위쪽에서 바꿀 수 있어요.`}
          </p>
        ) : (
          // 문구: docs/legal/consent-texts.md 5장(위치 권한 요청 전 안내, 법률 검토 전 임시 문구)
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>내 주변 매물을 보여 드리려고 지금 위치를 써요.</p>
            <p>위치는 저장하지 않고 이 기기에 {MY_LOCATION_KEEP}만 둬요.</p>
            <p>허용하지 않아도 동네를 골라서 볼 수 있어요.</p>
          </div>
        )}
      </div>

      {regionStep ? (
        <RegionPicker />
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="h-12 text-base"
            disabled={status === 'locating'}
            onClick={requestLocation}
          >
            {status === 'locating' ? '위치 확인 중…' : '내 위치 허용'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-12 text-base"
            disabled={status === 'locating'}
            onClick={() => setShowRegions(true)}
          >
            동네 고르기
          </Button>
        </div>
      )}
    </section>
  );
}
