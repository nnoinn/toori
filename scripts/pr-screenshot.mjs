// PR 스크린샷: Claude가 화면을 찍어 PR 댓글로 올린다. 내 컴퓨터의 개발 서버(localhost)에서만 쓴다.
//   찍기:   npm run screenshot -- capture --as owner-a /owner /owner/slots/new
//           npm run screenshot -- capture --email <내 로그인 이메일> --mode owner /owner
//   올리기: npm run screenshot -- upload --pr 185 <사진 파일>...  (찍은 파일, 사용자가 대화창에 붙여 넣은 사진)
// --as는 시드 계정(가짜 데이터)이라 레포에 올려도 안전하다. 레포가 공개라서 올리기 전에 Claude가 사진을 직접 열어
// 진짜 이메일·전화번호·계좌번호가 없는지 확인한다. 있으면 올리지 않는다(CLAUDE.md "PR 작성 규칙").

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';

const BASE_URL = 'http://localhost:3000';
const SEED_EMAIL_DOMAIN = 'seed.test';
const RELEASE_TAG = 'pr-screenshots';
const RELEASE_URL = `https://github.com/nnoinn/toori/releases/download/${RELEASE_TAG}`;
const OUT_DIR = join(tmpdir(), 'toori-screenshots');
const VIEWPORT = { width: 1280, height: 800 };
const LOAD_TIMEOUT_MS = 15000;
// 공개 저장소에 올라가므로 사진만 받는다(다른 파일을 잘못 넘겨도 올라가지 않게)
const IMAGE_FILE = /.(png|jpe?g|webp)$/i;

function flag(args, name) {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

/** --이름 값 쌍을 뺀 나머지(화면 주소, 파일) */
function positional(args) {
  return args.filter((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));
}

/** 시드 계정 또는 내 계정으로 로그인한 쿠키를 만든다. 이메일로 링크를 보내지 않고 관리 기능으로 바로 만든다 */
async function signIn(email) {
  process.loadEnvFile('.env.local');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !secretKey || !publishableKey) {
    throw new Error('.env.local에 Supabase 값이 없어요. 단톡방의 최신 파일을 받아 주세요.');
  }
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // 없는 이메일이면 로그인 정보가 새로 생기므로 먼저 막는다
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (!profile) throw new Error(`${email} 계정이 개발 DB에 없어요. 앱에서 한 번 로그인해 주세요.`);

  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`로그인 링크를 만들지 못했어요: ${error.name}`);
  const cookies = new Map();
  const client = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  const verified = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  });
  if (verified.error) throw new Error(`로그인하지 못했어요: ${verified.error.name}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { client, cookies };
}

/** Windows의 Git Bash가 /owner를 C:/Program Files/Git/owner로 바꿔 넘기는 것을 되돌린다 */
function screenPath(arg) {
  const path = arg.replace(/^[A-Za-z]:\/.*?\/Git(?=\/|$)/, '');
  return path.startsWith('/') ? path : `/${path}`;
}

function fileName(path) {
  const slug = path.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-') || 'home';
  return `${slug.slice(0, 60)}.png`;
}

async function capture(args) {
  const key = flag(args, '--as');
  const email = key ? `${key}@${SEED_EMAIL_DOMAIN}` : flag(args, '--email');
  const mode = flag(args, '--mode') ?? (key?.startsWith('owner') ? 'owner' : 'customer');
  const paths = positional(args).map(screenPath);
  if (paths.length === 0) throw new Error('찍을 화면 주소를 넣어 주세요. 예: /owner');
  const server = await fetch(BASE_URL).catch(() => null);
  if (!server) throw new Error(`${BASE_URL}에 개발 서버가 없어요. npm run dev를 먼저 켜 주세요.`);

  const session = email ? await signIn(email) : null;
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ko-KR' });
    if (session) {
      const cookies = [...session.cookies].map(([name, value]) => ({ name, value }));
      cookies.push({ name: 'account_mode', value: mode });
      await context.addCookies(cookies.map((c) => ({ ...c, url: BASE_URL })));
    }
    const page = await context.newPage();
    mkdirSync(OUT_DIR, { recursive: true });
    for (const path of paths) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: LOAD_TIMEOUT_MS }).catch(() => {});
      // 개발 서버의 N 표시는 실제 화면에 없다
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      const file = join(OUT_DIR, fileName(path));
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${path} → ${page.url().replace(BASE_URL, '')} → ${file}`);
    }
  } finally {
    await browser.close();
    await session?.client.auth.signOut({ scope: 'local' });
  }
}

function upload(args) {
  const pr = flag(args, '--pr');
  const files = positional(args);
  if (!/^\d+$/.test(pr ?? '') || files.length === 0) {
    throw new Error('예: npm run screenshot -- upload --pr 185 <사진 파일>...');
  }
  const notImage = files.find((file) => !IMAGE_FILE.test(file));
  if (notImage) throw new Error(`사진 파일만 올려요: ${basename(notImage)}`);
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = Date.now().toString(36);
  const images = files.map((file, index) => {
    // 붙여 넣은 사진은 파일 이름이 한글일 수 있다. GitHub가 바꾸지 않게 영문·숫자로만 짓고, 지난 사진을 덮어쓰지 않는다
    const ext = extname(file);
    const slug = basename(file, ext).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    const name = `pr${pr}-${stamp}-${index + 1}${slug ? `-${slug}` : ''}${ext}`;
    const named = join(OUT_DIR, name);
    copyFileSync(file, named);
    execFileSync('gh', ['release', 'upload', RELEASE_TAG, named, '--clobber'], { stdio: 'pipe' });
    return `![${name}](${RELEASE_URL}/${name})`;
  });
  const comment = execFileSync('gh', ['pr', 'comment', pr, '--body', images.join('\n')], {
    encoding: 'utf8',
  });
  console.log(comment.trim());
}

const [command, ...args] = process.argv.slice(2);
try {
  if (process.env.CI || process.env.VERCEL) throw new Error('내 컴퓨터에서만 실행해요.');
  if (command === 'capture') await capture(args);
  else if (command === 'upload') upload(args);
  else console.log('npm run screenshot -- capture|upload (scripts/pr-screenshot.mjs 맨 위 설명)');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
