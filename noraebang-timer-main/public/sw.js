// 최소한의 서비스워커. 아이패드/폰에서 "홈 화면에 추가"로 설치할 때 필요합니다.
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
