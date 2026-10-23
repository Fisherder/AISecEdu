(function () {
  "use strict";
  const api = window.DojoLearning;
  const root = document.getElementById("teacher-library");
  if (!api || !root) return;
  const $ = id => document.getElementById(id);
  const escape = api.escapeHtml;
  const unwrap = result => result.data || result;
  const selected = new Map();
  const query = new URLSearchParams(location.search);
  let context = {courses: [], collections: [], types: {}};
  let rows = [], pagination = {}, offset = 0, collectionId = "", sequence = 0;
  let sourceRows = [], sourceOffset = 0, sourcePage = {}, sourceSequence = 0;
  let chosenSource = null, editing = null, archiveItem = null;
  let importKey = null, importRequest = null;
  const request = async path => unwrap(await api.request(`/material-library${path}`));
  const write = async (method, path, body) => unwrap(await api.json(method, `/material-library${path}`, body));
  const courseOptions = () => context.courses.map(course => `<option value="${course.id}">${escape(course.name)}</option>`).join("");

  function notify(message, error = false) {
    $("library-notice").textContent = message;
    $("library-notice").style.color = error ? "#ae3039" : "";
  }

  function show(id) {
    const dialog = $(id);
    dialog.returnFocus = document.activeElement;
    dialog.showModal();
  }

  root.querySelectorAll("dialog").forEach(dialog => {
    dialog.addEventListener("close", () => {
      dialog.returnFocus?.focus?.();
    });
  });
  root.addEventListener("click", event => {
    const close = event.target.closest("[data-library-close]");
    if (close && !close.disabled) close.closest("dialog").close();
  });

  async function busyForm(form, errorId, action) {
    if (form.dataset.busy === "true") return;
    form.dataset.busy = "true";
    $(errorId).textContent = "";
    const controls = [...form.querySelectorAll("button,input,select,textarea")].map(element => [element, element.disabled]);
    controls.forEach(([element]) => element.disabled = true);
    try { await action(); }
    catch (error) { $(errorId).textContent = error.message || "操作没有完成，请重试。"; }
    finally { controls.forEach(([element, disabled]) => element.disabled = disabled); form.dataset.busy = "false"; }
  }

  function collectionsMarkup(chosen = []) {
    const owned = context.collections.filter(item => item.canManage);
    return owned.length ? owned.map(item => `<label><input type="checkbox" name="collectionIds" value="${escape(item.id)}" ${chosen.includes(item.id) ? "checked" : ""}>${escape(item.name)}</label>`).join("") : '<p>还没有分类，可先保存，之后再归类。</p>';
  }

  function renderCollections() {
    $("library-collections").innerHTML = context.collections.map(item => `<button type="button" data-library-collection="${escape(item.id)}" aria-pressed="${collectionId === item.id}">${escape(item.name)} <small>(${item.count || 0})</small></button>`).join("");
    $("library-all-collections").setAttribute("aria-pressed", String(!collectionId));
  }

  async function loadContext() {
    context = await request("/context");
    const type = $("library-type").value;
    $("library-type").innerHTML = '<option value="">全部类型</option>' + Object.entries(context.types).map(([key, title]) => `<option value="${escape(key)}">${escape(title)}</option>`).join("");
    $("library-type").value = type;
    renderCollections();
  }

  function selectionState() {
    $("library-selection-bar").hidden = !selected.size;
    $("library-selected-count").textContent = `已选 ${selected.size} 项 · 最多 20 项，切换分类保留选择`;
    root.querySelectorAll("[data-library-select]").forEach(input => {
      input.checked = selected.has(input.dataset.librarySelect);
      input.closest(".library-card").classList.toggle("is-selected", input.checked);
    });
  }

  function choose(item) {
    if (!item || item.archived) return false;
    if (!selected.has(item.id) && selected.size >= 20) {
      notify("每次最多选用 20 项素材，请先加入课程或清空部分选择。", true);
      return false;
    }
    selected.set(item.id, item);
    selectionState();
    return true;
  }

  function card(item) {
    return `<article class="library-card" data-library-id="${escape(item.id)}"><div class="library-card-top"><span class="library-type-chip">${escape(item.typeLabel)}</span>${item.archived ? '<span>已归档</span>' : `<label class="library-pick"><input type="checkbox" data-library-select="${escape(item.id)}" aria-label="选择 ${escape(item.title)}">选择</label>`}</div><h2>${escape(item.title)}</h2><p>${escape(item.description || "暂无补充说明，可打开预览查看具体内容。")}</p><div class="library-card-meta">${escape(item.collections.map(group => group.name).join(" · ") || "未分类")}<br>${item.construction ? "已验收入库 · " : "自主素材 · "}版本 ${item.version} · ${item.visibility === "teachers" ? "教师共享" : "仅自己"}${item.canManage ? " · 我的素材" : ""}</div><footer><button type="button" data-library-preview="${escape(item.id)}">预览</button>${!item.archived ? `<button type="button" class="library-primary" data-library-use="${escape(item.id)}">加入课程</button>` : ""}${item.canManage ? `<button type="button" data-library-edit="${escape(item.id)}">管理</button><button type="button" data-library-archive="${escape(item.id)}">${item.archived ? "恢复" : "归档"}</button>` : ""}</footer></article>`;
  }

  async function load() {
    const ticket = ++sequence;
    $("library-items").setAttribute("aria-busy", "true");
    const scope = $("library-scope").value;
    const params = new URLSearchParams({q: $("library-search").value.trim(), type: $("library-type").value,
      scope: scope === "archived" ? "mine" : scope, archived: String(scope === "archived"),
      collectionId, offset: String(offset), limit: "24"});
    try {
      const result = await request(`/items?${params}`);
      if (ticket !== sequence) return;
      rows = result.items;
      pagination = result.pagination;
      $("library-items").innerHTML = rows.map(card).join("");
      $("library-empty").hidden = rows.length > 0;
      $("library-page").textContent = `第 ${Math.floor(offset / 24) + 1} / ${Math.max(1, Math.ceil(pagination.total / 24))} 页`;
      $("library-prev").disabled = offset === 0;
      $("library-next").disabled = !pagination.hasNext;
      notify(`共 ${pagination.total} 项素材 · 加入课程后可独立修改，不影响原件`);
      selectionState();
    } catch (error) { if (ticket === sequence) notify(error.message, true); }
    finally { if (ticket === sequence) $("library-items").setAttribute("aria-busy", "false"); }
  }

  async function reload() { await loadContext(); await load(); }
  function filter() { offset = 0; void load(); }
  let searchTimer;
  $("library-search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(filter, 250); });
  ["library-type", "library-scope"].forEach(id => $(id).addEventListener("change", filter));
  $("library-refresh").addEventListener("click", () => reload().catch(error => notify(error.message, true)));
  $("library-all-collections").addEventListener("click", () => { collectionId = ""; renderCollections(); filter(); });
  $("library-collections").addEventListener("click", event => {
    const button = event.target.closest("[data-library-collection]");
    if (!button) return;
    collectionId = button.dataset.libraryCollection; renderCollections(); filter();
  });
  $("library-prev").addEventListener("click", () => { offset = Math.max(0, offset - 24); void load(); });
  $("library-next").addEventListener("click", () => { if (pagination.hasNext) { offset += 24; void load(); } });
  $("library-selection-clear").addEventListener("click", () => { selected.clear(); selectionState(); });
  $("library-items").addEventListener("change", event => {
    const id = event.target.dataset.librarySelect;
    if (!id) return;
    if (event.target.checked) choose(rows.find(item => item.id === id)); else selected.delete(id);
    selectionState();
  });
  $("library-items").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const item = rows.find(row => row.id === button.closest(".library-card").dataset.libraryId);
    if (button.dataset.libraryPreview) void preview(item).catch(error => notify(error.message, true));
    if (button.dataset.libraryUse && choose(item)) openImport();
    if (button.dataset.libraryEdit) openSave(item);
    if (button.dataset.libraryArchive) {
      archiveItem = item;
      $("library-archive-heading").textContent = item.archived ? "恢复素材" : "归档素材";
      $("library-archive-description").textContent = item.archived ? `恢复“${item.title}”后，它将按原共享范围重新出现在素材库。` : `归档“${item.title}”后不再供新课程选用；原件、已选用的课程副本和版本记录仍保留，可从“我的归档”恢复。`;
      $("library-archive-submit").textContent = item.archived ? "确认恢复" : "确认归档";
      $("library-archive-error").textContent = "";
      show("library-archive-dialog");
    }
  });
  $("library-archive-form").addEventListener("submit", event => {
    event.preventDefault();
    void busyForm(event.currentTarget, "library-archive-error", async () => {
      await write("PATCH", `/items/${archiveItem.id}`, {expectedMetadataVersion: archiveItem.metadataVersion, archived: !archiveItem.archived});
      selected.delete(archiveItem.id);
      await reload();
      $("library-archive-dialog").close();
    });
  });

  function openSave(item = null, source = null) {
    editing = item; chosenSource = null; sourceOffset = 0;
    $("library-save-heading").textContent = item ? "管理素材" : "保存已有内容";
    $("library-source-picker").hidden = Boolean(item);
    $("library-source-chosen").textContent = item ? `修改分类和说明不改动内容快照。当前内容版本 ${item.version}。` : "请选择要保存的已有内容。";
    $("library-title").value = item?.title || "";
    $("library-description").value = item?.description || "";
    $("library-visibility").value = item?.visibility || "private";
    $("library-save-collections").innerHTML = collectionsMarkup(item?.collections.map(group => group.id) || []);
    $("library-save-error").textContent = "";
    $("library-save-submit").disabled = !item;
    $("library-save-submit").textContent = item ? "保存设置" : "保存到素材库";
    $("library-source-course").innerHTML = '<option value="">全部课程与独立项目</option>' + courseOptions();
    $("library-source-search").value = "";
    if (source) $("library-source-kind").value = source.kind;
    const preferred = context.courses.find(row => row.referenceId === query.get("dojo") || String(row.id) === query.get("dojo"));
    if (preferred && !source) $("library-source-course").value = String(preferred.id);
    show("library-save-dialog");
    if (!item) void loadSources(source);
  }
  $("library-save-open").addEventListener("click", () => openSave());

  async function loadSources(source = null) {
    const ticket = ++sourceSequence;
    chosenSource = null;
    $("library-save-submit").disabled = true;
    $("library-source-chosen").textContent = "请选择要保存的已有内容。";
    $("library-sources").textContent = "正在读取可保存的内容…";
    const params = new URLSearchParams({kind: $("library-source-kind").value, q: $("library-source-search").value.trim(), offset: String(sourceOffset), limit: "15"});
    if ($("library-source-course").value) params.set("courseId", $("library-source-course").value);
    if (source) params.set("id", source.id);
    try {
      const result = await request(`/sources?${params}`);
      if (ticket !== sourceSequence) return;
      sourceRows = result.sources; sourcePage = result.pagination;
      $("library-sources").innerHTML = sourceRows.length ? sourceRows.map((source, index) => `<label class="library-source-row"><input type="radio" name="library-source" value="${index}"><span>${escape(source.title)}<small>${escape(source.typeLabel)}${source.libraryItem ? ` · 素材库已有版本 ${source.libraryItem.version}` : ""}</small></span></label>`).join("") : '<p class="library-help">没有符合条件的内容，换个来源或课程试试。</p>';
      $("library-source-page").textContent = `共 ${sourcePage.total} 项 · 第 ${Math.floor(sourceOffset / 15) + 1} 页`;
      $("library-source-prev").disabled = !sourceOffset;
      $("library-source-next").disabled = !sourcePage.hasNext;
      if (source && sourceRows.length === 1) {
        $("library-sources").querySelector("input").checked = true;
        await chooseSource(sourceRows[0]);
      }
    } catch (error) { if (ticket === sourceSequence) $("library-sources").textContent = error.message; }
  }
  async function chooseSource(source) {
    chosenSource = source;
    $("library-source-chosen").textContent = `已选：${chosenSource.title}${chosenSource.libraryItem ? "。这次将更新库中素材，保留旧版本，不改动已选入课程的副本。" : ""}`;
    $("library-title").value = chosenSource.title;
    $("library-description").value = "";
    $("library-visibility").value = "private";
    $("library-save-collections").innerHTML = collectionsMarkup();
    $("library-save-error").textContent = "";
    $("library-save-submit").disabled = false;
    $("library-save-submit").textContent = chosenSource.libraryItem ? "保存来源的新版本" : "保存到素材库";
    if (chosenSource.libraryItem) {
      const source = chosenSource;
      $("library-save-submit").disabled = true;
      try {
        const saved = (await request(`/items/${source.libraryItem.id}`)).item;
        if (chosenSource !== source) return;
        source.libraryItem.metadataVersion = saved.metadataVersion;
        $("library-title").value = saved.title;
        $("library-description").value = saved.description;
        $("library-visibility").value = saved.visibility;
        $("library-save-collections").innerHTML = collectionsMarkup(saved.collections.map(group => group.id));
        $("library-save-submit").disabled = false;
      } catch (error) { if (chosenSource === source) $("library-save-error").textContent = error.message; }
    }
  }
  $("library-sources").addEventListener("change", event => {
    if (event.target.name === "library-source") void chooseSource(sourceRows[Number(event.target.value)]);
  });
  ["library-source-kind", "library-source-course"].forEach(id => $(id).addEventListener("change", () => { sourceOffset = 0; void loadSources(); }));
  let sourceTimer;
  $("library-source-search").addEventListener("input", () => { clearTimeout(sourceTimer); sourceTimer = setTimeout(() => { sourceOffset = 0; void loadSources(); }, 250); });
  $("library-source-prev").addEventListener("click", () => { sourceOffset = Math.max(0, sourceOffset - 15); void loadSources(); });
  $("library-source-next").addEventListener("click", () => { if (sourcePage.hasNext) { sourceOffset += 15; void loadSources(); } });
  $("library-save-form").addEventListener("submit", event => {
    event.preventDefault();
    const body = {title: $("library-title").value, description: $("library-description").value,
      visibility: $("library-visibility").value,
      collectionIds: [...$("library-save-collections").querySelectorAll("input:checked")].map(input => input.value)};
    void busyForm(event.currentTarget, "library-save-error", async () => {
      if (editing) await write("PATCH", `/items/${editing.id}`, {...body, expectedMetadataVersion: editing.metadataVersion});
      else {
        if (!chosenSource) throw new Error("请先选择已有内容。");
        await write("POST", "/items", {...body, source: {kind: chosenSource.kind, id: chosenSource.id}, expectedMetadataVersion: chosenSource.libraryItem?.metadataVersion});
      }
      await reload();
      $("library-save-dialog").close();
      notify("已保存到素材库。原内容和课程中的副本没有改变。");
    });
  });

  $("library-collection-open").addEventListener("click", () => {
    $("library-collection-course").innerHTML = '<option value="">自定义分类</option>' + courseOptions();
    $("library-collection-name").value = ""; $("library-collection-error").textContent = "";
    show("library-collection-dialog");
  });
  $("library-collection-course").addEventListener("change", () => {
    const course = context.courses.find(course => String(course.id) === $("library-collection-course").value);
    if (course) $("library-collection-name").value = course.name;
  });
  $("library-collection-form").addEventListener("submit", event => {
    event.preventDefault();
    const body = {name: $("library-collection-name").value, courseId: $("library-collection-course").value ? Number($("library-collection-course").value) : null};
    void busyForm(event.currentTarget, "library-collection-error", async () => {
      await write("POST", "/collections", body); await reload(); $("library-collection-dialog").close();
    });
  });

  function targetModules() {
    const course = context.courses.find(course => String(course.id) === $("library-target-course").value);
    $("library-target-module").innerHTML = course?.modules.length ? course.modules.map(module => `<option value="${module.index}">${escape(module.name)}</option>`).join("") : '<option value="">请先选择有章节的课程</option>';
    importRequest = null;
  }
  function openImport() {
    if (!selected.size) return;
    $("library-import-items").innerHTML = `<p>已选 ${selected.size} 项：</p><ul>${[...selected.values()].map(item => `<li>${escape(item.title)} · 版本 ${item.version}</li>`).join("")}</ul>`;
    $("library-target-course").innerHTML = '<option value="">请选择自己的课程</option>' + courseOptions();
    const preferred = query.get("dojo");
    const course = context.courses.find(row => row.referenceId === preferred || String(row.id) === preferred);
    if (course) $("library-target-course").value = String(course.id);
    targetModules();
    $("library-import-error").textContent = "";
    importKey = null; importRequest = null;
    show("library-import-dialog");
  }
  $("library-import-open").addEventListener("click", openImport);
  $("library-target-course").addEventListener("change", targetModules);
  $("library-target-module").addEventListener("change", () => importRequest = null);
  $("library-import-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!importRequest) {
      importKey = `library_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      importRequest = {items: [...selected.values()].map(item => ({id: item.id, version: item.version})),
        courseId: Number($("library-target-course").value), moduleIndex: Number($("library-target-module").value), requestKey: importKey};
    }
    void busyForm(event.currentTarget, "library-import-error", async () => {
      const result = await write("POST", "/imports", importRequest);
      $("library-import-dialog").close();
      selected.clear(); selectionState();
      $("library-result").hidden = false;
      const link = resource => `<a href="${escape(resource.href)}">${escape(resource.title)}</a> <small>草稿，待检查发布</small>`;
      $("library-result").innerHTML = `<h2>已加入课程，共 ${result.imports.length} 项</h2><p>副本可独立修改。配套实践题或教学内容需要先发布，测验才可发布给学生。</p><ul>${result.imports.map(item => `<li>${link(item.resource)}${item.resource.dependencies?.length ? `<ul>${item.resource.dependencies.map(dep => `<li>${link(dep)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>`;
      $("library-result").scrollIntoView({behavior: "smooth", block: "center"});
    });
  });

  async function preview(item) {
    const target = item.construction ? unwrap(await api.json("POST", `/construction/materials/${item.id}/preview`, {})) : await request(`/items/${item.id}/preview`);
    const url = new URL(target.href, window.location.origin);
    if (url.origin !== window.location.origin) throw new Error("项目预览地址无效。");
    window.location.assign(url.href);
  }
  reload().then(() => {
    const kind = query.get("sourceKind"), id = query.get("sourceId");
    if (id && ["artifact", "assignment", "practice", "challenge"].includes(kind)) openSave(null, {kind, id});
  }).catch(error => notify(error.message, true));
})();
