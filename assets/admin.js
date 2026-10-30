(function () {
  "use strict";

  var config = window.PNU_CONFIG || {};
  var ENDPOINT = String(config.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/admin-stats";
  var API_KEY = config.supabaseAnonKey || "";
  var PW_KEY = "pnu_hw_admin_pw";
  var REFRESH_MS = 60000;

  var loginView = document.getElementById("loginView");
  var dashView = document.getElementById("dashView");
  var loginForm = document.getElementById("loginForm");
  var loginBtn = document.getElementById("loginBtn");
  var loginError = document.getElementById("loginError");
  var passwordInput = document.getElementById("password");
  var updatedAt = document.getElementById("updatedAt");
  var rangeLabel = document.getElementById("rangeLabel");
  var refreshBtn = document.getElementById("refreshBtn");
  var logoutBtn = document.getElementById("logoutBtn");

  var password = "";
  var refreshTimer = null;
  var loading = false;

  var STEP_LABELS = {
    landing_view: "랜딩 방문",
    event_view: "이벤트 상세",
    ticket_select: "티켓 선택",
    form_start: "폼 입력 시작",
    checkout_start: "결제 시작",
    purchase_complete: "구매 완료"
  };

  var STEP_SHORT = {
    landing_view: "랜딩",
    event_view: "상세",
    ticket_select: "티켓",
    form_start: "폼",
    checkout_start: "결제",
    purchase_complete: "구매"
  };

  var BUTTON_LABELS = {
    nav_brand: "로고",
    nav_ticket: "상단 예매 버튼",
    hero_cta: "히어로 예매 CTA",
    share_click: "공유 버튼",
    final_cta: "하단 예매 CTA",
    checkout_submit: "예매 폼 제출",
    checkout_pay: "결제 실행",
    checkout_cancel: "결제 취소",
    success_close: "완료 닫기",
    instagram_click: "인스타그램 링크",
    map_click: "오시는 길 링크",
    faq_ticket: "FAQ · 현장 판매",
    faq_refund: "FAQ · 환불",
    faq_costume: "FAQ · 코스튬",
    faq_guest: "FAQ · 외부인"
  };

  function getStoredPassword() {
    try {
      return sessionStorage.getItem(PW_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function storePassword(value) {
    try {
      sessionStorage.setItem(PW_KEY, value);
    } catch (error) {
      /* ignore */
    }
  }

  function clearPassword() {
    try {
      sessionStorage.removeItem(PW_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function n(value) {
    return Number(value || 0).toLocaleString("ko-KR");
  }

  function pct(value) {
    if (value === null || value === undefined) return "—";
    return Number(value).toFixed(1) + "%";
  }

  function won(value) {
    return n(value) + "원";
  }

  function clampPercent(value) {
    var number = Number(value);
    if (!isFinite(number) || number < 0) return 0;
    return Math.min(100, number);
  }

  function formatDay(day) {
    if (!day) return "";
    var parts = String(day).split("-");
    return parts.length === 3 ? parts[1] + "/" + parts[2] : String(day);
  }

  function formatKst(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (error) {
      return "—";
    }
  }

  function formatTimeKst(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch (error) {
      return "—";
    }
  }

  async function requestStats(secret) {
    var response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: API_KEY,
        Authorization: "Bearer " + API_KEY
      },
      body: JSON.stringify({ password: secret })
    });

    if (response.status === 401) {
      var authError = new Error("unauthorized");
      authError.code = 401;
      throw authError;
    }

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    var payload = await response.json();
    if (!payload || !payload.ok) {
      throw new Error((payload && payload.error) || "stats_failed");
    }
    return payload.stats;
  }

  function showLogin(message) {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    loginView.hidden = false;
    dashView.hidden = true;
    loginError.hidden = !message;
    if (message) loginError.textContent = message;
    loginBtn.disabled = false;
    loginBtn.textContent = "로그인";
    passwordInput.focus();
  }

  function showDashboard() {
    loginView.hidden = true;
    dashView.hidden = false;
  }

  function setLoading(isLoading) {
    loading = isLoading;
    document.body.classList.toggle("is-loading", isLoading);
    if (refreshBtn) refreshBtn.disabled = isLoading;
  }

  async function authenticate(secret, options) {
    var opts = options || {};
    if (!opts.silent) {
      loginBtn.disabled = true;
      loginBtn.textContent = "확인 중…";
      loginError.hidden = true;
    }

    try {
      var stats = await requestStats(secret);
      password = secret;
      storePassword(secret);
      showDashboard();
      render(stats);
      startAutoRefresh();
      loginBtn.disabled = false;
      loginBtn.textContent = "로그인";
      return true;
    } catch (error) {
      if (!opts.silent) {
        loginError.hidden = false;
        loginError.textContent = error.code === 401
          ? "비밀번호가 올바르지 않습니다."
          : "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      }
      loginBtn.disabled = false;
      loginBtn.textContent = "로그인";
      if (opts.silent) {
        clearPassword();
        showLogin("");
      }
      return false;
    }
  }

  async function refresh(silent) {
    if (loading || !password) return;
    setLoading(true);
    try {
      var stats = await requestStats(password);
      render(stats);
    } catch (error) {
      if (error.code === 401) {
        clearPassword();
        showLogin("세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      if (updatedAt) updatedAt.textContent = "업데이트 실패 · 자동 재시도";
      if (!silent && window.console && console.warn) console.warn("[dashboard]", error.message);
    } finally {
      setLoading(false);
    }
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (document.visibilityState === "visible") refresh(true);
    }, REFRESH_MS);
  }

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = passwordInput.value.trim();
    if (!value) return;
    authenticate(value);
  });

  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      refresh(false);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      clearPassword();
      password = "";
      passwordInput.value = "";
      showLogin("");
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && password) refresh(true);
  });

  function render(stats) {
    if (!stats) return;
    renderKpis(stats.kpis || {});
    renderFunnel(stats.funnel || []);
    renderTrend(stats.daily || []);
    renderHourly(stats.hourly || []);
    renderButtons(stats.buttons || []);
    renderUtm(stats.utm || []);
    renderTickets(stats.tickets || []);
    renderDevices(stats.devices || []);
    renderScroll(stats.scroll || []);
    renderRecent(stats.recent_sessions || []);

    if (updatedAt) updatedAt.textContent = "업데이트 " + formatTimeKst(stats.generated_at);
    if (rangeLabel && stats.range) {
      rangeLabel.textContent = stats.range.from + " ~ " + stats.range.to + " · Asia/Seoul · 최근 14일";
    }
  }

  function renderKpis(kpis) {
    var container = document.getElementById("kpis");
    if (!container) return;

    var cards = [
      {
        label: "오늘 방문 세션",
        value: n(kpis.today_sessions),
        unit: "세션",
        sub: "14일 누적 <b>" + n(kpis.range_sessions) + " 세션</b>",
        accent: true
      },
      {
        label: "오늘 구매",
        value: n(kpis.today_purchases),
        unit: "건",
        sub: "14일 누적 <b>" + n(kpis.range_purchases) + " 건</b>"
      },
      {
        label: "구매 전환율",
        value: kpis.today_conversion_pct === null || kpis.today_conversion_pct === undefined
          ? "0.0"
          : Number(kpis.today_conversion_pct).toFixed(1),
        unit: "%",
        sub: "14일 평균 <b>" + pct(kpis.range_conversion_pct) + "</b>"
      },
      {
        label: "오늘 매출",
        value: n(kpis.today_revenue),
        unit: "원",
        sub: "14일 <b>" + won(kpis.range_revenue) + "</b> · AOV " + (kpis.range_aov === null ? "—" : won(kpis.range_aov))
      }
    ];

    container.innerHTML = cards.map(function (card) {
      return (
        '<article class="kpi' + (card.accent ? " kpi--accent" : "") + '">' +
          '<p class="kpi__label">' + esc(card.label) + "</p>" +
          '<p class="kpi__value">' + esc(card.value) + "<small>" + esc(card.unit) + "</small></p>" +
          '<p class="kpi__sub">' + card.sub + "</p>" +
        "</article>"
      );
    }).join("");
  }

  function renderFunnel(funnel) {
    var container = document.getElementById("funnel");
    if (!container) return;

    var max = funnel.reduce(function (acc, item) {
      return Math.max(acc, Number(item.sessions || 0));
    }, 0);

    if (!funnel.length || max === 0) {
      container.innerHTML = '<div class="chart__empty">아직 수집된 퍼널 데이터가 없습니다.</div>';
      return;
    }

    container.innerHTML = funnel.map(function (item, index) {
      var sessions = Number(item.sessions || 0);
      var width = clampPercent((sessions / max) * 100);
      var meta = index === 0
        ? "전체 유입 <b>" + n(sessions) + " 세션</b>"
        : "이전 단계 대비 <b>" + pct(item.step_conversion_pct) + "</b>" +
          (Number(item.dropoff_sessions) > 0
            ? ' · 이탈 <b class="is-loss">' + n(item.dropoff_sessions) + " 세션</b>"
            : " · 이탈 없음");

      return (
        '<div class="funnel__row">' +
          '<div class="funnel__top">' +
            '<span class="funnel__label">' + esc(STEP_LABELS[item.step] || item.step) +
              "<span>" + String(index + 1).padStart(2, "0") + "</span></span>" +
            '<span class="funnel__count"><b>' + n(sessions) + "</b> 세션 · " + pct(item.overall_conversion_pct) + "</span>" +
          "</div>" +
          '<div class="funnel__bar"><i style="width:' + width.toFixed(1) + '%"></i></div>' +
          '<div class="funnel__meta">' + meta + "</div>" +
        "</div>"
      );
    }).join("");
  }

  function renderTrend(daily) {
    var container = document.getElementById("trendChart");
    if (!container) return;

    var total = daily.reduce(function (acc, item) { return acc + Number(item.sessions || 0); }, 0);
    if (!daily.length || total === 0) {
      container.innerHTML = '<div class="chart__empty">아직 방문 데이터가 없습니다. 페이지를 방문하면 여기에 표시됩니다.</div>';
      return;
    }

    var width = 780;
    var height = 270;
    var padL = 40;
    var padR = 44;
    var padT = 18;
    var padB = 34;
    var innerW = width - padL - padR;
    var innerH = height - padT - padB;

    var maxS = Math.max.apply(null, daily.map(function (item) { return Number(item.sessions || 0); }));
    var maxP = Math.max.apply(null, daily.map(function (item) { return Number(item.purchases || 0); }));
    maxS = Math.max(1, maxS);
    maxP = Math.max(1, maxP);

    var step = daily.length > 1 ? innerW / (daily.length - 1) : innerW;
    var barWidth = Math.max(6, Math.min(26, (innerW / daily.length) * 0.55));

    var parts = [];
    parts.push('<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="일별 방문 및 구매 추이">');
    parts.push('<defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff7a18" stop-opacity="0.28"/><stop offset="100%" stop-color="#ff7a18" stop-opacity="0"/></linearGradient></defs>');

    for (var g = 0; g <= 3; g += 1) {
      var y = padT + (innerH / 3) * g;
      parts.push('<line class="axis-line" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (width - padR) + '" y2="' + y.toFixed(1) + '"/>');
      var leftValue = Math.round(maxS - (maxS / 3) * g);
      parts.push('<text x="' + (padL - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + leftValue + "</text>");
    }

    parts.push('<text x="' + (width - padR + 8) + '" y="' + (padT + 4) + '" text-anchor="start">' + maxP + " 구매</text>");
    parts.push('<text x="' + (width - padR + 8) + '" y="' + (padT + innerH + 4) + '" text-anchor="start">0</text>');

    var labelEvery = Math.max(1, Math.ceil(daily.length / 7));

    daily.forEach(function (item, index) {
      var sessions = Number(item.sessions || 0);
      var purchases = Number(item.purchases || 0);
      var x = padL + step * index;
      var barH = (sessions / maxS) * innerH;
      var barY = padT + innerH - barH;
      var tip = item.day + " · 방문 " + sessions + " · 구매 " + purchases + " · 매출 " + won(item.revenue);

      parts.push('<rect class="bar-sessions" x="' + (x - barWidth / 2).toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + Math.max(barH, sessions > 0 ? 2 : 0).toFixed(1) + '" rx="3"><title>' + esc(tip) + "</title></rect>");

      if (index % labelEvery === 0 || index === daily.length - 1) {
        parts.push('<text x="' + x.toFixed(1) + '" y="' + (padT + innerH + 18) + '" text-anchor="middle">' + esc(formatDay(item.day)) + "</text>");
      }
    });

    var purchasePoints = daily.map(function (item, index) {
      var x = padL + step * index;
      var y = padT + innerH - (Number(item.purchases || 0) / maxP) * innerH;
      return { x: x, y: y, item: item };
    });

    parts.push('<polyline class="line-purchases" points="' + purchasePoints.map(function (point) {
      return point.x.toFixed(1) + "," + point.y.toFixed(1);
    }).join(" ") + '"/>');

    purchasePoints.forEach(function (point) {
      parts.push('<circle class="dot-purchases" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="3"><title>' + esc(point.item.day + " · 구매 " + Number(point.item.purchases || 0)) + "</title></circle>");
    });

    parts.push("</svg>");
    container.innerHTML = parts.join("");
  }

  function renderHourly(hourly) {
    var container = document.getElementById("hourlyChart");
    if (!container) return;

    var total = hourly.reduce(function (acc, item) { return acc + Number(item.sessions || 0); }, 0);
    if (!hourly.length || total === 0) {
      container.innerHTML = '<div class="chart__empty">오늘 수집된 방문 데이터가 없습니다.</div>';
      return;
    }

    var width = 540;
    var height = 200;
    var padL = 22;
    var padR = 10;
    var padT = 12;
    var padB = 26;
    var innerW = width - padL - padR;
    var innerH = height - padT - padB;
    var max = Math.max(1, Math.max.apply(null, hourly.map(function (item) { return Number(item.sessions || 0); })));
    var barWidth = (innerW / hourly.length) * 0.62;
    var currentHour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }));

    var parts = ['<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="시간대별 방문">'];
    parts.push('<line class="axis-line" x1="' + padL + '" y1="' + (padT + innerH) + '" x2="' + (width - padR) + '" y2="' + (padT + innerH) + '"/>');

    hourly.forEach(function (item, index) {
      var sessions = Number(item.sessions || 0);
      var purchases = Number(item.purchases || 0);
      var barH = (sessions / max) * innerH;
      var x = padL + (innerW / hourly.length) * index + (innerW / hourly.length - barWidth) / 2;
      var y = padT + innerH - barH;
      var opacity = currentHour === Number(item.hour) ? "1" : "0.55";
      var tip = item.hour + "시 · 방문 " + sessions + " · 구매 " + purchases;

      parts.push('<rect class="bar-sessions" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + Math.max(barH, sessions > 0 ? 2 : 0).toFixed(1) + '" rx="2" opacity="' + opacity + '"><title>' + esc(tip) + "</title></rect>");

      if (item.hour % 6 === 0 || item.hour === 23) {
        parts.push('<text x="' + (x + barWidth / 2).toFixed(1) + '" y="' + (height - 8) + '" text-anchor="middle">' + item.hour + "시</text>");
      }
    });

    parts.push("</svg>");
    container.innerHTML = parts.join("");
  }

  function renderButtons(buttons) {
    var table = document.getElementById("buttonsTable");
    if (!table) return;
    var tbody = table.querySelector("tbody");
    if (!buttons.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="table__empty">아직 버튼 클릭 데이터가 없습니다.</td></tr>';
      return;
    }

    var max = Math.max.apply(null, buttons.map(function (item) { return Number(item.clicks || 0); })) || 1;

    tbody.innerHTML = buttons.map(function (item) {
      var clicks = Number(item.clicks || 0);
      var share = (clicks / max) * 100;
      return (
        "<tr>" +
          "<td>" + esc(BUTTON_LABELS[item.button_id] || item.button_id) + "</td>" +
          '<td class="num">' + n(clicks) + "</td>" +
          '<td class="num">' + n(item.sessions) + "</td>" +
          '<td><span class="table__bar"><i style="--w:' + share.toFixed(1) + '%"></i></span></td>' +
        "</tr>"
      );
    }).join("");
  }

  function renderUtm(utm) {
    var table = document.getElementById("utmTable");
    if (!table) return;
    var tbody = table.querySelector("tbody");
    if (!utm.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="table__empty">아직 유입 데이터가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = utm.map(function (item) {
      return (
        "<tr>" +
          "<td>" + esc(item.source === "direct" ? "직접 유입" : item.source) + "</td>" +
          '<td class="num">' + n(item.sessions) + "</td>" +
          '<td class="num">' + n(item.purchases) + "</td>" +
          '<td class="num">' + pct(item.conversion_pct) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function renderTickets(tickets) {
    var table = document.getElementById("ticketsTable");
    if (!table) return;
    var tbody = table.querySelector("tbody");
    if (!tickets.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="table__empty">아직 판매 데이터가 없습니다.</td></tr>';
      return;
    }

    var labels = { standard: "스탠다드", couple: "커플" };

    tbody.innerHTML = tickets.map(function (item) {
      return (
        "<tr>" +
          "<td>" + esc(labels[item.ticket_type] || item.ticket_type) + "</td>" +
          '<td class="num">' + n(item.orders) + "</td>" +
          '<td class="num">' + n(item.tickets) + "</td>" +
          '<td class="num">' + won(item.revenue) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function renderDevices(devices) {
    var container = document.getElementById("deviceStats");
    if (!container) return;
    if (!devices.length) {
      container.innerHTML = '<div class="chart__empty">아직 디바이스 데이터가 없습니다.</div>';
      return;
    }

    var max = Math.max.apply(null, devices.map(function (item) { return Number(item.sessions || 0); })) || 1;
    var labels = { mobile: "모바일", desktop: "데스크톱" };

    container.innerHTML = devices.map(function (item) {
      var sessions = Number(item.sessions || 0);
      var purchases = Number(item.purchases || 0);
      var width = clampPercent((sessions / max) * 100);
      return (
        '<div class="mini-bar">' +
          '<div class="mini-bar__top"><span>' + esc(labels[item.device] || item.device) + "</span><b>" + n(sessions) + " 세션 · 구매 " + n(purchases) + "</b></div>" +
          '<div class="mini-bar__track"><i style="width:' + width.toFixed(1) + '%"></i></div>' +
        "</div>"
      );
    }).join("");
  }

  function renderScroll(scroll) {
    var container = document.getElementById("scrollStats");
    if (!container) return;
    if (!scroll.length) {
      container.innerHTML = "";
      return;
    }

    var max = Math.max.apply(null, scroll.map(function (item) { return Number(item.sessions || 0); })) || 1;

    container.innerHTML = scroll.map(function (item) {
      var sessions = Number(item.sessions || 0);
      var width = clampPercent((sessions / max) * 100);
      return (
        '<div class="mini-bar">' +
          '<div class="mini-bar__top"><span>스크롤 ' + n(item.percent) + "%</span><b>" + n(sessions) + " 세션</b></div>" +
          '<div class="mini-bar__track"><i style="width:' + width.toFixed(1) + '%"></i></div>' +
        "</div>"
      );
    }).join("");
  }

  function renderRecent(sessions) {
    var container = document.getElementById("recentSessions");
    if (!container) return;
    if (!sessions.length) {
      container.innerHTML = '<div class="chart__empty">최근 세션이 없습니다.</div>';
      return;
    }

    container.innerHTML = sessions.map(function (item) {
      var chips = (item.steps || []).map(function (step) {
        var isFinal = step === "purchase_complete";
        return '<span class="step-chip' + (isFinal ? " step-chip--final" : "") + '">' + esc(STEP_SHORT[step] || step) + "</span>";
      }).join("");

      return (
        '<div class="session">' +
          '<div class="session__top">' +
            '<span class="session__time">' + esc(formatKst(item.started_at)) + "</span>" +
            '<span class="session__badge ' + (item.converted ? "session__badge--yes" : "session__badge--no") + '">' +
              (item.converted ? "구매 완료" : "이탈") +
            "</span>" +
          "</div>" +
          '<div class="session__steps">' + (chips || '<span class="step-chip">방문</span>') + "</div>" +
        "</div>"
      );
    }).join("");
  }

  var stored = getStoredPassword();
  if (stored) {
    passwordInput.value = stored;
    showDashboard();
    authenticate(stored, { silent: true });
  } else {
    showLogin("");
  }
})();
