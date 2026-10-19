# 체크짐 V2 (onerm.net) 홈페이지 리뉴얼 초안

- 디자인 레퍼런스: http://zeroback.co.kr/ (레이아웃·색상·모션 구조 복제)
- 콘텐츠: https://onerm.net/ 기존 문구·요금·FAQ·연락처 그대로 사용
- `index.html` : 로컬/서버용 완성 파일 (더블클릭으로 열림)
- `page.html`  : index.html 의 본문 (artifact 게시용, doctype 없음)
- `assets/img/` : onerm.net 에서 가져와 리사이즈한 이미지

색상은 `:root` 의 `--main`(오렌지) / `--sub`(네이비) 두 변수만 바꾸면 전체 테마가 바뀝니다.
폼은 초안이라 전송 기능 없음 (submit 시 안내 문구만 표시).
