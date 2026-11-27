(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const KINDS = { newsletter: "Newsletters", blog: "Blogs", paper: "Papers", community: "HN & Lobsters", saved: "Saved" };
  const DEFAULT_FILTERS = { importance: "2", when: "30", show: "all", len: "any", sort: "new", kinds: [], cats: [], q: "" };
  const DEFAULT_PREFS = { v: 2, theme: "sepia", size: "m", font: "sans", density: "comfortable" };

  let items = [];
  let byId = new Map();
  const byStory = new Map(); // story key -> every item covering it
  let logos = {};
  let brief = null;
  let kbId = null; // card selected with j/k
  const genericImages = new Set(); // share images reused by 3+ posts are site banners, not article art
  let filters = { ...DEFAULT_FILTERS, ...store.get("rl.filters", {}), q: "" };
  if (filters.show === "new") filters.show = "all";
  const saved = store.get("rl.prefs", {});
  if (saved.v !== 2) { delete saved.theme; saved.v = 2; } // Sepia became the default in v2
  let prefs = { ...DEFAULT_PREFS, ...saved };
  const read = new Set(store.get("rl.read", []));
  const starred = new Set(store.get("rl.starred", []));

  // ---------- visits: what is new since last time ----------
  const visit = store.get("rl.visit", {});
  const now = Date.now();
  if (visit.last && now - visit.last > 30 * 60e3) visit.prev = visit.last; // a gap of 30+ min is a new visit
  visit.last = now;
  store.set("rl.visit", visit);
  let since = visit.prev || 0;
  const stamp = (it) => new Date(it.added || it.published).getTime();
  const isNew = (it) => since > 0 && stamp(it) > since && !read.has(it.id);

  // ---------- rendering helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  // Calendar days between a date and today, in the reader's time zone.
  const daysAgo = (iso) => Math.round((new Date(new Date().toDateString()) - new Date(new Date(iso).toDateString())) / 864e5);
  function rel(iso) {
    const d = daysAgo(iso);
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 7) return `${d}d ago`;
    const opts = { month: "short", day: "numeric" };
    if (new Date(iso).getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return new Date(iso).toLocaleDateString(undefined, opts);
  }
  function dayLabel(iso) {
    const d = daysAgo(iso);
    if (d <= 0) return "Today";
    if (d === 1) return "Yesterday";
    return new Date(iso).getFullYear() !== new Date().getFullYear()
      ? new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : day(iso);
  }
  const ICON = {
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  };

  // ---------- filtering ----------
  function matches(it, ignore) {
    if (ignore !== "importance" && it.importance < +filters.importance) return false;
    if (filters.when !== "all" && Date.now() - new Date(it.published) > filters.when * 864e5) return false;
    if (ignore !== "show") {
      if (filters.show === "unread" && read.has(it.id)) return false;
      if (filters.show === "new" && !isNew(it)) return false;
      if (filters.show === "starred" && !starred.has(it.id)) return false;
    }
    if (filters.len === "quick" && !(it.minutes > 0 && it.minutes < 5)) return false;
    if (filters.len === "long" && !(it.minutes >= 10)) return false;
    if (ignore !== "kinds" && filters.kinds.length && !filters.kinds.includes(it.kind)) return false;
    if (ignore !== "cats" && filters.cats.length && !filters.cats.includes(it.category)) return false;
    if (filters.q) {
      const hay = `${it.title} ${it.summary} ${it.source} ${it.category} ${(it.tags || []).join(" ")}`.toLowerCase();
      if (!filters.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function render() {
    let list = items.filter((it) => matches(it));
    if (filters.sort === "imp") list.sort((a, b) => b.importance - a.importance || b.published.localeCompare(a.published));
    // One card per story: the most important post leads, the rest are listed on it.
    const lead = new Map();
    for (const it of list) if (it.story && (!lead.has(it.story) || it.importance > lead.get(it.story).importance)) lead.set(it.story, it);
    list = list.filter((it) => !it.story || lead.get(it.story) === it);

    $("#top").innerHTML = newBar() + briefHtml() + trendHtml();
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
    if (kbId) $(`.card[data-id="${kbId}"]`)?.classList.add("kb");

    renderChips();
    syncSegs();
    const active = (filters.importance !== DEFAULT_FILTERS.importance) + (filters.when !== DEFAULT_FILTERS.when) +
      (filters.show !== "all") + (filters.len !== "any") + filters.kinds.length + filters.cats.length;
    const b = $("#filterBadge");
    b.hidden = !active; b.textContent = active;
    store.set("rl.filters", { ...filters, q: "" });
  }

  // ---------- top of the list: new since last visit, daily brief, trending ----------
  function newBar() {
    const fresh = items.filter((i) => isNew(i) && matches(i, "show")).length;
    document.title = fresh ? `(${fresh}) Reading List` : "Reading List";
    if (!fresh && filters.show !== "new") return "";
    return `<div class="newbar" role="status"><span class="dot" aria-hidden="true"></span>
      <span><strong>${fresh} new</strong> since your last visit</span>
      <span class="newbar-acts"><button class="link-btn" data-shownew>${filters.show === "new" ? "Show everything" : "Show only new"}</button>
      <button class="link-btn" data-seen>Mark all seen</button></span></div>`;
  }

  function briefHtml() {
    if (!brief || filters.q || filters.show !== "all") return "";
    const date = new Date(`${brief.date}T12:00:00`);
    if (now - date > 7 * 864e5) return "";
    if (store.get("rl.briefHidden") === brief.date) return `<button class="link-btn brief-show" data-brief="show">Show the daily brief</button>`;
    const picks = (brief.picks || []).map((id) => byId.get(id)).filter(Boolean);
    return `<section class="brief" aria-labelledby="briefTitle">
      <div class="brief-head"><span class="kicker">Daily brief · ${esc(day(date))}</span><button class="link-btn" data-brief="hide">Hide</button></div>
      <h2 id="briefTitle">${esc(brief.headline)}</h2>
      <p>${esc(brief.text)}</p>
      ${picks.length ? `<ol class="picks">${picks.map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener" data-open-id="${esc(p.id)}">${sourceMark(p)}<span class="pt">${esc(p.title)}</span><span class="pm">${esc(p.source)}${p.minutes ? ` · ${p.minutes} min` : ""}</span></a></li>`).join("")}</ol>` : ""}
    </section>`;
  }

  const GENERIC_TAGS = new Set(["ai", "llm", "llms", "ml", "newsletter", "news", "data", "software", "tech"]);
  function trendHtml() {
    if (filters.show === "starred") return "";
    const n = new Map();
    for (const it of items) {
      if (it.importance < 2 || now - new Date(it.published) > 7 * 864e5) continue;
      for (const t of it.tags || []) if (!GENERIC_TAGS.has(t)) n.set(t, (n.get(t) || 0) + 1);
    }
    const top = [...n].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
    if (!top.length) return "";
    return `<div class="trend" role="group" aria-label="Trending topics this week"><span class="trend-label">Trending this week</span>${top
      .map(([t, c]) => `<button class="chip" data-tag="${esc(t)}" aria-pressed="${filters.q === t}">${esc(t)}<span class="n">${c}</span></button>`).join("")}</div>`;
  }

  // ---------- cards ----------
  const logoKey = (it) => it.source_id || it.source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const mono = (name) => `<span class="logo mono" aria-hidden="true">${esc((String(name).match(/[A-Za-z0-9]/) || ["?"])[0].toUpperCase())}</span>`;
  function sourceMark(it) {
    const key = logoKey(it), src = logos[key];
    return src
      ? `<img class="logo" src="${esc(src)}" alt="" width="20" height="20" loading="lazy" data-key="${esc(key)}" data-name="${esc(it.source)}">`
      : mono(it.source);
  }
  const pic = (it) => (it.image && !genericImages.has(it.image) ? it.image : "");

  function card(it) {
    const isRead = read.has(it.id), isStar = starred.has(it.id);
    const tags = (it.tags || []).map((t) => `<button class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join("");
    const disc = it.discussion_url
      ? `<a class="act" href="${esc(it.discussion_url)}" target="_blank" rel="noopener">${ICON.chat}${it.points ? esc(it.points) + " pts" : "Discussion"}</a>` : "";
    const img = pic(it);
    const imgTag = img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : "";
    const also = it.story ? (byStory.get(it.story) || []).filter((x) => x !== it) : [];
    const alsoHtml = also.length ? `<div class="also"><span>Also covered by</span>${also
      .map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener" data-open-id="${esc(x.id)}" title="${esc(x.title)}">${sourceMark(x)}${esc(x.source)}</a>`).join("")}</div>` : "";
    return `<article class="card${isRead ? " read" : ""}${img ? " has-thumb" : ""}" tabindex="-1" data-id="${esc(it.id)}" data-imp="${it.importance}"${it.story ? ` data-story="${esc(it.story)}"` : ""}>
      <div class="bar" aria-hidden="true"></div>
      <div class="body">
        <div class="meta">${sourceMark(it)}<span class="src">${esc(it.source)}</span><span>·</span><span class="cat">${esc(it.category)}</span><span>·</span><time datetime="${esc(it.published)}">${rel(it.published)}</time>${it.minutes ? `<span>·</span><span>${it.minutes} min</span>` : ""}${isNew(it) ? '<span class="new">New</span>' : ""}${it.importance === 3 ? '<span class="imp">Must read</span>' : ""}</div>
        <a class="title" href="${esc(it.url)}" target="_blank" rel="noopener" data-open>${esc(it.title)}</a>
        <p class="summary">${esc(it.summary)}</p>
        ${alsoHtml}
      </div>
      ${img ? `<a class="thumb" href="${esc(it.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true" data-open>${imgTag}</a>` : ""}
      <div class="foot-row">${tags}<span class="acts">${disc}
        <button class="act star" data-star aria-pressed="${isStar}" aria-label="${isStar ? "Unstar" : "Star"}">${ICON.star}<span>${isStar ? "Starred" : "Star"}</span></button>
        <button class="act" data-read aria-pressed="${isRead}" aria-label="${isRead ? "Mark unread" : "Mark read"}">${ICON.check}<span>${isRead ? "Read" : "Mark read"}</span></button>
        <button class="act" data-share aria-label="Copy link to this pick" title="Copy link">${ICON.link}</button></span>
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

  // ---------- sheets (mobile filters, settings, shortcuts) ----------
  const isMobile = () => matchMedia("(max-width: 860px)").matches;
  let openSheet = null, lastFocus = null;
  function open(el) {
    close();
    lastFocus = document.activeElement;
    openSheet = el;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("open"));
    if (isMobile() || el.classList.contains("settings")) $("#scrim").hidden = false;
    const f = $("button, input", el); f && f.focus();
  }
  function close() {
    if (!openSheet) return;
    const el = openSheet; openSheet = null;
    el.classList.remove("open");
    if (el.classList.contains("settings")) el.hidden = true;
    $("#scrim").hidden = true;
    lastFocus && lastFocus.focus();
  }

  // ---------- actions ----------
  const toggle = (arr, v) => { const i = arr.indexOf(v); i < 0 ? arr.push(v) : arr.splice(i, 1); };
  const flip = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
  function resetFilters() { filters = { ...DEFAULT_FILTERS }; $("#q").value = ""; render(); }
  function markRead(id) { if (!read.has(id)) { read.add(id); store.set("rl.read", [...read]); setTimeout(render, 300); } }
  function setQuery(q) { filters.q = q; $("#q").value = q; render(); }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }
  async function share(id) {
    const it = byId.get(id);
    const url = `${location.origin}${location.pathname}#a-${id}`;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: it ? it.title : "Reading List", url }); } catch { /* dismissed */ }
      return;
    }
    try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { toast("Could not copy the link"); }
  }

  function focusCard(el) {
    if (!el) return;
    $$(".card.kb").forEach((c) => c.classList.remove("kb"));
    kbId = el.dataset.id;
    el.classList.add("kb");
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  }

  // Open a shared link (#a-<id>): widen the filters if needed, then scroll to the card.
  function jumpToHash() {
    const m = location.hash.match(/^#a-([\w-]+)$/);
    const it = m && byId.get(m[1]);
    if (!it) return;
    if (!matches(it)) {
      const savedFilters = store.get("rl.filters", null); // widen for this view only
      filters = { ...DEFAULT_FILTERS, importance: "1", when: "all" }; $("#q").value = ""; render();
      if (savedFilters) store.set("rl.filters", savedFilters);
    }
    const el = $(`.card[data-id="${it.id}"]`) || (it.story && $(`.card[data-story="${CSS.escape(it.story)}"]`));
    if (!el) return;
    focusCard(el);
    el.scrollIntoView({ block: "center" });
    el.classList.add("flash");
  }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const seg = t.closest("[data-filter]");
    if (seg && t.dataset.v) { filters[seg.dataset.filter] = t.dataset.v; return render(); }
    const pseg = t.closest("[data-pref]");
    if (pseg && t.dataset.v) { prefs[pseg.dataset.pref] = t.dataset.v; return applyPrefs(); }
    if (t.dataset.kind) { toggle(filters.kinds, t.dataset.kind); return render(); }
    if (t.dataset.cat) { toggle(filters.cats, t.dataset.cat); return render(); }
    if (t.dataset.tag) return setQuery(filters.q === t.dataset.tag ? "" : t.dataset.tag);
    if (t.hasAttribute("data-reset")) return resetFilters();
    if (t.hasAttribute("data-close")) return close();
    if (t.hasAttribute("data-help")) return open($("#help"));
    if (t.hasAttribute("data-shownew")) { filters.show = filters.show === "new" ? "all" : "new"; return render(); }
    if (t.hasAttribute("data-seen")) {
      since = visit.prev = Date.now(); store.set("rl.visit", visit);
      if (filters.show === "new") filters.show = "all";
      return render();
    }
    if (t.dataset.brief) { store.set("rl.briefHidden", t.dataset.brief === "hide" ? brief.date : ""); return render(); }
    if (t.dataset.openId) return markRead(t.dataset.openId);
    const cardEl = t.closest(".card");
    if (cardEl) {
      const id = cardEl.dataset.id;
      kbId = id;
      if (t.hasAttribute("data-star")) { flip(starred, id); store.set("rl.starred", [...starred]); return render(); }
      if (t.hasAttribute("data-read")) { flip(read, id); store.set("rl.read", [...read]); return render(); }
      if (t.hasAttribute("data-share")) return share(id);
      if (t.hasAttribute("data-open")) markRead(id);
    }
  });

  $("#resetFilters").addEventListener("click", resetFilters);
  $("#resetFilters2").addEventListener("click", resetFilters);
  $("#openFilters").addEventListener("click", () => open($("#filters")));
  $("#closeFilters").addEventListener("click", close);
  $("#openSettings").addEventListener("click", () => (openSheet && openSheet.id === "settings" ? close() : open($("#settings"))));
  $("#scrim").addEventListener("click", close);

  // Keyboard: j/k move, o or Enter opens, s stars, m marks read, c copies a link, / searches, ? lists keys.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return close();
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    if (e.key === "/") { e.preventDefault(); return $("#q").focus(); }
    if (e.key === "?") { e.preventDefault(); return openSheet && openSheet.id === "help" ? close() : open($("#help")); }
    if (openSheet) return;
    const cards = $$(".card");
    if (!cards.length) return;
    let i = cards.findIndex((c) => c.dataset.id === kbId);
    if (e.key === "j" || e.key === "k") {
      e.preventDefault();
      i = e.key === "j" ? Math.min(cards.length - 1, i + 1) : Math.max(0, i - 1);
      return focusCard(cards[i]);
    }
    const cur = cards[i], it = cur && byId.get(cur.dataset.id);
    if (!it) return;
    if (e.key === "o" || (e.key === "Enter" && document.activeElement === cur)) { window.open(it.url, "_blank", "noopener"); return markRead(it.id); }
    if (e.key === "s") { flip(starred, it.id); store.set("rl.starred", [...starred]); return render(); }
    if (e.key === "m") { flip(read, it.id); store.set("rl.read", [...read]); return render(); }
    if (e.key === "c") return share(it.id);
  });
  let qTimer;
  $("#q").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { filters.q = e.target.value.trim(); render(); }, 120); });
  // Broken pictures: drop the article image, fall back to the source's initial for logos.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.classList.contains("logo")) {
      delete logos[img.dataset.key];
      img.outerHTML = mono(img.dataset.name || "?");
      return;
    }
    const card = img.closest(".card");
    if (card) { img.closest(".thumb")?.remove(); card.classList.remove("has-thumb"); }
  }, true);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyPrefs);
  window.addEventListener("hashchange", jumpToHash);

  // ---------- boot ----------
  applyPrefs();
  const json = (url, fallback) => fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback);
  Promise.all([fetch("data/items.json", { cache: "no-cache" }).then((r) => r.json()), json("logos/index.json", {}), json("data/brief.json", null)])
    .then(([data, logoIndex, briefData]) => {
      logos = Object.fromEntries(Object.entries(logoIndex).filter(([, v]) => v));
      brief = briefData && briefData.date && briefData.headline ? briefData : null;
      const uses = new Map();
      for (const it of data) if (it.image) uses.set(it.image, (uses.get(it.image) || 0) + 1);
      for (const [src, n] of uses) if (n >= 3) genericImages.add(src);
      items = data.sort((a, b) => b.published.localeCompare(a.published));
      byId = new Map(items.map((i) => [i.id, i]));
      for (const it of items) if (it.story) (byStory.get(it.story) || byStory.set(it.story, []).get(it.story)).push(it);
      const latest = items[0];
      $("#updated").textContent = latest ? `${items.length} articles · newest from ${day(latest.published)}` : "";
      render();
      jumpToHash();
    })
    .catch(() => { $("#items").innerHTML = '<div class="empty"><p>Could not load articles. Refresh to try again.</p></div>'; });
})();
