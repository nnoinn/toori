// Storage 저장 경로 (#47 6장). 서버가 만든 경로만 그 샵(또는 본인) 폴더의 것으로 받는지 확인한다.

import { describe, expect, it } from 'vitest';

import {
  assertBusinessDocPath,
  assertShopImagePath,
  newBusinessDocPath,
  newShopImagePath,
} from './paths';

const SHOP = '2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091';
const OTHER_SHOP = '9f8e7d6c-5b4a-4321-8fed-cba987654321';
const USER = '3b1557e8-0000-4000-8000-000000000001';
const FILE = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';

describe('경로 만들기', () => {
  it('샵 사진은 {shopId}/{uuid}.{확장자}', () => {
    expect(newShopImagePath(SHOP, 'image/jpeg')).toMatch(
      new RegExp(`^${SHOP}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(newShopImagePath(SHOP, 'image/webp')).toMatch(/\.webp$/);
  });

  it('등록증은 가입 중이면 users/{userId}/, 샵이 있으면 shops/{shopId}/', () => {
    expect(newBusinessDocPath({ userId: USER }, 'image/png')).toMatch(
      new RegExp(`^users/${USER}/[0-9a-f-]{36}\\.png$`),
    );
    expect(newBusinessDocPath({ shopId: SHOP }, 'image/jpeg')).toMatch(
      new RegExp(`^shops/${SHOP}/[0-9a-f-]{36}\\.jpg$`),
    );
  });

  it('매번 다른 이름이라 덮어쓰지 않는다', () => {
    expect(newShopImagePath(SHOP, 'image/jpeg')).not.toBe(newShopImagePath(SHOP, 'image/jpeg'));
  });
});

describe('assertShopImagePath', () => {
  it('서버가 만든 그 샵 경로만 받는다', async () => {
    expect((await assertShopImagePath(SHOP, newShopImagePath(SHOP, 'image/png'))).ok).toBe(true);
  });

  it.each([
    ['다른 샵 폴더', `${OTHER_SHOP}/${FILE}.jpg`],
    ['폴더 없이 파일만', `${FILE}.jpg`],
    ['한 단계 더 들어감', `${SHOP}/x/${FILE}.jpg`],
    ['상위 폴더로 나감', `${SHOP}/../${OTHER_SHOP}/${FILE}.jpg`],
    ['허용하지 않는 확장자', `${SHOP}/${FILE}.html`],
    ['서버가 만든 이름이 아님', `${SHOP}/photo.jpg`],
    ['등록증 경로', `shops/${SHOP}/${FILE}.jpg`],
  ])('%s → INVALID_PATH', async (_, path) => {
    const result = await assertShopImagePath(SHOP, path);
    expect(result.ok === false && result.error.code).toBe('INVALID_PATH');
  });
});

describe('assertBusinessDocPath', () => {
  it('가입 중이면 본인 폴더, 샵이 있으면 그 샵 폴더만 받는다', async () => {
    const mine = newBusinessDocPath({ userId: USER }, 'image/jpeg');
    const shopDoc = newBusinessDocPath({ shopId: SHOP }, 'image/jpeg');
    expect((await assertBusinessDocPath({ userId: USER }, mine)).ok).toBe(true);
    expect((await assertBusinessDocPath({ shopId: SHOP }, shopDoc)).ok).toBe(true);

    expect((await assertBusinessDocPath({ userId: USER }, shopDoc)).ok).toBe(false);
    expect((await assertBusinessDocPath({ shopId: OTHER_SHOP }, shopDoc)).ok).toBe(false);
    expect((await assertBusinessDocPath({ userId: USER }, `users/${USER}/../x.jpg`)).ok).toBe(
      false,
    );
  });
});
