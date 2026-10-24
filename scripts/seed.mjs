// 개발 DB에 시드 데이터를 넣는다 (연결 #3, docs/tech-guide.md 3-4 "시드 데이터"). 내용은 scripts/seed-data.mjs.
// 모두가 같이 보는 데이터라 nnoinn·강규민만 실행한다: npm run db:seed -- --yes
// 시드 계정(@seed.test)의 데이터만 지우고 다시 넣는다. 팀원이 만든 데이터와 DB 구조는 건드리지 않는다.
// 시드 계정은 비밀번호가 없어서 아무도 로그인할 수 없다(10/13 결정, 내 계정 상황은 시나리오 명령으로 만든다).

import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { SEED_ACCOUNTS, SEED_CUSTOMERS, SEED_EMAIL_DOMAIN, SEED_SHOPS } from './seed-data.mjs';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// 시드 전용 값. 정책값(src/server/policy, W4)과 같게 둔다: 매물은 시작 48시간 전에 게시(S-204), 홀딩 10분(C-404)
const PUBLISH_BEFORE_HOURS = 48;
const HOLD_MINUTES = 10;

/** 할인가 = 정가 × (1 − 할인율), 원 미만 버림 (S-203) */
export function salePrice(listPrice, discountRate) {
  return Math.floor((listPrice * (100 - discountRate)) / 100);
}

const pad = (n, width) => String(n).padStart(width, '0');

/** 시드 계정(userIds)의 데이터를 지운다. 로그인 정보(auth.users)와 profiles는 다음 시드에서 다시 쓰려고 남긴다 */
async function clearSeedData(sql, userIds) {
  // 조각(fragment)은 쿼리마다 새로 만든다
  const seedOwners = () => sql`select id from owners where user_id in ${sql(userIds)}`;
  const seedShops = () => sql`select id from shops where owner_id in (${seedOwners()})`;
  const seedCustomers = () => sql`select id from customers where user_id in ${sql(userIds)}`;
  // W1b 테이블(예약·결제 등)이 생기면 시드 데이터를 가리키는 행을 여기서 먼저 지운다
  await sql`update slots set hold_customer_id = null, hold_expires_at = null where hold_customer_id in (${seedCustomers()})`;
  await sql`delete from slots where shop_id in (${seedShops()}) or created_by in ${sql(userIds)}`;
  await sql`delete from shop_images where shop_id in (${seedShops()})`;
  await sql`delete from payout_accounts where shop_id in (${seedShops()})`;
  await sql`delete from menus where shop_id in (${seedShops()})`;
  await sql`delete from shops where owner_id in (${seedOwners()})`;
  await sql`delete from owners where user_id in ${sql(userIds)}`;
  await sql`delete from customers where user_id in ${sql(userIds)}`;
  await sql`delete from terms_agreements where user_id in ${sql(userIds)}`;
  await sql`delete from location_use_logs where user_id in ${sql(userIds)}`;
}

/**
 * 시드 데이터를 지우고 다시 넣는다. 트랜잭션 안에서 부른다(중간에 실패하면 모두 되돌린다).
 * @param {import('postgres').TransactionSql} sql
 * @param {{ now: Date, userIds: Record<string, string> }} options userIds: SEED_ACCOUNTS의 key → auth.users id
 */
export async function seedDevData(sql, { now, userIds }) {
  const ids = SEED_ACCOUNTS.map((account) => {
    const id = userIds[account.key];
    if (!id) throw new Error(`시드 계정 ${account.key}의 로그인 정보 id가 없어요.`);
    return id;
  });
  await clearSeedData(sql, ids);

  // 시드를 넣는 시각을 10분 단위로 내려서 매물 시작 시각이 14:37 같은 어중간한 값이 되지 않게 한다
  const base = Math.floor(now.getTime() / (10 * 60 * 1000)) * 10 * 60 * 1000;
  const at = (hours) => new Date(base + hours * HOUR);
  const ago = (ms) => new Date(now.getTime() - ms);

  const profiles = SEED_ACCOUNTS.map((account) => ({ id: userIds[account.key], email: account.email }));
  await sql`insert into profiles ${sql(profiles)} on conflict (id) do nothing`;

  const customers = SEED_CUSTOMERS.map((c) => ({
    id: crypto.randomUUID(),
    user_id: userIds[`customer-${c.key}`],
    nickname: c.nickname,
  }));
  await sql`insert into customers ${sql(customers)}`;
  const holdCustomerId = customers[0].id;

  const owners = [];
  const shops = [];
  const menus = [];
  const slots = [];
  SEED_SHOPS.forEach((shop, i) => {
    const n = i + 1;
    const ownerUserId = userIds[`owner-${shop.key}`];
    const ownerName = `샘플 원장 ${shop.key.toUpperCase()}`;
    const ownerId = crypto.randomUUID();
    owners.push({ id: ownerId, user_id: ownerUserId, name: ownerName, phone: `010-0000-${pad(n, 4)}` });

    const shopId = crypto.randomUUID();
    const reviewed = shop.status !== 'pending';
    shops.push({
      id: shopId,
      owner_id: ownerId,
      name: shop.name,
      category: shop.category,
      phone: `031-000-${pad(n, 4)}`,
      road_address: `경기 ${shop.area.sigungu} 샘플로 ${n}`,
      jibun_address: n % 2 ? `경기 ${shop.area.sigungu} ${shop.dong} ${100 + n}` : null,
      address_detail: n % 3 ? `${n}층` : null,
      sido: shop.area.sido,
      sigungu: shop.area.sigungu,
      sigungu_code: shop.area.sigunguCode,
      location: `SRID=4326;POINT(${shop.lng} ${shop.lat})`,
      business_hours: sql.json(shop.hours),
      description: shop.description ?? null,
      instagram_url: shop.links.instagram ?? null,
      naver_place_url: shop.links.naver ?? null,
      business_name: shop.name,
      representative_name: ownerName,
      business_registration_number: `000-00-${pad(n, 5)}`,
      opened_on: '2021-03-02',
      business_doc_path: `seed/${shop.key}/business-doc.jpg`,
      status: shop.status,
      rejection_reason: shop.rejectionReason ?? null,
      applied_at: ago(reviewed ? 7 * DAY : DAY),
      reviewed_at: reviewed ? ago(6 * DAY) : null,
    });

    const menuByKey = {};
    shop.menus.forEach((menu, sortOrder) => {
      const row = {
        id: crypto.randomUUID(),
        shop_id: shopId,
        service_type: menu.serviceType,
        name: menu.name,
        list_price: menu.price,
        duration_minutes: menu.minutes,
        sort_order: sortOrder,
        hidden_at: menu.hidden ? ago(3 * DAY) : null,
      };
      menuByKey[menu.key] = row;
      menus.push(row);
    });

    const slotIdByKey = {};
    for (const slot of shop.slots) {
      const menu = menuByKey[slot.menu];
      const startAt = at(slot.at);
      const id = crypto.randomUUID();
      if (slot.id) slotIdByKey[slot.id] = id;
      slots.push({
        id,
        shop_id: shopId,
        menu_id: menu.id,
        service_type: menu.service_type,
        menu_name: menu.name,
        list_price: menu.list_price,
        duration_minutes: menu.duration_minutes,
        discount_rate: slot.rate,
        sale_price: salePrice(menu.list_price, slot.rate),
        new_customer_only: slot.newOnly ?? false,
        start_at: startAt,
        end_at: new Date(startAt.getTime() + menu.duration_minutes * 60 * 1000),
        publish_at: new Date(startAt.getTime() - PUBLISH_BEFORE_HOURS * HOUR),
        status: slot.status ?? 'published',
        hold_customer_id: slot.hold ? holdCustomerId : null,
        hold_expires_at: slot.hold ? new Date(now.getTime() + HOLD_MINUTES * 60 * 1000) : null,
        closed_at: slot.closeReason ? ago(HOUR) : null,
        close_reason: slot.closeReason ?? null,
        relisted_from_slot_id: slot.relistOf ? slotIdByKey[slot.relistOf] : null,
        created_by: ownerUserId,
      });
    }
  });

  await sql`insert into owners ${sql(owners)}`;
  await sql`insert into shops ${sql(shops)}`;
  await sql`insert into menus ${sql(menus)}`;
  await sql`insert into slots ${sql(slots)}`;

  return { accounts: profiles.length, shops: shops.length, menus: menus.length, slots: slots.length };
}

/** 시드 계정의 로그인 정보(auth.users)를 찾고, 없으면 Supabase 관리 기능으로 비밀번호 없이 만든다 */
async function ensureSeedUsers(sql, supabaseUrl, secretKey) {
  const emails = SEED_ACCOUNTS.map((account) => account.email);
  const rows = await sql`select id, email from auth.users where email in ${sql(emails)}`;
  const idByEmail = new Map(rows.map((row) => [row.email, row.id]));

  const missing = SEED_ACCOUNTS.filter((account) => !idByEmail.has(account.email));
  if (missing.length > 0) {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const account of missing) {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        email_confirm: true,
        user_metadata: { seed: true },
      });
      if (error) throw new Error(`시드 계정 ${account.email}을 만들지 못했어요: ${error.message}`);
      idByEmail.set(account.email, data.user.id);
    }
  }
  return Object.fromEntries(SEED_ACCOUNTS.map((account) => [account.key, idByEmail.get(account.email)]));
}

async function main() {
  if (!process.argv.includes('--yes')) {
    console.log(
      `개발 DB의 시드 데이터(@${SEED_EMAIL_DOMAIN} 계정의 샵·메뉴·매물)를 지우고 다시 넣어요. 팀원 모두가 보는 데이터예요.\n` +
        '실행하려면: npm run db:seed -- --yes',
    );
    process.exitCode = 1;
    return;
  }
  if (process.env.CI || process.env.VERCEL) {
    throw new Error('시드는 내 컴퓨터에서만 실행해요(CI·배포 환경에서는 멈춰요).');
  }
  process.loadEnvFile('.env.local');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (!supabaseUrl || !secretKey || !databaseUrl) {
    throw new Error('.env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL이 있어야 해요.');
  }
  // DB 주소와 Supabase 주소가 같은 프로젝트인지 확인한다(다른 DB 주소가 섞여 들어온 경우 멈춘다)
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  if (!databaseUrl.includes(projectRef)) {
    throw new Error('DATABASE_URL이 NEXT_PUBLIC_SUPABASE_URL과 다른 프로젝트예요. .env.local을 확인해 주세요.');
  }

  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const userIds = await ensureSeedUsers(sql, supabaseUrl, secretKey);
    const result = await sql.begin((tx) => seedDevData(tx, { now: new Date(), userIds }));
    console.log(
      `시드를 넣었어요: 계정 ${result.accounts}, 샵 ${result.shops}, 메뉴 ${result.menus}, 매물 ${result.slots}`,
    );
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
