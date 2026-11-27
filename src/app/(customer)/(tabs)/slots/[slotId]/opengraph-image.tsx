// 매물 링크 미리보기 그림(C-310). 카톡·인스타 등에 매물 주소를 붙이면 할인율·시간·샵 이름이 보이는 그림이 뜬다.
// 로그인하지 않은 손님이 보는 것과 같은 조건으로 읽는다(승인 샵, 게시 뒤 매물). 볼 수 없는 매물이면 투리 소개 그림을 준다.
// 글꼴은 화면과 같은 Pretendard(패키지 안의 ttf)를 쓴다. 그림 만들기는 next/og(ImageResponse)
// 주의: 팀 접속 코드 잠금(#303)이 켜져 있는 동안은 카톡이 미리보기를 읽지 못한다. 출시 때 잠금을 풀면 보인다

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';
import { isUuid } from '@/lib/uuid';

import { selectSlotDetail } from './queries';
import { slotShareCard } from './share-rules';

export const alt = `${SITE_NAME} 할인 매물`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// 파일 경로는 글자 그대로 둔다. 배포 때 이 두 글꼴만 함께 올라가게 하려는 것이다(폴더로 쓰면 폴더 전체가 올라간다)
const [bold, medium, wordmark] = await Promise.all([
  readFile(
    join(
      process.cwd(),
      'node_modules/pretendard/dist/public/static/alternative/Pretendard-Bold.ttf',
    ),
  ),
  readFile(
    join(
      process.cwd(),
      'node_modules/pretendard/dist/public/static/alternative/Pretendard-Medium.ttf',
    ),
  ),
  readFile(join(process.cwd(), 'public/brand/wordmark/toori-wordmark-light-512.png'), 'base64'),
]);
const wordmarkSrc = `data:image/png;base64,${wordmark}`;
/** 로고 그림(512×174)을 비율 그대로 높이 56으로 줄인 크기 */
const WORDMARK = { width: Math.round((512 / 174) * 56), height: 56 };

// 브랜드 색(docs/brand.md, globals.css의 --primary와 같은 초록). 그림 안에서는 CSS 변수를 쓸 수 없다
const BRAND_GREEN = '#10b981';
const SALE_RED = '#e5484d';
const MUTED = '#737373';

export default async function Image({ params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = await params;
  const now = await getRequestNow();
  const slot = isUuid(slotId)
    ? await selectSlotDetail(getDb(), { slotId, customerId: null, now })
    : null;
  const card = slot ? slotShareCard(slot) : null;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        background: '#ffffff',
        fontFamily: 'Pretendard',
        color: '#111111',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og 그림 안에서는 img만 쓸 수 있다 */}
      <img
        src={wordmarkSrc}
        width={WORDMARK.width}
        height={WORDMARK.height}
        alt=""
        style={{ width: WORDMARK.width, height: WORDMARK.height }}
      />
      {card ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 500, color: MUTED }}>
            {card.shopName}
          </div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700 }}>{card.menuName}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
            <span style={{ fontSize: 80, fontWeight: 700, color: SALE_RED }}>{card.discount}</span>
            <span style={{ fontSize: 80, fontWeight: 700 }}>{card.salePrice}</span>
            <span
              style={{
                fontSize: 40,
                fontWeight: 500,
                color: MUTED,
                textDecoration: 'line-through',
              }}
            >
              {card.listPrice}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 700 }}>{SITE_DESCRIPTION}</div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'flex-start',
          padding: '14px 28px',
          borderRadius: 999,
          background: card ? '#ecfdf5' : '#f3f4f6',
          color: card ? '#047857' : MUTED,
          fontSize: 36,
          fontWeight: 700,
        }}
      >
        {card ? card.startAt : `${SITE_NAME}에서 임박 할인을 찾아보세요`}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 16,
          background: BRAND_GREEN,
        }}
      />
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
        { name: 'Pretendard', data: medium, weight: 500, style: 'normal' },
      ],
    },
  );
}
