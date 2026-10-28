'use server';

// 원장님 가입 저장 (S-101, S-107, #47 4장). 원장님 가입 화면(/owner/join, 정민석 O7)에서 부른다.
// 화면에서는 '@/server/auth/owner-account'에서 가져온다. 사업자등록증은 먼저 createBusinessDocUploadUrl로 올린 경로를 넘긴다.

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { getDb } from '@/db';
import { owners } from '@/db/schema';
import { geocodeAddress, type GeocodeError } from '@/features/map/geocode';
import { normalizePhone } from '@/lib/phone';
import { getRequestNow } from '@/lib/request-time';
import { fail, ok } from '@/lib/result';
import { utcToKst } from '@/lib/time';
import { encryptAccountNumber } from '@/server/payouts/account-crypto';
import { BANK_CODES, SHOP_CATEGORIES, type ShopCategory } from '@/server/policy';
import { assertBusinessDocPath } from '@/server/storage';

import { ACCOUNT_MODE_COOKIE, ACCOUNT_MODE_COOKIE_OPTIONS } from './account-mode';
import { saveOwnerAccount } from './account-store';
import { getSessionUser } from './current-account';
import { AUTH_ERRORS } from './require';

const text = z.string().trim().min(1);
/** 하이픈 넣은 모양으로 맞춰 저장한다(10/28 결정). 지역번호·070·0507 안심번호·대표번호도 받는다. 번호 모양이 아니면 실패 */
const phone = z
  .string()
  .transform((value) => normalizePhone(value))
  .pipe(z.string());
/** 하이픈·공백을 빼고 숫자만 */
const digits = (pattern: RegExp) =>
  z
    .string()
    .transform((value) => value.replace(/[-\s]/g, ''))
    .pipe(z.string().regex(pattern));

const inputSchema = z.object({
  owner: z.object({ name: text, phone }),
  shop: z.object({
    businessName: text,
    representativeName: text,
    businessRegistrationNumber: digits(/^\d{10}$/),
    openedOn: z.iso.date(),
    businessDocPath: text,
    name: text,
    category: z.enum(SHOP_CATEGORIES.map((c) => c.key) as [ShopCategory, ...ShopCategory[]]),
    phone,
    roadAddress: text,
    addressDetail: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || null),
  }),
  payout: z.object({
    bankCode: z.enum(BANK_CODES),
    accountNumber: digits(/^\d{8,16}$/),
    accountHolder: text,
  }),
  agreements: z.object({
    supplier: z.boolean(),
    privacy: z.boolean(),
    payoutInfo: z.boolean(),
  }),
});

export type CreateOwnerAccountInput = {
  owner: { name: string; phone: string };
  shop: {
    businessName: string;
    representativeName: string;
    /** 숫자 10자리(하이픈 있어도 됨) */
    businessRegistrationNumber: string;
    /** YYYY-MM-DD */
    openedOn: string;
    /** createBusinessDocUploadUrl로 올린 경로 */
    businessDocPath: string;
    name: string;
    category: ShopCategory;
    phone: string;
    roadAddress: string;
    addressDetail?: string;
  };
  payout: { bankCode: string; accountNumber: string; accountHolder: string };
  /** 동의 문구 2장의 필수 3개: 원장님 이용약관, 개인정보 수집·이용(원장님), 정산을 위한 정보 제공 */
  agreements: { supplier: true; privacy: true; payoutInfo: true };
};

/** 실패하면 주소 후보(ADDRESS_AMBIGUOUS일 때 candidates)도 같이 온다(#51) */
export type CreateOwnerAccountResult =
  { ok: true; data: { ownerId: string; shopId: string } } | { ok: false; error: GeocodeError };

/**
 * 원장님 계정·샵(승인 대기)·정산 계좌·약관 동의를 한 번에 만든다.
 * 좌표·지역은 화면에서 받지 않고 서버가 geocodeAddress(#51)로 만든다. 계좌번호는 암호화해서 저장하고 뒷자리 4개만 따로 둔다.
 * 전화번호는 하이픈 넣은 모양으로 맞춘다. 성공하면 원장님 모드로 두고 결과를 돌려준다(화면이 /owner로 이동)
 */
export async function createOwnerAccount(
  input: CreateOwnerAccountInput,
): Promise<CreateOwnerAccountResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', '입력한 내용을 다시 확인해 주세요');
  const { owner, shop, payout, agreements } = parsed.data;
  if (Object.values(agreements).includes(false)) {
    return fail('REQUIRED_TERMS_MISSING', '필수 항목에 모두 동의해 주세요');
  }
  if (shop.openedOn > (await kstToday())) {
    return fail('INVALID_INPUT', '개업일자를 다시 확인해 주세요');
  }

  const user = await getSessionUser();
  if (!user) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  // 등록증은 가입 중 본인 폴더(business-docs/users/{userId}/)에 올린 것만 받는다
  const docPath = await assertBusinessDocPath({ userId: user.userId }, shop.businessDocPath);
  if (!docPath.ok) return docPath;
  // 주소 변환(외부 API)을 부르기 전에 이미 가입했는지 먼저 본다. 동시에 두 번 눌러도 저장 단계에서 한 번만 된다
  if (await hasOwnerAccount(user.userId)) return fail('ALREADY_EXISTS', ALREADY_EXISTS_MESSAGE);

  const geo = await geocodeAddress(shop.roadAddress);
  if (!geo.ok) return geo;

  const saved = await getDb().transaction((tx) =>
    saveOwnerAccount(tx, {
      userId: user.userId,
      owner,
      shop: {
        name: shop.name,
        category: shop.category,
        phone: shop.phone,
        roadAddress: geo.data.roadAddress,
        jibunAddress: geo.data.jibunAddress,
        addressDetail: shop.addressDetail,
        sido: geo.data.region.sido,
        sigungu: geo.data.region.sigungu,
        sigunguCode: geo.data.region.sigunguCode,
        location: { lat: geo.data.lat, lng: geo.data.lng },
        businessName: shop.businessName,
        representativeName: shop.representativeName,
        businessRegistrationNumber: shop.businessRegistrationNumber,
        openedOn: shop.openedOn,
        businessDocPath: shop.businessDocPath,
      },
      payout: {
        bankCode: payout.bankCode,
        accountNumberEncrypted: encryptAccountNumber(payout.accountNumber),
        accountLast4: payout.accountNumber.slice(-4),
        accountHolder: payout.accountHolder,
      },
    }),
  );
  if (!saved) return fail('ALREADY_EXISTS', ALREADY_EXISTS_MESSAGE);

  (await cookies()).set(ACCOUNT_MODE_COOKIE, 'owner', ACCOUNT_MODE_COOKIE_OPTIONS);
  return ok(saved);
}

const ALREADY_EXISTS_MESSAGE = '이미 원장님 계정이 있어요';

async function hasOwnerAccount(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.userId, userId));
  return Boolean(row);
}

/** 오늘 날짜(한국 시간) YYYY-MM-DD */
async function kstToday(): Promise<string> {
  const { year, month, day } = utcToKst(await getRequestNow());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
