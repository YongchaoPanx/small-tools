(() => {
  const DB_NAME = "rd-requirement-tracker";
  const DB_VERSION = 1;
  const STORE = "kv";
  const STATE_KEY = "state";

  const REQUIREMENT_STATUSES = [
    "待分析",
    "待开发",
    "开发中",
    "自测试中",
    "PR评审中",
    "门禁处理中",
    "待合入",
    "合入验证中",
    "已完成",
    "已暂停",
    "已取消",
  ];

  const PRIORITIES = ["P0", "P1", "P2", "P3"];
  const PRIORITY_LABEL = {
    P0: "P0 紧急",
    P1: "P1 高",
    P2: "P2 中",
    P3: "P3 低",
  };

  const RISK_LABEL = {
    normal: "正常",
    attention: "注意",
    blocked: "阻塞",
    failed: "失败",
    overdue: "逾期",
  };

  const ACTION_STATUSES = ["待处理", "进行中", "已完成", "已取消"];
  const BRANCH_STATUSES = ["未开始", "开发中", "PR处理中", "测试中", "门禁中", "待合入", "已完成", "已取消"];
  const BRANCH_TYPES = ["蓝区Master分支", "Dev分支", "主干分支", "Master/Main分支", "Release分支", "特性分支", "维护分支", "其他"];
  const PR_STATUSES = ["草稿", "已创建", "评审中", "修改中", "已批准", "待门禁", "待合入", "已合入", "已关闭", "已废弃"];
  const TEST_STATUSES = ["未测试", "测试中", "测试成功", "测试失败", "不适用"];
  const TEST_TYPES = ["单元测试", "XTS", "自验证", "稳定性测试", "编译验证", "功能测试", "冒烟测试", "回归测试", "其他"];
  const GATE_STATUSES = ["未触发", "运行中", "通过", "失败", "已取消", "不适用"];
  const ISSUE_STATUSES = ["无需走单", "待创建", "已创建", "处理中", "待验证", "已解决", "已关闭", "已取消"];
  const ISSUE_TYPES = ["需求单", "缺陷单", "测试问题", "门禁问题", "变更单", "其他"];
  const LOG_TYPES = ["代码开发", "问题修复", "PR创建", "PR更新", "测试完成", "门禁通过", "PR合入", "文档完成", "需求确认", "其他"];

  const STAGE_PROGRESS = {
    待分析: 5,
    待开发: 10,
    开发中: 30,
    自测试中: 50,
    PR评审中: 65,
    门禁处理中: 75,
    待合入: 85,
    合入验证中: 95,
    已完成: 100,
    已暂停: 0,
    已取消: 0,
  };

  const dom = {};
  let state = {
    version: 1,
    ui: {
      query: "",
      view: "list",
      status: "全部",
      priority: "全部",
      risk: "全部",
      sort: "risk",
      showArchived: false,
      leftCollapsed: false,
      detailOpen: false,
      selectedId: null,
      focusTarget: "",
    },
    requirements: [],
  };
  let saveTimer = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheDom();
    fillSelect(dom.statusFilter, ["全部", ...REQUIREMENT_STATUSES]);
    fillSelect(dom.priorityFilter, ["全部", ...PRIORITIES], (value) => (value === "全部" ? value : PRIORITY_LABEL[value]));
    fillSelect(dom.riskFilter, ["全部", "normal", "attention", "blocked", "failed", "overdue"], (value) =>
      value === "全部" ? value : RISK_LABEL[value],
    );
    bindEvents();
    const loaded = await loadState();
    state = normalizeState(loaded && !isBundledDemoState(loaded) ? loaded : createEmptyState());
    if (!state.ui.selectedId && state.requirements.length) {
      state.ui.selectedId = state.requirements[0].id;
    }
    render();
    persistSoon();
  }

  function cacheDom() {
    Object.assign(dom, {
      globalSearch: document.querySelector("#globalSearch"),
      workspace: document.querySelector(".workspace"),
      toggleLeftRailBtn: document.querySelector("#toggleLeftRailBtn"),
      listViewBtn: document.querySelector("#listViewBtn"),
      boardViewBtn: document.querySelector("#boardViewBtn"),
      newRequirementBtn: document.querySelector("#newRequirementBtn"),
      statsGrid: document.querySelector("#statsGrid"),
      todoCount: document.querySelector("#todoCount"),
      todoList: document.querySelector("#todoList"),
      statusFilter: document.querySelector("#statusFilter"),
      priorityFilter: document.querySelector("#priorityFilter"),
      riskFilter: document.querySelector("#riskFilter"),
      sortMode: document.querySelector("#sortMode"),
      showArchived: document.querySelector("#showArchived"),
      clearFiltersBtn: document.querySelector("#clearFiltersBtn"),
      exportJsonBtn: document.querySelector("#exportJsonBtn"),
      importJsonBtn: document.querySelector("#importJsonBtn"),
      exportCsvBtn: document.querySelector("#exportCsvBtn"),
      resetDemoBtn: document.querySelector("#resetDemoBtn"),
      importFile: document.querySelector("#importFile"),
      weeklyReportBtn: document.querySelector("#weeklyReportBtn"),
      quickAddFromClipboardBtn: document.querySelector("#quickAddFromClipboardBtn"),
      collapseAllBtn: document.querySelector("#collapseAllBtn"),
      mainTitle: document.querySelector("#mainTitle"),
      resultSummary: document.querySelector("#resultSummary"),
      contentArea: document.querySelector("#contentArea"),
      detailPanel: document.querySelector("#detailPanel"),
      modalHost: document.querySelector("#modalHost"),
      toastHost: document.querySelector("#toastHost"),
    });
  }

  function bindEvents() {
    dom.globalSearch.addEventListener("input", () => {
      state.ui.query = dom.globalSearch.value.trim();
      render();
      persistSoon();
    });
    dom.toggleLeftRailBtn.addEventListener("click", () => {
      state.ui.leftCollapsed = !state.ui.leftCollapsed;
      render();
      persistSoon();
    });
    dom.listViewBtn.addEventListener("click", () => setView("list"));
    dom.boardViewBtn.addEventListener("click", () => setView("board"));
    dom.newRequirementBtn.addEventListener("click", () => openRequirementForm());
    dom.statusFilter.addEventListener("change", () => updateFilter("status", dom.statusFilter.value));
    dom.priorityFilter.addEventListener("change", () => updateFilter("priority", dom.priorityFilter.value));
    dom.riskFilter.addEventListener("change", () => updateFilter("risk", dom.riskFilter.value));
    dom.sortMode.addEventListener("change", () => updateFilter("sort", dom.sortMode.value));
    dom.showArchived.addEventListener("change", () => updateFilter("showArchived", dom.showArchived.checked));
    dom.clearFiltersBtn.addEventListener("click", clearFilters);
    dom.exportJsonBtn.addEventListener("click", () => exportJson("backup"));
    dom.importJsonBtn.addEventListener("click", () => dom.importFile.click());
    dom.importFile.addEventListener("change", importJson);
    dom.exportCsvBtn.addEventListener("click", exportCsv);
    dom.resetDemoBtn.addEventListener("click", resetDemo);
    dom.weeklyReportBtn.addEventListener("click", openWeeklyReport);
    dom.quickAddFromClipboardBtn.addEventListener("click", quickAddFromClipboard);
    dom.collapseAllBtn.addEventListener("click", () => {
      state.ui.detailOpen = false;
      render();
      persistSoon();
    });

    dom.contentArea.addEventListener("click", handleContentClick);
    dom.contentArea.addEventListener("change", handleContentChange);
    dom.detailPanel.addEventListener("click", handleDetailClick);
    dom.modalHost.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", handleOutsideDetailClick);
  }

  function setView(view) {
    state.ui.view = view;
    render();
    persistSoon();
  }

  function updateFilter(key, value) {
    state.ui[key] = value;
    render();
    persistSoon();
  }

  function clearFilters() {
    state.ui.query = "";
    state.ui.status = "全部";
    state.ui.priority = "全部";
    state.ui.risk = "全部";
    state.ui.sort = "risk";
    state.ui.showArchived = false;
    render();
    persistSoon();
  }

  function render() {
    syncControls();
    renderStats();
    renderTodos();
    renderMain();
    renderDetail();
  }

  function syncControls() {
    dom.globalSearch.value = state.ui.query || "";
    dom.statusFilter.value = state.ui.status || "全部";
    dom.priorityFilter.value = state.ui.priority || "全部";
    dom.riskFilter.value = state.ui.risk || "全部";
    dom.sortMode.value = state.ui.sort || "risk";
    dom.showArchived.checked = Boolean(state.ui.showArchived);
    dom.workspace.classList.toggle("rail-collapsed", Boolean(state.ui.leftCollapsed));
    dom.workspace.classList.toggle("detail-open", Boolean(state.ui.detailOpen));
    dom.detailPanel.classList.toggle("open", Boolean(state.ui.detailOpen && state.ui.selectedId));
    dom.detailPanel.setAttribute("aria-hidden", state.ui.detailOpen && state.ui.selectedId ? "false" : "true");
    dom.toggleLeftRailBtn.textContent = state.ui.leftCollapsed ? "展开侧栏" : "收起侧栏";
    dom.toggleLeftRailBtn.title = state.ui.leftCollapsed ? "展开左侧概览" : "收起左侧概览";
    dom.collapseAllBtn.textContent = state.ui.detailOpen ? "关闭详情" : "详情未打开";
    dom.collapseAllBtn.disabled = !state.ui.detailOpen;
    dom.listViewBtn.classList.toggle("active", state.ui.view === "list");
    dom.boardViewBtn.classList.toggle("active", state.ui.view === "board");
  }

  function renderStats() {
    const stats = computeStats();
    const items = [
      ["进行中需求", stats.activeRequirements],
      ["阻塞需求", stats.blockedRequirements],
      ["待处理动作", stats.pendingActions],
      ["逾期动作", stats.overdueActions],
      ["测试失败PR", stats.failedPrs],
      ["待合入PR", stats.waitingMergePrs],
      ["本周完成", stats.completedThisWeek],
      ["已归档", stats.archivedRequirements],
    ];
    dom.statsGrid.innerHTML = items
      .map(([label, value]) => `<div class="stat-card"><strong>${value}</strong><span>${h(label)}</span></div>`)
      .join("");
  }

  function renderTodos() {
    const todos = buildTodos();
    dom.todoCount.textContent = todos.length;
    if (!todos.length) {
      dom.todoList.className = "todo-list empty-state";
      dom.todoList.textContent = "暂无待处理项";
      return;
    }
    dom.todoList.className = "todo-list";
    dom.todoList.innerHTML = todos
      .map(
        (item) => `
          <button type="button" class="todo-item" data-action="todo-jump" data-id="${item.reqId}" data-focus-target="${h(item.focusTarget || "")}">
            <strong>${h(item.title)}</strong>
            <span>${h(item.meta)}</span>
          </button>
        `,
      )
      .join("");
  }

  function renderMain() {
    const reqs = getFilteredRequirements();
    dom.mainTitle.textContent = state.ui.view === "board" ? "需求看板" : "需求列表";
    dom.resultSummary.textContent = `共 ${reqs.length} 条需求，未归档 ${state.requirements.filter((req) => !req.isArchived).length} 条，本地自动保存`;
    if (!reqs.length) {
      dom.contentArea.innerHTML = `<div class="empty-state">没有匹配的需求。可以调整筛选条件，或新增一个需求。</div>`;
      return;
    }
    dom.contentArea.innerHTML = state.ui.view === "board" ? renderBoard(reqs) : renderList(reqs);
  }

  function renderList(reqs) {
    return `
      <div class="req-list">
        ${reqs.map(renderRequirementRow).join("")}
      </div>
    `;
  }

  function renderRequirementRow(req) {
    const risk = computeRisk(req);
    const delivery = computeRequirementDelivery(req);
    const primary = getPrimaryAction(req);
    return `
      <article class="req-list-card req-row ${state.ui.selectedId === req.id ? "selected" : ""}" data-action="select-req" data-id="${req.id}">
        <div class="req-list-top">
          <div class="req-list-title">
            <strong>${h(req.title)}</strong>
            <span>${h(req.requirementNo || req.projectName || "未填写编号")}</span>
          </div>
          <span class="pill priority-${h(req.priority)}">${h(req.priority)}</span>
        </div>
        <div class="meta-line">
          <span class="pill risk-${risk.key}">${h(risk.label)}</span>
          ${req.plannedEndAt ? `<span class="tag">计划 ${h(formatDate(req.plannedEndAt))}</span>` : `<span class="tag">未设计划</span>`}
          ${req.isArchived ? `<span class="tag">已归档</span>` : ""}
        </div>
        <select class="inline-select" data-no-row data-inline-status="${req.id}" aria-label="修改需求状态">
          ${REQUIREMENT_STATUSES.map((status) => `<option value="${h(status)}" ${status === req.status ? "selected" : ""}>${h(status)}</option>`).join("")}
        </select>
        <div class="req-list-action">
          ${
            primary
              ? `<strong>${h(primary.content)}</strong><span>${h(primary.status)}${renderActionTimeMeta(primary)}</span>`
              : `<strong>未设置下一步动作</strong><span>建议补充今天要推进的动作</span>`
          }
        </div>
        <div class="req-list-progress">
          ${renderDeliveryLine(delivery)}
          <div class="progress-note">${h(delivery.label)} · ${h(delivery.blocker)}</div>
        </div>
        <div class="req-list-bottom">
          <span>${renderIssueSummary(req)}</span>
          <div class="row-actions">
            <button type="button" data-action="edit-req" data-id="${req.id}">编辑</button>
            <button type="button" data-action="add-action" data-id="${req.id}">动作</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderProgressGroup(counts) {
    return `
      <div class="progress-group">
        ${renderProgressLine("分支", counts.doneBranches, counts.requiredBranches)}
        ${renderProgressLine("PR", counts.mergedPrs, counts.requiredPrs)}
        ${renderProgressLine("测试", counts.okTests, counts.requiredTests)}
      </div>
    `;
  }

  function renderDeliveryLine(delivery) {
    return `
      <div class="delivery-line">
        <div class="delivery-head">
          <span>交付链路</span>
          <strong>${delivery.percent}%</strong>
        </div>
        <div class="meter"><span style="width:${delivery.percent}%"></span></div>
      </div>
    `;
  }

  function renderProgressLine(label, done, total) {
    const percent = total ? Math.round((done / total) * 100) : 0;
    return `
      <div class="progress-line">
        <span>${h(label)}</span>
        <div class="meter"><span style="width:${percent}%"></span></div>
        <span>${done}/${total}</span>
      </div>
    `;
  }

  function renderActionTimeMeta(action) {
    const parts = [];
    if (action.startedAt) parts.push(`开始 ${formatDateTime(action.startedAt)}`);
    if (action.plannedEndAt) parts.push(`目标 ${formatDate(action.plannedEndAt)}`);
    if (action.completedAt) parts.push(`完成 ${formatDateTime(action.completedAt)}`);
    return parts.length ? ` · ${parts.join(" · ")}` : "";
  }

  function renderIssueSummary(req) {
    const issues = req.issues || [];
    if (!issues.length) return `<span class="tag">无</span>`;
    const open = issues.filter((item) => !["已关闭", "已取消", "无需走单"].includes(item.status)).length;
    return `<span class="tag">${issues.length}条</span> <span class="tag">${open}处理中</span>`;
  }

  function renderBoard(reqs) {
    const columns = REQUIREMENT_STATUSES.filter((status) =>
      reqs.some((req) => req.status === status) || !["已取消"].includes(status),
    );
    return `
      <div class="board" style="grid-template-columns: repeat(${columns.length}, minmax(220px, 1fr));">
        ${columns
          .map((status) => {
            const list = reqs.filter((req) => req.status === status);
            return `
              <section class="board-column">
                <h3><span>${h(status)}</span><span>${list.length}</span></h3>
                ${
                  list.length
                    ? list.map(renderBoardCard).join("")
                    : `<div class="empty-state">暂无</div>`
                }
              </section>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderBoardCard(req) {
    const risk = computeRisk(req);
    const primary = getPrimaryAction(req);
    return `
      <button type="button" class="board-card ${state.ui.selectedId === req.id ? "selected" : ""}" data-action="select-req" data-id="${req.id}">
        <strong>${h(req.title)}</strong>
        <div class="meta-line">
          <span class="pill priority-${h(req.priority)}">${h(req.priority)}</span>
          <span class="pill risk-${risk.key}">${h(risk.label)}</span>
          ${req.plannedEndAt ? `<span class="tag">${h(formatDate(req.plannedEndAt))}</span>` : ""}
        </div>
        <span>${primary ? `${h(primary.content)}${renderActionTimeMeta(primary)}` : "未设置下一步动作"}</span>
      </button>
    `;
  }

  function renderDetail() {
    const req = getSelectedRequirement();
    if (!req || !state.ui.detailOpen) {
      dom.detailPanel.innerHTML = "";
      return;
    }
    const risk = computeRisk(req);
    const delivery = computeRequirementDelivery(req);
    const primary = getPrimaryAction(req);
    dom.detailPanel.innerHTML = `
      <div class="detail-head">
        <div>
          <h2>${h(req.title)}</h2>
          <div class="detail-meta">
            <span class="pill priority-${h(req.priority)}">${h(PRIORITY_LABEL[req.priority] || req.priority)}</span>
            <span class="pill status-pill">${h(req.status)}</span>
            <span class="pill risk-${risk.key}">${h(risk.label)}</span>
            ${req.requirementNo ? `<span class="tag">${h(req.requirementNo)}</span>` : ""}
            ${req.isArchived ? `<span class="tag">已归档</span>` : ""}
          </div>
        </div>
        <div class="compact-actions">
          <button type="button" data-action="edit-req" data-id="${req.id}">编辑</button>
          <button type="button" data-action="duplicate-req" data-id="${req.id}">复制</button>
          <button type="button" data-action="complete-req" data-id="${req.id}">完成</button>
        </div>
      </div>

      <section class="detail-section" id="${h(focusId("section", "actions"))}">
        <h3>当前推进</h3>
        <div class="summary-grid">
          <div class="summary-item"><span>下一步动作</span><strong>${primary ? h(primary.content) : "未设置"}</strong></div>
          <div class="summary-item"><span>计划完成</span><strong>${req.plannedEndAt ? h(formatDate(req.plannedEndAt)) : "未设置"}</strong></div>
          <div class="summary-item"><span>交付链路进度</span><strong>${delivery.percent}%</strong></div>
          <div class="summary-item"><span>当前卡点</span><strong>${h(delivery.blocker)}</strong></div>
        </div>
        ${req.description ? `<p class="hint">${h(req.description)}</p>` : ""}
        ${req.isBlocked ? `<p class="hint"><strong>阻塞原因：</strong>${h(req.blockedReason || "未填写")}</p>` : ""}
      </section>

      <section class="detail-section">
        <div class="section-title">
          <h3>下一步动作</h3>
          <button type="button" data-action="add-action" data-id="${req.id}">新增动作</button>
        </div>
        ${renderActions(req)}
      </section>

      <section class="detail-section">
        <div class="section-title">
          <h3>分支与PR</h3>
          <button type="button" data-action="add-branch" data-id="${req.id}">新增分支</button>
        </div>
        ${renderBranches(req)}
      </section>

      <section class="detail-section">
        <div class="section-title">
          <h3>问题单</h3>
          <button type="button" data-action="add-issue" data-id="${req.id}">新增问题单</button>
        </div>
        ${renderIssues(req)}
      </section>

      <section class="detail-section">
        <div class="section-title">
          <h3>完成时间线</h3>
          <button type="button" data-action="add-log" data-id="${req.id}">新增记录</button>
        </div>
        ${renderLogs(req)}
      </section>

      <section class="detail-section">
        <div class="compact-actions">
          <button type="button" data-action="${req.isArchived ? "restore-req" : "archive-req"}" data-id="${req.id}">
            ${req.isArchived ? "恢复需求" : "归档需求"}
          </button>
          <button type="button" class="danger-ghost" data-action="delete-req" data-id="${req.id}">删除需求</button>
        </div>
      </section>
    `;
    focusPendingDetailTarget();
  }

  function renderActions(req) {
    if (!req.actions?.length) return `<div class="empty-state">暂无动作。进行中的需求建议保留一个当前主要动作。</div>`;
    return `
      <div class="entity-list">
        ${req.actions
          .slice()
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.plannedEndAt || "9999").localeCompare(b.plannedEndAt || "9999"))
          .map(
            (action) => `
              <div class="entity-card" id="${h(focusId("action", action.id))}">
                <div class="entity-card-head">
                  <div>
                    <h4>${h(action.content)}</h4>
                    <div class="meta-line">
                      <span class="pill status-pill">${h(action.status)}</span>
                      <span class="pill priority-${h(action.priority || "P2")}">${h(action.priority || "P2")}</span>
                      ${action.isPrimary ? `<span class="tag">主要动作</span>` : ""}
                      ${action.isBlocked ? `<span class="pill risk-blocked">阻塞</span>` : ""}
                      ${action.startedAt ? `<span class="tag">开始 ${h(formatDateTime(action.startedAt))}</span>` : ""}
                      ${action.plannedEndAt ? `<span class="tag">目标 ${h(formatDate(action.plannedEndAt))}</span>` : ""}
                      ${action.completedAt ? `<span class="tag">完成 ${h(formatDateTime(action.completedAt))}</span>` : ""}
                    </div>
                  </div>
                  <div class="compact-actions">
                    <button type="button" data-action="edit-action" data-id="${req.id}" data-action-id="${action.id}">编辑</button>
                    ${
                      action.status !== "已完成"
                        ? `<button type="button" data-action="finish-action" data-id="${req.id}" data-action-id="${action.id}">完成</button>`
                        : ""
                    }
                  </div>
                </div>
                ${
                  action.blockedReason || action.relatedUrl || action.note
                    ? `<div class="entity-card-body">
                        ${action.blockedReason ? `<p class="hint"><strong>阻塞：</strong>${h(action.blockedReason)}</p>` : ""}
                        ${action.note ? `<p class="hint">${h(action.note)}</p>` : ""}
                        ${action.relatedUrl ? `<a href="${h(safeHref(action.relatedUrl))}" target="_blank" rel="noreferrer">打开相关链接</a>` : ""}
                      </div>`
                    : ""
                }
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderBranches(req) {
    if (!req.branches?.length) return `<div class="empty-state">暂无分支。新增需求时会默认生成三个分支位置，也可以按实际情况调整。</div>`;
    return `
      <div class="entity-list">
        ${req.branches
          .slice()
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          .map((branch) => renderBranchCard(req, branch))
          .join("")}
      </div>
    `;
  }

  function renderBranchCard(req, branch) {
    const delivery = computeBranchDelivery(branch);
    const currentGate = (branch.gates || []).find((gate) => gate.isCurrent) || (branch.gates || [])[0];
    return `
      <div class="entity-card" id="${h(focusId("branch", branch.id))}">
        <div class="entity-card-head">
          <div>
            <h4>${h(branch.name || "未命名分支")}</h4>
            <div class="meta-line">
              <span class="pill status-pill">${h(branch.status)}</span>
              <span class="tag">${h(branch.branchType || "其他")}</span>
              ${branch.isRequired ? `<span class="tag">必需</span>` : `<span class="tag">非必需</span>`}
              ${currentGate ? renderGatePill(currentGate.status) : `<span class="tag">无门禁</span>`}
            </div>
          </div>
          <div class="compact-actions">
            ${branch.repositoryUrl ? `<button type="button" data-action="open-url" data-url="${h(branch.repositoryUrl)}">仓库</button>` : ""}
            <button type="button" data-action="export-branch-pr-links" data-id="${req.id}" data-branch-id="${branch.id}">导出PR链接</button>
            <button type="button" data-action="edit-branch" data-id="${req.id}" data-branch-id="${branch.id}">编辑</button>
            <button type="button" data-action="add-pr" data-id="${req.id}" data-branch-id="${branch.id}">新增PR</button>
            <button type="button" data-action="add-gate" data-id="${req.id}" data-branch-id="${branch.id}">门禁</button>
          </div>
        </div>
        <div class="entity-card-body">
          <div class="progress-group">
            ${renderDeliveryLine(delivery)}
            <div class="progress-note">${h(delivery.label)} · ${h(delivery.blocker)}</div>
          </div>
          ${renderPrTable(req, branch)}
          ${renderGateList(req, branch)}
        </div>
      </div>
    `;
  }

  function renderPrTable(req, branch) {
    if (!branch.prs?.length) return `<div class="empty-state">该分支暂无PR。</div>`;
    return `
      <table class="mini-table">
        <thead>
          <tr>
            <th>PR</th>
            <th>状态</th>
            <th>测试</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${branch.prs
            .map(
              (pr) => `
                <tr id="${h(focusId("pr", pr.id))}">
                  <td>
                    <strong>${h(pr.title || pr.prNo || "未命名PR")}</strong>
                    <div class="meta-line">
                      ${pr.prNo ? `<span>${h(pr.prNo)}</span>` : ""}
                      ${pr.isRequired ? `<span class="tag">必需</span>` : `<span class="tag">非必需</span>`}
                      ${pr.isMerged ? `<span class="pill test-success">已合入</span>` : ""}
                    </div>
                  </td>
                  <td><span class="pill status-pill">${h(pr.status)}</span></td>
                  <td>${renderTestChips(req, branch, pr)}</td>
                  <td>
                    <div class="compact-actions">
                      ${pr.prUrl ? `<button type="button" data-action="open-url" data-url="${h(pr.prUrl)}">打开</button>` : ""}
                      <button type="button" data-action="edit-pr" data-id="${req.id}" data-branch-id="${branch.id}" data-pr-id="${pr.id}">编辑</button>
                      <button type="button" data-action="complete-pr-tests" data-id="${req.id}" data-branch-id="${branch.id}" data-pr-id="${pr.id}">测试全过</button>
                      <button type="button" data-action="add-test" data-id="${req.id}" data-branch-id="${branch.id}" data-pr-id="${pr.id}">新增测试</button>
                      ${
                        !pr.isMerged
                          ? `<button type="button" data-action="merge-pr" data-id="${req.id}" data-branch-id="${branch.id}" data-pr-id="${pr.id}">合入</button>`
                          : `<button type="button" data-action="unmerge-pr" data-id="${req.id}" data-branch-id="${branch.id}" data-pr-id="${pr.id}">取消合入</button>`
                      }
                    </div>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderTestChips(req, branch, pr) {
    if (!pr.tests?.length) return `<span class="tag">无测试项</span>`;
    return `
      <div class="test-chip-list">
        ${pr.tests
          .map(
            (test) => `
              <button
                type="button"
                class="pill test-chip ${testStatusClass(test.status)}"
                data-action="toggle-test-success"
                data-id="${req.id}"
                data-branch-id="${branch.id}"
                data-pr-id="${pr.id}"
                data-test-id="${test.id}"
                id="${h(focusId("test", test.id))}"
                title="${h(test.status === "测试成功" ? "点击改回未测试" : "点击标记测试成功")}"
              >
                <span aria-hidden="true">${test.status === "测试成功" ? "✓" : "□"}</span>
                ${h(test.name || test.testType)}${test.status === "测试失败" ? " · 失败" : ""}${test.status === "不适用" ? " · 不适用" : ""}${test.isRequired ? "" : " · 非必需"}
              </button>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderGateList(req, branch) {
    const gates = branch.gates || [];
    if (!gates.length) return "";
    return `
      <div>
        <div class="meta-line">${gates.map((gate) => renderGatePill(gate.status, gate.name)).join("")}</div>
        <table class="mini-table">
          <tbody>
            ${gates
              .map(
                (gate) => `
                  <tr id="${h(focusId("gate", gate.id))}">
                    <td>${h(gate.name || "门禁")}${gate.isCurrent ? ` <span class="tag">当前</span>` : ""}</td>
                    <td>${renderGatePill(gate.status)}</td>
                    <td>${gate.failureReason ? h(gate.failureReason) : h(formatDateTime(gate.completedAt || gate.triggeredAt))}</td>
                    <td>
                      <div class="compact-actions">
                        ${gate.gateUrl ? `<button type="button" data-action="open-url" data-url="${h(gate.gateUrl)}">打开</button>` : ""}
                        <button type="button" data-action="edit-gate" data-id="${req.id}" data-branch-id="${branch.id}" data-gate-id="${gate.id}">编辑</button>
                      </div>
                    </td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderGatePill(status, name = "") {
    const cls = status === "通过" || status === "不适用" ? "gate-pass" : status === "失败" ? "gate-fail" : status === "运行中" ? "gate-running" : "status-pill";
    return `<span class="pill ${cls}">${name ? `${h(name)} · ` : ""}${h(status || "未触发")}</span>`;
  }

  function renderIssues(req) {
    if (!req.issues?.length) return `<div class="empty-state">暂无问题单。</div>`;
    return `
      <table class="mini-table">
        <thead><tr><th>问题单</th><th>状态</th><th>阻塞</th><th>操作</th></tr></thead>
        <tbody>
          ${req.issues
            .map(
              (issue) => `
                <tr>
                  <td>
                    <strong>${h(issue.title || issue.issueNo || "未命名问题单")}</strong>
                    <div class="meta-line">
                      ${issue.issueNo ? `<span>${h(issue.issueNo)}</span>` : ""}
                      ${issue.issueType ? `<span class="tag">${h(issue.issueType)}</span>` : ""}
                    </div>
                  </td>
                  <td><span class="pill status-pill">${h(issue.status)}</span></td>
                  <td>${issue.isBlocking ? `<span class="pill risk-blocked">是</span>` : `<span class="tag">否</span>`}</td>
                  <td>
                    <div class="compact-actions">
                      ${issue.issueUrl ? `<button type="button" data-action="open-url" data-url="${h(issue.issueUrl)}">打开</button>` : ""}
                      <button type="button" data-action="edit-issue" data-id="${req.id}" data-issue-id="${issue.id}">编辑</button>
                    </div>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderLogs(req) {
    const logs = (req.logs || []).slice().sort((a, b) => (b.completedAt || b.createdAt || "").localeCompare(a.completedAt || a.createdAt || ""));
    if (!logs.length) return `<div class="empty-state">暂无完成记录。</div>`;
    return `
      <div class="timeline">
        ${logs
          .map(
            (log) => `
              <div class="timeline-item">
                <div class="timeline-head">
                  <time>${h(formatDateTime(log.completedAt || log.createdAt))} · ${h(log.logType || "其他")}</time>
                  <button type="button" class="text-btn danger-text" data-action="delete-log" data-id="${req.id}" data-log-id="${log.id}">删除</button>
                </div>
                <div>${h(log.content)}</div>
                ${log.relatedUrl ? `<a href="${h(safeHref(log.relatedUrl))}" target="_blank" rel="noreferrer">相关链接</a>` : ""}
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function handleContentClick(event) {
    if (event.target.closest("[data-no-row]")) return;
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (["select-req", "edit-req", "add-action", "archive-req", "restore-req"].includes(action)) {
      event.preventDefault();
      event.stopPropagation();
    }
    dispatchAction(button);
  }

  function handleContentChange(event) {
    const select = event.target.closest("[data-inline-status]");
    if (!select) return;
    const req = findRequirement(select.dataset.inlineStatus);
    if (!req) return;
    updateRequirementStatus(req, select.value);
  }

  function handleDetailClick(event) {
    event.stopPropagation();
    const button = event.target.closest("[data-action]");
    if (!button) return;
    event.preventDefault();
    dispatchAction(button);
  }

  function handleOutsideDetailClick(event) {
    if (!state.ui.detailOpen || dom.modalHost.contains(event.target) || dom.detailPanel.contains(event.target)) return;
    const actionEl = event.target.closest("[data-action]");
    if (actionEl && ["select-req", "todo-jump"].includes(actionEl.dataset.action)) return;
    closeDetail();
  }

  function dispatchAction(el) {
    const action = el.dataset.action;
    if (action === "close-detail") return closeDetail();
    const req = findRequirement(el.dataset.id);
    if (action === "select-req" || action === "todo-jump") return selectRequirement(el.dataset.id, el.dataset.focusTarget || "");
    if (action === "open-url") return openUrl(el.dataset.url);
    if (!req && action !== "select-req") return;

    const branch = req ? findBranch(req, el.dataset.branchId) : null;
    const pr = branch ? findPr(branch, el.dataset.prId) : null;
    const test = pr ? findTest(pr, el.dataset.testId) : null;
    const gate = branch ? findGate(branch, el.dataset.gateId) : null;
    const issue = req ? findIssue(req, el.dataset.issueId) : null;
    const actionItem = req ? findAction(req, el.dataset.actionId) : null;
    const log = req ? findLog(req, el.dataset.logId) : null;

    const handlers = {
      "edit-req": () => openRequirementForm(req),
      "duplicate-req": () => duplicateRequirement(req),
      "complete-req": () => completeRequirement(req),
      "archive-req": () => archiveRequirement(req, true),
      "restore-req": () => archiveRequirement(req, false),
      "delete-req": () => deleteRequirement(req),
      "add-action": () => openActionForm(req),
      "edit-action": () => openActionForm(req, actionItem),
      "finish-action": () => finishAction(req, actionItem),
      "add-branch": () => openBranchForm(req),
      "edit-branch": () => openBranchForm(req, branch),
      "add-pr": () => openPrForm(req, branch),
      "edit-pr": () => openPrForm(req, branch, pr),
      "merge-pr": () => mergePr(req, branch, pr),
      "unmerge-pr": () => unmergePr(req, branch, pr),
      "add-test": () => openTestForm(req, branch, pr),
      "edit-test": () => openTestForm(req, branch, pr, test),
      "toggle-test-success": () => toggleTestSuccess(req, branch, pr, test),
      "complete-pr-tests": () => completePrTests(req, branch, pr),
      "add-gate": () => openGateForm(req, branch),
      "edit-gate": () => openGateForm(req, branch, gate),
      "export-branch-pr-links": () => exportBranchPrLinks(req, branch),
      "add-issue": () => openIssueForm(req),
      "edit-issue": () => openIssueForm(req, issue),
      "add-log": () => openLogForm(req),
      "delete-log": () => deleteLog(req, log),
    };
    handlers[action]?.();
  }

  function selectRequirement(id, focusTarget = "") {
    state.ui.selectedId = id;
    state.ui.detailOpen = true;
    state.ui.focusTarget = focusTarget;
    render();
    persistSoon();
  }

  function closeDetail() {
    state.ui.detailOpen = false;
    state.ui.focusTarget = "";
    render();
    persistSoon();
  }

  function focusId(kind, id) {
    return `focus-${kind}-${id}`;
  }

  function focusPendingDetailTarget() {
    const targetId = state.ui.focusTarget;
    if (!targetId) return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("focus-flash");
      window.setTimeout(() => target.classList.remove("focus-flash"), 1400);
      state.ui.focusTarget = "";
      persistSoon();
    });
  }

  function openRequirementForm(req = null) {
    const values = req
      ? {
          ...req,
          tags: (req.tags || []).join(", "),
          nextAction: getPrimaryAction(req)?.content || "",
        }
      : {
          title: "",
          requirementNo: "",
          projectName: "",
          versionName: "",
          iterationName: "",
          source: "",
          priority: "P2",
          status: "待分析",
          progress: "",
          plannedStartAt: "",
          plannedEndAt: "",
          description: "",
          acceptanceCriteria: "",
          tags: "",
          isBlocked: false,
          blockedReason: "",
          nextAction: "",
        };

    openForm({
      title: req ? "编辑需求" : "新增需求",
      fields: [
        field("title", "需求名称", "text", { required: true, full: true }),
        field("requirementNo", "需求编号"),
        field("projectName", "所属项目"),
        field("versionName", "所属版本"),
        field("iterationName", "迭代或周次"),
        field("source", "需求来源"),
        field("priority", "优先级", "select", { options: PRIORITIES, labeler: (value) => PRIORITY_LABEL[value] }),
        field("status", "当前状态", "select", { options: REQUIREMENT_STATUSES }),
        field("progress", "手动进度(0-100)", "number"),
        field("plannedStartAt", "计划开始", "date"),
        field("plannedEndAt", "计划完成", "date"),
        field("tags", "标签，逗号分隔"),
        field("nextAction", "当前下一步动作", "textarea", { full: true }),
        field("description", "需求说明", "textarea", { full: true }),
        field("acceptanceCriteria", "验收标准", "textarea", { full: true }),
        field("isBlocked", "标记为阻塞", "checkbox"),
        field("blockedReason", "阻塞原因", "textarea", { full: true }),
      ],
      values,
      onSubmit: (form) => {
        if (form.isBlocked && !form.blockedReason.trim()) {
          toast("阻塞需求需要填写阻塞原因。");
          return false;
        }
        const now = nowIso();
        if (req) {
          const oldStatus = req.status;
          Object.assign(req, mapRequirementForm(form));
          syncRequirementDerivedFields(req, oldStatus);
          upsertPrimaryActionFromRequirement(req, form.nextAction);
          touchRequirement(req);
          addSystemLog(req, "需求确认", "更新需求信息。");
          toast("需求已更新。");
        } else {
          const newReq = {
            id: uid("req"),
            ...mapRequirementForm(form),
            completedAt: "",
            isArchived: false,
            archivedAt: "",
            actions: [],
            logs: [],
            branches: createDefaultBranches(),
            issues: [],
            createdAt: now,
            updatedAt: now,
          };
          syncRequirementDerivedFields(newReq, "");
          upsertPrimaryActionFromRequirement(newReq, form.nextAction);
          addSystemLog(newReq, "需求确认", "创建需求。");
          state.requirements.unshift(newReq);
          state.ui.selectedId = newReq.id;
          state.ui.detailOpen = true;
          toast("需求已创建。");
        }
        commit();
        return true;
      },
    });
  }

  function mapRequirementForm(form) {
    return {
      title: form.title.trim(),
      requirementNo: form.requirementNo.trim(),
      projectName: form.projectName.trim(),
      versionName: form.versionName.trim(),
      iterationName: form.iterationName.trim(),
      source: form.source.trim(),
      priority: form.priority,
      status: form.status,
      progress: normalizeProgress(form.progress),
      plannedStartAt: form.plannedStartAt,
      plannedEndAt: form.plannedEndAt,
      description: form.description.trim(),
      acceptanceCriteria: form.acceptanceCriteria.trim(),
      tags: splitTags(form.tags),
      isBlocked: Boolean(form.isBlocked),
      blockedReason: form.isBlocked ? form.blockedReason.trim() : "",
    };
  }

  function openActionForm(req, action = null) {
    const values = action || {
      content: "",
      status: "待处理",
      priority: req.priority || "P2",
      owner: "本人",
      startedAt: nowLocalInput(),
      plannedEndAt: req.plannedEndAt || "",
      isPrimary: !getPrimaryAction(req),
      isBlocked: false,
      blockedReason: "",
      relatedUrl: "",
      note: "",
    };
    openForm({
      title: action ? "编辑下一步动作" : "新增下一步动作",
      fields: [
        field("content", "动作内容", "textarea", { required: true, full: true }),
        field("status", "状态", "select", { options: ACTION_STATUSES }),
        field("priority", "优先级", "select", { options: PRIORITIES, labeler: (value) => PRIORITY_LABEL[value] }),
        field("owner", "负责人"),
        field("startedAt", "开始时间", "datetime-local"),
        field("plannedEndAt", "目标完成时间（可调整）", "date"),
        field("relatedUrl", "相关链接"),
        field("isPrimary", "设为当前主要动作", "checkbox"),
        field("isBlocked", "动作阻塞", "checkbox"),
        field("blockedReason", "阻塞原因", "textarea", { full: true }),
        field("note", "备注", "textarea", { full: true }),
      ],
      values,
      onSubmit: (form) => {
        if (form.isBlocked && !form.blockedReason.trim()) {
          toast("阻塞动作需要填写阻塞原因。");
          return false;
        }
        if (form.isPrimary) req.actions.forEach((item) => (item.isPrimary = false));
        const payload = {
          content: form.content.trim(),
          status: form.status,
          priority: form.priority,
          owner: form.owner.trim() || "本人",
          startedAt: localInputToIso(form.startedAt || nowLocalInput()),
          plannedEndAt: form.plannedEndAt,
          completedAt: form.status === "已完成" ? action?.completedAt || nowIso() : "",
          isPrimary: Boolean(form.isPrimary),
          isBlocked: Boolean(form.isBlocked),
          blockedReason: form.isBlocked ? form.blockedReason.trim() : "",
          relatedUrl: form.relatedUrl.trim(),
          note: form.note.trim(),
          updatedAt: nowIso(),
        };
        if (action) {
          Object.assign(action, payload);
        } else {
          req.actions.push({ id: uid("act"), ...payload, createdAt: nowIso() });
        }
        touchRequirement(req);
        commit();
        toast("动作已保存。");
        return true;
      },
      dangerAction: action
        ? {
            label: "删除动作",
            onClick: () => deleteAction(req, action),
          }
        : null,
    });
  }

  function openBranchForm(req, branch = null) {
    const values = branch || {
      name: "",
      branchType: "Dev分支",
      repositoryName: "",
      repositoryUrl: "",
      sourceBranch: "",
      targetBranch: "",
      status: "未开始",
      isRequired: true,
      sortOrder: (req.branches || []).length + 1,
      description: "",
    };
    openForm({
      title: branch ? "编辑分支" : "新增分支",
      fields: [
        field("name", "分支名称", "text", { required: true }),
        field("branchType", "分支类型", "select", { options: BRANCH_TYPES }),
        field("status", "分支状态", "select", { options: BRANCH_STATUSES }),
        field("sortOrder", "排序", "number"),
        field("repositoryName", "所属仓库"),
        field("repositoryUrl", "仓库链接"),
        field("sourceBranch", "源分支"),
        field("targetBranch", "目标分支"),
        field("isRequired", "必需分支", "checkbox"),
        field("description", "分支说明", "textarea", { full: true }),
      ],
      values,
      onSubmit: (form) => {
        const payload = {
          name: form.name.trim(),
          branchType: form.branchType,
          repositoryName: form.repositoryName.trim(),
          repositoryUrl: form.repositoryUrl.trim(),
          sourceBranch: form.sourceBranch.trim(),
          targetBranch: form.targetBranch.trim(),
          status: form.status,
          isRequired: Boolean(form.isRequired),
          sortOrder: Number(form.sortOrder || 0),
          description: form.description.trim(),
          updatedAt: nowIso(),
        };
        if (branch) {
          Object.assign(branch, payload);
        } else {
          req.branches.push({ id: uid("br"), ...payload, prs: [], gates: [], createdAt: nowIso() });
        }
        touchRequirement(req);
        commit();
        toast("分支已保存。");
        return true;
      },
      dangerAction: branch
        ? {
            label: "删除分支",
            onClick: () => deleteBranch(req, branch),
          }
        : null,
    });
  }

  function openPrForm(req, branch, pr = null, seed = {}) {
    if (!branch) return toast("请先选择或新增分支。");
    const values = pr || {
      title: seed.title || "",
      prNo: "",
      prUrl: seed.prUrl || "",
      repositoryName: branch.repositoryName || "",
      sourceBranch: branch.sourceBranch || "",
      targetBranch: branch.targetBranch || "",
      status: "已创建",
      isRequired: true,
      isMerged: false,
      mergedAt: "",
      mergeCommitId: "",
      reviewer: "",
      note: "",
    };
    openForm({
      title: pr ? "编辑PR" : "新增PR",
      fields: [
        field("title", "PR标题", "text", { required: true, full: true }),
        field("prNo", "PR编号"),
        field("prUrl", "PR链接", "url", { required: true, full: true }),
        field("repositoryName", "代码仓库"),
        field("sourceBranch", "源分支"),
        field("targetBranch", "目标分支"),
        field("status", "PR状态", "select", { options: PR_STATUSES }),
        field("reviewer", "评审人"),
        field("isRequired", "必需PR", "checkbox"),
        field("mergedAt", "合入时间", "datetime-local"),
        field("mergeCommitId", "合入Commit ID"),
        field("note", "备注", "textarea", { full: true }),
      ],
      values,
      onSubmit: (form) => {
        const isMerged = form.status === "已合入";
        const payload = {
          title: form.title.trim(),
          prNo: form.prNo.trim(),
          prUrl: form.prUrl.trim(),
          repositoryName: form.repositoryName.trim(),
          sourceBranch: form.sourceBranch.trim(),
          targetBranch: form.targetBranch.trim(),
          status: form.status,
          isRequired: Boolean(form.isRequired),
          isMerged,
          mergedAt: isMerged ? form.mergedAt || nowLocalInput() : "",
          mergeCommitId: isMerged ? form.mergeCommitId.trim() : "",
          reviewer: form.reviewer.trim(),
          note: form.note.trim(),
          updatedAt: nowIso(),
        };
        if (pr) {
          const wasMerged = pr.isMerged;
          Object.assign(pr, payload);
          if (!wasMerged && pr.isMerged) addSystemLog(req, "PR合入", `PR ${pr.title || pr.prNo} 已合入。`, pr.prUrl);
          if (wasMerged && !pr.isMerged) addSystemLog(req, "PR更新", `PR ${pr.title || pr.prNo} 已恢复为未合入。`, pr.prUrl);
        } else {
          const created = { id: uid("pr"), ...payload, tests: createDefaultTests(), createdAt: nowIso() };
          branch.prs.push(created);
          addSystemLog(req, "PR创建", `创建PR：${created.title || created.prNo}。`, created.prUrl);
        }
        recalcBranchStatus(branch);
        touchRequirement(req);
        commit();
        toast("PR已保存。");
        return true;
      },
      dangerAction: pr
        ? {
            label: "删除PR",
            onClick: () => deletePr(req, branch, pr),
          }
        : null,
    });
  }

  function openTestForm(req, branch, pr, test = null) {
    if (!pr) return toast("请先选择或新增PR。");
    const values = test || {
      testType: "单元测试",
      name: "",
      status: "未测试",
      isRequired: true,
      tester: "",
      environment: "",
      version: "",
      resultSummary: "",
      resultUrl: "",
      logUrl: "",
      failureReason: "",
      solution: "",
    };
    openForm({
      title: test ? "编辑测试项" : "新增测试项",
      fields: [
        field("testType", "测试类型", "select", { options: TEST_TYPES }),
        field("name", "测试名称"),
        field("status", "测试状态", "select", { options: TEST_STATUSES }),
        field("tester", "测试人员"),
        field("environment", "测试环境"),
        field("version", "测试版本"),
        field("isRequired", "必需测试", "checkbox"),
        field("resultSummary", "结果说明", "textarea", { full: true }),
        field("resultUrl", "结果/报告链接", "url", { full: true }),
        field("logUrl", "日志链接", "url", { full: true }),
        field("failureReason", "失败原因", "textarea", { full: true }),
        field("solution", "解决方案", "textarea", { full: true }),
      ],
      values,
      onSubmit: (form) => {
        if (form.status === "测试失败" && !form.failureReason.trim()) {
          toast("测试失败时需要填写失败原因。");
          return false;
        }
        const oldStatus = test?.status || "";
        const completed = isTestCompletedStatus(form.status);
        const started = form.status === "测试中" || completed;
        const payload = {
          testType: form.testType,
          name: form.name.trim() || form.testType,
          status: form.status,
          isRequired: form.status === "不适用" ? false : Boolean(form.isRequired),
          tester: form.tester.trim(),
          environment: form.environment.trim(),
          version: form.version.trim(),
          resultSummary: form.resultSummary.trim(),
          resultUrl: form.resultUrl.trim(),
          logUrl: form.logUrl.trim(),
          failureReason: form.status === "测试失败" ? form.failureReason.trim() : "",
          solution: form.status === "测试失败" ? form.solution.trim() : "",
          startedAt: started ? test?.startedAt || nowIso() : "",
          completedAt: completed ? (oldStatus === form.status && test?.completedAt ? test.completedAt : nowIso()) : "",
          updatedAt: nowIso(),
        };
        if (test) {
          Object.assign(test, payload);
          recordTestExecution(test, oldStatus);
        } else {
          const created = {
            id: uid("test"),
            ...payload,
            retryCount: 0,
            executions: [],
            createdAt: nowIso(),
          };
          recordTestExecution(created, "");
          pr.tests.push(created);
        }
        if (payload.status === "测试成功" && oldStatus !== "测试成功") {
          addSystemLog(req, "测试完成", `${pr.title || pr.prNo} 的 ${payload.name} 测试成功。`, payload.resultUrl);
        }
        recalcBranchStatus(branch);
        touchRequirement(req);
        commit();
        toast("测试项已保存。");
        return true;
      },
      dangerAction: test
        ? {
            label: "删除测试项",
            onClick: () => deleteTest(req, branch, pr, test),
          }
        : null,
    });
  }

  function openGateForm(req, branch, gate = null) {
    if (!branch) return toast("请先选择或新增分支。");
    const prOptions = ["", ...(branch.prs || []).map((pr) => pr.id)];
    const values = gate || {
      name: "",
      gateUrl: "",
      pullRequestId: "",
      status: "未触发",
      triggeredAt: "",
      completedAt: "",
      failureReason: "",
      logUrl: "",
      isCurrent: !(branch.gates || []).some((item) => item.isCurrent),
      note: "",
    };
    openForm({
      title: gate ? "编辑门禁记录" : "新增门禁记录",
      fields: [
        field("name", "门禁名称", "text", { required: true }),
        field("status", "门禁状态", "select", { options: GATE_STATUSES }),
        field("gateUrl", "门禁链接", "url", { full: true }),
        field("pullRequestId", "关联PR", "select", {
          options: prOptions,
          labeler: (id) => (id ? findPr(branch, id)?.title || findPr(branch, id)?.prNo || id : "不关联PR"),
        }),
        field("triggeredAt", "触发时间", "datetime-local"),
        field("completedAt", "完成时间", "datetime-local"),
        field("failureReason", "失败原因", "textarea", { full: true }),
        field("logUrl", "日志链接", "url", { full: true }),
        field("isCurrent", "设为当前门禁", "checkbox"),
        field("note", "备注", "textarea", { full: true }),
      ],
      values,
      onSubmit: (form) => {
        if (form.status === "失败" && !form.failureReason.trim()) {
          toast("门禁失败时需要填写失败原因。");
          return false;
        }
        const oldStatus = gate?.status || "";
        const completed = isGateCompletedStatus(form.status);
        const triggered = form.status !== "未触发";
        if (form.isCurrent) branch.gates.forEach((item) => (item.isCurrent = false));
        const payload = {
          name: form.name.trim(),
          gateUrl: form.gateUrl.trim(),
          pullRequestId: form.pullRequestId,
          status: form.status,
          triggeredAt: triggered ? form.triggeredAt || gate?.triggeredAt || nowLocalInput() : "",
          completedAt: completed ? form.completedAt || (oldStatus === form.status ? gate?.completedAt : "") || nowLocalInput() : "",
          failureReason: form.status === "失败" ? form.failureReason.trim() : "",
          logUrl: form.logUrl.trim(),
          isCurrent: Boolean(form.isCurrent),
          note: form.note.trim(),
          updatedAt: nowIso(),
        };
        if (gate) {
          Object.assign(gate, payload);
        } else {
          branch.gates.push({ id: uid("gate"), ...payload, createdAt: nowIso() });
        }
        if (payload.status === "通过" && oldStatus !== "通过") addSystemLog(req, "门禁通过", `${branch.name} 门禁通过。`, payload.gateUrl);
        recalcBranchStatus(branch);
        touchRequirement(req);
        commit();
        toast("门禁记录已保存。");
        return true;
      },
      dangerAction: gate
        ? {
            label: "删除门禁",
            onClick: () => deleteGate(req, branch, gate),
          }
        : null,
    });
  }

  function openIssueForm(req, issue = null) {
    const values = issue || {
      title: "",
      issueNo: "",
      issueUrl: "",
      issueType: "需求单",
      status: "待创建",
      isBlocking: false,
      plannedCloseAt: "",
      closedAt: "",
      resolution: "",
      note: "",
    };
    openForm({
      title: issue ? "编辑问题单" : "新增问题单",
      fields: [
        field("title", "问题单标题", "text", { required: true, full: true }),
        field("issueNo", "问题单编号"),
        field("issueType", "问题类型", "select", { options: ISSUE_TYPES }),
        field("status", "问题单状态", "select", { options: ISSUE_STATUSES }),
        field("issueUrl", "问题单链接", "url", { full: true }),
        field("isBlocking", "阻塞需求", "checkbox"),
        field("plannedCloseAt", "计划关闭", "date"),
        field("closedAt", "实际关闭", "date"),
        field("resolution", "处理结论", "textarea", { full: true }),
        field("note", "备注", "textarea", { full: true }),
      ],
      values,
      onSubmit: (form) => {
        const closed = isIssueClosedStatus(form.status);
        const payload = {
          title: form.title.trim(),
          issueNo: form.issueNo.trim(),
          issueUrl: form.issueUrl.trim(),
          issueType: form.issueType,
          status: form.status,
          isBlocking: Boolean(form.isBlocking),
          plannedCloseAt: form.plannedCloseAt,
          closedAt: closed ? form.closedAt || todayDate() : "",
          resolution: form.resolution.trim(),
          note: form.note.trim(),
          updatedAt: nowIso(),
        };
        if (issue) {
          Object.assign(issue, payload);
        } else {
          req.issues.push({ id: uid("issue"), ...payload, createdAt: nowIso() });
        }
        touchRequirement(req);
        commit();
        toast("问题单已保存。");
        return true;
      },
      dangerAction: issue
        ? {
            label: "删除问题单",
            onClick: () => deleteIssue(req, issue),
          }
        : null,
    });
  }

  function openLogForm(req) {
    openForm({
      title: "新增完成记录",
      fields: [
        field("logType", "记录类型", "select", { options: LOG_TYPES }),
        field("completedAt", "完成时间", "datetime-local"),
        field("content", "完成内容", "textarea", { required: true, full: true }),
        field("relatedUrl", "相关链接", "url", { full: true }),
      ],
      values: {
        logType: "其他",
        completedAt: nowLocalInput(),
        content: "",
        relatedUrl: "",
      },
      onSubmit: (form) => {
        req.logs.push({
          id: uid("log"),
          logType: form.logType,
          content: form.content.trim(),
          relatedUrl: form.relatedUrl.trim(),
          completedAt: localInputToIso(form.completedAt),
          createdAt: nowIso(),
        });
        touchRequirement(req);
        commit();
        toast("完成记录已保存。");
        return true;
      },
    });
  }

  function openForm({ title, fields, values, onSubmit, dangerAction = null }) {
    const formId = uid("form");
    dom.modalHost.hidden = false;
    dom.modalHost.innerHTML = `
      <form id="${formId}" class="modal-card">
        <div class="modal-head">
          <h2>${h(title)}</h2>
          <button type="button" data-modal-close aria-label="关闭">关闭</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            ${fields.map((item) => renderField(item, values?.[item.name])).join("")}
          </div>
        </div>
        <div class="modal-foot">
          <div class="modal-left-actions">
            ${dangerAction ? `<button type="button" class="danger-ghost" data-modal-danger>${h(dangerAction.label)}</button>` : ""}
            <span class="hint">带星号字段为必填，保存后会自动写入本地数据。</span>
          </div>
          <div class="compact-actions">
            <button type="button" data-modal-close>取消</button>
            <button type="submit" class="primary-btn">保存</button>
          </div>
        </div>
      </form>
    `;
    const form = document.getElementById(formId);
    dom.modalHost.querySelectorAll("[data-modal-close]").forEach((button) => button.addEventListener("click", closeModal));
    dom.modalHost.querySelector("[data-modal-danger]")?.addEventListener("click", () => {
      const success = dangerAction?.onClick?.();
      if (success !== false) closeModal();
    });
    dom.modalHost.addEventListener("click", (event) => {
      if (event.target === dom.modalHost) closeModal();
    }, { once: true });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = collectForm(form, fields);
      const success = onSubmit(payload);
      if (success !== false) closeModal();
    });
    const first = form.querySelector("input:not([type='checkbox']), textarea, select");
    first?.focus();
  }

  function renderField(item, value) {
    const full = item.full || item.type === "textarea" ? " full" : "";
    const required = item.required ? " required" : "";
    const label = `${h(item.label)}${item.required ? " *" : ""}`;
    const val = value ?? "";
    if (item.type === "select") {
      return `
        <label class="${full}">
          ${label}
          <select name="${h(item.name)}"${required}>
            ${(item.options || []).map((option) => `<option value="${h(option)}" ${String(option) === String(val) ? "selected" : ""}>${h(item.labeler ? item.labeler(option) : option)}</option>`).join("")}
          </select>
        </label>
      `;
    }
    if (item.type === "textarea") {
      return `
        <label class="${full}">
          ${label}
          <textarea name="${h(item.name)}"${required}>${h(val)}</textarea>
        </label>
      `;
    }
    if (item.type === "checkbox") {
      return `
        <label class="checkbox-field${full}">
          <input name="${h(item.name)}" type="checkbox" ${val ? "checked" : ""} />
          ${label}
        </label>
      `;
    }
    return `
      <label class="${full}">
        ${label}
        <input name="${h(item.name)}" type="${h(item.type || "text")}" value="${h(formatInputValue(item.type, val))}"${required} />
      </label>
    `;
  }

  function collectForm(form, fields) {
    const result = {};
    fields.forEach((item) => {
      const node = form.elements[item.name];
      result[item.name] = item.type === "checkbox" ? Boolean(node.checked) : node.value;
    });
    return result;
  }

  function field(name, label, type = "text", options = {}) {
    return { name, label, type, ...options };
  }

  function closeModal() {
    dom.modalHost.hidden = true;
    dom.modalHost.innerHTML = "";
  }

  function finishAction(req, action) {
    if (!action) return;
    action.status = "已完成";
    action.completedAt = nowIso();
    action.updatedAt = nowIso();
    action.isPrimary = false;
    addSystemLog(req, "其他", `完成动作：${action.content}。`, action.relatedUrl);
    touchRequirement(req);
    commit();
    toast("动作已标记完成。");
  }

  function updateRequirementStatus(req, nextStatus) {
    const old = req.status;
    req.status = nextStatus;
    if (nextStatus === "已完成" && old !== "已完成") {
      req.completedAt = nowIso();
      addSystemLog(req, "需求确认", "需求标记为已完成。");
    }
    if (old === "已完成" && nextStatus !== "已完成") {
      req.completedAt = "";
    }
    touchRequirement(req);
    commit();
    toast("需求状态已更新。");
  }

  function completeRequirement(req) {
    const ready = canCompleteRequirement(req);
    const message = ready
      ? "该需求满足建议完成条件，确认标记为已完成？"
      : "该需求仍存在未完成项，仍要手动标记为已完成吗？";
    if (!window.confirm(message)) return;
    updateRequirementStatus(req, "已完成");
  }

  function archiveRequirement(req, archived) {
    req.isArchived = archived;
    req.archivedAt = archived ? nowIso() : "";
    touchRequirement(req);
    commit();
    toast(archived ? "需求已归档。" : "需求已恢复。");
  }

  function deleteRequirement(req) {
    if (!window.confirm(`确认删除需求「${req.title}」？此操作不可恢复。`)) return;
    if (!window.confirm("请再次确认删除。建议先导出备份。")) return;
    state.requirements = state.requirements.filter((item) => item.id !== req.id);
    if (state.ui.selectedId === req.id) state.ui.selectedId = state.requirements[0]?.id || null;
    if (!state.ui.selectedId) state.ui.detailOpen = false;
    commit();
    toast("需求已删除。");
  }

  function deleteAction(req, action) {
    if (!action) return false;
    if (!window.confirm(`确认删除动作「${action.content || "未命名动作"}」？`)) return false;
    req.actions = (req.actions || []).filter((item) => item.id !== action.id);
    touchRequirement(req);
    commit();
    toast("动作已删除。");
    return true;
  }

  function deleteBranch(req, branch) {
    if (!branch) return false;
    const prCount = (branch.prs || []).length;
    const gateCount = (branch.gates || []).length;
    const suffix = prCount || gateCount ? `，同时删除 ${prCount} 个PR和 ${gateCount} 条门禁记录` : "";
    if (!window.confirm(`确认删除分支「${branch.name || "未命名分支"}」${suffix}？`)) return false;
    req.branches = (req.branches || []).filter((item) => item.id !== branch.id);
    touchRequirement(req);
    commit();
    toast("分支已删除。");
    return true;
  }

  function deletePr(req, branch, pr) {
    if (!branch || !pr) return false;
    const testCount = (pr.tests || []).length;
    const suffix = testCount ? `，同时删除 ${testCount} 个测试项` : "";
    if (!window.confirm(`确认删除PR「${pr.title || pr.prNo || "未命名PR"}」${suffix}？`)) return false;
    branch.prs = (branch.prs || []).filter((item) => item.id !== pr.id);
    recalcBranchStatus(branch);
    touchRequirement(req);
    commit();
    toast("PR已删除。");
    return true;
  }

  function deleteGate(req, branch, gate) {
    if (!branch || !gate) return false;
    if (!window.confirm(`确认删除门禁「${gate.name || "未命名门禁"}」？`)) return false;
    branch.gates = (branch.gates || []).filter((item) => item.id !== gate.id);
    recalcBranchStatus(branch);
    touchRequirement(req);
    commit();
    toast("门禁已删除。");
    return true;
  }

  function deleteIssue(req, issue) {
    if (!issue) return false;
    if (!window.confirm(`确认删除问题单「${issue.title || issue.issueNo || "未命名问题单"}」？`)) return false;
    req.issues = (req.issues || []).filter((item) => item.id !== issue.id);
    touchRequirement(req);
    commit();
    toast("问题单已删除。");
    return true;
  }

  function deleteLog(req, log) {
    if (!log) return;
    if (!window.confirm("确认删除这条完成记录？")) return;
    req.logs = (req.logs || []).filter((item) => item.id !== log.id);
    touchRequirement(req);
    commit();
    toast("完成记录已删除。");
  }

  function duplicateRequirement(req) {
    const copy = deepClone(req);
    const now = nowIso();
    reidRequirement(copy);
    copy.title = `${copy.title} - 副本`;
    copy.status = "待分析";
    copy.completedAt = "";
    copy.isArchived = false;
    copy.archivedAt = "";
    copy.createdAt = now;
    copy.updatedAt = now;
    addSystemLog(copy, "需求确认", "复制需求。");
    state.requirements.unshift(copy);
    state.ui.selectedId = copy.id;
    state.ui.detailOpen = true;
    commit();
    toast("需求已复制。");
  }

  function mergePr(req, branch, pr) {
    if (!pr) return;
    pr.status = "已合入";
    pr.isMerged = true;
    pr.mergedAt = pr.mergedAt || nowLocalInput();
    pr.updatedAt = nowIso();
    addSystemLog(req, "PR合入", `PR ${pr.title || pr.prNo} 已合入。`, pr.prUrl);
    recalcBranchStatus(branch);
    touchRequirement(req);
    commit();
    toast("PR已标记合入。");
  }

  function unmergePr(req, branch, pr) {
    if (!pr) return;
    pr.status = "待合入";
    pr.isMerged = false;
    pr.mergedAt = "";
    pr.mergeCommitId = "";
    pr.updatedAt = nowIso();
    addSystemLog(req, "PR更新", `取消PR合入标记：${pr.title || pr.prNo}。`, pr.prUrl);
    recalcBranchStatus(branch);
    touchRequirement(req);
    commit();
    toast("PR已恢复为未合入。");
  }

  function deleteTest(req, branch, pr, test) {
    if (!pr || !test) return false;
    const name = test.name || test.testType || "测试项";
    if (!window.confirm(`确认删除测试项「${name}」？`)) return false;
    pr.tests = (pr.tests || []).filter((item) => item.id !== test.id);
    if (branch) recalcBranchStatus(branch);
    touchRequirement(req);
    commit();
    toast("测试项已删除。");
    return true;
  }

  function toggleTestSuccess(req, branch, pr, test) {
    if (!test) return;
    const oldStatus = test.status || "";
    if (test.status === "测试成功") {
      test.status = "未测试";
      test.startedAt = "";
      test.completedAt = "";
      test.resultSummary = "";
    } else {
      markTestSuccess(test, oldStatus);
    }
    test.failureReason = "";
    test.solution = "";
    test.updatedAt = nowIso();
    recordTestExecution(test, oldStatus);
    recalcBranchStatus(branch);
    touchRequirement(req);
    commit();
    toast(test.status === "测试成功" ? "测试已标记成功。" : "测试已改回未测试。");
  }

  function completePrTests(req, branch, pr) {
    if (!pr) return;
    if (!Array.isArray(pr.tests) || !pr.tests.length) pr.tests = createDefaultTests();
    let changed = 0;
    pr.tests.forEach((test) => {
      if (test.status === "测试成功") return;
      const oldStatus = test.status || "";
      markTestSuccess(test, oldStatus);
      recordTestExecution(test, oldStatus);
      changed += 1;
    });
    if (!changed) return toast("该PR测试已全部成功。");
    addSystemLog(req, "测试完成", `${pr.title || pr.prNo || "PR"} 的测试已全部标记成功。`, pr.prUrl);
    recalcBranchStatus(branch);
    touchRequirement(req);
    commit();
    toast("该PR全部测试已标记成功。");
  }

  function markTestSuccess(test, oldStatus = "") {
    test.status = "测试成功";
    test.startedAt = test.startedAt || nowIso();
    test.completedAt = oldStatus === "测试成功" && test.completedAt ? test.completedAt : nowIso();
    test.failureReason = "";
    test.solution = "";
    test.resultSummary = test.resultSummary || "验证通过。";
    test.updatedAt = nowIso();
  }

  function recalcBranchStatus(branch) {
    const counts = computeBranchCounts(branch);
    const gates = branch.gates || [];
    const hasGateFail = gates.some((gate) => gate.status === "失败");
    const gatesOk = !gates.length || gates.every((gate) => ["通过", "不适用", "已取消"].includes(gate.status));
    if (hasGateFail) branch.status = "门禁中";
    else if (counts.requiredPrs && counts.mergedPrs < counts.requiredPrs) branch.status = "待合入";
    else if (counts.requiredTests && counts.okTests < counts.requiredTests) branch.status = "测试中";
    else if (gatesOk && (!counts.requiredPrs || counts.mergedPrs === counts.requiredPrs)) branch.status = "已完成";
  }

  function upsertPrimaryActionFromRequirement(req, content) {
    const trimmed = (content || "").trim();
    if (!trimmed) return;
    let primary = getPrimaryAction(req);
    if (!primary) {
      req.actions.forEach((item) => (item.isPrimary = false));
      primary = {
        id: uid("act"),
        content: trimmed,
        status: "待处理",
        priority: req.priority || "P2",
        owner: "本人",
        startedAt: nowIso(),
        plannedEndAt: req.plannedEndAt || "",
        completedAt: "",
        isPrimary: true,
        isBlocked: false,
        blockedReason: "",
        relatedUrl: "",
        note: "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      req.actions.push(primary);
    } else {
      primary.content = trimmed;
      primary.updatedAt = nowIso();
      if (primary.status === "已完成") primary.status = "待处理";
    }
  }

  function recordTestExecution(test, oldStatus) {
    if (test.status === oldStatus) return;
    if (!test.executions) test.executions = [];
    if (["测试中", "测试成功", "测试失败", "不适用"].includes(test.status)) {
      test.executions.push({
        id: uid("exec"),
        executionNo: test.executions.length + 1,
        status: test.status,
        failureReason: test.failureReason || "",
        resultSummary: test.resultSummary || "",
        resultUrl: test.resultUrl || "",
        logUrl: test.logUrl || "",
        startedAt: test.status === "测试中" ? nowIso() : test.startedAt || nowIso(),
        completedAt: ["测试成功", "测试失败", "不适用"].includes(test.status) ? nowIso() : "",
        createdAt: nowIso(),
      });
      if (test.status === "测试失败") test.retryCount = Number(test.retryCount || 0) + 1;
      if (test.status === "测试中") test.startedAt = test.startedAt || nowIso();
      if (["测试成功", "测试失败", "不适用"].includes(test.status)) test.completedAt = nowIso();
    }
  }

  function addSystemLog(req, logType, content, relatedUrl = "") {
    req.logs = req.logs || [];
    req.logs.push({
      id: uid("log"),
      logType,
      content,
      relatedUrl,
      completedAt: nowIso(),
      createdAt: nowIso(),
    });
  }

  function computeStats() {
    const all = state.requirements;
    const activeReqs = all.filter((req) => !req.isArchived && !["已完成", "已取消"].includes(req.status));
    const stats = {
      activeRequirements: activeReqs.length,
      blockedRequirements: all.filter((req) => !req.isArchived && computeRisk(req).key === "blocked").length,
      pendingActions: 0,
      overdueActions: 0,
      failedPrs: 0,
      waitingMergePrs: 0,
      completedThisWeek: 0,
      archivedRequirements: all.filter((req) => req.isArchived).length,
    };
    const weekStart = startOfWeek();
    all.forEach((req) => {
      (req.actions || []).forEach((action) => {
        if (["待处理", "进行中"].includes(action.status)) stats.pendingActions += 1;
        if (["待处理", "进行中"].includes(action.status) && isPastDate(action.plannedEndAt)) stats.overdueActions += 1;
      });
      if (req.status === "已完成" && req.completedAt && new Date(req.completedAt) >= weekStart) stats.completedThisWeek += 1;
      (req.branches || []).forEach((branch) => {
        (branch.prs || []).forEach((pr) => {
          if ((pr.tests || []).some((test) => test.status === "测试失败")) stats.failedPrs += 1;
          if (pr.isRequired && !pr.isMerged && ["已批准", "待合入"].includes(pr.status)) stats.waitingMergePrs += 1;
        });
      });
    });
    return stats;
  }

  function buildTodos() {
    const items = [];
    state.requirements
      .filter((req) => !req.isArchived && !["已完成", "已取消"].includes(req.status))
      .forEach((req) => {
        const primary = getPrimaryAction(req);
        if (!primary) {
          items.push({ reqId: req.id, title: `${req.title}`, meta: "缺少当前下一步动作", weight: 5, due: "9999-12-31", focusTarget: focusId("section", "actions") });
        } else {
          const actionItem = { reqId: req.id, title: primary.content, due: primary.plannedEndAt || "9999-12-31", focusTarget: focusId("action", primary.id) };
          if (isPastDate(primary.plannedEndAt)) {
            items.push({ ...actionItem, meta: `${req.title} · 动作已逾期`, weight: 1 });
          } else if (primary.plannedEndAt === todayDate()) {
            items.push({ ...actionItem, meta: `${req.title} · 今日到期`, weight: 2 });
          } else if (primary.isBlocked) {
            items.push({ ...actionItem, meta: `${req.title} · 动作阻塞`, weight: 1 });
          }
        }
        (req.branches || []).forEach((branch) => {
          (branch.prs || []).forEach((pr) => {
            (pr.tests || [])
              .filter((test) => test.status === "测试失败")
              .forEach((test) => {
                items.push({
                  reqId: req.id,
                  title: test.name || test.testType || pr.title || "测试失败",
                  meta: `${req.title} · ${branch.name || "分支"} · ${pr.title || pr.prNo || "PR"}`,
                  weight: 1,
                  due: req.plannedEndAt || "9999-12-31",
                  focusTarget: focusId("test", test.id),
                });
              });
            if (pr.isRequired && !pr.isMerged && ["已批准", "待合入"].includes(pr.status)) {
              items.push({
                reqId: req.id,
                title: pr.title || pr.prNo || "PR待合入",
                meta: `${req.title} · ${branch.name || "分支"} · 待合入PR`,
                weight: 3,
                due: req.plannedEndAt || "9999-12-31",
                focusTarget: focusId("pr", pr.id),
              });
            }
          });
          (branch.gates || []).forEach((gate) => {
            if (gate.status === "失败") {
              items.push({
                reqId: req.id,
                title: gate.name || "门禁失败",
                meta: `${req.title} · ${branch.name || "分支"} · 门禁失败待处理`,
                weight: 1,
                due: req.plannedEndAt || "9999-12-31",
                focusTarget: focusId("gate", gate.id),
              });
            }
          });
        });
      });
    return items.sort((a, b) => a.weight - b.weight || (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31") || a.title.localeCompare(b.title));
  }

  function computeCounts(req) {
    const counts = {
      requiredBranches: 0,
      doneBranches: 0,
      requiredPrs: 0,
      mergedPrs: 0,
      requiredTests: 0,
      okTests: 0,
      failedTests: 0,
      failedGates: 0,
    };
    (req.branches || []).forEach((branch) => {
      if (branch.isRequired) {
        counts.requiredBranches += 1;
        if (branch.status === "已完成") counts.doneBranches += 1;
      }
      const branchCounts = computeBranchCounts(branch);
      counts.requiredPrs += branchCounts.requiredPrs;
      counts.mergedPrs += branchCounts.mergedPrs;
      counts.requiredTests += branchCounts.requiredTests;
      counts.okTests += branchCounts.okTests;
      counts.failedTests += branchCounts.failedTests;
      counts.failedGates += (branch.gates || []).filter((gate) => gate.status === "失败").length;
    });
    return counts;
  }

  function computeBranchCounts(branch) {
    const counts = {
      requiredPrs: 0,
      mergedPrs: 0,
      requiredTests: 0,
      okTests: 0,
      failedTests: 0,
    };
    (branch.prs || []).forEach((pr) => {
      if (pr.isRequired) {
        counts.requiredPrs += 1;
        if (pr.isMerged || pr.status === "已合入") counts.mergedPrs += 1;
      }
      (pr.tests || []).forEach((test) => {
        if (test.isRequired) {
          counts.requiredTests += 1;
          if (["测试成功", "不适用"].includes(test.status)) counts.okTests += 1;
        }
        if (test.status === "测试失败") counts.failedTests += 1;
      });
    });
    return counts;
  }

  function computeRequirementDelivery(req) {
    if (req.status === "已完成") {
      return { percent: 100, label: "需求已完成", blocker: "已完成" };
    }
    if (req.status === "已取消") {
      return { percent: 0, label: "需求已取消", blocker: "已取消" };
    }

    const branches = (req.branches || []).filter((branch) => branch.isRequired);
    if (!branches.length) {
      return { percent: 0, label: "未建立分支链路", blocker: "先新增必需分支" };
    }

    const deliveries = branches.map(computeBranchDelivery);
    const percent = Math.round(deliveries.reduce((sum, item) => sum + item.percent, 0) / deliveries.length);
    const done = deliveries.filter((item) => item.percent === 100).length;
    const firstBlockedIndex = deliveries.findIndex((item) => item.percent < 100);
    const blocker =
      firstBlockedIndex >= 0
        ? `${branches[firstBlockedIndex].name || "分支"}：${deliveries[firstBlockedIndex].blocker}`
        : "可标记需求完成";

    return {
      percent,
      label: `${done}/${branches.length} 条分支完成`,
      blocker,
    };
  }

  function computeBranchDelivery(branch) {
    if (branch.status === "已完成") {
      return { percent: 100, label: "分支已完成", blocker: "已完成" };
    }
    if (branch.status === "已取消") {
      return { percent: 0, label: "分支已取消", blocker: "已取消" };
    }

    const prs = (branch.prs || []).filter((pr) => pr.isRequired);
    if (!prs.length) {
      return { percent: 0, label: "未建立PR链路", blocker: "先新增必需PR" };
    }

    const prDeliveries = prs.map(computePrDelivery);
    const merged = prs.filter((pr) => pr.isMerged || pr.status === "已合入").length;
    const allMerged = merged === prs.length;

    if (!allMerged) {
      const percent = Math.min(89, Math.round(prDeliveries.reduce((sum, item) => sum + item.percent, 0) / prDeliveries.length));
      const firstBlockedIndex = prDeliveries.findIndex((item) => item.percent < 100);
      const blocker =
        firstBlockedIndex >= 0
          ? `${prs[firstBlockedIndex].title || prs[firstBlockedIndex].prNo || "PR"}：${prDeliveries[firstBlockedIndex].blocker}`
          : "等待PR合入";
      return {
        percent,
        label: `${merged}/${prs.length} 条PR已合入`,
        blocker,
      };
    }

    const gates = branch.gates || [];
    const hasGateFailed = gates.some((gate) => gate.status === "失败");
    const hasGateRunning = gates.some((gate) => gate.status === "运行中");
    const hasGatePending = gates.some((gate) => ["未触发", ""].includes(gate.status || ""));
    const gatesOk = !gates.length || gates.every((gate) => ["通过", "不适用", "已取消"].includes(gate.status));

    if (hasGateFailed) return { percent: 90, label: "PR已合入，门禁失败", blocker: "处理门禁失败" };
    if (hasGateRunning) return { percent: 92, label: "PR已合入，门禁运行中", blocker: "等待门禁结果" };
    if (hasGatePending) return { percent: 90, label: "PR已合入，待触发门禁", blocker: "触发或更新门禁" };
    if (gatesOk) return { percent: 95, label: "PR和门禁已满足", blocker: "手动确认分支完成" };

    return { percent: 90, label: "PR已合入", blocker: "确认门禁和分支状态" };
  }

  function computePrDelivery(pr) {
    if (pr.isMerged || pr.status === "已合入") {
      return { percent: 100, label: "PR已合入", blocker: "已合入" };
    }
    if (["已关闭", "已废弃"].includes(pr.status)) {
      return { percent: 0, label: pr.status, blocker: "PR不可继续推进" };
    }

    const tests = (pr.tests || []).filter((test) => test.isRequired);
    if (!tests.length) {
      return { percent: 10, label: "未建立测试项", blocker: "先补充必需测试项" };
    }

    const okTests = tests.filter((test) => ["测试成功", "不适用"].includes(test.status)).length;
    const failedTest = tests.find((test) => test.status === "测试失败");
    if (failedTest) {
      return {
        percent: Math.max(10, Math.round((okTests / tests.length) * 60)),
        label: `${okTests}/${tests.length} 项测试通过`,
        blocker: `${failedTest.name || failedTest.testType} 测试失败`,
      };
    }

    if (okTests < tests.length) {
      return {
        percent: Math.round((okTests / tests.length) * 70),
        label: `${okTests}/${tests.length} 项测试通过`,
        blocker: "先完成必需测试",
      };
    }

    return {
      percent: 85,
      label: "测试已完成，待PR合入",
      blocker: "合入PR",
    };
  }

  function computeRisk(req) {
    const counts = computeCounts(req);
    const primary = getPrimaryAction(req);
    const openBlockingIssue = (req.issues || []).some(
      (issue) => issue.isBlocking && !["已解决", "已关闭", "已取消", "无需走单"].includes(issue.status),
    );
    if (req.isBlocked || openBlockingIssue || (primary && primary.isBlocked)) return { key: "blocked", label: "阻塞" };
    if (counts.failedTests > 0 || counts.failedGates > 0) return { key: "failed", label: "失败" };
    if (isRequirementOverdue(req)) return { key: "overdue", label: "逾期" };
    if (!["已完成", "已取消"].includes(req.status)) {
      if (!primary) return { key: "attention", label: "注意" };
      if (primary.plannedEndAt === todayDate()) return { key: "attention", label: "注意" };
      if (counts.requiredPrs > counts.mergedPrs && ["PR评审中", "待合入", "门禁处理中"].includes(req.status)) {
        return { key: "attention", label: "注意" };
      }
    }
    return { key: "normal", label: "正常" };
  }

  function computeRequirementProgress(req) {
    if (req.progress !== "" && req.progress !== null && req.progress !== undefined && !Number.isNaN(Number(req.progress))) {
      return Number(req.progress);
    }
    return STAGE_PROGRESS[req.status] ?? 0;
  }

  function canCompleteRequirement(req) {
    const counts = computeCounts(req);
    const hasBlockingAction = (req.actions || []).some((action) => action.isBlocked || !["已完成", "已取消"].includes(action.status));
    const hasBlockingIssue = (req.issues || []).some(
      (issue) => issue.isBlocking && !["已解决", "已关闭", "已取消", "无需走单"].includes(issue.status),
    );
    return (
      counts.doneBranches >= counts.requiredBranches &&
      counts.mergedPrs >= counts.requiredPrs &&
      counts.okTests >= counts.requiredTests &&
      counts.failedGates === 0 &&
      !hasBlockingIssue &&
      !hasBlockingAction
    );
  }

  function getFilteredRequirements() {
    const query = (state.ui.query || "").toLowerCase();
    return state.requirements
      .filter((req) => {
        if (!state.ui.showArchived && req.isArchived) return false;
        if (state.ui.status !== "全部" && req.status !== state.ui.status) return false;
        if (state.ui.priority !== "全部" && req.priority !== state.ui.priority) return false;
        if (state.ui.risk !== "全部" && computeRisk(req).key !== state.ui.risk) return false;
        if (query && !searchHaystack(req).includes(query)) return false;
        return true;
      })
      .sort(sortRequirements);
  }

  function sortRequirements(a, b) {
    const mode = state.ui.sort || "risk";
    if (mode === "priority") return priorityScore(a.priority) - priorityScore(b.priority);
    if (mode === "plannedEndAt") return (a.plannedEndAt || "9999-12-31").localeCompare(b.plannedEndAt || "9999-12-31");
    if (mode === "updatedAt") return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    if (mode === "createdAt") return (b.createdAt || "").localeCompare(a.createdAt || "");
    if (mode === "progress") return computeRequirementDelivery(b).percent - computeRequirementDelivery(a).percent;
    return riskScore(computeRisk(a).key) - riskScore(computeRisk(b).key) || priorityScore(a.priority) - priorityScore(b.priority);
  }

  function searchHaystack(req) {
    const parts = [
      req.title,
      req.requirementNo,
      req.projectName,
      req.versionName,
      req.iterationName,
      req.source,
      req.description,
      req.acceptanceCriteria,
      ...(req.tags || []),
      ...(req.actions || []).flatMap((action) => [action.content, action.relatedUrl, action.blockedReason, action.note]),
      ...(req.logs || []).flatMap((log) => [log.content, log.relatedUrl]),
      ...(req.issues || []).flatMap((issue) => [issue.title, issue.issueNo, issue.issueUrl, issue.resolution, issue.note]),
    ];
    (req.branches || []).forEach((branch) => {
      parts.push(branch.name, branch.repositoryName, branch.repositoryUrl, branch.sourceBranch, branch.targetBranch, branch.description);
      (branch.gates || []).forEach((gate) => parts.push(gate.name, gate.gateUrl, gate.failureReason, gate.logUrl, gate.note));
      (branch.prs || []).forEach((pr) => {
        parts.push(pr.title, pr.prNo, pr.prUrl, pr.repositoryName, pr.sourceBranch, pr.targetBranch, pr.mergeCommitId, pr.reviewer, pr.note);
        (pr.tests || []).forEach((test) =>
          parts.push(test.name, test.testType, test.tester, test.environment, test.version, test.resultSummary, test.resultUrl, test.logUrl, test.failureReason, test.solution),
        );
      });
    });
    return parts.filter(Boolean).join(" ").toLowerCase();
  }

  function getPrimaryAction(req) {
    return (req.actions || []).find((action) => action.isPrimary && !["已完成", "已取消"].includes(action.status)) ||
      (req.actions || []).find((action) => !["已完成", "已取消"].includes(action.status));
  }

  function getSelectedRequirement() {
    return state.ui.selectedId ? findRequirement(state.ui.selectedId) : null;
  }

  function findRequirement(id) {
    return state.requirements.find((req) => req.id === id);
  }

  function findAction(req, id) {
    return (req.actions || []).find((item) => item.id === id);
  }

  function findBranch(req, id) {
    return (req.branches || []).find((item) => item.id === id);
  }

  function findPr(branch, id) {
    return (branch?.prs || []).find((item) => item.id === id);
  }

  function findTest(pr, id) {
    return (pr?.tests || []).find((item) => item.id === id);
  }

  function findGate(branch, id) {
    return (branch?.gates || []).find((item) => item.id === id);
  }

  function findIssue(req, id) {
    return (req.issues || []).find((item) => item.id === id);
  }

  function findLog(req, id) {
    return (req.logs || []).find((item) => item.id === id);
  }

  function fillSelect(select, options, labeler = (value) => value) {
    select.innerHTML = options.map((value) => `<option value="${h(value)}">${h(labeler(value))}</option>`).join("");
  }

  function openUrl(url) {
    if (!url) return toast("链接为空。");
    window.open(safeHref(url), "_blank", "noopener,noreferrer");
  }

  async function quickAddFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const url = text.match(/https?:\/\/[^\s]+/i)?.[0];
      if (!url) return toast("剪贴板中没有识别到URL。");
      if (!state.requirements.length) {
        openRequirementForm();
        toast("请先创建需求，再从剪贴板添加链接。");
        return;
      }
      openClipboardLinkForm(url);
    } catch (error) {
      toast("无法读取剪贴板，请确认浏览器权限。");
    }
  }

  function openClipboardLinkForm(url) {
    const defaultReq = getSelectedRequirement() || state.requirements.find((item) => !item.isArchived) || state.requirements[0];
    const defaultType = guessLinkType(url);
    const defaultTitle = guessTitleFromUrl(url);
    dom.modalHost.hidden = false;
    dom.modalHost.innerHTML = `
      <form id="clipboardLinkForm" class="modal-card">
        <div class="modal-head">
          <h2>从剪贴板添加链接</h2>
          <button type="button" data-modal-close aria-label="关闭">关闭</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label>
              链接类型
              <select name="linkType">
                ${["PR", "门禁", "问题单"].map((type) => `<option value="${h(type)}" ${type === defaultType ? "selected" : ""}>${h(type)}</option>`).join("")}
              </select>
            </label>
            <label>
              所属需求
              <select name="requirementId">
                ${state.requirements
                  .map((req) => `<option value="${h(req.id)}" ${req.id === defaultReq.id ? "selected" : ""}>${h(req.title)}</option>`)
                  .join("")}
              </select>
            </label>
            <label data-branch-field>
              所属分支
              <select name="branchId"></select>
            </label>
            <label>
              标题
              <input name="title" type="text" value="${h(defaultTitle)}" />
            </label>
            <label>
              编号
              <input name="number" type="text" value="${h(guessNumberFromUrl(url))}" />
            </label>
            <label class="full">
              链接
              <input name="url" type="url" value="${h(url)}" required />
            </label>
          </div>
        </div>
        <div class="modal-foot">
          <span class="hint">不会自动猜归属，请确认需求和分支后再保存。</span>
          <div class="compact-actions">
            <button type="button" data-modal-close>取消</button>
            <button type="submit" class="primary-btn">添加</button>
          </div>
        </div>
      </form>
    `;

    const form = document.querySelector("#clipboardLinkForm");
    const requirementSelect = form.elements.requirementId;
    const branchSelect = form.elements.branchId;
    const typeSelect = form.elements.linkType;
    const branchField = form.querySelector("[data-branch-field]");

    const updateBranchOptions = () => {
      const req = findRequirement(requirementSelect.value);
      const branches = req?.branches || [];
      branchSelect.innerHTML = branches.length
        ? branches.map((branch) => `<option value="${h(branch.id)}">${h(branch.name || "未命名分支")}</option>`).join("")
        : `<option value="">该需求暂无分支</option>`;
      branchSelect.disabled = !branches.length;
    };
    const updateTypeState = () => {
      const needsBranch = typeSelect.value !== "问题单";
      branchField.classList.toggle("hidden", !needsBranch);
      branchSelect.disabled = !needsBranch || !(findRequirement(requirementSelect.value)?.branches || []).length;
    };

    updateBranchOptions();
    updateTypeState();
    requirementSelect.addEventListener("change", () => {
      updateBranchOptions();
      updateTypeState();
    });
    typeSelect.addEventListener("change", updateTypeState);
    dom.modalHost.querySelectorAll("[data-modal-close]").forEach((button) => button.addEventListener("click", closeModal));

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const req = findRequirement(requirementSelect.value);
      const type = typeSelect.value;
      const title = form.elements.title.value.trim() || defaultTitle;
      const number = form.elements.number.value.trim();
      const link = form.elements.url.value.trim();
      if (!req) return toast("请选择需求。");
      if (!link) return toast("链接不能为空。");
      if (type !== "问题单" && !findBranch(req, branchSelect.value)) {
        return toast("PR和门禁必须选择所属分支。");
      }

      if (type === "PR") {
        addClipboardPr(req, findBranch(req, branchSelect.value), title, number, link);
      } else if (type === "门禁") {
        addClipboardGate(req, findBranch(req, branchSelect.value), title, link);
      } else {
        addClipboardIssue(req, title, number, link);
      }
      state.ui.selectedId = req.id;
      state.ui.detailOpen = true;
      closeModal();
      commit();
      toast(`${type}链接已添加。`);
    });
  }

  function addClipboardPr(req, branch, title, prNo, prUrl) {
    const now = nowIso();
    branch.prs = branch.prs || [];
    const pr = {
      id: uid("pr"),
      title,
      prNo,
      prUrl,
      repositoryName: branch.repositoryName || "",
      sourceBranch: branch.sourceBranch || "",
      targetBranch: branch.targetBranch || "",
      status: "已创建",
      isRequired: true,
      isMerged: false,
      mergedAt: "",
      mergeCommitId: "",
      reviewer: "",
      note: "",
      tests: createDefaultTests(),
      createdAt: now,
      updatedAt: now,
    };
    branch.prs.push(pr);
    addSystemLog(req, "PR创建", `从剪贴板添加PR：${title}。`, prUrl);
    recalcBranchStatus(branch);
    touchRequirement(req);
  }

  function addClipboardGate(req, branch, name, gateUrl) {
    const now = nowIso();
    branch.gates = branch.gates || [];
    if (branch.gates.length) branch.gates.forEach((gate) => (gate.isCurrent = false));
    branch.gates.push({
      id: uid("gate"),
      name,
      gateUrl,
      pullRequestId: "",
      status: "未触发",
      triggeredAt: "",
      completedAt: "",
      failureReason: "",
      logUrl: "",
      isCurrent: true,
      note: "",
      createdAt: now,
      updatedAt: now,
    });
    touchRequirement(req);
  }

  function addClipboardIssue(req, title, issueNo, issueUrl) {
    const now = nowIso();
    req.issues = req.issues || [];
    req.issues.push({
      id: uid("issue"),
      title,
      issueNo,
      issueUrl,
      issueType: "其他",
      status: "已创建",
      isBlocking: false,
      plannedCloseAt: "",
      closedAt: "",
      resolution: "",
      note: "",
      createdAt: now,
      updatedAt: now,
    });
    touchRequirement(req);
  }

  function openWeeklyReport() {
    const md = generateWeeklyReport();
    dom.modalHost.hidden = false;
    dom.modalHost.innerHTML = `
      <div class="modal-card">
        <div class="modal-head">
          <h2>Markdown周报</h2>
          <button type="button" data-modal-close>关闭</button>
        </div>
        <div class="modal-body">
          <textarea class="markdown-box" readonly>${h(md)}</textarea>
        </div>
        <div class="modal-foot">
          <span class="hint">已按当前本周时间范围生成，可复制到周报或群消息。</span>
          <div class="compact-actions">
            <button type="button" id="copyReportBtn">复制</button>
            <button type="button" id="downloadReportBtn">下载MD</button>
          </div>
        </div>
      </div>
    `;
    dom.modalHost.querySelector("[data-modal-close]").addEventListener("click", closeModal);
    dom.modalHost.querySelector("#copyReportBtn").addEventListener("click", async () => {
      await navigator.clipboard.writeText(md);
      toast("周报已复制。");
    });
    dom.modalHost.querySelector("#downloadReportBtn").addEventListener("click", () => {
      downloadText(`rd-weekly-${todayDate()}.md`, md, "text/markdown;charset=utf-8");
    });
  }

  function generateWeeklyReport() {
    const weekStart = startOfWeek();
    const completed = [];
    const mergedPrs = [];
    const passedTests = [];
    const solvedIssues = [];
    const logs = [];
    const running = [];
    const problems = [];
    state.requirements.forEach((req) => {
      if (req.status === "已完成" && req.completedAt && new Date(req.completedAt) >= weekStart) completed.push(req.title);
      const primary = getPrimaryAction(req);
      if (!req.isArchived && !["已完成", "已取消"].includes(req.status)) {
        running.push(`- ${req.title}：${req.status}；下一步：${primary ? primary.content : "未设置"}；风险：${computeRisk(req).label}`);
      }
      (req.logs || []).forEach((log) => {
        if (log.completedAt && new Date(log.completedAt) >= weekStart) logs.push(`- ${req.title}：${log.content}`);
      });
      (req.issues || []).forEach((issue) => {
        if (["已解决", "已关闭"].includes(issue.status) && issue.closedAt && new Date(issue.closedAt) >= weekStart) {
          solvedIssues.push(`${req.title} / ${issue.title}`);
        }
        if (issue.isBlocking && !["已解决", "已关闭", "已取消", "无需走单"].includes(issue.status)) {
          problems.push(`- ${req.title}：阻塞问题单 ${issue.title}`);
        }
      });
      (req.branches || []).forEach((branch) => {
        (branch.prs || []).forEach((pr) => {
          if (pr.isMerged && pr.mergedAt && new Date(pr.mergedAt) >= weekStart) mergedPrs.push(`${req.title} / ${pr.title || pr.prNo}`);
          (pr.tests || []).forEach((test) => {
            if (test.status === "测试成功" && test.completedAt && new Date(test.completedAt) >= weekStart) {
              passedTests.push(`${req.title} / ${pr.title || pr.prNo} / ${test.name}`);
            }
            if (test.status === "测试失败") problems.push(`- ${req.title}：${pr.title || pr.prNo} ${test.name} 测试失败：${test.failureReason || "未填写原因"}`);
          });
        });
        (branch.gates || []).forEach((gate) => {
          if (gate.status === "失败") problems.push(`- ${req.title}：${branch.name} 门禁失败：${gate.failureReason || "未填写原因"}`);
        });
      });
    });
    return [
      `# 研发周报 ${formatDate(weekStart.toISOString())} - ${formatDate(todayDate())}`,
      "",
      "## 本周完成",
      listOrNone([...completed.map((item) => `- 完成需求：${item}`), ...mergedPrs.map((item) => `- 合入PR：${item}`), ...passedTests.map((item) => `- 通过测试：${item}`), ...solvedIssues.map((item) => `- 解决问题单：${item}`), ...logs]),
      "",
      "## 当前进行中",
      listOrNone(running),
      "",
      "## 当前问题",
      listOrNone(problems),
      "",
    ].join("\n");
  }

  function listOrNone(items) {
    return items.length ? items.join("\n") : "- 暂无";
  }

  async function exportBranchPrLinks(req, branch) {
    if (!branch) return;
    const links = (branch.prs || []).map((pr) => pr.prUrl).filter(Boolean);
    if (!links.length) return toast("该分支没有可导出的PR链接。");
    const ok = await copyTextToClipboard(links.join("\n"));
    toast(ok ? "PR链接已复制到剪贴板。" : "复制失败，请检查浏览器剪贴板权限。");
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      // Fall through to the textarea copy path.
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  function exportJson(suffix = "backup") {
    const snapshot = deepClone(state);
    downloadText(`rd-tracker-${suffix}-${todayDate()}.json`, JSON.stringify(snapshot, null, 2), "application/json;charset=utf-8");
    toast("JSON备份已导出。");
  }

  function exportCsv() {
    const rows = [
      ["需求名称", "需求编号", "项目", "版本", "优先级", "状态", "风险", "交付链路进度", "当前卡点", "计划完成", "下一步", "是否归档"],
      ...state.requirements.map((req) => {
        const delivery = computeRequirementDelivery(req);
        const primary = getPrimaryAction(req);
        return [
          req.title,
          req.requirementNo,
          req.projectName,
          req.versionName,
          req.priority,
          req.status,
          computeRisk(req).label,
          `${delivery.percent}%`,
          delivery.blocker,
          req.plannedEndAt,
          primary?.content || "",
          req.isArchived ? "是" : "否",
        ];
      }),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    downloadText(`rd-tracker-requirements-${todayDate()}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
    toast("CSV已导出。");
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.requirements)) throw new Error("invalid");
      if (!window.confirm("导入会覆盖当前数据。系统将先下载一份当前JSON备份，是否继续？")) return;
      exportJson("before-import");
      state = normalizeState(parsed);
      if (!state.ui.selectedId && state.requirements.length) state.ui.selectedId = state.requirements[0].id;
      commit();
      toast("导入完成。");
    } catch (error) {
      toast("导入失败：JSON格式不正确。");
    }
  }

  function resetDemo() {
    if (!window.confirm("确认清空全部本地数据？当前数据会先下载备份。")) return;
    exportJson("before-reset");
    state = normalizeState(createEmptyState());
    commit();
    toast("数据已清空。");
  }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function loadState() {
    try {
      const db = await openDb();
      const data = await idbGet(db, STATE_KEY);
      db.close();
      return data;
    } catch (error) {
      const fallback = localStorage.getItem(DB_NAME);
      return fallback ? JSON.parse(fallback) : null;
    }
  }

  function persistSoon() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveState, 180);
  }

  async function saveState() {
    const snapshot = deepClone(state);
    try {
      const db = await openDb();
      await idbSet(db, STATE_KEY, snapshot);
      db.close();
    } catch (error) {
      localStorage.setItem(DB_NAME, JSON.stringify(snapshot));
    }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function idbGet(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  function idbSet(db, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function commit() {
    render();
    persistSoon();
  }

  function touchRequirement(req) {
    req.updatedAt = nowIso();
  }

  function syncRequirementDerivedFields(req, oldStatus = "") {
    if (req.status === "已完成") {
      req.completedAt = req.completedAt || nowIso();
    }
    if (req.status !== "已完成") {
      req.completedAt = "";
    }
    if (!req.isBlocked) {
      req.blockedReason = "";
    }
  }

  function isTestCompletedStatus(status) {
    return ["测试成功", "测试失败", "不适用"].includes(status);
  }

  function isGateCompletedStatus(status) {
    return ["通过", "失败", "已取消", "不适用"].includes(status);
  }

  function isIssueClosedStatus(status) {
    return ["已解决", "已关闭"].includes(status);
  }

  function normalizeState(input) {
    const next = input && typeof input === "object" ? input : createEmptyState();
    next.version = 1;
    next.ui = {
      query: "",
      view: "list",
      status: "全部",
      priority: "全部",
      risk: "全部",
      sort: "risk",
      showArchived: false,
      leftCollapsed: false,
      detailOpen: false,
      selectedId: null,
      focusTarget: "",
      ...(next.ui || {}),
    };
    next.requirements = Array.isArray(next.requirements) ? next.requirements : [];
    next.requirements.forEach((req) => {
      req.actions = Array.isArray(req.actions) ? req.actions : [];
      req.logs = Array.isArray(req.logs) ? req.logs : [];
      req.branches = Array.isArray(req.branches) ? req.branches : [];
      req.issues = Array.isArray(req.issues) ? req.issues : [];
      req.tags = Array.isArray(req.tags) ? req.tags : splitTags(req.tags || "");
      req.priority = req.priority || "P2";
      req.status = req.status || "待分析";
      req.createdAt = req.createdAt || nowIso();
      req.updatedAt = req.updatedAt || req.createdAt;
      syncRequirementDerivedFields(req, req.status);
      req.branches.forEach((branch, index) => {
        branch.id = branch.id || uid("br");
        branch.prs = Array.isArray(branch.prs) ? branch.prs : [];
        branch.gates = Array.isArray(branch.gates) ? branch.gates : [];
        branch.sortOrder = branch.sortOrder || index + 1;
        branch.status = branch.status || "未开始";
        branch.prs.forEach((pr) => {
          pr.id = pr.id || uid("pr");
          pr.tests = Array.isArray(pr.tests) ? pr.tests : [];
          pr.status = pr.status || "已创建";
          pr.isMerged = pr.status === "已合入";
          if (!pr.isMerged) {
            pr.mergedAt = "";
            pr.mergeCommitId = "";
          }
          pr.tests.forEach((test) => {
            test.id = test.id || uid("test");
            test.executions = Array.isArray(test.executions) ? test.executions : [];
            test.status = test.status || "未测试";
            test.isRequired = test.status === "不适用" ? false : test.isRequired !== false;
            if (test.status === "测试中" || isTestCompletedStatus(test.status)) {
              test.startedAt = test.startedAt || test.updatedAt || nowIso();
            } else {
              test.startedAt = "";
            }
            if (isTestCompletedStatus(test.status)) {
              test.completedAt = test.completedAt || test.updatedAt || nowIso();
            } else {
              test.completedAt = "";
            }
            if (test.status !== "测试失败") {
              test.failureReason = "";
              test.solution = "";
            }
          });
        });
        branch.gates.forEach((gate) => {
          gate.id = gate.id || uid("gate");
          gate.status = gate.status || "未触发";
          if (gate.status === "未触发") {
            gate.triggeredAt = "";
            gate.completedAt = "";
          } else {
            gate.triggeredAt = gate.triggeredAt || gate.createdAt || nowLocalInput();
            gate.completedAt = isGateCompletedStatus(gate.status) ? gate.completedAt || gate.updatedAt || nowLocalInput() : "";
          }
          if (gate.status !== "失败") gate.failureReason = "";
        });
      });
      req.issues.forEach((issue) => {
        issue.id = issue.id || uid("issue");
        issue.status = issue.status || "待创建";
        issue.closedAt = isIssueClosedStatus(issue.status) ? issue.closedAt || todayDate() : "";
      });
      req.actions.forEach((action) => {
        action.id = action.id || uid("act");
        action.startedAt = action.startedAt || action.createdAt || req.createdAt || nowIso();
        if (action.status !== "已完成") action.completedAt = "";
        if (!action.isBlocked) action.blockedReason = "";
      });
      req.logs.forEach((log) => (log.id = log.id || uid("log")));
    });
    return next;
  }

  function createEmptyState() {
    return {
      version: 1,
      ui: {
        query: "",
        view: "list",
        status: "全部",
        priority: "全部",
        risk: "全部",
        sort: "risk",
        showArchived: false,
        leftCollapsed: false,
        detailOpen: false,
        selectedId: null,
        focusTarget: "",
      },
      requirements: [],
    };
  }

  function isBundledDemoState(input) {
    const titles = (input?.requirements || []).map((req) => req.title).sort();
    return (
      titles.length === 2 &&
      titles.includes("帐号模块周版本缺陷修复") &&
      titles.includes("音频服务稳定性需求适配")
    );
  }

  function createDemoState() {
    const today = todayDate();
    const tomorrow = addDays(today, 1);
    const yesterday = addDays(today, -1);
    const now = nowIso();
    const req1 = {
      id: uid("req"),
      title: "音频服务稳定性需求适配",
      requirementNo: "REQ-2026-0713-01",
      projectName: "OpenHarmony子系统",
      versionName: "weekly-0720",
      iterationName: "W29",
      source: "版本计划",
      priority: "P1",
      status: "门禁处理中",
      progress: "",
      description: "跟踪多分支适配、PR评审、XTS验证和门禁处理进展。",
      acceptanceCriteria: "必需PR合入，单元测试/XTS/自验证通过，门禁无失败。",
      plannedStartAt: addDays(today, -2),
      plannedEndAt: tomorrow,
      completedAt: "",
      isBlocked: false,
      blockedReason: "",
      isArchived: false,
      archivedAt: "",
      tags: ["音频", "稳定性"],
      createdAt: addDaysIso(-2),
      updatedAt: now,
      actions: [
        {
          id: uid("act"),
          content: "修复XTS失败用例并重新触发dev分支门禁",
          status: "进行中",
          priority: "P1",
          owner: "本人",
          plannedEndAt: today,
          completedAt: "",
          isPrimary: true,
          isBlocked: false,
          blockedReason: "",
          relatedUrl: "",
          note: "优先处理失败用例，门禁通过后标记分支完成。",
          createdAt: addDaysIso(-1),
          updatedAt: now,
        },
      ],
      logs: [
        {
          id: uid("log"),
          logType: "PR创建",
          content: "完成dev分支代码开发并提交PR。",
          relatedUrl: "https://example.com/pr/1024",
          completedAt: addHoursIso(-25),
          createdAt: addHoursIso(-25),
        },
      ],
      branches: [
        demoBranch("蓝区Master分支", "已完成", "蓝区master", true, 1, [
          demoPr("适配主干接口变更", "1024", "已合入", true, [
            demoTest("单元测试", "测试成功"),
            demoTest("XTS", "测试成功"),
            demoTest("自验证", "测试成功"),
            demoTest("稳定性测试", "不适用", false),
          ]),
        ]),
        demoBranch("Dev分支", "测试中", "dev", true, 2, [
          demoPr("dev分支稳定性修复", "1025", "待门禁", false, [
            demoTest("单元测试", "测试成功"),
            demoTest("XTS", "测试失败", true, "test_audio_route_timeout超时，需调整等待条件。"),
            demoTest("自验证", "测试成功"),
            demoTest("稳定性测试", "未测试"),
          ]),
        ], [
          {
            id: uid("gate"),
            name: "dev门禁",
            gateUrl: "https://example.com/gate/7788",
            pullRequestId: "",
            status: "失败",
            triggeredAt: addHoursLocal(-5),
            completedAt: addHoursLocal(-4),
            failureReason: "XTS用例失败。",
            logUrl: "https://example.com/log/7788",
            isCurrent: true,
            note: "",
            createdAt: addHoursIso(-5),
            updatedAt: addHoursIso(-4),
          },
        ]),
        demoBranch("主干分支", "未开始", "主干", true, 3, []),
      ],
      issues: [
        {
          id: uid("issue"),
          title: "XTS失败跟踪单",
          issueNo: "ISSUE-8812",
          issueUrl: "https://example.com/issue/8812",
          issueType: "测试问题",
          status: "处理中",
          isBlocking: false,
          plannedCloseAt: tomorrow,
          closedAt: "",
          resolution: "",
          note: "",
          createdAt: addDaysIso(-1),
          updatedAt: now,
        },
      ],
    };

    const req2 = {
      id: uid("req"),
      title: "帐号模块周版本缺陷修复",
      requirementNo: "BUGFIX-2026-0713-02",
      projectName: "帐号服务",
      versionName: "weekly-0713",
      iterationName: "W29",
      source: "缺陷池",
      priority: "P2",
      status: "待合入",
      progress: "",
      description: "收敛帐号模块周版本缺陷，确认问题单关闭状态。",
      acceptanceCriteria: "",
      plannedStartAt: addDays(today, -5),
      plannedEndAt: yesterday,
      completedAt: "",
      isBlocked: false,
      blockedReason: "",
      isArchived: false,
      archivedAt: "",
      tags: ["帐号", "周版本"],
      createdAt: addDaysIso(-5),
      updatedAt: addHoursIso(-2),
      actions: [
        {
          id: uid("act"),
          content: "等待评审人批准后合入PR",
          status: "待处理",
          priority: "P2",
          owner: "本人",
          plannedEndAt: yesterday,
          completedAt: "",
          isPrimary: true,
          isBlocked: false,
          blockedReason: "",
          relatedUrl: "https://example.com/pr/2033",
          note: "",
          createdAt: addDaysIso(-1),
          updatedAt: now,
        },
      ],
      logs: [],
      branches: [
        demoBranch("Dev分支", "待合入", "dev", true, 1, [
          demoPr("帐号模块空指针修复", "2033", "已批准", false, [
            demoTest("单元测试", "测试成功"),
            demoTest("自验证", "测试成功"),
          ]),
        ]),
      ],
      issues: [],
    };

    return {
      version: 1,
      ui: {
        query: "",
        view: "list",
        status: "全部",
        priority: "全部",
        risk: "全部",
        sort: "risk",
        showArchived: false,
        leftCollapsed: false,
        detailOpen: false,
        selectedId: req1.id,
      },
      requirements: [req1, req2],
    };
  }

  function demoBranch(type, status, name, required, order, prs, gates = []) {
    return {
      id: uid("br"),
      name,
      branchType: type,
      repositoryName: "示例仓库",
      repositoryUrl: "https://example.com/repo",
      sourceBranch: "dev",
      targetBranch: name,
      status,
      isRequired: required,
      sortOrder: order,
      description: "",
      prs,
      gates,
      createdAt: addDaysIso(-2),
      updatedAt: nowIso(),
    };
  }

  function demoPr(title, no, status, merged, tests) {
    return {
      id: uid("pr"),
      title,
      prNo: no,
      prUrl: `https://example.com/pr/${no}`,
      repositoryName: "示例仓库",
      sourceBranch: "feature/fix",
      targetBranch: "dev",
      status,
      isRequired: true,
      isMerged: merged,
      mergedAt: merged ? addHoursLocal(-10) : "",
      mergeCommitId: merged ? "abc1234" : "",
      reviewer: "reviewer",
      note: "",
      tests,
      createdAt: addDaysIso(-1),
      updatedAt: nowIso(),
    };
  }

  function demoTest(type, status, required = true, failureReason = "") {
    const completed = ["测试成功", "测试失败", "不适用"].includes(status);
    return {
      id: uid("test"),
      testType: type,
      name: type,
      status,
      isRequired: required,
      tester: "本人",
      environment: "本地验证环境",
      version: "weekly",
      startedAt: completed ? addHoursIso(-8) : "",
      completedAt: completed ? addHoursIso(-7) : "",
      resultSummary: status === "测试成功" ? "验证通过。" : "",
      resultUrl: "",
      logUrl: failureReason ? "https://example.com/log/xts" : "",
      failureReason,
      solution: "",
      retryCount: failureReason ? 1 : 0,
      executions: completed
        ? [
            {
              id: uid("exec"),
              executionNo: 1,
              status,
              failureReason,
              resultSummary: status === "测试成功" ? "验证通过。" : "",
              resultUrl: "",
              logUrl: failureReason ? "https://example.com/log/xts" : "",
              startedAt: addHoursIso(-8),
              completedAt: addHoursIso(-7),
              createdAt: addHoursIso(-7),
            },
          ]
        : [],
      createdAt: addDaysIso(-1),
      updatedAt: nowIso(),
    };
  }

  function createDefaultBranches() {
    const now = nowIso();
    return [
      ["蓝区Master分支", "蓝区master", "master", 1],
      ["Dev分支", "dev", "dev", 2],
      ["主干分支", "主干", "main", 3],
    ].map(([type, name, targetBranch, sortOrder]) => ({
      id: uid("br"),
      name,
      branchType: type,
      repositoryName: "",
      repositoryUrl: "",
      sourceBranch: "",
      targetBranch,
      status: "未开始",
      isRequired: true,
      sortOrder,
      description: "",
      prs: [],
      gates: [],
      createdAt: now,
      updatedAt: now,
    }));
  }

  function createDefaultTests() {
    const now = nowIso();
    return ["单元测试", "XTS", "自验证", "稳定性测试"].map((name) => ({
      id: uid("test"),
      testType: name,
      name,
      status: "未测试",
      isRequired: true,
      tester: "",
      environment: "",
      version: "",
      startedAt: "",
      completedAt: "",
      resultSummary: "",
      resultUrl: "",
      logUrl: "",
      failureReason: "",
      solution: "",
      retryCount: 0,
      executions: [],
      createdAt: now,
      updatedAt: now,
    }));
  }

  function reidRequirement(req) {
    req.id = uid("req");
    (req.actions || []).forEach((item) => (item.id = uid("act")));
    (req.logs || []).forEach((item) => (item.id = uid("log")));
    (req.issues || []).forEach((item) => (item.id = uid("issue")));
    (req.branches || []).forEach((branch) => {
      branch.id = uid("br");
      (branch.gates || []).forEach((gate) => (gate.id = uid("gate")));
      (branch.prs || []).forEach((pr) => {
        pr.id = uid("pr");
        (pr.tests || []).forEach((test) => {
          test.id = uid("test");
          (test.executions || []).forEach((exec) => (exec.id = uid("exec")));
        });
      });
    });
  }

  function safeHref(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    if (/^(https?:|mailto:|file:)/i.test(value)) return value;
    return `https://${value}`;
  }

  function testStatusClass(status) {
    if (status === "测试成功" || status === "不适用") return "test-success";
    if (status === "测试失败") return "test-failed";
    if (status === "测试中") return "test-running";
    return "status-pill";
  }

  function priorityScore(priority) {
    return { P0: 0, P1: 1, P2: 2, P3: 3 }[priority] ?? 9;
  }

  function riskScore(risk) {
    return { blocked: 0, failed: 1, overdue: 2, attention: 3, normal: 4 }[risk] ?? 9;
  }

  function isRequirementOverdue(req) {
    return !["已完成", "已取消"].includes(req.status) && isPastDate(req.plannedEndAt);
  }

  function isPastDate(date) {
    return Boolean(date) && String(date).slice(0, 10) < todayDate();
  }

  function todayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function nowLocalInput() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function localInputToIso(value) {
    return value ? new Date(value).toISOString() : nowIso();
  }

  function formatInputValue(type, value) {
    if (!value) return "";
    if (type === "datetime-local") {
      if (String(value).includes("T") && String(value).length >= 16) return String(value).slice(0, 16);
      return value;
    }
    if (type === "date") return String(value).slice(0, 10);
    return value;
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatDateTime(value) {
    if (!value) return "未记录";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function startOfWeek() {
    const date = new Date();
    const day = date.getDay() || 7;
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - day + 1);
    return date;
  }

  function addDays(dateString, amount) {
    const date = new Date(`${dateString}T00:00:00`);
    date.setDate(date.getDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function addDaysIso(amount) {
    const date = new Date();
    date.setDate(date.getDate() + amount);
    return date.toISOString();
  }

  function addHoursIso(amount) {
    const date = new Date();
    date.setHours(date.getHours() + amount);
    return date.toISOString();
  }

  function addHoursLocal(amount) {
    const date = new Date();
    date.setHours(date.getHours() + amount);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function normalizeProgress(value) {
    if (value === "" || value === null || value === undefined) return "";
    const number = Number(value);
    if (Number.isNaN(number)) return "";
    return Math.max(0, Math.min(100, number));
  }

  function splitTags(value) {
    if (Array.isArray(value)) return value;
    return String(value || "")
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function guessTitleFromUrl(url) {
    try {
      const parsed = new URL(url);
      const tail = parsed.pathname.split("/").filter(Boolean).pop();
      return tail ? `PR ${tail}` : parsed.hostname;
    } catch {
      return "剪贴板PR";
    }
  }

  function guessNumberFromUrl(url) {
    const match = String(url || "").match(/(?:pull|merge_requests|pr|issues?|gate|pipeline|build)[/-](\d+)/i);
    if (match) return match[1];
    const tailNumber = String(url || "").match(/(\d+)(?:[/?#].*)?$/);
    return tailNumber ? tailNumber[1] : "";
  }

  function guessLinkType(url) {
    const text = String(url || "").toLowerCase();
    if (/issue|bug|ticket|workitem/.test(text)) return "问题单";
    if (/gate|pipeline|build|ci|check/.test(text)) return "门禁";
    return "PR";
  }

  function uid(prefix) {
    if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function h(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toast(message) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    dom.toastHost.appendChild(node);
    window.setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(4px)";
    }, 2400);
    window.setTimeout(() => node.remove(), 2900);
  }
})();
