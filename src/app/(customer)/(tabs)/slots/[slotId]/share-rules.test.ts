import { describe, expect, it } from 'vitest';

import { SITE_NAME } from '@/lib/site';

import { slotShareCard, slotSharePath, slotShareText, slotShareTitle } from './share-rules';

// 2026-11-28(토) 11:00 한국 시간
const slot = {
  slotId: 'ad635ed6-84dd-42db-b947-6db51c232504',
  startAt: '2026-11-28T02:00:00.000Z',
  listPrice: 25000,
  salePrice: 12500,
  discountRate: 50,
  menu: { name: '여성 커트' },
  shop: { name: '샘플 헤어 중앙역점' },
};

describe('매물 공유 문구 (C-310)', () => {
  it('공유 링크는 매물 상세 주소다(로그인 없이 열린다)', () => {
    expect(slotSharePath(slot.slotId)).toBe(`/slots/${slot.slotId}`);
  });

  it('제목은 시술 · 샵 이름(탭 제목과 같다)', () => {
    expect(slotShareTitle(slot)).toBe('여성 커트 · 샘플 헤어 중앙역점');
  });

  it('설명에 할인율·판매가·시작 시각(한국 시간)이 들어간다', () => {
    expect(slotShareText(slot)).toBe(`50% 할인 12,500원 · 11/28(토) 11:00 시작 · ${SITE_NAME}`);
  });

  it('미리보기 그림 글자: 샵·시술·할인율·판매가·정가·시작 시각', () => {
    expect(slotShareCard(slot)).toEqual({
      shopName: '샘플 헤어 중앙역점',
      menuName: '여성 커트',
      discount: '50%',
      salePrice: '12,500원',
      listPrice: '25,000원',
      startAt: '11/28(토) 11:00 시작',
    });
  });
});
