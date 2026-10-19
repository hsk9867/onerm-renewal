/**
 * 랜딩 페이지 인터랙션.
 *
 * 앞선 파셜(inc/landing/sec_*.php)이 렌더한 data-* 규약을 실제 동작으로 연결한다.
 * 원본: v2 app/frontend/Pages/Landing/Index.tsx 의 React state/useEffect 들.
 *
 * ── ES5 전용 ──
 * 레거시 서버로 유입되는 구형 브라우저(IE11 등)를 고려해 const/let/화살표함수/
 * 템플릿리터럴/Array.from 을 쓰지 않는다. NodeList 순회는
 * Array.prototype.slice.call() 로 배열화한 뒤 forEach 한다.
 *
 * ── 설계 원칙 ──
 * 1) window.LANDING_SETTINGS 는 null 일 수 있다(home.php 의 landing_js_json() 이
 *    json_encode 실패 시 'null' 을 출력한다). 설정이 없으면 견적 계산만 건너뛰고
 *    탭/FAQ/약관/폼 등 나머지 인터랙션은 전부 정상 동작해야 한다.
 * 2) 어떤 실패에서도 사용자 입력을 버리지 않는다. form.reset() 은 성공 시에만.
 * 3) 에러는 toast 가 아니라 각 필드 아래 인라인(.field-error)으로 남긴다.
 * 4) 초기 상태(period=yearly, 수량 0)는 PHP 가 이미 올바르게 렌더했다.
 *    JS 는 같은 값을 다시 써넣으므로 로드 직후 깜빡임이 없다.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------
  // 공용 헬퍼
  // ---------------------------------------------------------------

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  /** NodeList -> 실제 배열. ES5 에서 forEach 를 쓰기 위한 변환. */
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function addClass(el, cls) {
    if (el && !hasClass(el, cls)) {
      el.className = el.className === '' ? cls : el.className + ' ' + cls;
    }
  }

  function hasClass(el, cls) {
    if (!el || !el.className) { return false; }
    return (' ' + el.className + ' ').indexOf(' ' + cls + ' ') > -1;
  }

  function removeClass(el, cls) {
    if (!el || !el.className) { return; }
    var parts = el.className.split(/\s+/);
    var kept = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] !== '' && parts[i] !== cls) { kept.push(parts[i]); }
    }
    el.className = kept.join(' ');
  }

  function toggleClass(el, cls, on) {
    if (on) { addClass(el, cls); } else { removeClass(el, cls); }
  }

  /** hidden 클래스로 표시/숨김. 파셜이 쓰는 규약과 동일하다. */
  function setHidden(el, hidden) {
    toggleClass(el, 'hidden', hidden);
  }

  function on(el, evt, fn) {
    if (!el) { return; }
    if (el.addEventListener) {
      el.addEventListener(evt, fn, false);
    } else if (el.attachEvent) {
      el.attachEvent('on' + evt, fn);
    }
  }

  /**
   * 3자리 콤마. 원본 TSX 의 toLocaleString() 과 동일한 결과를 낸다.
   * toLocaleString 은 구형 브라우저/로케일에 따라 결과가 흔들리므로 직접 포맷한다
   * (PHP number_format() 초기 렌더와도 정확히 일치해야 한다).
   */
  function formatNumber(n) {
    if (typeof n !== 'number' || !isFinite(n)) { return '0'; }
    var neg = n < 0;
    var s = String(Math.abs(Math.round(n)));
    var out = '';
    var count = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s.charAt(i) + out;
      count++;
      if (count % 3 === 0 && i > 0) { out = ',' + out; }
    }
    return neg ? '-' + out : out;
  }

  // ---------------------------------------------------------------
  // 1. 탭 (3그룹 공용) — data-tabgroup / data-tab / data-tabpanel
  //    showcase(face|kiosk), installation(4종), feature(7종)
  //    그룹명을 하드코딩하지 않고 DOM 에서 수집하므로 그룹이 늘어도 그대로 동작한다.
  // ---------------------------------------------------------------

  function initTabs() {
    var buttons = qsa('[data-tabgroup][data-tab]');

    buttons.forEach(function (btn) {
      on(btn, 'click', function () {
        var group = btn.getAttribute('data-tabgroup');
        var tab = btn.getAttribute('data-tab');
        if (!group || !tab) { return; }
        activateTab(group, tab);
      });
    });
  }

  function activateTab(group, tab) {
    // 같은 그룹의 버튼만 골라 active 를 옮긴다.
    qsa('[data-tabgroup="' + group + '"][data-tab]').forEach(function (b) {
      toggleClass(b, 'active', b.getAttribute('data-tab') === tab);
    });

    // 같은 그룹의 패널만 토글한다.
    qsa('[data-tabgroup="' + group + '"][data-tabpanel]').forEach(function (p) {
      setHidden(p, p.getAttribute('data-tabpanel') !== tab);
    });
  }

  // ---------------------------------------------------------------
  // 2. 시뮬레이터 자동 순환 (4단계, 3.5초 — 원본 Index.tsx:110 과 동일 주기)
  //    data-simscreen 의 stage-N 클래스 / data-simstage 패널 / data-simstep 인디케이터
  // ---------------------------------------------------------------

  var SIM_STAGES = 4;
  var SIM_INTERVAL_MS = 3500;

  function initSimulator() {
    var screen = qs('[data-simscreen]');
    var stages = qsa('[data-simstage]');
    var steps = qsa('[data-simstep]');

    // 시뮬레이터가 없는 페이지(파셜 미포함)에서도 죽지 않는다.
    if (!screen || stages.length === 0) { return; }

    var stage = 0;

    function render() {
      // stage-N 클래스 교체. 원본은 className={`simulator-screen stage-${simStage}`}.
      for (var i = 0; i < SIM_STAGES; i++) {
        removeClass(screen, 'stage-' + i);
      }
      addClass(screen, 'stage-' + stage);

      stages.forEach(function (el) {
        setHidden(el, String(el.getAttribute('data-simstage')) !== String(stage));
      });

      steps.forEach(function (el) {
        toggleClass(el, 'active', String(el.getAttribute('data-simstep')) === String(stage));
      });
    }

    setInterval(function () {
      stage = (stage + 1) % SIM_STAGES;
      render();
    }, SIM_INTERVAL_MS);
  }

  // ---------------------------------------------------------------
  // 3. FAQ 아코디언 — 한 번에 하나만 열린다(원본 openFaqIndex 단일 state)
  // ---------------------------------------------------------------

  function initFaq() {
    var toggles = qsa('[data-faq-toggle]');

    function openOnly(index) {
      toggles.forEach(function (t) {
        var isTarget = t.getAttribute('data-faq-toggle') === index;
        t.setAttribute('aria-expanded', isTarget ? 'true' : 'false');
        toggleClass(t, 'active', isTarget);
      });
      qsa('[data-faq-panel]').forEach(function (p) {
        setHidden(p, p.getAttribute('data-faq-panel') !== index);
      });
    }

    toggles.forEach(function (toggle) {
      function handle() {
        var index = toggle.getAttribute('data-faq-toggle');
        // 이미 열린 항목을 다시 누르면 닫는다(원본: setOpenFaqIndex(null)).
        if (toggle.getAttribute('aria-expanded') === 'true') {
          openOnly(null);
        } else {
          openOnly(index);
        }
      }

      on(toggle, 'click', handle);

      // 파셜이 role="button" tabindex="0" 을 주므로 키보드 조작도 지원한다.
      on(toggle, 'keydown', function (e) {
        var key = e.which || e.keyCode;
        if (key === 13 || key === 32) { // Enter / Space
          if (e.preventDefault) { e.preventDefault(); }
          handle();
        }
      });
    });
  }

  // ---------------------------------------------------------------
  // 4. 약관 아코디언 — terms/privacy 는 서로 독립 토글(원본도 별개 state)
  // ---------------------------------------------------------------

  function initAgreements() {
    qsa('[data-agreement-toggle]').forEach(function (btn) {
      on(btn, 'click', function () {
        var key = btn.getAttribute('data-agreement-toggle');
        var panel = qs('[data-agreement-panel="' + key + '"]');
        if (!panel) { return; }

        var willOpen = hasClass(panel, 'hidden');
        setHidden(panel, !willOpen);
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        toggleClass(btn, 'expanded', willOpen);
      });
    });
  }

  // ---------------------------------------------------------------
  // 5. 체크박스 — '전체 동의' 연동 + .custom-chk 외형 동기화
  //
  //    ※ 서버 전송값은 건드리지 않는다. 파셜이 hidden(0) + checkbox(1) 짝으로
  //      마크업했으므로 FormData 가 자동으로 올바른 값('1'/'0')을 담는다.
  //      data.set('agree_terms','0') 같은 수동 보정은 불필요하며 오히려 위험하다.
  //    ※ .custom-chk 외형은 CSS(.chk-native:checked + .custom-chk)가 이미 처리한다.
  //      여기서 checked 클래스를 함께 토글하는 것은 구형 브라우저 보강용이다.
  // ---------------------------------------------------------------

  function syncCustomChk(input) {
    if (!input) { return; }
    var span = input.nextSibling;
    while (span && span.nodeType !== 1) { span = span.nextSibling; }
    if (span && hasClass(span, 'custom-chk')) {
      toggleClass(span, 'checked', !!input.checked);
    }
  }

  function initCheckboxes() {
    var all = qs('#f_agree_all');
    var terms = qs('#f_agree_terms');
    var privacy = qs('#f_agree_privacy');
    var required = [];
    if (terms) { required.push(terms); }
    if (privacy) { required.push(privacy); }

    // 초기 외형 동기화(브라우저 복원 체크 상태 대비)
    if (all) { syncCustomChk(all); }
    required.forEach(syncCustomChk);

    if (all) {
      on(all, 'change', function () {
        required.forEach(function (chk) {
          chk.checked = all.checked;
          syncCustomChk(chk);
          clearFieldError(chk.name);
        });
      });
    }

    required.forEach(function (chk) {
      on(chk, 'change', function () {
        syncCustomChk(chk);
        clearFieldError(chk.name);
        // 하나라도 풀리면 '전체 동의'도 풀린다.
        if (all) {
          var everyChecked = true;
          required.forEach(function (c) {
            if (!c.checked) { everyChecked = false; }
          });
          all.checked = everyChecked;
          syncCustomChk(all);
        }
      });
    });
  }

  // ---------------------------------------------------------------
  // 6. 스크롤스파이 + 헤더 scrolled 상태 + 부드러운 스크롤
  //    원본 Index.tsx:130-153 과 동일한 임계값(scrollY > 50, offset +120, 앵커 -80)
  //
  //    ※ 헤더는 #topNav 가 아니라 data-landing-header 다(실측 확인).
  // ---------------------------------------------------------------

  var SECTIONS = ['hero', 'showcase', 'features', 'pricing', 'consult', 'faq'];

  function initScrollSpy() {
    var header = qs('[data-landing-header]');
    var navlinks = qsa('[data-navlink]');

    function handleScroll() {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;

      if (header) {
        toggleClass(header, 'scrolled', y > 50);
      }

      var scrollPos = y + 120;
      var current = null;
      for (var i = 0; i < SECTIONS.length; i++) {
        var el = document.getElementById(SECTIONS[i]);
        if (!el) { continue; }
        var top = el.offsetTop;
        var height = el.offsetHeight;
        if (scrollPos >= top && scrollPos < top + height) {
          current = SECTIONS[i];
          break;
        }
      }

      // 원본은 매칭이 없으면 직전 activeSection 을 유지한다. 동일하게 동작시킨다.
      if (current === null) { return; }

      navlinks.forEach(function (link) {
        // 로고와 CTA 버튼(a.btn-primary)도 data-navlink 를 갖지만
        // active 하이라이트는 nav 안의 링크에만 의미가 있다.
        if (!hasClass(link, 'landing-nav-link')) { return; }
        toggleClass(link, 'active', link.getAttribute('data-navlink') === current);
      });
    }

    on(window, 'scroll', handleScroll);
    handleScroll();

    // 부드러운 스크롤. <a href="#consult"> 는 JS 없이도 동작하므로 여기서는
    // 기본 점프를 가로채 헤더 높이(80px)만큼 보정한 스무스 스크롤로 바꾼다.
    navlinks.forEach(function (link) {
      on(link, 'click', function (e) {
        var id = link.getAttribute('data-navlink');
        var target = document.getElementById(id);
        if (!target) { return; }
        if (e.preventDefault) { e.preventDefault(); }

        var top = target.offsetTop - 80;
        if (top < 0) { top = 0; }

        // scrollTo(options) 미지원 구형 브라우저는 즉시 점프로 폴백한다.
        try {
          window.scrollTo({ top: top, behavior: 'smooth' });
        } catch (err) {
          window.scrollTo(0, top);
        }
      });
    });
  }

  // ---------------------------------------------------------------
  // 7. 견적 계산기
  //
  //    ⚠ hwkey 는 UI에 5종만 존재한다(general_face/general_kiosk/general_touch/
  //      premium_face/premium_kiosk). calc.js 의 HW_KEYS 는 6종이지만 나머지 1종
  //      (premium_fingerprint)은 DOM 에 없다 —
  //      존재하지 않는 엘리먼트 조회 결과(null)에 절대 접근하지 않는다.
  //
  //    ⚠ 계약기간 화이트리스트: calc.estimate() 는 알 수 없는 period 에
  //      fall-through 해 progPrice=0 인데 사은은 붙는다("총액 0원 + 사은 6개월").
  //      VALID_PERIODS 로 막는다.
  // ---------------------------------------------------------------

  var VALID_PERIODS = { monthly: true, yearly: true, two_years: true };
  var DEFAULT_PERIOD = 'yearly'; // PHP 초기 렌더와 동일해야 한다.

  function initEstimator() {
    var settings = (typeof window.LANDING_SETTINGS !== 'undefined')
      ? window.LANDING_SETTINGS : null;

    var calc = window.LandingCalc;

    var periodCards = qsa('[data-period]');
    var qtyValues = qsa('[data-qty-value]');

    // 견적 UI 자체가 없으면 아무것도 하지 않는다.
    if (periodCards.length === 0 && qtyValues.length === 0) { return; }

    // 계약 1) 설정이 없거나(null) calc.js 가 로드되지 않았으면 견적만 건너뛴다.
    // PHP 가 렌더한 초기 화면 값이 그대로 남고, 나머지 인터랙션은 정상 동작한다.
    var canEstimate = !!(calc && typeof calc.estimate === 'function' && settings);
    if (!canEstimate) {
      // 상태 변경 버튼이 눌려도 값이 안 바뀌면 고장으로 보인다.
      // 클릭 핸들러 자체를 붙이지 않아 "죽은 버튼"임을 명확히 한다.
      return;
    }

    var period = DEFAULT_PERIOD;

    // DOM 에 실제로 존재하는 hwkey 만 상태로 관리한다.
    var hwKeys = [];
    qtyValues.forEach(function (el) {
      var key = el.getAttribute('data-qty-value');
      if (key && hwKeys.indexOf(key) === -1) { hwKeys.push(key); }
    });

    var quantities = {};
    hwKeys.forEach(function (key) {
      quantities[key] = 0;
    });

    function setResult(name, text) {
      // ⚠ 숫자만 써넣는다. "원"/"개월" 같은 단위는 span 바깥에 있다.
      //   함께 쓰면 "240,000원원" 이 된다.
      var el = qs('[data-result="' + name + '"]');
      if (el) { el.innerHTML = ''; el.appendChild(document.createTextNode(text)); }
    }

    // ⚠ 이 파일에서는 Tailwind 유틸리티와 같은 이름의 "맨 단어" 식별자를 쓰지 않는다.
    //   tailwind.config.js 의 content 에 ./assets/landing/*.js 가 포함돼 있어,
    //   스캐너가 변수명/주석 단어를 클래스명으로 오인해 실제 CSS 규칙을 생성한다.
    //   (하이픈이 붙은 hero-xxx 같은 이름은 분해되지 않으므로 안전하다)
    //   그래서 인자명을 isShown 처럼 Tailwind 에 없는 이름으로 짓는다.
    function setResultRow(name, isShown) {
      var el = qs('[data-result-row="' + name + '"]');
      if (el) { setHidden(el, !isShown); }
    }

    function syncHiddenFields(result) {
      var plan = qs('#f_selected_plan');
      if (plan) { plan.value = period; }

      var total = qs('#f_total_price');
      if (total) { total.value = String(result.finalPrice); }

      // hidden 필드는 5종(#f_hw_<key>)만 존재한다. 없으면 조용히 건너뛴다.
      hwKeys.forEach(function (key) {
        var input = qs('#f_hw_' + key);
        if (input) { input.value = String(quantities[key] || 0); }
      });
    }

    function render() {
      // 화이트리스트 밖의 period 로는 절대 계산하지 않는다.
      var safePeriod = VALID_PERIODS[period] ? period : DEFAULT_PERIOD;

      var result = calc.estimate(safePeriod, quantities, settings);

      setResult('programPrice', formatNumber(result.programPrice));
      setResult('hwPrice', formatNumber(result.hwPrice));
      setResult('bonusMonths', formatNumber(result.bonusMonths));
      setResult('finalPrice', formatNumber(result.finalPrice));
      setResult('monthlyAverage', formatNumber(result.monthlyAverage));
      // 화면 비표시 캐리어 — 'true'/'false' 문자열
      setResult('freeDelivery', result.freeDelivery ? 'true' : 'false');

      setResultRow('hwPrice', result.hwPrice > 0);
      setResultRow('bonusMonths', result.bonusMonths > 0);
      // 원본: 얼굴/지문인식 장비 수량이 있을 때만 설치비 경고를 띄운다.
      setResultRow('installNotice',
        (quantities.general_face > 0) || (quantities.premium_face > 0));
      // 결제키오스크(premium_kiosk)는 스탠드 추가금 경고를 따로 띄운다.
      setResultRow('standNotice', quantities.premium_kiosk > 0);

      // 기간 카드 selected 상태
      periodCards.forEach(function (card) {
        toggleClass(card, 'selected', card.getAttribute('data-period') === safePeriod);
      });

      // 수량 표시 + 감소 버튼 disabled
      hwKeys.forEach(function (key) {
        var q = quantities[key] || 0;

        var valEl = qs('[data-qty-value="' + key + '"]');
        if (valEl) {
          valEl.innerHTML = '';
          valEl.appendChild(document.createTextNode(String(q)));
        }

        var decEl = qs('[data-qty-dec="' + key + '"]');
        if (decEl) { decEl.disabled = (q <= 0); }
      });

      syncHiddenFields(result);
    }

    periodCards.forEach(function (card) {
      on(card, 'click', function () {
        var p = card.getAttribute('data-period');
        // 알 수 없는 period 는 무시한다(계약 3).
        if (!VALID_PERIODS[p]) { return; }
        period = p;
        render();
      });
    });

    qsa('[data-qty-inc]').forEach(function (btn) {
      on(btn, 'click', function () {
        var key = btn.getAttribute('data-qty-inc');
        // DOM 에 표시 엘리먼트가 없는 키는 상태에도 없다 — 조용히 무시.
        if (hwKeys.indexOf(key) === -1) { return; }
        quantities[key] = (quantities[key] || 0) + 1;
        render();
      });
    });

    qsa('[data-qty-dec]').forEach(function (btn) {
      on(btn, 'click', function () {
        var key = btn.getAttribute('data-qty-dec');
        if (hwKeys.indexOf(key) === -1) { return; }
        var next = (quantities[key] || 0) - 1;
        quantities[key] = next < 0 ? 0 : next; // 음수 금지
        render();
      });
    });

    // 계약 4) 초기 렌더는 PHP 결과와 동일한 값을 다시 써넣으므로 깜빡임이 없다.
    render();
  }

  // ---------------------------------------------------------------
  // 8. Daum 우편번호
  //    CDN 로드 실패 시 readonly 를 풀어 직접 입력하게 한다 —
  //    주소는 선택 항목이지만 입력 수단이 아예 사라지면 안 된다.
  // ---------------------------------------------------------------

  var DAUM_SRC = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

  function initAddressSearch() {
    var btn = qs('#btn-address-search');
    if (!btn) { return; }

    var zipcodeInput = qs('#f_zipcode');
    var addressInput = qs('#f_address');
    var daumLoaded = false;
    var daumFailed = false;

    function enableManualEntry(message) {
      daumFailed = true;
      if (zipcodeInput) { zipcodeInput.removeAttribute('readonly'); }
      if (addressInput) {
        addressInput.removeAttribute('readonly');
        addressInput.setAttribute('placeholder', '주소를 직접 입력해 주세요');
      }
      // 인라인 안내(계약 6: toast 가 아니라 필드 옆에 남긴다)
      showFieldError('zipcode', message);
    }

    // CDN 스크립트 주입. 실패하면 직접입력으로 폴백한다.
    var script = document.createElement('script');
    script.src = DAUM_SRC;
    script.async = true;
    script.onload = function () { daumLoaded = true; };
    script.onerror = function () {
      enableManualEntry('주소 검색 모듈을 불러오지 못했습니다. 주소를 직접 입력해 주세요.');
    };
    document.body.appendChild(script);

    on(btn, 'click', function () {
      if (daumFailed) { return; }

      if (!daumLoaded || !window.daum || !window.daum.Postcode) {
        // 아직 로딩 중일 수 있다 — 폴백 대신 재시도를 안내한다.
        showFieldError('zipcode', '주소 찾기 모듈을 불러오는 중입니다. 잠시 후 다시 클릭해 주세요.');
        return;
      }

      clearFieldError('zipcode');
      openPostcodeModal();
    });

    function openPostcodeModal() {
      // 원본 Index.tsx:1772-1781 의 마크업을 JS 로 구성한다.
      // 클래스는 landing.css 에 이미 존재하는 것만 쓴다(Tailwind 재빌드 불필요).
      var overlay = document.createElement('div');
      overlay.className = 'zipcode-overlay';

      var modal = document.createElement('div');
      modal.className = 'zipcode-modal';

      var header = document.createElement('div');
      header.className = 'zipcode-header';

      var title = document.createElement('span');
      title.className = 'zipcode-title';
      title.appendChild(document.createTextNode('설치 주소지 검색'));

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn-zipcode-close';
      closeBtn.appendChild(document.createTextNode('×'));

      var pcBox = document.createElement('div');
      pcBox.style.width = '100%';
      pcBox.style.height = '400px';

      header.appendChild(title);
      header.appendChild(closeBtn);
      modal.appendChild(header);
      modal.appendChild(pcBox);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      function close() {
        if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      }

      on(closeBtn, 'click', close);
      on(overlay, 'click', function (e) {
        // 모달 바깥(오버레이 자체)을 눌렀을 때만 닫는다.
        if ((e.target || e.srcElement) === overlay) { close(); }
      });
      on(modal, 'click', function (e) {
        if (e.stopPropagation) { e.stopPropagation(); }
      });

      try {
        new window.daum.Postcode({
          oncomplete: function (data) {
            // 원본과 동일한 주소 조립 규칙(Index.tsx:315-333)
            var fullAddr = data.address;
            var extraAddr = '';

            if (data.addressType === 'R') {
              if (data.bname !== '') { extraAddr += data.bname; }
              if (data.buildingName !== '') {
                extraAddr += (extraAddr !== '')
                  ? ', ' + data.buildingName
                  : data.buildingName;
              }
              if (extraAddr !== '') { fullAddr += ' (' + extraAddr + ')'; }
            }

            if (zipcodeInput) { zipcodeInput.value = data.zonecode; }
            if (addressInput) { addressInput.value = fullAddr; }
            clearFieldError('zipcode');
            clearFieldError('address');
            close();
          },
          width: '100%',
          height: '100%'
        }).embed(pcBox);
      } catch (err) {
        close();
        enableManualEntry('주소 검색을 실행하지 못했습니다. 주소를 직접 입력해 주세요.');
      }
    }
  }

  // ---------------------------------------------------------------
  // 9. 인라인 에러 표시 (계약 6)
  // ---------------------------------------------------------------

  function showFieldError(field, message) {
    var el = qs('[data-error-for="' + field + '"]');
    if (!el) { return; }
    el.innerHTML = '';
    el.appendChild(document.createTextNode(message));
    setHidden(el, false);
  }

  function clearFieldError(field) {
    var el = qs('[data-error-for="' + field + '"]');
    if (!el) { return; }
    el.innerHTML = '';
    setHidden(el, true);
  }

  function clearAllFieldErrors() {
    qsa('[data-error-for]').forEach(function (el) {
      el.innerHTML = '';
      setHidden(el, true);
    });
  }

  function setFormMessage(text, isError) {
    var el = qs('#consult-message');
    if (!el) { return; }
    el.innerHTML = '';
    // 서버가 여러 줄(\n)로 보낼 수 있다 — 줄바꿈을 <br> 대신 실제 개행 노드로 넣고
    // CSS 가 접는 것을 피하기 위해 white-space 를 인라인 지정한다.
    el.appendChild(document.createTextNode(text));
    el.style.whiteSpace = 'pre-line';
    removeClass(el, 'is-error');
    removeClass(el, 'is-success');
    addClass(el, isError ? 'is-error' : 'is-success');
    setHidden(el, false);
  }

  function clearFormMessage() {
    var el = qs('#consult-message');
    if (!el) { return; }
    el.innerHTML = '';
    removeClass(el, 'is-error');
    removeClass(el, 'is-success');
    setHidden(el, true);
  }

  /**
   * 접수 완료 안내 모달.
   *
   * 기존에는 성공 시 form.scrollIntoView() 로 폼 상단까지 스크롤을 올렸는데,
   * 안내 문구(#consult-message)는 폼 하단(제출 버튼 근처)에 있어서 화면 밖으로
   * 밀려나 "문구가 안 보인다"는 문의가 있었다. 스크롤 대신 뷰포트 중앙에
   * 고정(position:fixed)된 모달로 띄운다 — 스크롤 위치와 무관하게 항상 보인다.
   *
   * 스타일은 landing.css 가 tailwind 빌드 산출물이라 직접 수정하지 않고
   * 최초 1회 <style> 로 주입한다.
   */
  function ensureModalStyles() {
    if (document.getElementById('consult-modal-style')) { return; }
    var style = document.createElement('style');
    style.id = 'consult-modal-style';
    style.appendChild(document.createTextNode(
      '.consult-modal-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;' +
      'background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;' +
      'z-index:99999;padding:1rem;}' +
      '.consult-modal-box{background:#16181d;border:1px solid #2c3038;border-radius:14px;' +
      'max-width:400px;width:100%;padding:2rem 1.5rem;text-align:center;' +
      'box-shadow:0 20px 50px rgba(0,0,0,.5);}' +
      '.consult-modal-icon{width:56px;height:56px;line-height:56px;border-radius:50%;' +
      'margin:0 auto 1rem;background:rgba(16,185,129,.15);color:#10b981;font-size:30px;}' +
      '.consult-modal-text{color:#f3f4f6;font-size:1.05rem;font-weight:700;' +
      'line-height:1.6;white-space:pre-line;margin-bottom:1.5rem;}' +
      '.consult-modal-btn{background:#10b981;color:#fff;border:0;border-radius:8px;' +
      'padding:.8rem 2.5rem;font-size:1rem;font-weight:700;cursor:pointer;}' +
      '.consult-modal-btn:hover{background:#0ea371;}'
    ));
    document.getElementsByTagName('head')[0].appendChild(style);
  }

  function showConsultSuccessModal(text) {
    ensureModalStyles();

    // 중복 표시 방지
    var old = qs('.consult-modal-backdrop');
    if (old && old.parentNode) { old.parentNode.removeChild(old); }

    var backdrop = document.createElement('div');
    backdrop.className = 'consult-modal-backdrop';

    var box = document.createElement('div');
    box.className = 'consult-modal-box';
    // 접근성 — 스크린리더가 즉시 읽도록
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');

    var icon = document.createElement('div');
    icon.className = 'consult-modal-icon';
    icon.appendChild(document.createTextNode('✓'));

    var msg = document.createElement('div');
    msg.className = 'consult-modal-text';
    // 서버 메시지를 텍스트 노드로만 넣는다(HTML 인젝션 차단).
    msg.appendChild(document.createTextNode(text));

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'consult-modal-btn';
    btn.appendChild(document.createTextNode('확인'));

    function close() {
      if (backdrop.parentNode) { backdrop.parentNode.removeChild(backdrop); }
      if (document.removeEventListener) {
        document.removeEventListener('keydown', onKey, false);
      }
    }
    function onKey(e) {
      if ((e.key === 'Escape' || e.keyCode === 27)) { close(); }
    }

    on(btn, 'click', close);
    // 배경(딤) 클릭으로도 닫는다. 박스 내부 클릭은 무시.
    on(backdrop, 'click', function (e) {
      if (e.target === backdrop) { close(); }
    });
    if (document.addEventListener) {
      document.addEventListener('keydown', onKey, false);
    }

    box.appendChild(icon);
    box.appendChild(msg);
    box.appendChild(btn);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    try { btn.focus(); } catch (err) { /* 포커스 실패는 무시 */ }
  }

  // ---------------------------------------------------------------
  // 9-1. 아이디 중복 확인
  //
  //      proc/procCheckId.php → v2 POST /api/consults/check_id.
  //      판정은 v2 한 곳(ConsultRequest.id_available?)에 있다 —
  //      manager.mgid + 미거절 신청서(consult_requests.requested_id) 양쪽을 본다.
  //
  //      checkedId 는 "이 값으로 사용 가능 판정을 받았다"는 기록이다.
  //      아이디를 다시 고치면 판정이 무효가 되므로 input 이벤트에서 비운다.
  // ---------------------------------------------------------------

  var checkedId = '';

  function setIdCheckResult(message, isError) {
    var el = qs('#id-check-result');
    if (!el) { return; }
    el.innerHTML = '';
    if (message === '') {
      setHidden(el, true);
      return;
    }
    el.appendChild(document.createTextNode(message));
    removeClass(el, 'is-error');
    removeClass(el, 'is-success');
    addClass(el, isError ? 'is-error' : 'is-success');
    // 이 요소는 sec_consult.php 가 새로 추가한 것이라 기존 CSS 에 색 규칙이 없다.
    // 성공/실패를 색으로 즉시 구분할 수 있도록 인라인으로 지정한다.
    el.style.color = isError ? '#f87171' : '#34d399';
    el.style.fontSize = '0.75rem';
    el.style.marginTop = '0.5rem';
    setHidden(el, false);
  }

  function initIdCheck() {
    var btn = qs('#btn-id-check');
    var input = qs('#f_requested_id');
    if (!btn || !input) { return; }

    var originalText = btn.innerHTML;
    var busy = false;

    // 아이디를 고치면 이전 확인 결과는 무효다.
    on(input, 'input', function () {
      checkedId = '';
      setIdCheckResult('', false);
    });

    on(btn, 'click', function () {
      if (busy) { return; }

      var value = val('#f_requested_id');
      if (value.length < 4) {
        checkedId = '';
        setIdCheckResult('아이디는 4자 이상 입력하세요.', true);
        return;
      }

      busy = true;
      btn.disabled = true;
      btn.innerHTML = '';
      btn.appendChild(document.createTextNode('확인 중...'));

      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'proc/procCheckId.php', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }

        busy = false;
        btn.disabled = false;
        btn.innerHTML = originalText;

        var data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (err) {
          data = null;
        }

        // 응답을 해석하지 못하면 "사용 가능"으로 넘기지 않는다 —
        // 접수 단계에서 v2 가 어차피 거부하므로 여기서 통과시키면
        // 폼을 다 채운 뒤에야 아이디를 바꾸게 된다.
        if (!data || typeof data !== 'object') {
          checkedId = '';
          setIdCheckResult('중복 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', true);
          return;
        }

        var available = !!data.available;
        var message = (typeof data.message === 'string' && data.message !== '')
          ? data.message
          : (available ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.');

        checkedId = available ? value : '';
        setIdCheckResult(message, !available);
        if (available) { clearFieldError('requested_id'); }
      };

      xhr.send('requested_id=' + encodeURIComponent(value));
    });
  }

  // ---------------------------------------------------------------
  // 10. 상담 폼 제출
  //
  //     계약 5) 어떤 실패에서도 입력을 버리지 않는다. form.reset() 은 성공 시에만.
  //     계약 2) 체크박스 값은 손대지 않는다 — hidden(0)+checkbox(1) 짝이
  //             FormData 에 이미 올바른 값을 넣는다.
  // ---------------------------------------------------------------

  var EMAIL_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

  function val(id) {
    var el = qs(id);
    if (!el) { return ''; }
    return String(el.value === null || el.value === undefined ? '' : el.value).replace(/^\s+|\s+$/g, '');
  }

  /**
   * 클라이언트 검증. procConsult.php:79-147 과 동일한 규칙이다.
   * 서버가 어차피 재검증하므로 여기서는 왕복 없이 즉시 피드백하는 것이 목적이다.
   */
  function validateForm() {
    var errors = {};

    var terms = qs('#f_agree_terms');
    var privacy = qs('#f_agree_privacy');
    if (terms && !terms.checked) {
      errors.agree_terms = '체크짐 이용약관에 동의하셔야 합니다.';
    }
    if (privacy && !privacy.checked) {
      errors.agree_privacy = '개인정보 처리방침에 동의하셔야 합니다.';
    }

    var requestedId = val('#f_requested_id');
    if (requestedId.length < 4) {
      errors.requested_id = '아이디는 4자 이상 입력하세요.';
    } else if (checkedId !== requestedId) {
      // 중복 확인을 통과한 아이디여야 한다. 확인 후 고치면 checkedId 가 비워진다.
      // 서버(v2 ConsultRequest)도 같은 규칙으로 재검사하므로, 이 검사는 왕복 전에
      // 즉시 알려주기 위한 것이다.
      errors.requested_id = '아이디 중복 확인을 해 주세요.';
    }

    var pwd = val('#f_requested_pwd');
    var pwdRe = val('#f_requested_pwd_re');
    if (pwd.length < 4) {
      errors.requested_pwd = '비밀번호는 4자 이상 입력해 주세요.';
    } else if (pwd !== pwdRe) {
      errors.requested_pwd_re = '입력한 비밀번호가 서로 같지 않습니다.';
    }

    if (val('#f_contact_name') === '') {
      errors.contact_name = '담당자 이름을 입력하세요.';
    }
    if (val('#f_contact_phone') === '') {
      errors.contact_phone = '휴대폰을 입력하세요.';
    }

    var email = val('#f_email');
    if (email === '') {
      errors.email = 'E-mail을 입력하세요.';
    } else if (!EMAIL_RE.test(email)) {
      errors.email = '유효한 이메일 주소를 입력해 주세요.';
    }

    if (val('#f_center_name') === '') {
      errors.center_name = '클럽명을 입력하세요.';
    }
    if (val('#f_ceo_name') === '') {
      errors.ceo_name = '대표자명을 입력하세요.';
    }

    // 사업자등록번호(business_registration_number)만 선택 항목이다. 나머지는 전부 필수.
    if (val('#f_telephone') === '') {
      errors.telephone = '전화번호를 입력하세요.';
    }

    // zipcode/address 는 주소 찾기(다음 우편번호 API)로만 채워진다.
    // 비어 있으면 주소 찾기를 아직 하지 않은 것이다. JS 가 죽어 API 를 못 쓰는
    // 경우에는 initAddressSearch 가 readonly 를 풀어 직접 입력할 수 있게 한다.
    if (val('#f_zipcode') === '') {
      errors.zipcode = '주소 찾기를 통해 설치 주소지를 입력하세요.';
    }
    if (val('#f_address') === '') {
      errors.address = '주소 찾기를 통해 도로명 / 지번 주소를 입력하세요.';
    }
    if (val('#f_address_detail') === '') {
      errors.address_detail = '상세 주소를 입력하세요.';
    }

    return errors;
  }

  function countKeys(obj) {
    var n = 0;
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) { n++; }
    }
    return n;
  }

  /** 첫 에러 필드로 스크롤 — 16필드 폼에서 어디가 틀렸는지 못 찾는 것을 막는다. */
  function focusFirstError(errors) {
    for (var key in errors) {
      if (!Object.prototype.hasOwnProperty.call(errors, key)) { continue; }
      var input = qs('#f_' + key);
      var anchor = input || qs('[data-error-for="' + key + '"]');
      if (anchor && anchor.scrollIntoView) {
        try {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
          anchor.scrollIntoView();
        }
      }
      if (input && input.focus && input.type !== 'hidden') {
        try { input.focus(); } catch (e2) {}
      }
      return;
    }
  }

  /**
   * FormData 미지원 구형 브라우저 폴백 — 폼 필드를 직접 직렬화한다.
   * 체크박스는 checked 인 것만 포함해 브라우저 기본 동작과 동일하게 맞춘다
   * (hidden(0) + checkbox(1) 짝의 의미가 보존된다).
   */
  function serializeForm(form) {
    var parts = [];
    var elements = Array.prototype.slice.call(form.elements);

    elements.forEach(function (el) {
      if (!el.name || el.disabled) { return; }
      var type = (el.type || '').toLowerCase();
      if (type === 'submit' || type === 'button' || type === 'file') { return; }
      if ((type === 'checkbox' || type === 'radio') && !el.checked) { return; }
      parts.push(encodeURIComponent(el.name) + '=' + encodeURIComponent(el.value));
    });

    return parts.join('&');
  }

  function initConsultForm() {
    var form = qs('#consult-form');
    if (!form) { return; }

    var submitBtn = qs('#consult-submit');
    var submitting = false;
    var originalBtnText = submitBtn ? submitBtn.innerHTML : '';

    // 입력을 고치기 시작하면 해당 필드 에러를 지운다.
    qsa('.form-input', form).forEach(function (input) {
      if (!input.name) { return; }
      on(input, 'input', function () { clearFieldError(input.name); });
    });

    // 아이디(requested_id) 실시간 중복 확인.
    // onBlur 시 proc/procCheckId.php(→ v2 POST /api/consults/check_id)로 확인한다.
    // 결과 표시는 중복확인 버튼(#id-check-result)이 전담하고, 여기서는 제출 가드용
    // idTaken 플래그만 갱신한다(두 곳이 각자 슬롯에 쓰면 메시지가 중복 표시됨).
    // 확인 API 실패는 무시한다(제출 흐름 방해 금지 — v2 create 재검증이 최종 방어).
    var idInput = qs('#f_requested_id', form);
    var idTaken = false; // 마지막 확인 결과 캐시(제출 가드에 사용)
    if (idInput) {
      on(idInput, 'input', function () {
        idTaken = false;
        // 초록 안내 색을 남기지 않는다 — 이후 붉은 에러가 초록으로 보이는 것 방지.
        var slot = qs('[data-error-for="requested_id"]');
        if (slot) { slot.style.color = ''; }
      });
      on(idInput, 'blur', function () {
        var id = String(idInput.value || '').replace(/^\s+|\s+$/g, '');
        idTaken = false;
        if (id.length < 4) { clearFieldError('requested_id'); return; }

        var xhrId = new XMLHttpRequest();
        xhrId.open('POST', 'proc/procCheckId.php', true);
        xhrId.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhrId.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhrId.onreadystatechange = function () {
          if (xhrId.readyState !== 4) { return; }
          // 입력이 바뀌었으면 늦게 도착한 응답은 버린다.
          if (String(idInput.value || '').replace(/^\s+|\s+$/g, '') !== id) { return; }
          var res = null;
          try { res = JSON.parse(xhrId.responseText); } catch (e) { res = null; }
          if (!res || typeof res !== 'object') { return; }
          // 결과 "표시"는 중복확인 버튼(#id-check-result) 한 곳만 담당한다.
          // 여기(blur)는 제출 가드용 idTaken 플래그만 갱신한다 — 슬롯에 직접 쓰면
          // 버튼 결과와 겹쳐 같은 메시지가 두 번 보인다(중복 표시 버그).
          idTaken = !res.available;
        };
        xhrId.send('requested_id=' + encodeURIComponent(id));
      });
    }

    function setSubmitting(on_) {
      submitting = on_;
      if (!submitBtn) { return; }
      submitBtn.disabled = on_;
      if (on_) {
        submitBtn.innerHTML = '';
        submitBtn.appendChild(document.createTextNode('접수 중입니다...'));
      } else {
        submitBtn.innerHTML = originalBtnText;
      }
    }

    on(form, 'submit', function (e) {
      if (e.preventDefault) { e.preventDefault(); } else { e.returnValue = false; }

      if (submitting) { return false; }

      clearAllFieldErrors();
      clearFormMessage();

      var errors = validateForm();
      if (countKeys(errors) > 0) {
        for (var key in errors) {
          if (Object.prototype.hasOwnProperty.call(errors, key)) {
            showFieldError(key, errors[key]);
          }
        }
        setFormMessage('입력하신 내용을 다시 확인해 주세요.', true);
        focusFirstError(errors);
        return false; // ← 입력은 그대로 남는다(계약 5)
      }

      // 실시간 확인에서 중복으로 판정된 아이디는 제출을 막는다.
      // (최종 방어는 v2 create 재검증이지만, 왕복 전에 즉시 안내한다.)
      if (idTaken) {
        showFieldError('requested_id', '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.');
        setFormMessage('입력하신 내용을 다시 확인해 주세요.', true);
        if (idInput && idInput.focus) { idInput.focus(); }
        return false;
      }

      setSubmitting(true);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', form.getAttribute('action') || 'proc/procConsult.php', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) { return; }
        setSubmitting(false);

        var data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (err) {
          data = null;
        }

        // 응답을 해석하지 못한 경우에도 입력은 절대 지우지 않는다.
        if (!data || typeof data !== 'object') {
          setFormMessage(
            '접수 처리 중 오류가 발생했습니다. 번거로우시겠지만 010-9209-0448 로 전화 주시면 바로 도와드리겠습니다.',
            true
          );
          return;
        }

        var message = (typeof data.message === 'string' && data.message !== '')
          ? data.message
          : (data.success ? '가입 및 상담 신청이 접수되었습니다.' : '접수 중 오류가 발생했습니다.');

        if (data.success) {
          setFormMessage(message, false);
          // 성공했을 때만 초기화한다(계약 5).
          form.reset();
          qsa('.custom-chk').forEach(function (span) { removeClass(span, 'checked'); });
          // 아이디 중복 확인 결과도 초기화한다 — 폼이 비었으므로 이전 판정은 무효다.
          checkedId = '';
          setIdCheckResult('', false);
          // 견적 연동 hidden 은 reset 으로 초기 value 로 돌아가므로 그대로 둔다.
          //
          // 스크롤 이동(form.scrollIntoView)은 하지 않는다 — 폼 상단으로 올라가면
          // 하단의 안내 문구가 화면 밖으로 밀려나 보이지 않았다. 대신 현재 스크롤
          // 위치와 무관하게 뷰포트 중앙에 뜨는 모달로 안내한다.
          showConsultSuccessModal('가입신청이 완료되었습니다.');
          return;
        }

        // 실패 — 서버가 준 필드 에러를 인라인으로 표시한다(계약 6).
        var fieldErrors = (data.errors && typeof data.errors === 'object') ? data.errors : {};
        var shown = {};
        for (var k in fieldErrors) {
          if (!Object.prototype.hasOwnProperty.call(fieldErrors, k)) { continue; }
          var msg = fieldErrors[k];
          if (typeof msg !== 'string') { continue; }
          showFieldError(k, msg);
          shown[k] = msg;
        }

        setFormMessage(message, true);
        if (countKeys(shown) > 0) { focusFirstError(shown); }
      };

      // FormData 가 있으면 그대로 쓴다 — hidden(0)+checkbox(1) 짝이
      // 자동으로 올바른 값('1'/'0')을 담는다(계약 2). 수동 보정하지 않는다.
      if (typeof FormData !== 'undefined') {
        try {
          xhr.send(new FormData(form));
          return false;
        } catch (err) {
          // 아래 폴백으로 진행
        }
      }

      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
      xhr.send(serializeForm(form));
      return false;
    });
  }

  // ---------------------------------------------------------------
  // 가맹점 로고 마퀴 (동적)
  //
  // 레거시 home_old/js/index.js 의 rollingimg fetch 를 옮긴 것.
  // procHome.php?actmode=rollingimg → { rows: [{ mytype, photo }, ...] }
  // mytype(one/cg2/cg3)별로 3개 row 에 로고를 채운다(DB comlogo, explogo_home='Y').
  //
  // 실패해도(네트워크/DB 장애) 조용히 넘어간다 — sec_features.php 가 첫 row 에
  // 하드코딩 fallback 로고를 이미 렌더해 두었으므로 마퀴가 비지 않는다.
  //
  // 무한 순환 이음매: 각 row 는 track(.marquee-group) 2벌로 구성되고 CSS 가 -50%
  // 이동하므로, 받은 로고를 "동일하게 2벌" 채워야 이음매가 매끄럽다.
  // ---------------------------------------------------------------

  function initClubLogos() {
    var section = qs('[data-club-logos]');
    if (!section) { return; }

    var url = section.getAttribute('data-rollingimg-url') || 'procHome.php';

    // mytype -> 해당 row 의 track 2벌. 없는 row 는 건너뛴다(스키마 변경 방어).
    var rowMap = {};
    var rows = qsa('.marquee-content[data-marquee-row]', section);
    for (var i = 0; i < rows.length; i++) {
      var type = rows[i].getAttribute('data-marquee-row');
      rowMap[type] = qsa('[data-marquee-track]', rows[i]);
    }

    var isStatic = /\.json(\?|$)/.test(url); // 정적 복제본(GitHub Pages)에서는 JSON 파일을 GET
    var xhr = new XMLHttpRequest();
    xhr.open(isStatic ? 'GET' : 'POST', url, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    if (!isStatic) { xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8'); }

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) { return; }
      if (xhr.status < 200 || xhr.status >= 300) { return; } // 실패 → 하드코딩 fallback 유지

      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch (err) { return; }
      if (!data || !data.rows || !data.rows.length) { return; }

      // mytype 별로 로고 URL 을 모은다.
      var byType = { one: [], cg2: [], cg3: [] };
      for (var r = 0; r < data.rows.length; r++) {
        var row = data.rows[r];
        if (!row || typeof row.photo !== 'string' || row.photo === '') { continue; }
        var mt = row.mytype;
        if (byType.hasOwnProperty(mt)) { byType[mt].push(row.photo); }
      }

      // fetch 가 실제로 로고를 준 row 만 교체한다. 빈 row 는 기존(fallback) 유지.
      var anyReplaced = false;
      for (var mtype in byType) {
        if (!byType.hasOwnProperty(mtype)) { continue; }
        var logos = byType[mtype];
        var tracks = rowMap[mtype];
        if (!tracks || !tracks.length || !logos.length) { continue; }

        for (var t = 0; t < tracks.length; t++) {
          fillTrack(tracks[t], logos);
        }
        anyReplaced = true;
      }

      // one row 가 fetch 로 채워졌으면 하드코딩 fallback 은 이미 fillTrack 이
      // innerHTML 을 비우고 다시 채웠으므로 중복되지 않는다.
      if (window.console && window.console.log && anyReplaced) {
        window.console.log('[landing] 가맹점 로고 ' + data.rows.length + '건 로드');
      }
    };

    try {
      xhr.send(isStatic ? null : 'actmode=rollingimg');
    } catch (err) {
      // 전송 자체 실패 → fallback 유지, 조용히 넘어간다.
    }
  }

  /**
   * 하나의 track(.marquee-group)을 로고 이미지로 다시 채운다.
   * src 는 DOM 속성으로 직접 세팅한다(innerHTML 문자열 조립 금지) — 로고 URL 이
   * DB 에서 오므로 속성 인젝션을 원천 차단한다.
   */
  function fillTrack(track, logos) {
    track.innerHTML = '';
    for (var i = 0; i < logos.length; i++) {
      var wrapper = document.createElement('div');
      wrapper.className = 'marquee-logo-wrapper';

      var img = document.createElement('img');
      img.className = 'marquee-logo-img';
      img.alt = '가맹점 로고';
      img.setAttribute('decoding', 'async');
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.setAttribute('loading', 'lazy');
      img.src = logos[i];

      wrapper.appendChild(img);
      track.appendChild(wrapper);
    }
  }

  // ---------------------------------------------------------------
  // 부트스트랩
  //
  // 각 초기화를 개별 try/catch 로 감싼다. 한 기능(예: 견적)이 예기치 못한
  // 이유로 죽어도 나머지 인터랙션(탭/FAQ/폼)은 살아 있어야 한다.
  // ---------------------------------------------------------------

  function safely(name, fn) {
    try {
      fn();
    } catch (err) {
      if (window.console && window.console.error) {
        window.console.error('[landing] ' + name + ' 초기화 실패:', err);
      }
    }
  }

  function init() {
    safely('tabs', initTabs);
    safely('simulator', initSimulator);
    safely('faq', initFaq);
    safely('agreements', initAgreements);
    safely('checkboxes', initCheckboxes);
    safely('scrollspy', initScrollSpy);
    safely('estimator', initEstimator);
    safely('addressSearch', initAddressSearch);
    safely('idCheck', initIdCheck);
    safely('consultForm', initConsultForm);
    safely('clubLogos', initClubLogos);
  }

  // 이 스크립트는 </body> 직전에 로드되므로 DOM 은 이미 준비돼 있다.
  // 그래도 방어적으로 상태를 확인한다.
  if (document.readyState === 'loading') {
    on(document, 'DOMContentLoaded', init);
  } else {
    init();
  }
})();
