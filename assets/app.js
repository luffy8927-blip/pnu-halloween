(function () {
  "use strict";

  var config = window.PNU_CONFIG || {};
  var REST_URL = String(config.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1";
  var API_KEY = config.supabaseAnonKey || "";
  var EVENT_AT = new Date(config.eventDate || "2026-10-31T18:00:00+09:00").getTime();

  var SESSION_KEY = "pnu_hw_session_id";
  var STEP_KEY = "pnu_hw_steps";
  var SCROLL_KEY = "pnu_hw_scroll";

  var sessionId = getSessionId();
  var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  var firedSteps = new Set(readJson(sessionStorage, STEP_KEY, []));
  var firedScrolls = new Set(readJson(sessionStorage, SCROLL_KEY, []));
  var startedAt = Date.now();
  var engagementSent = false;

  var params = new URLSearchParams(location.search);
  var baseMeta = {
    page: "halloween_night_2026",
    screen: window.innerWidth + "x" + window.innerHeight,
    lang: navigator.language,
    tz: getTimezone(),
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    utm_content: params.get("utm_content") || ""
  };

  function getTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (error) {
      return "";
    }
  }

  function readJson(storage, key, fallback) {
    try {
      var raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* storage may be unavailable in private mode */
    }
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
      var random = (Math.random() * 16) | 0;
      var value = char === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function getSessionId() {
    var existing = null;
    try {
      existing = localStorage.getItem(SESSION_KEY);
    } catch (error) {
      existing = null;
    }
    if (existing) return existing;
    var created = uuid();
    try {
      localStorage.setItem(SESSION_KEY, created);
    } catch (error) {
      /* ignore */
    }
    return created;
  }

  function post(table, row) {
    return fetch(REST_URL + "/" + table, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: API_KEY,
        Authorization: "Bearer " + API_KEY,
        Prefer: "return=minimal"
      },
      body: JSON.stringify(row)
    }).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (text) {
          throw new Error(table + " " + response.status + " " + text);
        });
      }
      return true;
    });
  }

  function track(eventName, options) {
    var opts = options || {};
    var metadata = Object.assign({}, baseMeta, opts.meta || {});
    var row = {
      session_id: sessionId,
      event_name: eventName,
      funnel_step: opts.step || null,
      button_id: opts.button || null,
      path: location.pathname,
      referrer: document.referrer || null,
      device: isMobile ? "mobile" : "desktop",
      metadata: metadata
    };
    post("events", row).catch(function (error) {
      if (window.console && console.warn) console.warn("[analytics]", error.message);
    });
  }

  function step(name, meta) {
    if (firedSteps.has(name)) return;
    firedSteps.add(name);
    writeJson(sessionStorage, STEP_KEY, Array.from(firedSteps));
    track("funnel_step", { step: name, meta: meta });
  }

  function trackButton(buttonId) {
    track("button_click", { button: buttonId });
  }

  var revealObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 })
    : null;

  document.querySelectorAll(".reveal").forEach(function (element) {
    if (revealObserver) {
      revealObserver.observe(element);
    } else {
      element.classList.add("is-visible");
    }
  });

  if ("IntersectionObserver" in window) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var section = entry.target.getAttribute("data-section");
        if (section === "about") step("event_view", { section: section });
        track("section_view", { meta: { section: section } });
        sectionObserver.unobserve(entry.target);
      });
    }, { threshold: 0.35 });
    document.querySelectorAll("[data-section]").forEach(function (element) {
      sectionObserver.observe(element);
    });
  }

  step("landing_view", { entry: document.referrer ? "referral" : "direct" });
  track("page_view", { meta: { title: document.title } });

  document.addEventListener("click", function (event) {
    var target = event.target.closest("[data-track]");
    if (target) trackButton(target.getAttribute("data-track"));
  });

  var shareBtn = document.getElementById("shareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var shareData = {
        title: "PNU HALLOWEEN NIGHT 2026",
        text: "10.31 부산대학교 학생회관 앞 광장, 할로윈 나이트 같이 가요.",
        url: location.href
      };
      if (navigator.share) {
        navigator.share(shareData).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(location.href).then(function () {
          showToast("링크가 복사되었습니다");
        }).catch(function () {
          showToast(location.href);
        });
      }
    });
  }

  var countdownIds = {
    days: document.getElementById("cd-days"),
    hours: document.getElementById("cd-hours"),
    minutes: document.getElementById("cd-minutes"),
    seconds: document.getElementById("cd-seconds")
  };

  function pad(value) {
    return String(Math.max(0, value)).padStart(2, "0");
  }

  function renderCountdown() {
    var diff = Math.max(0, EVENT_AT - Date.now());
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var minutes = Math.floor((diff % 3600000) / 60000);
    var seconds = Math.floor((diff % 60000) / 1000);
    if (countdownIds.days) countdownIds.days.textContent = pad(days);
    if (countdownIds.hours) countdownIds.hours.textContent = pad(hours);
    if (countdownIds.minutes) countdownIds.minutes.textContent = pad(minutes);
    if (countdownIds.seconds) countdownIds.seconds.textContent = pad(seconds);
  }

  renderCountdown();
  setInterval(renderCountdown, 1000);

  var thresholds = [25, 50, 75, 100];
  var scrollTicking = false;

  function onScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(function () {
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - window.innerHeight;
      var percent = scrollable > 0 ? Math.round((window.scrollY / scrollable) * 100) : 100;
      thresholds.forEach(function (threshold) {
        if (percent >= threshold && !firedScrolls.has(threshold)) {
          firedScrolls.add(threshold);
          writeJson(sessionStorage, SCROLL_KEY, Array.from(firedScrolls));
          track("scroll_depth", { meta: { percent: threshold } });
        }
      });
      scrollTicking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function sendEngagement() {
    if (engagementSent) return;
    var seconds = Math.round((Date.now() - startedAt) / 1000);
    if (seconds < 3) return;
    engagementSent = true;
    track("engagement", { meta: { seconds: seconds, max_scroll: currentScrollPercent() } });
  }

  function currentScrollPercent() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    return scrollable > 0 ? Math.round((window.scrollY / scrollable) * 100) : 100;
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendEngagement();
  });
  window.addEventListener("pagehide", sendEngagement);

  var form = document.getElementById("bookingForm");
  var quantitySelect = document.getElementById("quantity");
  var totalPrice = document.getElementById("totalPrice");
  var ticketCards = Array.prototype.slice.call(document.querySelectorAll("[data-ticket-card]"));
  var radioInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="ticket"]'));
  var formStarted = false;

  function selectedTicket() {
    var checked = document.querySelector('input[name="ticket"]:checked');
    return checked ? checked.value : "standard";
  }

  function quantity() {
    return parseInt(quantitySelect ? quantitySelect.value : "1", 10) || 1;
  }

  function unitPrice(type) {
    return type === "couple" ? 9000 : 5000;
  }

  function currentAmount() {
    var type = selectedTicket();
    var qty = type === "couple" ? 1 : quantity();
    return unitPrice(type) * qty;
  }

  function formatWon(value) {
    return value.toLocaleString("ko-KR") + "원";
  }

  function syncTicketUi() {
    var type = selectedTicket();
    ticketCards.forEach(function (card) {
      card.classList.toggle("is-active", card.getAttribute("data-ticket-card") === type);
    });
    if (quantitySelect) {
      quantitySelect.disabled = type === "couple";
      if (type === "couple") quantitySelect.value = "1";
    }
    if (totalPrice) totalPrice.textContent = formatWon(currentAmount());
  }

  radioInputs.forEach(function (input) {
    input.addEventListener("change", function () {
      syncTicketUi();
      step("ticket_select", { ticket_type: selectedTicket() });
      track("select_ticket", { meta: { ticket_type: selectedTicket(), amount: currentAmount() } });
    });
  });

  ticketCards.forEach(function (card) {
    card.addEventListener("click", function () {
      var input = card.querySelector('input[type="radio"]');
      if (input && !input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });

  if (quantitySelect) {
    quantitySelect.addEventListener("change", function () {
      if (totalPrice) totalPrice.textContent = formatWon(currentAmount());
      step("ticket_select", { ticket_type: selectedTicket() });
      track("change_quantity", { meta: { quantity: quantity(), amount: currentAmount() } });
    });
  }

  if (form) {
    form.addEventListener("focusin", function (event) {
      if (formStarted) return;
      if (!event.target.matches("input, select")) return;
      formStarted = true;
      step("form_start", { field: event.target.name || event.target.id });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      openCheckout();
    });
  }

  syncTicketUi();

  var checkoutModal = document.getElementById("checkoutModal");
  var successModal = document.getElementById("successModal");
  var checkoutSummary = document.getElementById("checkoutSummary");
  var payBtn = document.getElementById("payBtn");
  var orderNo = document.getElementById("orderNo");
  var lastFocus = null;

  function openModal(modal) {
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("is-locked");
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    if (checkoutModal && checkoutModal.hidden && successModal && successModal.hidden) {
      document.body.classList.remove("is-locked");
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openCheckout() {
    var type = selectedTicket();
    var qty = type === "couple" ? 1 : quantity();
    var amount = currentAmount();
    var name = form.querySelector("#name").value.trim();
    var department = form.querySelector("#department").value.trim();

    if (checkoutSummary) {
      checkoutSummary.innerHTML =
        "<div><dt>티켓</dt><dd>" + (type === "couple" ? "커플 (2인)" : "스탠다드") + "</dd></div>" +
        "<div><dt>수량</dt><dd>" + qty + "매</dd></div>" +
        "<div><dt>예매자</dt><dd>" + escapeHtml(name) + " · " + escapeHtml(department) + "</dd></div>" +
        "<div><dt>결제 금액</dt><dd>" + formatWon(amount) + "</dd></div>";
    }

    openModal(checkoutModal);
    step("checkout_start", { ticket_type: type, quantity: qty, amount: amount });
    track("begin_checkout", { meta: { ticket_type: type, quantity: qty, amount: amount } });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  document.querySelectorAll("[data-close-modal]").forEach(function (element) {
    element.addEventListener("click", function () {
      closeModal(checkoutModal);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (checkoutModal && !checkoutModal.hidden) closeModal(checkoutModal);
  });

  document.querySelectorAll(".pay-method").forEach(function (label) {
    label.addEventListener("click", function () {
      document.querySelectorAll(".pay-method").forEach(function (item) {
        item.classList.remove("is-active");
      });
      label.classList.add("is-active");
    });
  });

  if (payBtn) {
    payBtn.addEventListener("click", function () {
      completePurchase();
    });
  }

  function completePurchase() {
    if (!form || !payBtn) return;
    var type = selectedTicket();
    var qty = type === "couple" ? 1 : quantity();
    var amount = currentAmount();
    var methodInput = document.querySelector('input[name="payMethod"]:checked');
    var method = methodInput ? methodInput.value : "card";
    var orderId = uuid();
    var payload = {
      id: orderId,
      session_id: sessionId,
      name: form.querySelector("#name").value.trim(),
      department: form.querySelector("#department").value.trim(),
      student_id: form.querySelector("#studentId").value.trim(),
      phone: form.querySelector("#phone").value.trim() || null,
      ticket_type: type,
      quantity: qty,
      amount: amount,
      status: "completed"
    };

    var originalLabel = payBtn.textContent;
    payBtn.disabled = true;
    payBtn.textContent = "결제 처리 중...";

    post("registrations", payload)
      .then(function () {
        return new Promise(function (resolve) {
          setTimeout(resolve, 650);
        });
      })
      .then(function () {
        if (orderNo) orderNo.textContent = orderId.slice(0, 8).toUpperCase();
        closeModal(checkoutModal);
        openModal(successModal);
        step("purchase_complete", { ticket_type: type, quantity: qty, amount: amount, payment: method });
        track("purchase", {
          meta: {
            order_id: orderId,
            ticket_type: type,
            quantity: qty,
            amount: amount,
            payment_method: method
          }
        });
        showToast("예매가 완료되었습니다");
      })
      .catch(function (error) {
        track("purchase_error", { meta: { message: String(error.message || error).slice(0, 200) } });
        showToast("결제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        if (window.console && console.error) console.error(error);
      })
      .then(function () {
        payBtn.disabled = false;
        payBtn.textContent = originalLabel;
      });
  }

  var closeSuccess = document.getElementById("closeSuccess");
  if (closeSuccess) {
    closeSuccess.addEventListener("click", function () {
      closeModal(successModal);
    });
  }

  var toast = document.getElementById("toast");
  var toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  window.addEventListener("error", function (event) {
    track("client_error", { meta: { message: String(event.message || "").slice(0, 200) } });
  });
})();
