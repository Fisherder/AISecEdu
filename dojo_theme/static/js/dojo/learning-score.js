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

    function levelLabel(score) {
      if (score >= 90) return "掌握扎实";
      if (score >= 75) return "完成良好";
      if (score >= 60) return "目标已达成";
      return "继续补强";
    }

    function renderCriteria(criteria) {
      document.getElementById("learning-score-criteria").innerHTML = (criteria || []).map(criterion => {
        const score = Number(criterion.score) || 0;
        const maximum = Number(criterion.maxScore) || 0;
        const percent = maximum ? Math.max(0, Math.min(100, score / maximum * 100)) : 0;
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
              <strong>${learning.escapeHtml(score)} <span>/ ${learning.escapeHtml(maximum)}</span></strong>
            </div>
            <div class="learning-score-progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
              <span style="width:${percent}%"></span>
            </div>
            ${citationCount ? `<div class="learning-score-citations"><span>已关联 ${learning.escapeHtml(citationCount)} 项可核验证据</span></div>` : ""}
          </section>`;
      }).join("");
    }

    function renderAbilities(abilities) {
      const values = Object.values(abilities || {});
      document.getElementById("learning-score-abilities").innerHTML = values.length
        ? values.map(ability => {
          const score = Math.max(0, Math.min(100, Number(ability.score) || 0));
          return `
            <div class="learning-score-ability">
              <div><span>${learning.escapeHtml(ability.label)}</span><strong>${learning.escapeHtml(score)}</strong></div>
              <div class="learning-score-progress"><span style="width:${score}%"></span></div>
            </div>`;
        }).join("")
        : '<p class="learning-score-empty-copy">当前评分尚未产生能力维度数据。</p>';
    }

    function renderEvidence(attempt) {
      const events = attempt.evidence || [];
      document.getElementById("learning-score-chain").textContent = attempt.evidenceChain && attempt.evidenceChain.valid
        ? `过程记录完整，可复核 · ${events.length} 条`
        : `过程记录待复核 · ${events.length} 条`;
      document.getElementById("learning-score-evidence").innerHTML = events.length
        ? events.map((event, index) => `
          <article class="learning-score-evidence-item">
            <span class="learning-score-evidence-sequence">${index + 1}</span>
            <span class="learning-score-evidence-dot ${Number(event.trustLevel) >= 3 ? "is-verifiable" : "is-learner"}"></span>
            <div>
              <h3>${learning.escapeHtml(evidenceLabel(event.type))}</h3>
              <p>${Number(event.trustLevel) >= 3 ? "可核验记录" : "学习者记录"} · ${learning.escapeHtml(learning.formatDate(event.occurred))}</p>
            </div>
          </article>`).join("")
        : '<p class="learning-score-empty-copy">本次作答暂时没有可展示的过程事件。</p>';
    }

    function render(attempt) {
      const assessment = attempt.assessment;
      const assessmentReady = attempt.assessmentState === "READY" && Boolean(assessment);
      const total = assessmentReady ? Number(assessment.totalScore) || 0 : null;
      document.getElementById("learning-score-title").textContent = attempt.challengeName;
      document.getElementById("learning-score-meta").textContent =
        `${attempt.dojoName} · ${attempt.moduleName} · 第 ${attempt.epoch} 次学习 · ${statusLabel(attempt.activityState)}`;
      document.getElementById("learning-score-challenge-link").href = attempt.challengeUrl;
      document.getElementById("learning-score-course-link").href = attempt.courseLearningUrl;
      document.getElementById("learning-score-total").textContent = assessmentReady ? total : "—";
      document.getElementById("learning-score-total-unit").hidden = !assessmentReady;
      document.getElementById("learning-score-objective").textContent = assessmentReady ? Number(assessment.objectiveScore) || 0 : "—";
      document.querySelector("#learning-score-objective-value > span:last-child").hidden = !assessmentReady;
      document.getElementById("learning-score-process").textContent = assessmentReady ? Number(assessment.processScore) || 0 : "—";
      document.querySelector("#learning-score-process-value > span:last-child").hidden = !assessmentReady;
      document.getElementById("learning-score-trust").textContent = evidenceStateLabel(attempt.evidenceState);
      document.getElementById("learning-score-level").textContent = assessmentReady
        ? levelLabel(total)
        : attempt.assessmentState === "PENDING"
          ? "等待评分"
          : "尚未形成评分";
      document.getElementById("learning-score-ring").classList.toggle("is-pending", !assessmentReady);
      document.getElementById("learning-score-ring").style.setProperty("--score-progress", `${assessmentReady ? Math.max(0, Math.min(100, total)) * 3.6 : 0}deg`);
      document.getElementById("learning-score-feedback").textContent = assessmentReady
        ? assessment.feedback || "本次评分已根据客观结果与可核验过程生成。"
        : attempt.assessmentState === "PENDING"
          ? `已提交于 ${learning.formatDate(attempt.submitted)}；评分完成前不会显示 0 分占位。`
          : "完成并提交本次学习后，这里会显示单次评分结果。";
      document.getElementById("learning-score-revision").textContent = assessment
        ? `第 ${assessment.revision} 次评估`
        : "等待评估";
      document.getElementById("learning-score-reflection").textContent =
        attempt.reflection || "本次作答尚未填写复盘。可前往课程学习分析中的尝试记录补充复盘并重新评估。";
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
      })
      .catch(error => {
        notice.hidden = false;
        notice.className = "learning-score-notice alert alert-danger";
        notice.textContent = error.message || "无法加载评分详情。";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {once: true});
  } else {
    boot();
  }
})();
