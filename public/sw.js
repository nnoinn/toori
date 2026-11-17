// 서비스 워커(PWA). 웹 푸시 받기(W16, #131). 등록은 알림을 켤 때 한다(src/features/push/subscribe-push.ts).
// 보내는 내용은 src/server/notifications/notify.ts가 정한다: { title, body, url, account }
// 한 기기에서 고객·원장님 알림을 모두 받는다. 지금 들어와 있지 않은 계정의 알림은 흑백 아이콘과 제목 앞 계정 이름으로 가르고,
// 누르면 로그인 화면을 거쳐 그 알림의 화면으로 간다(기술 가이드 7장 "한 기기의 알림", docs/brand.md).
// 지금 계정의 알림이면 앞에 보이는 투리 창의 화면 안내(src/components/ui/notification-toast.tsx)에 먼저 전해서 바로 띄운다.
// 화면 안내가 띄웠다고 답하고 크롬 계열이면 기기 알림을 생략한다(두 번 뜨지 않게, #371). 사파리는 푸시마다 기기 알림을
// 띄워야 해서(어기면 푸시가 끊길 수 있다) 늘 띄우고, 답이 없으면(화면 안내가 없는 화면, 응답 지연) 기기 알림을 띄운다.

const ICON = '/brand/app-icon/toori-app-icon-light-192.png';
const OTHER_ACCOUNT_ICON = '/brand/app-icon/toori-app-icon-gray-192.png';
const ACCOUNT_LABELS = { customer: '[고객]', owner: '[원장님]' };
/** 화면 안내에 보내는 메시지 이름. src/server/notifications/inbox-types.ts의 PUSH_TOAST_MESSAGE와 같아야 한다 */
const PUSH_TOAST_MESSAGE = 'toori:push-toast';
/** 화면 안내의 답을 기다리는 시간(ms). 서버에 새 알림을 묻고 답하므로 넉넉히 둔다. 넘으면 기기 알림을 띄운다 */
const TOAST_ANSWER_MS = 3000;

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

/**
 * 사이트 창이 앞에 보이면 기기 알림을 생략해도 되는 브라우저인지: 크롬 계열(크롬·엣지·삼성 인터넷 등 Chromium).
 * 사파리(맥, 아이폰 홈 화면 앱)는 푸시마다 기기 알림을 띄워야 한다. 아이폰의 다른 브라우저도 사파리 엔진이고
 * 이름이 CriOS·EdgiOS라서 여기에 걸리지 않는다
 */
function canSkipNotification() {
  const agent = self.navigator?.userAgent ?? '';
  return /Chrome\/|Chromium\/|Edg\//.test(agent);
}

/**
 * 앞에 보이는 투리 창들에 새 알림이 왔다고 전한다. 그 계정의 화면 안내가 있는 창은 서버에 새 알림을 묻고 답한다.
 * 한 창이라도 띄웠다고(shown) 답하면 true. 보이는 창이 없거나, 모두 아니라고 답하거나, 기다리는 시간이 지나면 false
 */
async function askToast(account) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const visible = windows.filter((client) => client.visibilityState === 'visible');
  if (visible.length === 0) return false;
  return new Promise((resolve) => {
    let waiting = visible.length;
    const channels = [];
    const finish = (shown) => {
      clearTimeout(timer);
      channels.forEach((channel) => channel.port1.close());
      resolve(shown);
    };
    const timer = setTimeout(() => finish(false), TOAST_ANSWER_MS);
    for (const client of visible) {
      const channel = new MessageChannel();
      channels.push(channel);
      channel.port1.onmessage = (message) => {
        if (message.data?.shown === true) finish(true);
        else if (--waiting === 0) finish(false);
      };
      client.postMessage({ type: PUSH_TOAST_MESSAGE, account }, [channel.port2]);
    }
  });
}

// 푸시를 받으면 기기 알림을 보여준다(브라우저 규칙). 내용을 읽지 못해도 보여준다.
// 크롬 계열에서 지금 계정의 화면 안내가 이미 띄웠으면 생략한다(사이트 창이 앞에 보이면 생략해도 된다)
async function showPush(event) {
  const { title = '새 알림이 있어요', body, url = '/', account } = readPush(event);
  const isCurrent = !account || (await currentAccount()) === account;
  if (account && isCurrent) {
    const toasted = await askToast(account);
    if (toasted && canSkipNotification()) return;
  }
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
