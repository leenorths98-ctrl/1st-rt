# 룸 타이머 보드

노래방 룸 101호~118호 시간 관리 웹앱. 카운터 아이패드에 항상 켜놓고,
실장님들이 각자 폰으로도 접속해서 같은 화면(같은 상태)을 봅니다.

## 동작 방식
- 룸 상태는 Upstash Redis(무료 티어)에 저장 → 모든 기기가 3초마다 폴링하며 동기화
- 방을 터치하면 **노란색**으로 선택되고, 하단에 시간 추가 버튼(+1/+5/+10/+50/+100분)이 뜸
- 남은 시간이 **6분 이하가 되면 해당 방 카드가 빨간색으로 깜빡임** (푸시 알림 아님, 화면 표시)
- 화면이 켜져 있는 동안: 6분 이하로 떨어지는 순간 알람음 3연타 + 진동이 울리고,
  경고 상태가 계속되면 15초마다 반복해서 울림
- 진동(navigator.vibrate)은 안드로이드/크롬에서는 동작하지만, **아이폰/아이패드 사파리는 진동 API 자체를 지원하지 않아 진동은 울리지 않습니다.** 소리는 아이패드에서도 정상 작동합니다.

## 1. Upstash Redis 만들기 (무료)
1. https://upstash.com 가입 → New Database (Redis)
2. 생성된 DB의 "REST API" 탭에서 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 복사

## 2. Vercel 배포
1. 이 프로젝트를 GitHub 레포에 올리기
2. https://vercel.com 에서 New Project → 해당 레포 선택
3. Environment Variables에 아래 두 값 추가
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Deploy

## 3. 카운터 아이패드 세팅
1. 배포된 주소로 접속
2. 우측 상단 **"🔔 소리 켜기"** 버튼을 한 번 탭 (브라우저 자동재생 정책 때문에 최초 1번 사람이 눌러줘야 소리가 납니다)
3. 화면이 항상 켜져 있는 용도이므로 자동 잠금(자동 화면 꺼짐)을 아이패드 설정에서 "안 함"으로 바꿔두는 걸 권장합니다 (앱에도 화면 꺼짐 방지 기능이 있지만, iOS는 자체 설정이 우선할 수 있습니다)

## 4. 로컬 개발
```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev
```

## 5. 커스터마이징 포인트
- `lib/constants.ts` — `MINUTE_OPTIONS`(시간 추가 단위), `WARNING_MS`(경고 기준, 현재 6분), `ROOM_COUNT`/`ROOM_ID_START`(방 개수/시작 번호, 현재 18개, 101호부터)
