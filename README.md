# 줍줍 (JupJup)

예약 취소·빈 시간을 할인 판매하는 B2B2C 마켓.

## 팀 멈반죽

| 이름 | GitHub | 담당 | 맡는 것 |
| --- | --- | --- | --- |
| 현동훈 | [nnoinn](https://github.com/nnoinn) | 통합·QA | 기반 세팅, DB 스키마·인증·권한 설계와 변경 승인, 공통 UI 컴포넌트, CLAUDE.md, 자동 검사·PR 규칙, 테스트, PR 리뷰와 main 머지, 리팩토링, 다른 팀원 작업 서포팅 |
| 정찬형 | [chosanai](https://github.com/chosanai) | 고객(수요자) | 홈·내 주변 매물, 목록·지도 탐색, 매물 상세, 예약·결제 화면, 내 예약, 로그인 화면, 지도 API |
| 정민석 | [alstjr62](https://github.com/alstjr62) | 업주(공급자) | 업주 가입·매장 등록, 매물 3탭 등록·수정·마감, 예약 현황 캘린더, 매장 설정(신규 고객 전용 등), 업주용 대시보드 |
| 강규민 | [poiuyst282-ui](https://github.com/poiuyst282-ui) | 공통·부가 | DB 스키마·인증·권한 구현(설계·변경 승인은 현동훈), 결제·환불 엔진, 알림, 업체 프로필, 정산·통계 대시보드(플랫폼 운영자용) |

## 처음 왔다면

[docs/onboarding.md](docs/onboarding.md): 세팅, Git, Claude Code 사용법, 매일 작업 흐름, 막혔을 때. 코드 규칙은 [docs/conventions.md](docs/conventions.md).

## 기능 명세

[docs/feature-spec.md](docs/feature-spec.md). 원본은 노션 CORE의 '기능 명세 통합본'이다.

## 기술 가이드

[docs/tech-guide.md](docs/tech-guide.md). 기술 스택, 담당별 구현 방법과 주의점, 담당자끼리 맞춰야 할 연결 지점.

## 작업 방식

팀 작업 규칙(브랜치, 커밋, PR, 리뷰·머지 흐름)은 [CLAUDE.md](CLAUDE.md)에 있다. 모든 팀원의 Claude가 세션을 시작할 때 이 파일을 읽는다.

PR을 만들 때는 [PR 템플릿](.github/pull_request_template.md)의 항목을 모두 채운다.
