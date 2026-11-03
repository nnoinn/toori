import { describe, expect, it } from 'vitest';

import { categoryPinUrl } from './category-pins';

const svgOf = (url: string) =>
  decodeURIComponent(url.replace('data:image/svg+xml;charset=utf-8,', ''));

describe('업종별 핀 그림 (#204)', () => {
  it('미용실과 네일·속눈썹은 안쪽 아이콘이 다르다', () => {
    const hair = svgOf(categoryPinUrl('hair', 'red'));
    const nail = svgOf(categoryPinUrl('nail_lash', 'red'));
    expect(hair).not.toBe(nail);
    expect(hair).toContain('<circle cx="6" cy="6" r="3"/>');
    expect(nail).toContain('M9.937 15.5');
  });

  it('색은 넘겨받은 테마 색 값을 쓴다', () => {
    const svg = svgOf(categoryPinUrl('hair', '#10b981'));
    expect(svg).toContain('fill="#10b981"');
    expect(svg).toContain('stroke="#10b981"');
  });

  it('주소에 넣을 수 있게 data URL로 감싼다', () => {
    expect(categoryPinUrl('hair', '#10b981')).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  });
});
