(() => {
  const services = Array.isArray(window.SERVICES) ? window.SERVICES : [];
  const publishedUsage = (window.PUBLISHED_USAGE && typeof window.PUBLISHED_USAGE === "object") ? window.PUBLISHED_USAGE : {};
  const researchCount = services.reduce((sum, s) => sum + (Array.isArray(s.variants) ? s.variants.length : 0), 0);
  const categories = ["웹·UI/UX","범용·리서치","이미지","영상","PPT·시각화","회의록·기록"];
  const STORAGE_KEY = "ai-service-hub-usage-v2";
  const state = { category: "전체", price: "전체", directOnly: false, query: "", compare: [], editMode: false };

  const $ = (sel) => document.querySelector(sel);
  const els = {
    grid: $("#serviceGrid"), empty: $("#emptyState"), search: $("#searchInput"), clear: $("#clearSearch"),
    cats: $("#categoryFilters"), price: $("#priceFilter"), direct: $("#directOnly"), summary: $("#resultSummary"),
    reset: $("#resetFilters"), compareBar: $("#compareBar"), comparePills: $("#comparePills"), compareCount: $("#compareCount"),
    openCompare: $("#openCompare"), detailModal: $("#detailModal"), detailContent: $("#detailContent"),
    compareModal: $("#compareModal"), compareTable: $("#compareTableWrap"), editToggle: $("#toggleEditMode"),
    editConsole: $("#editConsole"), exportUsage: $("#exportUsage"), resetUsage: $("#resetUsage")
  };

  const escapeHtml = (value = "") => String(value)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const normalize = (text) => String(text || "").toLowerCase().replace(/\s+/g," ").trim();
  const priceClassName = (p) => p === "무료" ? "free" : p === "무료+유료" ? "mixed" : "paid";

  // 서비스 URL에서 대표 사이트를 뽑아 카드/상세/비교 화면에 아이콘을 자동 표시합니다.
  // 외부 아이콘을 불러오지 못하면 서비스 이름 이니셜이 자동으로 남습니다.
  function primaryUrl(s){
    const values = [s?.url, ...(s?.variants || []).map(v => v?.url)].filter(Boolean);
    for (const value of values){
      const match = String(value).match(/https?:\/\/[^\s]+/i);
      if (match) return match[0].replace(/[),.;]+$/g, "");
    }
    return "";
  }
  function serviceInitials(name){
    const cleaned = String(name || "AI").replace(/\([^)]*\)/g, " ").trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return cleaned.replace(/[^0-9A-Za-z가-힣]/g, "").slice(0,2).toUpperCase() || "AI";
  }
  function logoUrl(s){
    const url = primaryUrl(s);
    if (!url) return "";
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=128`;
  }
  function logoMarkup(s, size = "card"){
    const url = logoUrl(s);
    const alt = `${s.name} 아이콘`;
    return `<span class="service-logo service-logo-${size}" aria-hidden="true">
      <span class="service-logo-fallback">${escapeHtml(serviceInitials(s.name))}</span>
      ${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    </span>`;
  }

  let localUsage = loadLocalUsage();

  function loadLocalUsage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) { return {}; }
  }
  function saveLocalUsage() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(localUsage)); } catch (_) {}
  }
  function hasOwn(obj, key){ return Object.prototype.hasOwnProperty.call(obj, key); }

  function defaultUsage(s){
    return { used: Boolean(s.directUsed), review: String(s.directReview || "") };
  }
  function getUsage(s){
    const base = defaultUsage(s);
    const published = publishedUsage[s.id] || {};
    const local = localUsage[s.id] || {};
    return {
      used: hasOwn(local,"used") ? Boolean(local.used) : hasOwn(published,"used") ? Boolean(published.used) : base.used,
      review: hasOwn(local,"review") ? String(local.review || "") : hasOwn(published,"review") ? String(published.review || "") : base.review
    };
  }
  function setUsage(id, patch){
    localUsage[id] = { ...(localUsage[id] || {}), ...patch };
    saveLocalUsage();
  }
  function removeLocalUsage(){
    localUsage = {};
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  function searchText(s) {
    const v = (s.variants || []).flatMap(x => [x.originalCategory, x.description, x.price, x.pros, x.cons, x.recommended, x.review, x.subtype, x.designInvolvement]);
    const usage = getUsage(s);
    return normalize([s.name, ...(s.aliases || []), ...(s.categories || []), usage.review, ...v].join(" "));
  }

  function setStats() {
    $("#statResearch").textContent = researchCount;
    $("#statServices").textContent = services.length;
    $("#statDirect").textContent = services.filter(s => getUsage(s).used).length;
    $("#statCategories").textContent = categories.length;
  }

  function renderCategoryFilters() {
    const countFor = cat => services.filter(s => (s.categories || []).includes(cat)).length;
    const buttons = [{name:"전체", count:services.length}, ...categories.map(c => ({name:c, count:countFor(c)}))];
    els.cats.innerHTML = buttons.map(b => `
      <button class="chip ${state.category === b.name ? "active" : ""}" type="button" data-category="${escapeHtml(b.name)}">
        ${escapeHtml(b.name)} <span class="count">${b.count}</span>
      </button>`).join("");
  }

  function getFiltered() {
    const q = normalize(state.query);
    return services.filter(s => {
      const usage = getUsage(s);
      if (state.category !== "전체" && !(s.categories || []).includes(state.category)) return false;
      if (state.price !== "전체" && s.priceClass !== state.price) return false;
      if (state.directOnly && !usage.used) return false;
      if (q && !searchText(s).includes(q)) return false;
      return true;
    }).sort((a,b) => {
      const au = getUsage(a).used, bu = getUsage(b).used;
      if (au !== bu) return Number(bu) - Number(au);
      return a.name.localeCompare(b.name, "ko");
    });
  }

  function cardMarkup(s) {
    const selected = state.compare.includes(s.id);
    const usage = getUsage(s);
    return `
      <article class="card" data-id="${s.id}">
        <div class="card-top">
          <div class="service-identity">
            ${logoMarkup(s, "card")}
            <h3 class="service-name">${escapeHtml(s.name)}</h3>
          </div>
          <span class="price-badge ${priceClassName(s.priceClass)}">${escapeHtml(s.priceClass)}</span>
        </div>
        <div class="tags">
          ${(s.categories || []).map(c => `<span class="tag">${escapeHtml(c)}</span>`).join("")}
          ${usage.used ? `<span class="tag direct">● USED / 직접 사용</span>` : ""}
        </div>
        <p class="card-desc">${escapeHtml(s.description || "조사 자료에서 세부 설명을 확인할 수 있습니다.")}</p>
        <div class="card-actions">
          <button class="secondary-btn" type="button" data-detail="${s.id}">상세보기</button>
          <button class="secondary-btn ${selected ? "selected" : ""}" type="button" data-compare="${s.id}">${selected ? "✓ 비교 선택됨" : "비교 +"}</button>
          ${state.editMode ? `<button class="usage-quick ${usage.used ? "used" : ""}" type="button" data-toggle-used="${s.id}">${usage.used ? "사용 취소" : "써봄 표시"}</button>` : ""}
        </div>
      </article>`;
  }

  function render() {
    const list = getFiltered();
    els.grid.innerHTML = list.map(cardMarkup).join("");
    els.empty.hidden = list.length !== 0;
    els.grid.hidden = list.length === 0;
    els.summary.textContent = `SCAN RESULT / ${list.length} NODES`;
    els.clear.hidden = !state.query;
    renderCategoryFilters();
    renderCompareBar();
    setStats();
  }

  function variantBlock(v) {
    const reviewLabel = v.reviewType === "direct" ? "직접 써본 소감" : v.reviewType === "reference" ? "참고 평가" : "평가";
    const optional = [
      v.subtype ? `<div class="detail-item"><h4>세부 분류</h4><p>${escapeHtml(v.subtype)}</p></div>` : "",
      v.designInvolvement ? `<div class="detail-item"><h4>디자인 개입 정도</h4><p>${escapeHtml(v.designInvolvement)}</p></div>` : ""
    ].join("");
    return `
      <article class="variant">
        <div class="variant-head"><strong>${escapeHtml(v.category)}</strong><span>${escapeHtml(v.originalCategory || "")}</span></div>
        <div class="variant-grid">
          <div class="detail-item"><h4>한 줄 소개</h4><p>${escapeHtml(v.description)}</p></div>
          <div class="detail-item"><h4>요금</h4><p>${escapeHtml(v.price)}</p></div>
          <div class="detail-item"><h4>장점</h4><p>${escapeHtml(v.pros)}</p></div>
          <div class="detail-item"><h4>아쉬운 점</h4><p>${escapeHtml(v.cons)}</p></div>
          <div class="detail-item"><h4>추천 용도</h4><p>${escapeHtml(v.recommended)}</p></div>
          ${optional}
          ${v.review ? `<div class="detail-item full"><h4>${reviewLabel}</h4><p>${escapeHtml(v.review)}</p></div>` : ""}
        </div>
      </article>`;
  }

  function usageEditorMarkup(s, usage){
    if (!state.editMode) return "";
    return `
      <section class="usage-editor" data-usage-editor="${s.id}">
        <div class="usage-editor-head">
          <h3>내 사용 기록 수정</h3>
          <div class="usage-status-row">
            <label class="toggle">
              <input id="usageUsed-${s.id}" type="checkbox" ${usage.used ? "checked" : ""}>
              <span class="toggle-track" aria-hidden="true"><span></span></span>
              <span class="toggle-copy"><strong>직접 사용함</strong><small>내 기록으로 표시</small></span>
            </label>
          </div>
        </div>
        <textarea id="usageReview-${s.id}" placeholder="직접 써본 소감을 입력하세요. 예: 사용이 쉽고 결과 생성이 빨랐으며…">${escapeHtml(usage.review)}</textarea>
        <div class="usage-save-row"><button class="hud-btn primary" type="button" data-save-usage="${s.id}">사용 기록 저장</button></div>
      </section>`;
  }

  function openDetail(id) {
    const s = services.find(x => x.id === id);
    if (!s) return;
    const usage = getUsage(s);
    const urls = [...new Set((s.variants || []).map(v => v.url).filter(Boolean))];
    els.detailContent.innerHTML = `
      <div class="detail-head">
        <p class="section-kicker">// SERVICE DETAIL</p>
        <div class="detail-title-row">
          ${logoMarkup(s, "detail")}
          <h2 id="detailTitle" class="detail-title">${escapeHtml(s.name)}</h2>
        </div>
        <div class="detail-meta">
          ${(s.categories || []).map(c => `<span class="tag">${escapeHtml(c)}</span>`).join("")}
          <span class="price-badge ${priceClassName(s.priceClass)}">${escapeHtml(s.priceClass)}</span>
          ${usage.used ? `<span class="tag direct">● USED / 직접 사용</span>` : ""}
        </div>
        <p class="detail-lead">${escapeHtml(s.description || "")}</p>
      </div>
      ${usage.used && usage.review ? `<div class="direct-review"><span class="lab">MY EXPERIENCE LOG</span><p>${escapeHtml(usage.review)}</p></div>` : ""}
      ${usageEditorMarkup(s, usage)}
      <div class="detail-variants">${(s.variants || []).map(variantBlock).join("")}</div>
      <div class="detail-actions">
        ${urls.slice(0,3).map((url,i) => `<a class="link-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">공식 사이트${urls.length>1 ? ` ${i+1}` : ""} ↗</a>`).join("")}
      </div>`;
    openModal(els.detailModal);
  }

  function addCompare(id) {
    const idx = state.compare.indexOf(id);
    if (idx >= 0) state.compare.splice(idx,1);
    else {
      if (state.compare.length >= 3) { alert("비교는 최대 3개까지 선택할 수 있어요."); return; }
      state.compare.push(id);
    }
    render();
  }

  function renderCompareBar() {
    const selected = state.compare.map(id => services.find(s => s.id === id)).filter(Boolean);
    els.compareBar.hidden = selected.length === 0;
    els.compareCount.textContent = `${selected.length}/3`;
    els.comparePills.innerHTML = selected.map(s => `<span class="compare-pill">${logoMarkup(s, "mini")}<span>${escapeHtml(s.name)}</span><button type="button" data-remove-compare="${s.id}" aria-label="${escapeHtml(s.name)} 비교에서 제거">×</button></span>`).join("");
    els.openCompare.disabled = selected.length < 2;
  }

  const uniqueJoin = (arr) => [...new Set(arr.filter(Boolean))].join("\n\n");
  function comparisonValue(s, type) {
    const vs = s.variants || [];
    const usage = getUsage(s);
    if (type === "category") return (s.categories || []).join(", ");
    if (type === "price") return uniqueJoin(vs.map(v => v.price));
    if (type === "pros") return uniqueJoin(vs.map(v => v.pros));
    if (type === "cons") return uniqueJoin(vs.map(v => v.cons));
    if (type === "recommended") return uniqueJoin(vs.map(v => v.recommended));
    if (type === "review") {
      if (usage.used && usage.review) return `직접 사용\n${usage.review}`;
      const refs = vs.filter(v=>v.reviewType==="reference").map(v=>v.review);
      return refs.length ? "참고 평가\n" + uniqueJoin(refs) : "—";
    }
    return "";
  }

  function openCompareModal() {
    const selected = state.compare.map(id => services.find(s => s.id === id)).filter(Boolean);
    if (selected.length < 2) return;
    const rows = [["분야","category"],["요금","price"],["장점","pros"],["아쉬운 점","cons"],["추천 용도","recommended"],["사용 소감","review"]];
    els.compareTable.innerHTML = `<table class="compare-table"><thead><tr><th>항목</th>${selected.map(s=>`<th><span class="compare-head">${logoMarkup(s, "compare")}<span>${escapeHtml(s.name)}</span></span></th>`).join("")}</tr></thead><tbody>
      ${rows.map(([label,key]) => `<tr><th>${label}</th>${selected.map(s=>`<td>${escapeHtml(comparisonValue(s,key))}</td>`).join("")}</tr>`).join("")}
      <tr><th>바로가기</th>${selected.map(s=>`<td>${primaryUrl(s) ? `<a class="link-btn" href="${escapeHtml(primaryUrl(s))}" target="_blank" rel="noopener noreferrer">공식 사이트 ↗</a>` : "—"}</td>`).join("")}</tr>
    </tbody></table>`;
    openModal(els.compareModal);
  }

  function openModal(el) { el.classList.add("open"); el.setAttribute("aria-hidden","false"); document.body.style.overflow = "hidden"; }
  function closeModal(el) { el.classList.remove("open"); el.setAttribute("aria-hidden","true"); if (!document.querySelector(".modal.open")) document.body.style.overflow = ""; }

  function resetFilters() {
    state.category = "전체"; state.price = "전체"; state.directOnly = false; state.query = "";
    els.search.value = ""; els.price.value = "전체"; els.direct.checked = false; render();
  }

  function toggleEditMode(){
    state.editMode = !state.editMode;
    els.editToggle.setAttribute("aria-pressed", String(state.editMode));
    els.editToggle.textContent = state.editMode ? "편집 모드 종료" : "사용 기록 편집";
    els.editConsole.hidden = !state.editMode;
    render();
    showToast(state.editMode ? "사용 기록 편집 모드가 켜졌습니다." : "편집 모드가 종료되었습니다.");
  }

  function toggleUsed(id){
    const s = services.find(x => x.id === id); if (!s) return;
    const current = getUsage(s);
    setUsage(id,{used:!current.used});
    render();
    showToast(!current.used ? `${s.name}: 직접 사용으로 표시했습니다.` : `${s.name}: 사용 표시를 해제했습니다.`);
  }

  function saveUsageFromDetail(id){
    const s = services.find(x => x.id === id); if (!s) return;
    const usedEl = $(`#usageUsed-${CSS.escape(id)}`);
    const reviewEl = $(`#usageReview-${CSS.escape(id)}`);
    setUsage(id,{used:Boolean(usedEl?.checked),review:String(reviewEl?.value || "").trim()});
    render();
    openDetail(id);
    showToast(`${s.name} 사용 기록을 저장했습니다.`);
  }

  function effectiveUsageSnapshot(){
    const output = {};
    services.forEach(s => {
      const u = getUsage(s);
      output[s.id] = { used:Boolean(u.used), review:String(u.review || "") };
    });
    return output;
  }

  function exportUsageFile(){
    const data = effectiveUsageSnapshot();
    const fileText = `/* AI SERVICE HUB 공개 사용 기록 - 사이트에서 생성 */\nwindow.PUBLISHED_USAGE = ${JSON.stringify(data,null,2)};\n`;
    const blob = new Blob([fileText],{type:"text/javascript;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "usage-overrides.js"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast("usage-overrides.js 파일을 저장했습니다. js 폴더에 덮어쓴 뒤 push 하세요.");
  }

  function resetUsageChanges(){
    if (!confirm("이 브라우저에서 수정한 사용 기록을 모두 초기화할까요? 공개 기본값은 유지됩니다.")) return;
    removeLocalUsage(); render(); showToast("내 브라우저의 변경 기록을 초기화했습니다.");
  }

  let toastTimer;
  function showToast(message){
    let toast = document.querySelector(".toast");
    if (!toast){ toast = document.createElement("div"); toast.className = "toast"; document.body.appendChild(toast); }
    toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(()=>toast.classList.remove("show"),3200);
  }

  els.cats.addEventListener("click", e => { const btn = e.target.closest("[data-category]"); if (!btn) return; state.category = btn.dataset.category; render(); });
  els.search.addEventListener("input", e => { state.query = e.target.value; render(); });
  els.clear.addEventListener("click", () => { state.query = ""; els.search.value = ""; els.search.focus(); render(); });
  els.price.addEventListener("change", e => { state.price = e.target.value; render(); });
  els.direct.addEventListener("change", e => { state.directOnly = e.target.checked; render(); });
  els.reset.addEventListener("click", resetFilters);
  els.editToggle.addEventListener("click", toggleEditMode);
  els.exportUsage.addEventListener("click", exportUsageFile);
  els.resetUsage.addEventListener("click", resetUsageChanges);

  els.grid.addEventListener("click", e => {
    const detail = e.target.closest("[data-detail]"); if (detail) return openDetail(detail.dataset.detail);
    const comp = e.target.closest("[data-compare]"); if (comp) return addCompare(comp.dataset.compare);
    const usage = e.target.closest("[data-toggle-used]"); if (usage) return toggleUsed(usage.dataset.toggleUsed);
  });
  els.detailContent.addEventListener("click", e => { const btn = e.target.closest("[data-save-usage]"); if (btn) saveUsageFromDetail(btn.dataset.saveUsage); });
  els.comparePills.addEventListener("click", e => { const btn = e.target.closest("[data-remove-compare]"); if (btn) addCompare(btn.dataset.removeCompare); });
  els.openCompare.addEventListener("click", openCompareModal);

  document.querySelectorAll("[data-close-detail]").forEach(el => el.addEventListener("click", () => closeModal(els.detailModal)));
  document.querySelectorAll("[data-close-compare]").forEach(el => el.addEventListener("click", () => closeModal(els.compareModal)));
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(els.detailModal); closeModal(els.compareModal); } });
  $("#scrollTop").addEventListener("click", () => window.scrollTo({top:0, behavior:"smooth"}));

  setStats(); render();
})();
