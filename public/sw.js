// 서비스 워커(PWA). 웹 푸시 받기(push, notificationclick)는 강규민이 채운다(로드맵 W16).
// 등록(navigator.serviceWorker.register)은 푸시 작업 때 한다. 지금은 등록하지 않는다.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
