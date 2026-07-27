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
        ACTIVE: "进行中",
        SOLVED: "已完成",
        STOPPED: "已停止",
        INTERRUPTED: "已切换",
        COMPLETED: "已完成",
      })[status] || status || "未知";
    }

    function evidenceLabel(type) {
      return ({
        "lab.started": "题目环境已启动",
        "lab.stopped": "题目环境已停止",
        "lab.interrupted": "题目环境已切换",
        "terminal.command.completed": "终端命令已完成",
        "tutor.chat.user": "向 Tutor 提问",
        "tutor.chat.assistant": "Tutor 提供引导",
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
        const citations = [
          ...(evidence.evidenceSequences || []).map(sequence => `事件 #${sequence}`),
          ...(evidence.containerEvidence || []),
        ].slice(0, 8);
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
            ${citations.length ? `<div class="learning-score-citations">${citations.map(item => `<span>${learning.escapeHtml(item)}</span>`).join("")}</div>` : ""}
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
        ? `证据链已验证 · ${events.length} 条`
        : `证据链待复核 · ${events.length} 条`;
      document.getElementById("learning-score-evidence").innerHTML = events.length
        ? events.map(event => `
          <article class="learning-score-evidence-item">
            <span class="learning-score-evidence-sequence">#${learning.escapeHtml(event.sequence)}</span>
            <span class="learning-score-evidence-dot is-s${learning.escapeHtml(event.trustLevel)}"></span>
            <div>
              <h3>${learning.escapeHtml(evidenceLabel(event.type))}</h3>
              <p>S${learning.escapeHtml(event.trustLevel)} · ${learning.escapeHtml(event.source)} · ${learning.escapeHtml(learning.formatDate(event.occurred))}</p>
            </div>
          </article>`).join("")
        : '<p class="learning-score-empty-copy">本次作答暂时没有可展示的过程事件。</p>';
    }

    function render(attempt) {
      const assessment = attempt.assessment;
      const total = Number(attempt.totalScore) || 0;
      document.getElementById("learning-score-title").textContent = attempt.challengeName;
      document.getElementById("learning-score-meta").textContent =
        `${attempt.dojoName} · ${attempt.moduleName} · 第 ${attempt.epoch} 次作答 · ${statusLabel(attempt.status)}`;
      document.getElementById("learning-score-challenge-link").href = attempt.challengeUrl;
      document.getElementById("learning-score-course-link").href = attempt.courseLearningUrl;
      document.getElementById("learning-score-total").textContent = total;
      document.getElementById("learning-score-objective").textContent = Number(attempt.objectiveScore) || 0;
      document.getElementById("learning-score-process").textContent = Number(attempt.processScore) || 0;
      document.getElementById("learning-score-trust").textContent = `${Math.round((Number(attempt.trustScore) || 0) * 100)}%`;
      document.getElementById("learning-score-level").textContent = levelLabel(total);
      document.getElementById("learning-score-ring").style.setProperty("--score-progress", `${Math.max(0, Math.min(100, total)) * 3.6}deg`);
      document.getElementById("learning-score-feedback").textContent = assessment
        ? assessment.feedback || "本次评分已根据可信学习证据生成。"
        : "客观结果已记录，过程评分将在形成评估后显示。";
      document.getElementById("learning-score-revision").textContent = assessment
        ? `修订 ${assessment.revision} · ${assessment.source}`
        : "尚无评估修订";
      document.getElementById("learning-score-reflection").textContent =
        attempt.reflection || "本次作答尚未填写复盘。可前往课程学习分析中的尝试记录补充复盘并重新评估。";
      renderCriteria(assessment ? assessment.criteria : []);
      renderAbilities(assessment ? assessment.abilities : {});
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
