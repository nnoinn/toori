// 시나리오 명령: 내 계정에 테스트 상황을 만든다 (연결 #3, docs/tech-guide.md 3-4 "시나리오 명령").
// 시드 계정으로는 로그인할 수 없어서, 각자 자기 계정(앱에서 한 번 로그인한 계정)에 상황을 만든다. 누구나 실행해도 된다.
//   npm run scenario -- <명령> --email <로그인 이메일> [값]
// 안전장치: .env.local의 개발 DB에서만 돈다(scripts/dev-db.mjs). 이메일로 찾은 내 계정과 이 명령이 만든 데이터만
// 만들고 지운다. 다른 사람의 데이터, 시드 전체, DB 구조는 건드리지 않는다.
// 이 명령이 만든 것 표시: 매물 menu_description '[시나리오] <내 id>', 주문 payment_id 'scenario_<내 id>_',
// 샵 business_doc_path 'scenario/<내 id>/', 계정 이름 '[시나리오] …'

import { pathToFileURL } from 'node:url';

import {
  bookingRows,
  DAY,
  HOLD_MINUTES,
  HOUR,
  insertBookings,
  openDevDb,
  PUBLISH_BEFORE_HOURS,
  salePrice,
} from './dev-db.mjs';
import { SEED_EMAIL_DOMAIN, SEED_SHOPS } from './seed-data.mjs';

const TAG = '[시나리오]';

export const COMMANDS = {
  status: '지금 내 계정 상태 보기',
  'customer-existing': '<샵> 그 샵의 기존 고객으로 만들기(이용 완료 이력 하나). 신규 고객 전용 매물이 안 보이게 된다',
  'customer-new': '<샵> 그 샵의 신규 고객으로 되돌리기(이 명령이 만든 이력을 지움)',
  'my-reservations': '내 예약 탭용 예약 만들기: 예정·지난(이용 완료)·취소·노쇼 하나씩',
  'hold-by-other': '원장님 A 샵 게시중 매물 하나를 다른 고객이 결제 중으로(10분 뒤 풀림)',
  'owner-shop': '<pending|approved|rejected> 내 원장님 샵 만들기와 입점 상태 바꾸기',
  'owner-slots': '내 샵에 매물 상태 6가지와 예약된 매물 만들기',
  reset: '이 명령이 내 계정에 만든 것 모두 지우기',
};

const SHOP_STATUSES = ['pending', 'approved', 'rejected'];
const SHOP_STATUS_LABEL = { pending: '승인 대기', approved: '승인', rejected: '반려' };

const floorHour = (d) => new Date(Math.floor(d.getTime() / HOUR) * HOUR);
const fmt = (d) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

class ScenarioError extends Error {}

async function findMe(sql, email) {
  if (!email) throw new ScenarioError('--email <로그인 이메일>을 넣어 주세요.');
  if (email.endsWith(`@${SEED_EMAIL_DOMAIN}`)) {
    throw new ScenarioError('시드 계정에는 쓰지 않아요. 내가 로그인한 이메일을 넣어 주세요.');
  }
  const [me] = await sql`select id, email from profiles where lower(email) = lower(${email})`;
  if (!me) {
    throw new ScenarioError(
      `${email}로 로그인한 기록이 없어요. 앱에서 이 계정으로 한 번 로그인한 뒤 다시 실행해 주세요.`,
    );
  }
  return me;
}

const myTag = (userId) => `${TAG} ${userId}`;
const myPayment = (userId) => `scenario_${userId}_`;
const myShopDoc = (userId) => `scenario/${userId}/`;

async function ensureCustomer(sql, userId) {
  const [c] = await sql`select id from customers where user_id = ${userId}`;
  if (c) return c.id;
  const [created] =
    await sql`insert into customers ${sql({ user_id: userId, nickname: `${TAG} 고객` })} returning id`;
  return created.id;
}

/** 시드 샵(a~l). 고객 화면에 보이도록 승인된 샵이어야 한다 */
async function seedShop(sql, key) {
  const shop = SEED_SHOPS.find((s) => s.key === key);
  if (!shop) {
    throw new ScenarioError(
      `샵은 시드 샵 글자로 골라 주세요: ${SEED_SHOPS.filter((s) => s.status === 'approved')
        .map((s) => `${s.key}(${s.name})`)
        .join(', ')}`,
    );
  }
  const [row] = await sql`
    select s.id, s.name, s.status, o.user_id as owner_user_id from shops s
    join owners o on o.id = s.owner_id join profiles p on p.id = o.user_id
    where p.email = ${`owner-${key}@${SEED_EMAIL_DOMAIN}`}`;
  if (!row) throw new ScenarioError('시드 샵이 없어요. nnoinn·강규민에게 시드를 넣어 달라고 해 주세요.');
  if (row.status !== 'approved') throw new ScenarioError(`${row.name}은 승인된 샵이 아니에요.`);
  const [menu] = await sql`
    select id, service_type, name, list_price, duration_minutes from menus
    where shop_id = ${row.id} and hidden_at is null order by sort_order limit 1`;
  return { ...row, menu };
}

async function seedCustomer(sql, key) {
  const [c] = await sql`
    select c.id from customers c join profiles p on p.id = c.user_id
    where p.email = ${`customer-${key}@${SEED_EMAIL_DOMAIN}`}`;
  if (!c) throw new ScenarioError('시드 고객이 없어요. nnoinn·강규민에게 시드를 넣어 달라고 해 주세요.');
  return c.id;
}

function slotRow({ shopId, menu, startAt, status, description, createdBy, rate = 30, closeReason = null, now }) {
  return {
    id: crypto.randomUUID(),
    shop_id: shopId,
    menu_id: menu.id,
    service_type: menu.service_type,
    menu_name: menu.name,
    menu_description: description,
    list_price: menu.list_price,
    duration_minutes: menu.duration_minutes,
    discount_rate: rate,
    sale_price: salePrice(menu.list_price, rate),
    new_customer_only: false,
    start_at: startAt,
    end_at: new Date(startAt.getTime() + menu.duration_minutes * 60 * 1000),
    publish_at: new Date(startAt.getTime() - PUBLISH_BEFORE_HOURS * HOUR),
    status,
    closed_at: closeReason ? new Date(now.getTime() - HOUR) : null,
    close_reason: closeReason,
    created_by: createdBy,
  };
}

/** 매물을 넣는다. 같은 샵의 살아 있는 매물과 시간이 겹치면(S-209) 1시간씩 미뤄서 다시 넣는다 */
async function insertSlot(sql, row) {
  for (let i = 0; i < 24; i++) {
    try {
      await sql.savepoint((sp) => sp`insert into slots ${sp(row)}`);
      return row;
    } catch (error) {
      if (error?.code !== '23P01') throw error;
      row.start_at = new Date(row.start_at.getTime() + HOUR);
      row.end_at = new Date(row.end_at.getTime() + HOUR);
      row.publish_at = new Date(row.publish_at.getTime() + HOUR);
    }
  }
  throw new ScenarioError('겹치지 않는 시간을 찾지 못했어요. reset 뒤 다시 해 주세요.');
}

/** 주문 조건(fragment)에 걸린 환불·예약·주문을 지운다 */
async function deleteBookings(sql, orderIds) {
  await sql`delete from refunds where order_id in (${orderIds()})`;
  await sql`delete from reservations where order_id in (${orderIds()})`;
  await sql`delete from orders where id in (${orderIds()})`;
}

async function myShop(sql, userId) {
  const [row] = await sql`
    select s.id, s.name, s.status, s.business_doc_path from shops s
    join owners o on o.id = s.owner_id where o.user_id = ${userId}`;
  return row ?? null;
}

// ── 명령 ────────────────────────────────────────────────────────────────

async function status(sql, me) {
  const out = [`계정: ${me.email}`];
  const [customer] = await sql`select id, nickname from customers where user_id = ${me.id}`;
  if (!customer) {
    out.push('고객 계정: 없음');
  } else {
    out.push(`고객 계정: 있음${customer.nickname.startsWith(TAG) ? '(시나리오가 만듦)' : ''}`);
    const rows = await sql`
      select r.status, r.visit_result, s.name as shop, sl.start_at from reservations r
      join slots sl on sl.id = r.slot_id join shops s on s.id = sl.shop_id
      where r.customer_id = ${customer.id} order by sl.start_at`;
    out.push(`  내 예약 ${rows.length}건`);
    for (const r of rows) {
      const label = r.status === 'confirmed' ? '예정' : r.status === 'cancelled' ? '취소' : r.visit_result === 'no_show' ? '노쇼' : '이용 완료';
      out.push(`  - ${label} · ${r.shop} · ${fmt(r.start_at)}`);
    }
  }
  const shop = await myShop(sql, me.id);
  const [owner] = await sql`select id from owners where user_id = ${me.id}`;
  if (!owner) {
    out.push('원장님 계정: 없음');
  } else if (!shop) {
    out.push('원장님 계정: 있음, 샵 없음');
  } else {
    out.push(`원장님 샵: ${shop.name} · ${SHOP_STATUS_LABEL[shop.status]}`);
    const counts = await sql`select status, count(*)::int as n from slots where shop_id = ${shop.id} group by status order by status`;
    out.push(`  매물: ${counts.map((c) => `${c.status} ${c.n}`).join(', ') || '없음'}`);
  }
  return out;
}

async function customerExisting(sql, me, key, now) {
  const customerId = await ensureCustomer(sql, me.id);
  const shop = await seedShop(sql, key);
  const [{ n }] = await sql`
    select count(*)::int as n from reservations r join slots sl on sl.id = r.slot_id
    where r.customer_id = ${customerId} and sl.shop_id = ${shop.id} and r.status in ('confirmed', 'completed')`;
  if (n > 0) return [`이미 ${shop.name}의 기존 고객이에요.`];
  const slot = await insertSlot(
    sql,
    slotRow({
      shopId: shop.id,
      menu: shop.menu,
      startAt: new Date(floorHour(now).getTime() - 3 * DAY),
      status: 'completed',
      description: `${myTag(me.id)} history`,
      createdBy: shop.owner_user_id,
      now,
    }),
  );
  await insertBookings(sql, [
    bookingRows({ slot, customerId, recordedBy: shop.owner_user_id, now, paymentPrefix: myPayment(me.id), policyVersion: 'scenario' }),
  ]);
  return [`${shop.name}의 기존 고객이 됐어요(3일 전 이용 완료). 이 샵의 신규 고객 전용 매물은 이제 안 보여야 해요.`];
}

async function customerNew(sql, me, key) {
  const shop = await seedShop(sql, key);
  const mine = () => sql`
    select o.id from orders o join slots sl on sl.id = o.slot_id
    where o.payment_id like ${`${myPayment(me.id)}%`} and sl.shop_id = ${shop.id}`;
  await deleteBookings(sql, mine);
  await sql`delete from slots where shop_id = ${shop.id} and menu_description like ${`${myTag(me.id)}%`}`;
  const [{ n }] = await sql`
    select count(*)::int as n from reservations r join slots sl on sl.id = r.slot_id
    join customers c on c.id = r.customer_id
    where c.user_id = ${me.id} and sl.shop_id = ${shop.id} and r.status in ('confirmed', 'completed')`;
  if (n > 0) return [`이 명령이 만들지 않은 ${shop.name} 이용 이력이 ${n}건 있어서 신규 고객으로 되돌리지 못했어요.`];
  return [`${shop.name}의 신규 고객이 됐어요. 이 샵의 신규 고객 전용 매물이 보여야 해요.`];
}

async function myReservations(sql, me, now) {
  const customerId = await ensureCustomer(sql, me.id);
  const shop = await seedShop(sql, 'd');
  const tag = `${myTag(me.id)} reservations`;
  // 지난번에 만든 내 예약 세트를 먼저 지운다(다시 실행해도 한 벌만)
  const prev = () => sql`
    select o.id from orders o join slots sl on sl.id = o.slot_id
    where o.payment_id like ${`${myPayment(me.id)}%`} and sl.menu_description = ${tag}`;
  await deleteBookings(sql, prev);
  await sql`delete from slots where menu_description = ${tag}`;

  const base = floorHour(now).getTime();
  const plan = [
    { label: '예정', status: 'reserved', at: base + 4 * DAY },
    { label: '이용 완료', status: 'completed', at: base - 2 * DAY },
    { label: '취소', status: 'cancelled', at: base + 5 * DAY },
    { label: '노쇼', status: 'completed', at: base - DAY, visit: 'no_show' },
  ];
  const out = [];
  const bookings = [];
  for (const p of plan) {
    const slot = await insertSlot(
      sql,
      slotRow({ shopId: shop.id, menu: shop.menu, startAt: new Date(p.at), status: p.status, description: tag, createdBy: shop.owner_user_id, now }),
    );
    bookings.push(
      bookingRows({ slot, customerId, recordedBy: shop.owner_user_id, now, visit: p.visit, paymentPrefix: myPayment(me.id), policyVersion: 'scenario' }),
    );
    out.push(`- ${p.label} · ${shop.name} · ${fmt(slot.start_at)}`);
  }
  await insertBookings(sql, bookings);
  return ['내 예약 4건을 만들었어요(내 예약 탭 확인용).', ...out];
}

async function holdByOther(sql, now) {
  const shop = await seedShop(sql, 'a');
  const holder = await seedCustomer(sql, 'a');
  const [slot] = await sql`
    select id, start_at, menu_name from slots
    where shop_id = ${shop.id} and status = 'published' and start_at > ${new Date(now.getTime() + HOUR)}
      and (hold_expires_at is null or hold_expires_at <= ${now})
    order by start_at limit 1`;
  if (!slot) return ['결제 중으로 바꿀 게시중 매물이 없어요. 시드를 다시 넣어 달라고 해 주세요.'];
  const expires = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
  await sql`update slots set hold_customer_id = ${holder}, hold_expires_at = ${expires} where id = ${slot.id}`;
  return [`${shop.name} ${fmt(slot.start_at)} ${slot.menu_name} 매물을 다른 고객이 결제 중이에요. ${fmt(expires)}에 풀려요.`];
}

async function ownerShop(sql, me, statusValue, now) {
  if (!SHOP_STATUSES.includes(statusValue)) {
    throw new ScenarioError('입점 상태는 pending(승인 대기), approved(승인), rejected(반려) 중 하나로 넣어 주세요.');
  }
  let [owner] = await sql`select id from owners where user_id = ${me.id}`;
  if (!owner) {
    [owner] = await sql`insert into owners ${sql({ user_id: me.id, name: `${TAG} 원장님`, phone: '000-0000-0000' })} returning id`;
  }
  let shop = await myShop(sql, me.id);
  if (!shop) {
    [shop] = await sql`insert into shops ${sql({
      owner_id: owner.id,
      name: `${TAG} 내 샵`,
      category: 'hair',
      phone: '000-0000-0000',
      road_address: '경기 안산시 상록구 시나리오로 1',
      sido: '경기',
      sigungu: '안산시 상록구',
      sigungu_code: '41271',
      location: 'SRID=4326;POINT(126.8389 37.3006)',
      business_name: `${TAG} 내 샵`,
      representative_name: `${TAG} 원장님`,
      business_registration_number: '000-00-00000',
      opened_on: '2021-03-02',
      business_doc_path: `${myShopDoc(me.id)}business-doc.jpg`,
      applied_at: new Date(now.getTime() - DAY),
    })} returning id, name`;
    await sql`insert into menus ${sql({ shop_id: shop.id, service_type: 'cut', name: `${TAG} 커트`, list_price: 25000, duration_minutes: 60, sort_order: 0 })}`;
  }
  await sql`update shops set
    status = ${statusValue},
    rejection_reason = ${statusValue === 'rejected' ? `${TAG} 사업자등록증 사진이 흐려요. 다시 올려 주세요.` : null},
    reviewed_at = ${statusValue === 'pending' ? null : now},
    updated_at = ${now}
    where id = ${shop.id}`;
  return [`내 샵(${shop.name})을 ${SHOP_STATUS_LABEL[statusValue]} 상태로 바꿨어요.`];
}

async function ownerSlots(sql, me, now) {
  const shop = await myShop(sql, me.id);
  if (!shop) throw new ScenarioError('내 샵이 없어요. 먼저 owner-shop approved를 실행해 주세요.');
  let [menu] = await sql`
    select id, service_type, name, list_price, duration_minutes from menus
    where shop_id = ${shop.id} and hidden_at is null order by sort_order limit 1`;
  if (!menu) {
    [menu] = await sql`insert into menus ${sql({ shop_id: shop.id, service_type: 'cut', name: `${TAG} 커트`, list_price: 25000, duration_minutes: 60, sort_order: 0 })}
      returning id, service_type, name, list_price, duration_minutes`;
  }
  const tag = `${myTag(me.id)} owner`;
  const prev = () => sql`select o.id from orders o join slots sl on sl.id = o.slot_id where sl.menu_description = ${tag}`;
  await deleteBookings(sql, prev);
  await sql`delete from slots where menu_description = ${tag}`;

  const [ownerRow] = await sql`select user_id from owners where user_id = ${me.id}`;
  const b = await seedCustomer(sql, 'b');
  const c = await seedCustomer(sql, 'c');
  const base = floorHour(now).getTime();
  const plan = [
    { label: '예약대기', status: 'scheduled', at: base + 72 * HOUR },
    { label: '게시중', status: 'published', at: base + 5 * HOUR },
    { label: '마감(팔리지 않고 시작 지남)', status: 'published', at: base - 3 * HOUR },
    { label: '마감(직접 마감)', status: 'closed', at: base + 10 * HOUR, closeReason: 'other_channel' },
    { label: '예약됨', status: 'reserved', at: base + 8 * HOUR, customer: c },
    { label: '취소(고객 취소)', status: 'cancelled', at: base + 26 * HOUR, customer: b },
    { label: '완료', status: 'completed', at: base - 26 * HOUR, customer: b },
  ];
  const out = [];
  const bookings = [];
  for (const p of plan) {
    const slot = await insertSlot(
      sql,
      slotRow({ shopId: shop.id, menu, startAt: new Date(p.at), status: p.status, description: tag, createdBy: ownerRow.user_id, closeReason: p.closeReason ?? null, now }),
    );
    if (p.customer) {
      bookings.push(
        bookingRows({ slot, customerId: p.customer, recordedBy: me.id, now, paymentPrefix: myPayment(me.id), policyVersion: 'scenario' }),
      );
    }
    out.push(`- ${p.label} · ${fmt(slot.start_at)}`);
  }
  await insertBookings(sql, bookings);
  if (shop.status !== 'approved') out.push(`※ 내 샵은 지금 ${SHOP_STATUS_LABEL[shop.status]}이라 고객 화면에는 안 보여요.`);
  return [`내 샵에 매물 ${plan.length}개를 만들었어요.`, ...out];
}

async function reset(sql, me) {
  const myOrders = () => sql`select id from orders where payment_id like ${`${myPayment(me.id)}%`}`;
  await deleteBookings(sql, myOrders);
  // 시나리오가 만든 내 샵: 그 샵의 예약·매물·메뉴까지 지운다
  const scenarioShops = () => sql`select id from shops where business_doc_path like ${`${myShopDoc(me.id)}%`}`;
  const shopOrders = () => sql`select o.id from orders o join slots sl on sl.id = o.slot_id where sl.shop_id in (${scenarioShops()})`;
  await deleteBookings(sql, shopOrders);
  await sql`delete from slots where menu_description like ${`${myTag(me.id)}%`} or shop_id in (${scenarioShops()})`;
  await sql`delete from shop_images where shop_id in (${scenarioShops()})`;
  await sql`delete from payout_accounts where shop_id in (${scenarioShops()})`;
  await sql`delete from menus where shop_id in (${scenarioShops()})`;
  const removedShops = await sql`delete from shops where id in (${scenarioShops()}) returning id`;
  const out = ['이 명령이 만든 예약·매물을 지웠어요.'];
  if (removedShops.length > 0) out.push('시나리오가 만든 내 샵을 지웠어요.');
  // 시나리오가 만든 계정은 다른 데이터가 없을 때만 지운다
  const owners = await sql`
    delete from owners o where o.user_id = ${me.id} and o.name like ${`${TAG}%`}
      and not exists (select 1 from shops s where s.owner_id = o.id) returning id`;
  if (owners.length > 0) out.push('시나리오가 만든 원장님 계정을 지웠어요.');
  try {
    const customers = await sql.savepoint((sp) => sp`
      delete from customers c where c.user_id = ${me.id} and c.nickname like ${`${TAG}%`}
        and not exists (select 1 from orders o where o.customer_id = c.id) returning id`);
    if (customers.length > 0) out.push('시나리오가 만든 고객 계정을 지웠어요.');
  } catch {
    out.push('고객 계정은 다른 기록(찜·관심 동네 등)이 있어서 남겨 뒀어요.');
  }
  return out;
}

/**
 * 시나리오 하나를 실행하고 안내 문구 줄을 돌려준다. 트랜잭션 안에서 부른다
 * @param {import('postgres').TransactionSql} sql
 * @param {{ email: string, command: string, arg?: string, now: Date }} options
 */
export async function runScenario(sql, { email, command, arg, now }) {
  if (!COMMANDS[command]) throw new ScenarioError(`모르는 명령이에요: ${command}\n${usage()}`);
  const me = await findMe(sql, email);
  switch (command) {
    case 'status':
      return status(sql, me);
    case 'customer-existing':
      return customerExisting(sql, me, arg, now);
    case 'customer-new':
      return customerNew(sql, me, arg);
    case 'my-reservations':
      return myReservations(sql, me, now);
    case 'hold-by-other':
      return holdByOther(sql, now);
    case 'owner-shop':
      return ownerShop(sql, me, arg, now);
    case 'owner-slots':
      return ownerSlots(sql, me, now);
    case 'reset':
      return reset(sql, me);
  }
  return [];
}

function usage() {
  const lines = Object.entries(COMMANDS).map(([name, desc]) => `  ${name.padEnd(18)} ${desc}`);
  const shops = SEED_SHOPS.filter((s) => s.status === 'approved').map((s) => `${s.key} ${s.name}`).join(', ');
  return `npm run scenario -- <명령> --email <로그인 이메일> [값]\n${lines.join('\n')}\n<샵>: ${shops}`;
}

async function main() {
  const args = process.argv.slice(2);
  const emailAt = args.indexOf('--email');
  const email = emailAt >= 0 ? args[emailAt + 1] : undefined;
  const positional = args.filter((a, i) => !a.startsWith('--') && i !== emailAt + 1);
  const [command, arg] = positional;
  if (!command) {
    console.log(usage());
    return;
  }
  const { sql } = await openDevDb('시나리오 명령');
  try {
    const lines = await sql.begin((tx) => runScenario(tx, { email, command, arg, now: new Date() }));
    console.log(lines.join('\n'));
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
