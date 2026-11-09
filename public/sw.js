// 서비스 워커(PWA). 웹 푸시 받기(W16, #131). 등록은 알림을 켤 때 한다(src/features/push/subscribe-push.ts).
// 보내는 내용은 src/server/notifications/notify.ts가 정한다: { title, body, url, account }
// 한 기기에서 고객·원장님 알림을 모두 받는다. 지금 들어와 있지 않은 계정의 알림은 흑백 아이콘과 제목 앞 계정 이름으로 가르고,
// 누르면 로그인 화면을 거쳐 그 알림의 화면으로 간다(기술 가이드 7장 "한 기기의 알림", docs/brand.md).

const ICON = '/brand/app-icon/toori-app-icon-light-192.png';
const OTHER_ACCOUNT_ICON = '/brand/app-icon/toori-app-icon-gray-192.png';
const ACCOUNT_LABELS = { customer: '[고객]', owner: '[원장님]' };

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/** 지금 계정. 묻지 못하면 null이고, 다른 계정의 알림처럼 보여준다 */
async function currentAccount() {
  try {
    const response = await fetch('/api/account-mode', { cache: 'no-store' });
    if (!response.ok) return null;
    const { mode } = await response.json();
    return mode;
  } catch {
    return null;
  }
}

function readPush(event) {
  try {
    return event.data.json();
  } catch {
    return {};
  }
}

// 푸시를 받으면 꼭 알림을 보여줘야 한다(브라우저 규칙). 내용을 읽지 못해도 보여준다
async function showPush(event) {
  const { title = '새 알림이 있어요', body, url = '/', account } = readPush(event);
  const isCurrent = !account || (await currentAccount()) === account;
  await self.registration.showNotification(
    isCurrent ? title : `${ACCOUNT_LABELS[account]} ${title}`,
    {
      body,
      icon: isCurrent ? ICON : OTHER_ACCOUNT_ICON,
      data: { url, account },
    },
  );
}

self.addEventListener('push', (event) => {
  event.waitUntil(showPush(event));
});

/** 열려 있는 투리 창이 있으면 그 창에서 열고, 없으면 새 창을 연다 */
async function openPath(path) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    try {
      await client.focus();
      await client.navigate(path);
      return;
    } catch {
      // 이 창으로 옮기지 못했다. 다음 창이나 새 창으로 연다
    }
  }
  await self.clients.openWindow(path);
}

async function openNotification({ url, account }) {
  // 알림을 보여준 뒤 계정을 바꿨을 수 있어서 누를 때 다시 묻는다
  const isCurrent = !account || (await currentAccount()) === account;
  await openPath(isCurrent ? url : `/login?mode=${account}&next=${encodeURIComponent(url)}`);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openNotification(event.notification.data ?? { url: '/' }));
});
