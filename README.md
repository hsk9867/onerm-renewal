# 체크짐 V2 (onerm.net) 홈페이지 복제본

`https://onerm.net/home/` 을 2026-10-19 기준으로 그대로 받아 정적 사이트로 만든 것.

- `index.html` — 원본 HTML (상대 경로 그대로)
- `assets/landing/landing.css`, `landing.js`, `calc.js` — 원본 CSS/JS
- `assets/images/` — 제품 이미지·배경(webp)
- `assets/images/logos/` — 가맹점 로고 304개 (원본에서도 404인 7개는 제외) (원본은 cg2.co.kr / cg3.co.kr 외부 이미지)
- `assets/landing/rollingimg.json` — 원본 `procHome.php?actmode=rollingimg` 응답을 로컬 경로로 바꾼 것
- `draft-zeroback/` — 이전에 만든 zeroback.co.kr 스타일 리뉴얼 초안

## 원본과 다른 점

- 가맹점 로고 마퀴: `landing.js` 의 `initClubLogos` 가 `.json` URL 이면 GET 으로 받도록 두 줄 수정
- `체크짐 실행` 버튼: `/mng` → `https://onerm.net/mng`
- 가입 신청 폼·아이디 중복확인은 PHP 백엔드(procConsult.php, procCheckId.php)가 필요해서 정적 호스팅에서는 동작하지 않음
