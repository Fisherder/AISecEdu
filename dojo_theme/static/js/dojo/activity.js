document.addEventListener("DOMContentLoaded", async () => {
    const tracker = document.getElementById("activity-tracker");
    if (!tracker) return;

    const userID = tracker.dataset.userId || tracker.getAttribute("user-id");
    const DAY = 86400000;
    const monthNames = [
        "1 月", "2 月", "3 月", "4 月", "5 月", "6 月",
        "7 月", "8 月", "9 月", "10 月", "11 月", "12 月",
    ];

    function localDateKey(value) {
        const date = new Date(value);
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 10);
    }

    function dayLabel(value) {
        return new Intl.DateTimeFormat("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "short",
        }).format(value);
    }

    function shortDayLabel(value) {
        return new Intl.DateTimeFormat("zh-CN", {
            year: "numeric",
            month: "numeric",
            day: "numeric",
        }).format(value);
    }

    function dailyCounts(timestamps) {
        return timestamps.reduce((counts, timestamp) => {
            const date = new Date(timestamp);
            if (Number.isNaN(date.getTime())) return counts;
            const key = localDateKey(date);
            counts[key] = (counts[key] || 0) + 1;
            return counts;
        }, {});
    }

    function streaks(counts, today) {
        const activeKeys = Object.keys(counts).filter(key => counts[key] > 0).sort();
        let best = 0;
        let running = 0;
        let previous = null;
        activeKeys.forEach(key => {
            const current = new Date(`${key}T00:00:00`);
            if (previous && Math.round((current - previous) / DAY) === 1) {
                running += 1;
            } else {
                running = 1;
            }
            best = Math.max(best, running);
            previous = current;
        });

        const todayKey = localDateKey(today);
        const yesterday = new Date(today.getTime() - DAY);
        let cursor = counts[todayKey] ? new Date(today) : yesterday;
        let current = 0;
        while (counts[localDateKey(cursor)] > 0) {
            current += 1;
            cursor = new Date(cursor.getTime() - DAY);
        }
        return {current, best};
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() - 52 * 7);
    const totalDays = Math.floor((today - start) / DAY) + 1;

    const graph = document.createElement("div");
    graph.className = "activity-graph";
    graph.innerHTML = `
        <div class="profile-activity-summary" aria-label="年度活动摘要"></div>
        <div class="profile-activity-scroll">
            <div class="activity-calendar">
                <div class="month-labels" aria-hidden="true"></div>
                <div class="grid-container" role="grid" aria-label="过去一年的每日学习活动"></div>
            </div>
        </div>
        <div class="profile-activity-footer">
            <span class="profile-activity-range"></span>
            <div class="legend" aria-label="活动强度图例">
                <span>较少</span>
                <div class="legend-cells" aria-hidden="true"></div>
                <span>较多</span>
            </div>
        </div>`;
    tracker.replaceChildren(graph);

    const grid = graph.querySelector(".grid-container");
    const monthLabels = graph.querySelector(".month-labels");
    const legendCells = graph.querySelector(".legend-cells");
    const range = graph.querySelector(".profile-activity-range");
    const summary = graph.querySelector(".profile-activity-summary");
    const cells = new Map();
    let previousMonth = null;

    for (let offset = 0; offset < totalDays; offset += 1) {
        const date = new Date(start.getTime() + offset * DAY);
        const key = localDateKey(date);
        const cell = document.createElement("span");
        cell.className = "activity-cell level-0";
        cell.dataset.date = key;
        cell.dataset.count = "0";
        cell.title = `${dayLabel(date)}：未完成题目`;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", cell.title);
        cell.tabIndex = -1;
        grid.appendChild(cell);
        cells.set(key, cell);

        const month = date.getMonth();
        if (month !== previousMonth && (date.getDate() <= 7 || offset === 0)) {
            const label = document.createElement("span");
            label.className = "month-label";
            label.textContent = monthNames[month];
            label.style.left = `${Math.floor(offset / 7) * 14}px`;
            monthLabels.appendChild(label);
            previousMonth = month;
        }
    }

    for (let level = 0; level < 5; level += 1) {
        const cell = document.createElement("span");
        cell.className = `activity-cell level-${level}`;
        legendCells.appendChild(cell);
    }
    range.textContent = `统计范围：${shortDayLabel(start)} 至 ${shortDayLabel(today)}`;

    function renderSummary(counts, total) {
        const values = Object.values(counts);
        const activeDays = values.filter(value => value > 0).length;
        const maximum = values.length ? Math.max(...values) : 0;
        const {current, best} = streaks(counts, today);
        summary.innerHTML = `
            <span><strong>${total}</strong> 次完成</span>
            <span><strong>${activeDays}</strong> 个活跃日</span>
            <span><strong>${current}</strong> 天连续学习</span>
            <span><strong>${best}</strong> 天最长连续</span>
            <span><strong>${maximum}</strong> 次单日最高</span>`;
    }

    function renderGrid(counts) {
        const maximum = Math.max(...Object.values(counts), 1);
        cells.forEach((cell, key) => {
            const count = counts[key] || 0;
            const date = new Date(`${key}T00:00:00`);
            let level = 0;
            if (count > 0) {
                const ratio = count / maximum;
                if (ratio >= 0.76) level = 4;
                else if (ratio >= 0.51) level = 3;
                else if (ratio >= 0.26) level = 2;
                else level = 1;
            }
            cell.className = `activity-cell level-${level}`;
            cell.dataset.count = String(count);
            cell.title = `${dayLabel(date)}：${count ? `完成 ${count} 道题目` : "未完成题目"}`;
            cell.setAttribute("aria-label", cell.title);
            cell.tabIndex = count ? 0 : -1;
        });
    }

    try {
        let result;
        if (window.AISecEdu && typeof window.AISecEdu.request === "function") {
            result = await window.AISecEdu.request(
                `/pwncollege_api/v1/activity/${encodeURIComponent(userID)}`,
                {method: "GET", unwrap: false, cacheTtlMs: 30000},
            );
        } else {
            const request = window.CTFd?.fetch
                ? window.CTFd.fetch.bind(window.CTFd)
                : window.fetch.bind(window);
            const response = await request(`/pwncollege_api/v1/activity/${encodeURIComponent(userID)}`, {
                method: "GET",
                credentials: "same-origin",
                headers: {Accept: "application/json"},
            });
            result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "活动数据暂时不可用");
            }
        }
        const timestamps = Array.isArray(result.data?.solve_timestamps)
            ? result.data.solve_timestamps
            : [];
        const counts = dailyCounts(timestamps);
        renderGrid(counts);
        renderSummary(counts, Number(result.data?.total_solves || timestamps.length));
    } catch (error) {
        graph.replaceChildren();
        const message = document.createElement("div");
        message.className = "profile-empty-state is-compact";
        message.innerHTML = `<span><i class="fas fa-chart-area" aria-hidden="true"></i></span><div><strong>暂时无法读取学习活动</strong><p></p></div>`;
        message.querySelector("p").textContent = error.message || "请稍后刷新页面重试。";
        graph.appendChild(message);
    }
});
