import { describe, expect, it } from 'vitest';

import { kakaoDirectionsLink, kakaoMapLink } from './kakao-map';

describe('카카오맵 길찾기 링크 (C-307)', () => {
  it('도착지에 샵 이름과 좌표를 넣는다', () => {
    expect(kakaoDirectionsLink('샘플 헤어, 2층', 37.3, 126.8)).toBe(
      'https://map.kakao.com/link/to/%EC%83%98%ED%94%8C%20%ED%97%A4%EC%96%B4%2C%202%EC%B8%B5,37.3,126.8',
    );
  });
});

describe('카카오맵 크게 보기 링크', () => {
  it('샵 이름과 좌표를 넣고, 이름의 쉼표·공백은 주소에 맞게 바꾼다', () => {
    expect(kakaoMapLink('샘플 헤어, 2층', 37.3, 126.8)).toBe(
      'https://map.kakao.com/link/map/%EC%83%98%ED%94%8C%20%ED%97%A4%EC%96%B4%2C%202%EC%B8%B5,37.3,126.8',
    );
  });
});
