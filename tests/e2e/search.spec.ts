import { expect, test } from '@playwright/test';

// 검색(C-210). 홈 동네 바의 검색 칸 → 매물 목록에서 맞는 매물만 → 결과가 없을 때 → 최근 검색어로 다시 찾기 → 검색어 지우기.
// 시드 샵(scripts/seed-data.mjs): 안산시 단원구에 "샘플 헤어 중앙역점"·"샘플 네일 중앙역점"과 이름이 다른 "샘플 헤어 초지"가 있다
test('홈 검색 칸에서 샵 이름으로 찾으면 매물 목록에 그 샵 매물만 나오고, 최근 검색어로 다시 찾을 수 있다', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: '로그인 없이 둘러보기' }).click();
  await page.getByRole('button', { name: '동네 고르기' }).click();
  await page
    .getByRole('region', { name: '지금 영업하는 동네' })
    .getByRole('button', { name: '안산시 단원구' })
    .click();

  // 홈 검색 칸(PC는 동네 바 가운데, 폰은 바 아래. 화면 크기마다 하나만 보인다)
  const box = page.getByRole('searchbox', { name: '샵·메뉴 이름으로 매물 찾기' });
  await box.fill('중앙역');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/home\/list\?q=/);
  expect(new URL(page.url()).searchParams.get('q')).toBe('중앙역');

  const list = page.getByRole('region', { name: '매물 목록' });
  await expect(list.getByRole('heading', { level: 1 })).toContainText("'중앙역' 매물");
  await expect(list.getByText('샘플 헤어 중앙역점').first()).toBeVisible();
  // 같은 동네라도 이름이 맞지 않는 샵은 빠진다
  await expect(list.getByText('샘플 헤어 초지')).toHaveCount(0);

  // 결과가 없으면 빈 화면(C-208 모양)
  await box.fill('없는샵이름');
  await box.press('Enter');
  await expect(list.getByText("'없는샵이름'에 맞는 매물이 없어요")).toBeVisible();

  // 칸을 누르면 이 기기의 최근 검색어가 보이고, 누르면 다시 찾는다
  await box.click();
  await page
    .getByRole('list', { name: '최근 검색어' })
    .getByRole('button', { name: '중앙역', exact: true })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('중앙역');
  await expect(list.getByText('샘플 헤어 중앙역점').first()).toBeVisible();

  // 검색어 지우기: 검색만 풀고 동네 매물 목록으로
  await list.getByRole('link', { name: '검색어 지우기' }).click();
  await expect(page).toHaveURL(/\/home\/list$/);
});
