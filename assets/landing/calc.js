/**
 * 견적 계산 순수함수.
 * v2 app/frontend/Pages/Landing/Index.tsx:192-253 로직과 1:1 대응한다.
 * v2 쪽이 바뀌면 이 파일과 calc.test.js를 함께 갱신할 것.
 *
 * 이 계산 결과가 상담 신청 시 total_price 로 서버에 전송되므로,
 * v2 화면 금액과 한 원이라도 갈라지면 안 된다.
 *
 * DOM 의존 없음 — 브라우저와 Node 양쪽에서 동작한다. ES5.
 */
(function (root, factory) {
  'use strict';

  var api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LandingCalc = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis
   : typeof self !== 'undefined' ? self
   : typeof window !== 'undefined' ? window
   : this, function () {
  'use strict';

  var HW_KEYS = [
    'general_face', 'general_kiosk', 'general_touch',
    'premium_face', 'premium_kiosk', 'premium_fingerprint'
  ];

  /**
   * 값이 유한한 숫자가 아니면 0으로 수렴시킨다.
   * v2 API 가 부분 설정을 내려줄 때 NaN 이 금액에 전파되는 것을 막는다.
   * 설정이 온전할 때는 원본 TSX 와 동작이 완전히 동일하다.
   */
  function num(v) {
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  function section(settings, name) {
    return (settings && settings[name]) || {};
  }

  /**
   * @param {string} contractPeriod 'monthly' | 'yearly' | 'two_years'
   * @param {object} hwQuantities   장비별 수량
   * @param {object} settings       program_fees / hardware_solutions / bonus_benefits
   * @returns {object} programPrice, hwPrice, bonusMonths, freeDelivery, finalPrice, monthlyAverage
   */
  function estimate(contractPeriod, hwQuantities, settings) {
    var fees = section(settings, 'program_fees');
    var hw = section(settings, 'hardware_solutions');
    var bonus = section(settings, 'bonus_benefits');
    var qtys = hwQuantities || {};

    // A. 프로그램 이용료
    var progPrice = 0;
    var baseMonths = 1;
    if (contractPeriod === 'monthly') {
      progPrice = num(fees.monthly_rate);
      baseMonths = 1;
    } else if (contractPeriod === 'yearly') {
      progPrice = num(fees.yearly_total);
      baseMonths = 12 + num(fees.yearly_months_free);
    } else if (contractPeriod === 'two_years') {
      progPrice = num(fees.two_years_total);
      baseMonths = 24 + num(fees.two_years_months_free);
    }

    // B. 하드웨어 총액 + C. 고유 종류 수
    // 총액은 원본과 동일하게 수량을 그대로 곱한다(음수 방어 없음 — 원본 동작 보존).
    // 종류 수는 원본의 `filter(qty > 0)` 과 동일하게 양수만 집계한다.
    var hwPrice = 0;
    var uniqueHwCount = 0;
    for (var i = 0; i < HW_KEYS.length; i++) {
      var key = HW_KEYS[i];
      var q = num(qtys[key]);
      hwPrice += q * num(hw[key]);
      if (q > 0) {
        uniqueHwCount += 1;
      }
    }

    // D. 프로모션 — 연 계약에서만 동작
    var bonusMonths = 0;
    var freeDelivery = false;
    if (contractPeriod !== 'monthly') {
      if (uniqueHwCount >= 3) {
        bonusMonths = num(bonus.three_device_bonus_months);
        freeDelivery = true;
      } else if (uniqueHwCount >= 2) {
        bonusMonths = num(bonus.two_device_bonus_months);
        freeDelivery = true;
      } else if (num(qtys.general_touch) > 0 || num(qtys.premium_face) > 0) {
        bonusMonths = num(bonus.touch_bonus_months);
      }
    }

    var totalEffectiveMonths = baseMonths + bonusMonths;
    // 0으로 나누면 Infinity/NaN 이 되어 화면에 그대로 노출된다. 0으로 수렴시킨다.
    var monthlyAverage = totalEffectiveMonths > 0
      ? Math.round(progPrice / totalEffectiveMonths)
      : 0;

    return {
      programPrice: progPrice,
      hwPrice: hwPrice,
      bonusMonths: bonusMonths,
      freeDelivery: freeDelivery,
      finalPrice: progPrice + hwPrice,
      monthlyAverage: monthlyAverage
    };
  }

  return { estimate: estimate, HW_KEYS: HW_KEYS };
});
