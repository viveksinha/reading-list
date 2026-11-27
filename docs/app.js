(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const KINDS = { newsletter: "Newsletters", blog: "Blogs", community: "HN & Lobsters", saved: "Saved" };
  const DEFAULT_FILTERS = { importance: "2", when: "30", show: "all", sort: "new", kinds: [], cats: [], q: "" };
  const DEFAULT_PREFS = { v: 2, theme: "sepia", size: "m", font: "sans", density: "comfortable" };

  let items = [];
  let filters = { ...DEFAULT_FILTERS, ...store.get("rl.filters", {}), q: "" };
  const saved = store.get("rl.prefs", {});
  if (saved.v !== 2) { delete saved.theme; saved.v = 2; } // Sepia became the default in v2
  let prefs = { ...DEFAULT_PREFS, ...saved };
  const read = new Set(store.get("rl.read", []));
  const starred = new Set(store.get("rl.starred", []));

  // ---------- rendering helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  function rel(iso) {
    const d = (Date.now() - new Date(iso)) / 864e5;
    if (d < 1) return "today";
    if (d < 2) return "yesterday";
    if (d < 7) return `${Math.floor(d)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function dayLabel(iso) {
    const d = new Date(iso), t = new Date();
    const diff = Math.round((new Date(t.toDateString()) - new Date(d.toDateString())) / 864e5);
    return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : day(iso);
  }
  const IMP = { 3: "Must read", 2: "Worth it", 1: "Skim" };
  const ICON = {
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8z"/></svg>',
  };

  // ---------- filtering ----------
  function matches(it, ignore) {
    if (ignore !== "importance" && it.importance < +filters.importance) return false;
    if (filters.when !== "all" && Date.now() - new Date(it.published) > filters.when * 864e5) return false;
    if (filters.show === "unread" && read.has(it.id)) return false;
    if (filters.show === "starred" && !starred.has(it.id)) return false;
    if (ignore !== "kinds" && filters.kinds.length && !filters.kinds.includes(it.kind)) return false;
    if (ignore !== "cats" && filters.cats.length && !filters.cats.includes(it.category)) return false;
    if (filters.q) {
      const hay = `${it.title} ${it.summary} ${it.source} ${it.category} ${(it.tags || []).join(" ")}`.toLowerCase();
      if (!filters.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function render() {
    const list = items.filter((it) => matches(it));
    if (filters.sort === "imp") list.sort((a, b) => b.importance - a.importance || b.published.localeCompare(a.published));

    $("#count").textContent = `${list.length} ${list.length === 1 ? "article" : "articles"}`;
    const out = [];
    let lastDay = "";
    for (const it of list) {
      if (filters.sort === "new") {
        const d = dayLabel(it.published);
        if (d !== lastDay) { out.push(`<h2 class="day">${esc(d)}</h2>`); lastDay = d; }
      }
      out.push(card(it));
    }
    $("#items").innerHTML = out.length ? out.join("") :
      `<div class="empty"><p><strong>Nothing matches these filters.</strong></p><p>Try “All” importance or a longer time range.</p><button class="link-btn" data-reset>Reset filters</button></div>`;

    renderChips();
    syncSegs();
    const active = (filters.importance !== DEFAULT_FILTERS.importance) + (filters.when !== DEFAULT_FILTERS.when) +
      (filters.show !== "all") + filters.kinds.length + filters.cats.length;
    const b = $("#filterBadge");
    b.hidden = !active; b.textContent = active;
    store.set("rl.filters", { ...filters, q: "" });
  }

  function card(it) {
    const isRead = read.has(it.id), isStar = starred.has(it.id);
    const tags = (it.tags || []).map((t) => `<button class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join("");
    const disc = it.discussion_url
      ? `<a class="act" href="${esc(it.discussion_url)}" target="_blank" rel="noopener">${ICON.chat}${it.points ? esc(it.points) + " pts" : "Discussion"}</a>` : "";
    return `<article class="card${isRead ? " read" : ""}" data-id="${esc(it.id)}" data-imp="${it.importance}">
      <div class="bar" aria-hidden="true"></div>
      <div>
        <div class="meta"><span class="cat">${esc(it.category)}</span><span>·</span><span>${esc(it.source)}</span><span>·</span><time datetime="${esc(it.published)}">${rel(it.published)}</time>${it.importance === 3 ? '<span>·</span><span class="imp">Must read</span>' : ""}</div>
        <a class="title" href="${esc(it.url)}" target="_blank" rel="noopener" data-open>${esc(it.title)}</a>
        <p class="summary">${esc(it.summary)}</p>
        <div class="foot-row">${tags}<span class="spacer"></span>${disc}
          <button class="act star" data-star aria-pressed="${isStar}" aria-label="${isStar ? "Unstar" : "Star"}">${ICON.star}<span>${isStar ? "Starred" : "Star"}</span></button>
          <button class="act" data-read aria-pressed="${isRead}" aria-label="${isRead ? "Mark unread" : "Mark read"}">${ICON.check}<span>${isRead ? "Read" : "Mark read"}</span></button>
        </div>
      </div>
    </article>`;
  }

  function renderChips() {
    const count = (key, field) => {
      const m = new Map();
      for (const it of items) if (matches(it, key)) m.set(it[field], (m.get(it[field]) || 0) + 1);
      return m;
    };
    const kc = count("kinds", "kind");
    $("#kindChips").innerHTML = Object.entries(KINDS).filter(([k]) => items.some((i) => i.kind === k))
      .map(([k, label]) => `<button class="chip" data-kind="${k}" aria-pressed="${filters.kinds.includes(k)}">${label}<span class="n">${kc.get(k) || 0}</span></button>`).join("");
    const cc = count("cats", "category");
    const cats = [...new Set(items.map((i) => i.category))].sort((a, b) => (cc.get(b) || 0) - (cc.get(a) || 0) || a.localeCompare(b));
    $("#catChips").innerHTML = cats
      .map((c) => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${filters.cats.includes(c)}">${esc(c)}<span class="n">${cc.get(c) || 0}</span></button>`).join("");
  }

  function syncSegs() {
    $$("[data-filter]").forEach((g) => $$("button", g).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === String(filters[g.dataset.filter]))));
    $$("[data-pref]").forEach((g) => $$("button", g).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === prefs[g.dataset.pref])));
  }

  // ---------- reader settings ----------
  function applyPrefs() {
    const d = document.documentElement;
    if (prefs.theme === "system") delete d.dataset.theme; else d.dataset.theme = prefs.theme;
    d.dataset.size = prefs.size; d.dataset.font = prefs.font; d.dataset.density = prefs.density;
    store.set("rl.prefs", prefs);
    syncSegs();
  }

  // ---------- sheets (mobile filters, settings) ----------
  const isMobile = () => matchMedia("(max-width: 860px)").matches;
  let openSheet = null, lastFocus = null;
  function open(el) {
    close();
    lastFocus = document.activeElement;
    openSheet = el;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("open"));
    if (isMobile() || el.id === "settings") $("#scrim").hidden = false;
    const f = $("button, input", el); f && f.focus();
  }
  function close() {
    if (!openSheet) return;
    const el = openSheet; openSheet = null;
    el.classList.remove("open");
    if (el.id === "settings") el.hidden = true;
    $("#scrim").hidden = true;
    lastFocus && lastFocus.focus();
  }

  // ---------- events ----------
  function resetFilters() { filters = { ...DEFAULT_FILTERS }; $("#q").value = ""; render(); }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const seg = t.closest("[data-filter]");
    if (seg && t.dataset.v) { filters[seg.dataset.filter] = t.dataset.v; return render(); }
    const pseg = t.closest("[data-pref]");
    if (pseg && t.dataset.v) { prefs[pseg.dataset.pref] = t.dataset.v; return applyPrefs(); }
    if (t.dataset.kind) { toggle(filters.kinds, t.dataset.kind); return render(); }
    if (t.dataset.cat) { toggle(filters.cats, t.dataset.cat); return render(); }
    if (t.dataset.tag) { filters.q = t.dataset.tag; $("#q").value = t.dataset.tag; return render(); }
    if (t.hasAttribute("data-reset")) return resetFilters();
    const cardEl = t.closest(".card");
    if (cardEl) {
      const id = cardEl.dataset.id;
      if (t.hasAttribute("data-star")) { flip(starred, id); store.set("rl.starred", [...starred]); return render(); }
      if (t.hasAttribute("data-read")) { flip(read, id); store.set("rl.read", [...read]); return render(); }
      if (t.hasAttribute("data-open") && !read.has(id)) { read.add(id); store.set("rl.read", [...read]); setTimeout(render, 300); }
    }
  });
  const toggle = (arr, v) => { const i = arr.indexOf(v); i < 0 ? arr.push(v) : arr.splice(i, 1); };
  const flip = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));

  $("#resetFilters").addEventListener("click", resetFilters);
  $("#resetFilters2").addEventListener("click", resetFilters);
  $("#openFilters").addEventListener("click", () => open($("#filters")));
  $("#closeFilters").addEventListener("click", close);
  $("#openSettings").addEventListener("click", () => (openSheet && openSheet.id === "settings" ? close() : open($("#settings"))));
  $("#closeSettings").addEventListener("click", close);
  $("#scrim").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "/" && document.activeElement !== $("#q")) { e.preventDefault(); $("#q").focus(); }
  });
  let qTimer;
  $("#q").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { filters.q = e.target.value.trim(); render(); }, 120); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyPrefs);

  // ---------- boot ----------
  applyPrefs();
  fetch("data/items.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => {
      items = data.sort((a, b) => b.published.localeCompare(a.published));
      const latest = items[0];
      $("#updated").textContent = latest ? `${items.length} articles · newest from ${day(latest.published)}` : "";
      render();
    })
    .catch(() => { $("#items").innerHTML = '<div class="empty"><p>Could not load articles. Refresh to try again.</p></div>'; });
})();
