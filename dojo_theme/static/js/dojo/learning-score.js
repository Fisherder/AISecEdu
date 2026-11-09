(function () {
  let bootAttempts = 0;

  function boot() {
    const root = document.getElementById("learning-score-page");
    if (!root || root.dataset.scoreReady === "true") return;
    if (!window.DojoLearning) {
      if (bootAttempts < 100) {
        bootAttempts += 1;
        window.setTimeout(boot, 50);
      }
      return;
    }
    root.dataset.scoreReady = "true";

    const learning = window.DojoLearning;
    const notice = document.getElementById("learning-score-notice");
    const content = root.querySelector(".learning-score-content");

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false}).format(date) : "—";
  }

    function statusLabel(status) {
      return ({
        NOT_STARTED: "未开始",
        IN_PROGRESS: "进行中",
        SUBMITTED: "已提交",
        COMPLETED: "已完成",
      })[status] || "状态待更新";
    }

    function evidenceStateLabel(state) {
      return ({
        NONE: "暂无过程证据",
        PARTIAL: "已有部分记录",
        COMPLETE: "过程记录完整",
        INVALID: "过程记录待复核",
      })[state] || "证据状态待更新";
    }

    function evidenceLabel(type) {
      return ({
        "runtime.state.snapshot": "实验环境状态记录",
      "workspace.file.saved": "代码文件已保存",
      "coding.submission.verified": "编程作业已核验",
      "coding.basic.completed": "基础部分已完成",
      "lab.started": "题目环境已启动",
        "lab.stopped": "题目环境已停止",
        "lab.interrupted": "题目环境已切换",
        "terminal.command.completed": "终端命令已完成",
        "tutor.chat.user": "向 AI 学习助手提问",
        "tutor.chat.assistant": "AI 学习助手提供引导",
        "flag.compared": "Flag 已校验",
        "oracle.observed": "客观目标已验证",
        "assessment.created": "评分已生成",
        "attempt.reflection.saved": "复盘已保存",
      })[type] || type || "学习事件";
    }

    function scoreNumber(value) {
      if (value == null || typeof value === "boolean" || typeof value === "object" || String(value).trim() === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }

    function renderCriteria(criteria) {
      document.getElementById("learning-score-criteria").innerHTML = (criteria || []).map(criterion => {
        const score = scoreNumber(criterion.score);
        const maximum = scoreNumber(criterion.maxScore);
        const percent = score != null && maximum > 0 ? Math.max(0, Math.min(100, score / maximum * 100)) : null;
        const evidence = criterion.evidence || {};
        const citationCount = (evidence.evidenceSequences || []).length
          + (evidence.containerEvidence || []).length;
        return `
          <section class="learning-score-criterion">
            <div class="learning-score-criterion-heading">
              <div>
                <h3>${learning.escapeHtml(criterion.title || criterion.id)}</h3>
                ${evidence.rationale ? `<p>${learning.escapeHtml(evidence.rationale)}</p>` : ""}
              </div>
              <strong>${score == null ? "—" : learning.escapeHtml(score)} ${maximum == null ? "" : `<span>/ ${learning.escapeHtml(maximum)}</span>`}</strong>
            </div>
            ${percent == null ? "" : `<div class="learning-score-progress" role="progressbar" aria-label="${learning.escapeHtml(criterion.title || criterion.id)}" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
              <span style="width:${percent}%"></span>
            </div>`}
            ${citationCount ? `<div class="learning-score-citations"><span>已关联 ${learning.escapeHtml(citationCount)} 项可核验证据</span></div>` : ""}
          </section>`;
      }).join("") || '<p class="learning-score-empty-copy">暂无评分明细。</p>';
    }

    function renderAbilities(abilities) {
      const dimensions = [
        ["reconnaissance_environment", "环境侦察"],
        ["technical_reasoning", "技术推理"],
        ["tool_orchestration", "工具编排"],
        ["debugging_adaptation", "调试与调整"],
        ["solution_validation", "方案验证"],
        ["safety_independence", "安全与独立性"],
      ];
      const values = dimensions.map(([dimension, label]) => {
        const ability = abilities && abilities[dimension];
        const score = scoreNumber(ability && ability.score);
        return {label: ability && ability.label || label, value: score == null ? null : Math.max(0, Math.min(100, score))};
      });
      const radar = document.getElementById("learning-score-radar");
      radar.innerHTML = window.DojoSkillChart
        ? window.DojoSkillChart.render(values, {label: "本次六维表现", compact: true, unit: "分"})
        : "";
      document.getElementById("learning-score-abilities").innerHTML = values.map(ability => `
        <div class="learning-score-ability ${ability.value == null ? "is-unknown" : ""}">
          <div><span>${learning.escapeHtml(ability.label)}</span><strong>${ability.value == null ? "待评估" : learning.escapeHtml(ability.value)}</strong></div>
          ${ability.value == null ? "" : `<div class="learning-score-progress" role="progressbar" aria-label="${learning.escapeHtml(ability.label)}本次得分" aria-valuenow="${ability.value}" aria-valuemin="0" aria-valuemax="100"><span style="width:${ability.value}%"></span></div>`}
        </div>`).join("");
    }

    function renderEvidence(attempt) {
      const events = attempt.evidence || [];
      document.getElementById("learning-score-chain").textContent = !events.length
        ? "暂无过程记录"
        : attempt.evidenceChain && attempt.evidenceChain.valid
          ? `记录校验通过 · ${events.length} 条`
          : `记录待复核 · ${events.length} 条`;
      document.getElementById("learning-score-evidence").innerHTML = events.length
        ? events.map((event, index) => `
          <article class="learning-score-evidence-item">
            <span class="learning-score-evidence-sequence">${index + 1}</span>
            <span class="learning-score-evidence-dot ${Number(event.trustLevel) >= 3 ? "is-verifiable" : "is-learner"}"></span>
            <div>
              <h3>${learning.escapeHtml(evidenceLabel(event.type))}</h3>
              <p>${Number(event.trustLevel) >= 3 ? "可核验记录" : "学习者记录"} · ${learning.escapeHtml(formatDate(event.occurred))}</p>
            </div>
          </article>`).join("")
        : '<p class="learning-score-empty-copy">本次作答暂时没有可展示的过程事件。</p>';
    }

    function render(attempt) {
      const assessment = attempt.assessment;
      const assessmentReady = attempt.assessmentState === "READY" && Boolean(assessment);
      const total = assessmentReady ? scoreNumber(assessment.totalScore) : null;
      const objectiveScore = assessmentReady ? scoreNumber(assessment.objectiveScore) : null;
      const processScore = assessmentReady ? scoreNumber(assessment.processScore) : null;
      document.getElementById("learning-score-title").textContent = attempt.challengeName;
      document.getElementById("learning-score-meta").textContent =
        `${attempt.dojoName} · ${attempt.moduleName} · 第 ${attempt.epoch} 次学习 · ${statusLabel(attempt.activityState)}`;
      document.getElementById("learning-score-challenge-link").href = attempt.challengeUrl;
      document.getElementById("learning-score-course-link").href = attempt.courseLearningUrl;
      document.getElementById("learning-score-total").textContent = total == null ? "—" : total;
      document.getElementById("learning-score-total-unit").hidden = total == null;
      document.getElementById("learning-score-objective").textContent = objectiveScore == null ? "—" : objectiveScore;
      document.querySelector("#learning-score-objective-value > span:last-child").hidden = objectiveScore == null;
      document.getElementById("learning-score-process").textContent = processScore == null ? "—" : processScore;
      document.querySelector("#learning-score-process-value > span:last-child").hidden = processScore == null;
      document.getElementById("learning-score-trust").textContent = evidenceStateLabel(attempt.evidenceState);
      document.getElementById("learning-score-level").textContent = assessmentReady
        ? total == null ? "评分数据待更新" : "评分已完成"
        : attempt.assessmentState === "PENDING"
          ? "等待评分"
          : attempt.assessmentState === "FAILED" ? "评分未完成" : "尚未形成评分";
      document.getElementById("learning-score-ring").classList.toggle("is-pending", total == null);
      document.getElementById("learning-score-ring").style.setProperty("--score-progress", `${total == null ? 0 : Math.max(0, Math.min(100, total)) * 3.6}deg`);
      document.getElementById("learning-score-feedback").textContent = assessmentReady
        ? assessment.feedback || ""
        : attempt.assessmentState === "PENDING"
          ? `已提交于 ${formatDate(attempt.submitted)}。`
          : attempt.assessmentState === "FAILED" ? "本次评分未完成，可返回题目查看提交状态。" : "完成并提交后查看本次评分。";
      const credit = assessmentReady ? Number(assessment.scorePolicy && assessment.scorePolicy.completionCredit) || 0 : 0;
      const creditNotice = document.getElementById("learning-score-completion-credit");
      if (creditNotice) {
        creditNotice.hidden = credit <= 0;
        creditNotice.textContent = credit > 0 ? `有效 flag 已通过：完成奖励 +${credit} 分，补足至 90 分。` : "";
      }
      document.getElementById("learning-score-revision").textContent = assessment
        ? `第 ${assessment.revision} 次评估`
        : "等待评估";
      document.getElementById("learning-score-reflection").textContent =
        attempt.reflection || "本次暂无学习复盘，可在学习进展的学习记录中补充。";
      const policy = assessmentReady && assessment.scorePolicy;
      document.getElementById("learning-score-policy-notice").hidden = !policy;
      document.getElementById("learning-score-policy-copy").textContent = policy && policy.notice || "";
      if (assessment?.source === "CODING_RUBRIC") {
        const criteria = assessment.criteria || [];
        const maximumFor = predicate => {
          const values = criteria.filter(predicate).map(item => scoreNumber(item.maxScore));
          return values.length && values.every(value => value != null) ? values.reduce((sum, value) => sum + value, 0) : null;
        };
        const basicMaximum = maximumFor(item => item.stage === "basic");
        const thinkingMaximum = maximumFor(item => item.stage === "thinking" || item.id === "ai.quality");
        document.getElementById("learning-score-objective-label").textContent = "基础部分";
        document.getElementById("learning-score-process-label").textContent = "思考题";
        document.querySelector("#learning-score-objective-value > span:last-child").textContent = basicMaximum == null ? "" : `/ ${basicMaximum}`;
        document.querySelector("#learning-score-process-value > span:last-child").textContent = thinkingMaximum == null ? "" : `/ ${thinkingMaximum}`;
        document.getElementById("learning-score-policy-copy").textContent = assessment.scorePolicy && assessment.scorePolicy.notice || "本作业按保存的基础与思考题量规计算。";
        document.getElementById("learning-score-reflection").textContent = "已保存源码与核验结果，可在“工程与核验”中查看提交记录、AI 评价和代码。";
      }
      renderCriteria(assessmentReady ? assessment.criteria : []);
      renderAbilities(assessmentReady ? assessment.abilities : {});
      renderEvidence(attempt);
    }

    learning.request(`/learning/attempts/${encodeURIComponent(root.dataset.attemptId)}`)
      .then(response => {
        if (!response.success || !response.attempt) {
          throw new Error(learning.errorMessage(response, "无法加载评分详情。"));
        }
        render(response.attempt);
        notice.hidden = true;
        content.hidden = false;
        root.setAttribute("aria-busy", "false");
      })
      .catch(error => {
        notice.hidden = false;
        notice.className = "learning-score-notice alert alert-danger";
        notice.textContent = error.message || "无法加载评分详情。";
        root.setAttribute("aria-busy", "false");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {once: true});
  } else {
    boot();
  }
})();
