(function () {
    "use strict";

    const SVG_NS = "http://www.w3.org/2000/svg";
    let root = null;
    let run = null;
    let activeViewId = null;
    let loadingPromise = null;
    let actionPending = false;

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function svgElement(tag, attributes) {
        const node = document.createElementNS(SVG_NS, tag);
        Object.entries(attributes || {}).forEach(([name, value]) => {
            node.setAttribute(name, String(value));
        });
        return node;
    }

    function pointer(documentValue, path, fallback) {
        if (typeof path !== "string" || !path.startsWith("/")) return fallback;
        let current = documentValue;
        for (const raw of path.slice(1).split("/")) {
            const part = raw.replace(/~1/g, "/").replace(/~0/g, "~");
            if (Array.isArray(current)) {
                const index = Number(part);
                if (!Number.isInteger(index) || index < 0 || index >= current.length) return fallback;
                current = current[index];
            } else if (current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, part)) {
                current = current[part];
            } else {
                return fallback;
            }
        }
        return current;
    }

    function stateDocument() {
        return {public: run ? run.publicState : {}};
    }

    async function request(path, options) {
        const response = await CTFd.fetch(path, {
            credentials: "same-origin",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                ...(options && options.headers || {}),
            },
            ...(options || {}),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
            const error = new Error(payload.error || `请求失败（${response.status}）`);
            error.code = payload.code;
            error.details = payload;
            throw error;
        }
        return payload;
    }

    function setLoading(loading, message) {
        const overlay = root && root.querySelector("[data-simulation-loading]");
        if (!overlay) return;
        overlay.hidden = !loading;
        if (message) {
            const detail = overlay.querySelector("span");
            if (detail) detail.textContent = message;
        }
    }

    function statusLabel(status) {
        return {
            ACTIVE: "运行中",
            OBJECTIVES_COMPLETE: "目标完成，等待联合验证",
            COMPLETED: "已完成",
            FAILED: "本轮未通过",
            STOPPED: "已停止",
            INTERRUPTED: "已中断",
        }[status] || status || "未知状态";
    }

    function renderHeader() {
        const scenario = run.scenario || {};
        root.querySelector("[data-simulation-domain]").textContent = scenario.domain || "GENERAL";
        root.querySelector("[data-simulation-title]").textContent = scenario.title || run.challenge.name;
        root.querySelector("[data-simulation-description]").textContent = scenario.description || "";

        const status = root.querySelector("[data-simulation-status]");
        status.textContent = statusLabel(run.status);
        status.classList.remove("is-active", "is-complete", "is-failed");
        if (run.status === "ACTIVE") status.classList.add("is-active");
        else if (run.status === "COMPLETED" || run.status === "OBJECTIVES_COMPLETE") status.classList.add("is-complete");
        else if (run.status === "FAILED") status.classList.add("is-failed");

        const integrity = root.querySelector("[data-simulation-integrity]");
        const valid = Boolean(run.integrity && run.integrity.eventChain && run.integrity.eventChain.valid);
        integrity.classList.toggle("is-valid", valid);
        integrity.classList.toggle("is-invalid", !valid);
        integrity.lastChild.textContent = valid
            ? ` 事件链已验证 · ${run.integrity.eventChain.events} 条`
            : " 完整性校验失败";

        const progress = Number(run.objectiveSummary && run.objectiveSummary.progress || 0);
        root.querySelector("[data-simulation-turn]").textContent = `回合 ${run.turn} / ${run.maxTurns}`;
        root.querySelector("[data-simulation-progress-label]").textContent = `目标进度 ${progress}%`;
        const track = root.querySelector("[data-simulation-progress]");
        track.setAttribute("aria-valuenow", String(progress));
        track.querySelector("span").style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }

    function renderObjectives() {
        const list = root.querySelector("[data-simulation-objectives]");
        list.replaceChildren();
        const objectives = run.objectives || [];
        const completed = objectives.filter(item => item.status === "COMPLETED").length;
        root.querySelector("[data-simulation-objective-count]").textContent = `${completed} / ${objectives.length}`;
        objectives.forEach(objective => {
            const row = element("div", "simulation-objective");
            row.classList.toggle("is-complete", objective.status === "COMPLETED");
            row.classList.toggle("is-failed", objective.status === "FAILED");
            const icon = element("i");
            icon.className = objective.status === "COMPLETED"
                ? "fas fa-check-circle"
                : objective.status === "FAILED"
                ? "fas fa-times-circle"
                : objective.hidden
                ? "fas fa-eye-slash"
                : "far fa-circle";
            icon.setAttribute("aria-hidden", "true");
            const copy = element("div");
            copy.append(
                element("strong", "", objective.label),
                element("small", "", objective.description || (objective.required ? "必需目标" : "可选目标"))
            );
            const weight = element("span", "simulation-objective-weight", `${objective.weight}%`);
            row.append(icon, copy, weight);
            list.appendChild(row);
        });
    }

    function renderViewTabs() {
        const tabs = root.querySelector("[data-simulation-view-tabs]");
        tabs.replaceChildren();
        const views = run.scenario && run.scenario.views || [];
        if (!views.some(view => view.id === activeViewId)) {
            activeViewId = views[0] && views[0].id;
        }
        views.forEach(view => {
            const button = element("button", "simulation-view-tab", view.title || view.id);
            button.type = "button";
            button.setAttribute("role", "tab");
            button.setAttribute("aria-selected", view.id === activeViewId ? "true" : "false");
            button.addEventListener("click", () => {
                activeViewId = view.id;
                renderViewTabs();
                renderActiveView();
            });
            tabs.appendChild(button);
        });
    }

    function renderTopology(view, container) {
        const entitiesValue = pointer(stateDocument(), view.entitiesPath || view.path, {});
        const relations = pointer(stateDocument(), view.relationsPath, []);
        const entities = Array.isArray(entitiesValue)
            ? Object.fromEntries(entitiesValue.map(item => [item.id, item]))
            : entitiesValue || {};
        const wrapper = element("div", "simulation-topology");
        const svg = svgElement("svg", {
            viewBox: "0 0 100 100",
            role: "img",
            "aria-label": `${view.title || "拓扑"}，${Object.keys(entities).length} 个实体，${Array.isArray(relations) ? relations.length : 0} 条关系`,
            preserveAspectRatio: "xMidYMid meet",
        });
        (Array.isArray(relations) ? relations : []).forEach(relation => {
            const source = entities[relation.source];
            const target = entities[relation.target];
            if (!source || !target) return;
            const sourcePosition = source.position || {};
            const targetPosition = target.position || {};
            const line = svgElement("line", {
                x1: Number(sourcePosition.x || 50),
                y1: Number(sourcePosition.y || 50),
                x2: Number(targetPosition.x || 50),
                y2: Number(targetPosition.y || 50),
                class: `simulation-topology-line is-${String(relation.status || "normal").replace(/[^a-z0-9_-]/gi, "")}`,
            });
            svg.appendChild(line);
        });
        Object.values(entities).forEach(entity => {
            if (!entity || typeof entity !== "object") return;
            const position = entity.position || {};
            const x = Math.max(7, Math.min(93, Number(position.x || 50)));
            const y = Math.max(8, Math.min(90, Number(position.y || 50)));
            const group = svgElement("g", {
                class: `simulation-topology-node is-${String(entity.status || "normal").replace(/[^a-z0-9_-]/gi, "")}`,
                transform: `translate(${x} ${y})`,
            });
            group.appendChild(svgElement("circle", {r: 5.2}));
            const label = svgElement("text", {x: 0, y: 9});
            label.textContent = entity.label || entity.id || "entity";
            const kind = svgElement("text", {x: 0, y: 12.5, class: "simulation-node-kind"});
            kind.textContent = `${entity.kind || "entity"} · ${entity.status || "unknown"}`;
            group.append(label, kind);
            svg.appendChild(group);
        });
        wrapper.appendChild(svg);
        container.appendChild(wrapper);
    }

    function renderSpectrum(view, container) {
        const visible = view.visiblePath ? Boolean(pointer(stateDocument(), view.visiblePath, false)) : true;
        if (!visible) {
            const empty = element("div", "simulation-empty");
            const icon = element("i");
            icon.className = "fas fa-wave-square";
            icon.setAttribute("aria-hidden", "true");
            empty.append(icon, element("span", "", "执行频谱采集操作后显示测量结果。"));
            container.appendChild(empty);
            return;
        }
        const rows = pointer(stateDocument(), view.path, []);
        if (!Array.isArray(rows) || !rows.length) {
            container.appendChild(element("div", "simulation-empty", "暂无频谱数据。"));
            return;
        }
        const xField = view.xField || "channel";
        const yField = Array.isArray(view.yFields) && view.yFields[0] || view.yField || "value";
        const values = rows.map(row => Number(row[yField] || 0));
        const maximum = Math.max(100, ...values.map(value => Math.max(0, value)));
        const wrapper = element("div", "simulation-spectrum");
        const svg = svgElement("svg", {
            viewBox: "0 0 720 320",
            role: "img",
            "aria-label": `${view.title || "频谱"}，${rows.length} 个测量点`,
            preserveAspectRatio: "xMidYMid meet",
        });
        for (let index = 0; index <= 4; index += 1) {
            const y = 30 + index * 60;
            svg.appendChild(svgElement("line", {
                x1: 50,
                y1: y,
                x2: 700,
                y2: y,
                class: "simulation-spectrum-grid",
            }));
        }
        const availableWidth = 620;
        const slot = availableWidth / rows.length;
        rows.forEach((row, index) => {
            const value = Math.max(0, Number(row[yField] || 0));
            const height = value / maximum * 230;
            const x = 65 + index * slot;
            const y = 270 - height;
            const bar = svgElement("rect", {
                x,
                y,
                width: Math.max(10, slot - 20),
                height,
                rx: 3,
                class: `simulation-spectrum-bar${value >= maximum * 0.75 ? " is-high" : ""}`,
            });
            const valueLabel = svgElement("text", {
                x: x + Math.max(10, slot - 20) / 2,
                y: Math.max(18, y - 8),
                class: "simulation-spectrum-value",
            });
            valueLabel.textContent = `${value}${view.units && view.units[yField] || ""}`;
            const xLabel = svgElement("text", {
                x: x + Math.max(10, slot - 20) / 2,
                y: 295,
                class: "simulation-spectrum-label",
            });
            xLabel.textContent = String(row[xField]);
            svg.append(bar, valueLabel, xLabel);
        });
        wrapper.appendChild(svg);
        container.appendChild(wrapper);
    }

    function displayValue(value, metric) {
        if (metric && metric.format === "boolean") return value ? "已通过" : "未通过";
        if (value === null || value === undefined) return "—";
        if (typeof value === "object") return JSON.stringify(value);
        return `${value}${metric && metric.unit || ""}`;
    }

    function renderMetrics(view, container) {
        const grid = element("div", "simulation-metrics");
        (view.metrics || []).forEach(metric => {
            const card = element("div", "simulation-metric");
            card.append(
                element("span", "", metric.label || metric.path),
                element("strong", "", displayValue(pointer(stateDocument(), metric.path), metric))
            );
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }

    function renderTimeline(view, container) {
        const rows = pointer(stateDocument(), view.path, []);
        const list = element("ol", "simulation-timeline");
        (Array.isArray(rows) ? rows.slice().reverse() : []).forEach(item => {
            const row = element("li", `is-${String(item.level || "info").replace(/[^a-z0-9_-]/gi, "")}`);
            row.append(
                element("small", "", item.turn !== undefined ? `回合 ${item.turn}` : "事件"),
                element("span", "", item.message || JSON.stringify(item))
            );
            list.appendChild(row);
        });
        container.appendChild(list);
    }

    function renderTable(view, container) {
        const rows = pointer(stateDocument(), view.path, []);
        const columns = Array.isArray(view.columns) && view.columns.length
            ? view.columns
            : Array.from(new Set((Array.isArray(rows) ? rows : []).flatMap(row => Object.keys(row || {})))).slice(0, 12).map(field => ({field, label: field}));
        const table = element("table", "simulation-table");
        const head = element("thead");
        const headRow = element("tr");
        columns.forEach(column => headRow.appendChild(element("th", "", column.label || column.field)));
        head.appendChild(headRow);
        const body = element("tbody");
        (Array.isArray(rows) ? rows : []).slice(0, 200).forEach(item => {
            const row = element("tr");
            columns.forEach(column => {
                const value = item && item[column.field];
                row.appendChild(element("td", "", typeof value === "object" ? JSON.stringify(value) : value));
            });
            body.appendChild(row);
        });
        table.append(head, body);
        container.appendChild(table);
    }

    function renderState(view, container) {
        const value = pointer(stateDocument(), view.path || "/public", {});
        const pre = element("pre", "simulation-state-tree");
        pre.textContent = JSON.stringify(value, null, 2);
        container.appendChild(pre);
    }

    function renderActiveView() {
        const container = root.querySelector("[data-simulation-view]");
        container.replaceChildren();
        const view = (run.scenario && run.scenario.views || []).find(item => item.id === activeViewId);
        if (!view) {
            container.appendChild(element("div", "simulation-empty", "此场景没有可用视图。"));
            return;
        }
        ({
            topology: renderTopology,
            spectrum: renderSpectrum,
            metrics: renderMetrics,
            timeline: renderTimeline,
            table: renderTable,
            state: renderState,
        }[view.type] || renderState)(view, container);
    }

    function parameterControl(action, parameter) {
        const field = element("div", "simulation-action-field");
        const id = `simulation-${action.id}-${parameter.id}`;
        const label = element("label", "", parameter.label || parameter.id);
        label.htmlFor = id;
        let control;
        if (parameter.type === "choice" || parameter.type === "entity" || parameter.type === "boolean") {
            control = element("select", "form-control");
            const options = parameter.type === "boolean"
                ? [{value: true, label: "是"}, {value: false, label: "否"}]
                : parameter.options || [];
            if (!parameter.required) {
                const empty = element("option", "", "不设置");
                empty.value = "";
                control.appendChild(empty);
            }
            options.forEach(optionValue => {
                const optionDefinition = optionValue && typeof optionValue === "object"
                    ? optionValue
                    : {value: optionValue, label: optionValue};
                const option = element("option", "", optionDefinition.label);
                option.value = JSON.stringify(optionDefinition.value);
                if (parameter.default === optionDefinition.value) option.selected = true;
                control.appendChild(option);
            });
        } else if (parameter.type === "number") {
            control = element("input", "form-control");
            control.type = "number";
            if (parameter.min !== undefined) control.min = parameter.min;
            if (parameter.max !== undefined) control.max = parameter.max;
            if (parameter.step !== undefined) control.step = parameter.step;
            if (parameter.default !== undefined) control.value = parameter.default;
        } else {
            control = element("input", "form-control");
            control.type = "text";
            control.placeholder = parameter.placeholder || "";
            control.maxLength = Number(parameter.maxLength || 1000);
            if (parameter.default !== undefined) control.value = parameter.default;
        }
        control.id = id;
        control.dataset.parameterId = parameter.id;
        control.dataset.parameterType = parameter.type;
        control.required = Boolean(parameter.required);
        field.append(label, control);
        return field;
    }

    function readParameters(card, action) {
        const values = {};
        (action.parameters || []).forEach(parameter => {
            const control = card.querySelector(`[data-parameter-id="${CSS.escape(parameter.id)}"]`);
            if (!control || control.value === "") return;
            if (parameter.type === "number") values[parameter.id] = Number(control.value);
            else if (parameter.type === "choice" || parameter.type === "entity" || parameter.type === "boolean") {
                values[parameter.id] = JSON.parse(control.value);
            } else values[parameter.id] = control.value;
        });
        return values;
    }

    function setActionPending(pending) {
        actionPending = pending;
        root.querySelectorAll(".simulation-action-submit").forEach(button => {
            const action = (run.actions || []).find(item => item.id === button.dataset.actionId);
            button.disabled = pending || !action || !action.available;
            const icon = button.querySelector("i");
            if (icon) {
                icon.className = pending
                    ? "fas fa-circle-notch fa-spin"
                    : "fas fa-play";
            }
        });
        root.querySelector("[data-simulation-action-state]").textContent = pending
            ? "正在验证并提交状态迁移…"
            : "选择一个操作推进场景";
    }

    function showObservation(message, level) {
        const observation = root.querySelector("[data-simulation-observation]");
        observation.hidden = !message;
        observation.textContent = message || "";
        observation.classList.remove("is-success", "is-warning", "is-error");
        if (level) observation.classList.add(`is-${level}`);
    }

    function workspaceBanner(message, type, action) {
        if (typeof window.animateBanner !== "function") return;
        const controls = document.querySelector(".challenge-workspace .workspace-controls");
        if (!controls) return;
        window.animateBanner({target: controls}, message, type, action);
    }

    function bannerText(value) {
        return $("<div>").text(String(value || "")).html();
    }

    async function executeAction(action, card) {
        if (actionPending || !action.available) return;
        setActionPending(true);
        try {
            const payload = await request(`/pwncollege_api/v1/simulations/${encodeURIComponent(run.id)}/actions`, {
                method: "POST",
                body: JSON.stringify({
                    actionId: action.id,
                    parameters: readParameters(card, action),
                    expectedTurn: run.turn,
                }),
            });
            run = payload.run;
            showObservation(
                payload.observation && payload.observation.message,
                payload.accepted ? payload.observation && payload.observation.level : "warning"
            );
            render();
            if (!payload.accepted) {
                workspaceBanner(
                    bannerText(
                        payload.observation && payload.observation.message
                        || "当前不能执行此操作。"
                    ),
                    "warn"
                );
            }
            if (payload.completed) {
                workspaceBanner(
                    `&#127881 已完成 <b>${$("<div>").text(run.challenge.name).html()}</b> 的全部模拟目标！&#127881`,
                    "success",
                    {label: "查看评分", href: run.challenge.scoreUrl}
                );
                window.dispatchEvent(new CustomEvent("dojo:attempt-changed"));
            } else if (run.status === "OBJECTIVES_COMPLETE") {
                workspaceBanner("模拟目标已经完成，请按题目要求继续完成联合验证。", "success");
            } else if (run.status === "FAILED") {
                workspaceBanner("本轮模拟已到达终止条件，可以重置后重新尝试。", "warn");
            }
        } catch (error) {
            showObservation(error.message || "操作失败。", "error");
            workspaceBanner(
                bannerText(error.message || "模拟操作失败。"),
                "error"
            );
            if (error.code === "STALE_TURN") {
                await load(true);
            }
        } finally {
            setActionPending(false);
        }
    }

    function renderActions() {
        const container = root.querySelector("[data-simulation-actions]");
        container.replaceChildren();
        const groups = new Map();
        (run.actions || []).forEach(action => {
            const group = action.group || "操作";
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push(action);
        });
        groups.forEach((actions, groupName) => {
            const group = element("section", "simulation-action-group");
            group.appendChild(element("h4", "simulation-action-group-title", groupName));
            actions.forEach(action => {
                const card = element("div", "simulation-action");
                const header = element("div", "simulation-action-header");
                const copy = element("div");
                copy.append(
                    element("strong", "", action.label),
                    element("span", "simulation-action-description", action.description || "")
                );
                header.appendChild(copy);
                if (action.semantic) {
                    const badge = element("span", "simulation-action-badge");
                    badge.innerHTML = '<i class="fas fa-brain" aria-hidden="true"></i> Agent';
                    header.appendChild(badge);
                }
                card.appendChild(header);
                if (!action.available && action.unavailableReason) {
                    card.appendChild(element("span", "simulation-action-unavailable", action.unavailableReason));
                }
                if ((action.parameters || []).length) {
                    const fields = element("div", "simulation-action-fields");
                    action.parameters.forEach(parameter => fields.appendChild(parameterControl(action, parameter)));
                    card.appendChild(fields);
                }
                const button = element("button", "simulation-action-submit");
                button.type = "button";
                button.dataset.actionId = action.id;
                button.disabled = actionPending || !action.available;
                const icon = element("i");
                icon.className = "fas fa-play";
                icon.setAttribute("aria-hidden", "true");
                button.append(icon, document.createTextNode(" 执行"));
                button.addEventListener("click", () => executeAction(action, card));
                card.appendChild(button);
                group.appendChild(card);
            });
            container.appendChild(group);
        });
    }

    function render() {
        if (!root || !run) return;
        renderHeader();
        renderObjectives();
        renderViewTabs();
        renderActiveView();
        renderActions();
        setActionPending(actionPending);
    }

    async function load(force) {
        if (loadingPromise && !force) return loadingPromise;
        setLoading(true);
        const runId = root.dataset.runId;
        const path = runId
            ? `/pwncollege_api/v1/simulations/${encodeURIComponent(runId)}`
            : "/pwncollege_api/v1/simulations/current";
        loadingPromise = request(path)
            .then(payload => {
                if (!payload.run) throw new Error("当前没有可用的模拟运行，请重新启动题目。");
                run = payload.run;
                root.dataset.runId = run.id;
                render();
                setLoading(false);
                return run;
            })
            .catch(error => {
                setLoading(true, error.message || "无法载入模拟运行。");
                const overlay = root.querySelector("[data-simulation-loading]");
                const title = overlay && overlay.querySelector("strong");
                if (title) title.textContent = "模拟环境不可用";
                throw error;
            })
            .finally(() => {
                loadingPromise = null;
            });
        return loadingPromise;
    }

    function activate() {
        if (!root) root = document.querySelector("[data-simulation-workspace]");
        if (!root) return Promise.resolve(null);
        root.hidden = false;
        return run ? Promise.resolve(run) : load(false);
    }

    function deactivate() {
        if (root) root.hidden = true;
    }

    document.addEventListener("DOMContentLoaded", () => {
        root = document.querySelector("[data-simulation-workspace]");
        if (!root) return;
        document.documentElement.classList.add("scenario-runner-active");
        activate().catch(error => {
            showObservation(error.message || "情境题暂时无法载入。", "error");
        });
    });

    window.AISecEduSimulation = {
        activate,
        deactivate,
        reload: () => load(true),
        current: () => run,
    };
})();
