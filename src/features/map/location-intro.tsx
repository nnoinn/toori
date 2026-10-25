'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SITE_NAME } from '@/lib/site';

import { LOCATION_COOKIE_MAX_AGE, MY_LOCATION_ENABLED } from './location-config';
import { RegionPicker } from './region-picker';
import { useMyLocation } from './use-my-location';

const MY_LOCATION_HOURS = LOCATION_COOKIE_MAX_AGE.myLocation / 3600;

/**
 * 처음 들어온 고객(위치·동네 쿠키 없음)에게 보여주는 화면 (C-102).
 * 위치 권한을 묻기 전에 왜 필요한지 먼저 알리고, 거부·실패하면 동네 선택으로 넘어간다.
 */
export function LocationIntro() {
  const { status, message, requestLocation } = useMyLocation();
  const [showRegions, setShowRegions] = useState(!MY_LOCATION_ENABLED);

  const regionStep = showRegions || status === 'failed';

  return (
    <section className="flex flex-1 flex-col gap-6 px-4 py-10">
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
          <p className="text-sm text-muted-foreground">
            가까운 미용실·네일샵의 임박 할인을 거리순으로 보여 드리려고 위치를 써요. 위치는 서버에
            저장하지 않고, 이 기기에 {MY_LOCATION_HOURS}시간 동안만 기억해요.
          </p>
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
            {status === 'locating' ? '위치 확인 중…' : '내 위치 허용하기'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-12 text-base"
            disabled={status === 'locating'}
            onClick={() => setShowRegions(true)}
          >
            동네 직접 고르기
          </Button>
        </div>
      )}
    </section>
  );
}
