(function () {
  "use strict";
  const root = document.getElementById("teaching-showcase");
  const model = window.AISecEduTeachingShowcase;
  const api = window.DojoLearning;
  if (!root || !model || !api) return;
  const el = (id) => document.getElementById(`showcase-${id}`);
  const escape = api.escapeHtml;
  let state = model.initial();
  let timer = null;
  const debate = [
    ["立论", "优先限制异常影响，防止风险继续传递；同时保留变更与观测证据。", "单一仪表可能误报。应迅速比较控制指令与独立观测，避免无依据中断运行。", "请两组各提出一个可检验的判断依据，区分事实、推测和处置建议。"],
    ["质询", "如果反馈本身失真，等待多久仍可接受？请给出隔离触发条件。", "立即停机是否产生新的风险？请说明安全降级与直接中断的区别。", "回到画面中的两条证据链：什么观察会让你改变最初的立场？"],
    ["综合决策", "当独立证据证实偏移，应先限制影响，再分阶段恢复可信控制。", "同意设置证据阈值与时间上限。恢复时也需要核验，不能只看仪表正常。", "请学生给出有条件的方案：何时核验、何时隔离、如何恢复。按证据、因果、权衡和表达四项评价。"]
  ];
  function dispatch(action) {
    state = model.reduce(state, action);
    render();
    window.clearTimeout(timer);
    if (state.playing && !document.hidden) timer = window.setTimeout(() => dispatch({ type: "step" }), 3400);
  }
  function render() {
    const scenario = model.scenarios[state.scenario];
    const evidence = model.evidence(state);
    const isDebate = state.mode === "debate";
    const isSlide = state.mode === "slides";
    root.dataset.mode = state.mode;
    root.dataset.phase = String(state.phase);
    root.classList.toggle("is-playing", state.playing);
    root.classList.toggle("has-mismatch", evidence.mismatch > 0);
    root.classList.toggle("has-offset", evidence.actual > 50);
    root.classList.toggle("is-verified", state.verified);
    root.querySelectorAll("[data-showcase-case]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.showcaseCase === state.scenario)));
    root.querySelectorAll("[data-showcase-mode]").forEach((button) => {
      const selected = button.dataset.showcaseMode === state.mode;
      button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    el("stage").setAttribute("aria-labelledby", `showcase-tab-${state.mode}`);
    el("stage-label").textContent = isDebate ? "课堂辩论 / 预设结构示例" : isSlide ? `动态课件 / 第 ${state.phase + 1} 页，共 6 页` : `动态演示 / ${String(state.phase + 1).padStart(2, "0")}`;
    el("title").textContent = scenario.title;
    el("source").textContent = scenario.source;
    el("controller-label").textContent = scenario.controller;
    el("process-label").textContent = scenario.process;
    el("mobile-source").textContent = scenario.source;
    el("mobile-controller").textContent = scenario.controller;
    el("mobile-process").textContent = scenario.process;
    el("mobile-command").textContent = `下发指令 ${evidence.commanded}%`;
    el("mobile-actual").textContent = `${evidence.actual}%`;
    el("mobile-reported").textContent = `${evidence.reported}%`;
    el("process-value").textContent = `${evidence.actual}%`;
    el("monitor-value").textContent = `${evidence.reported}%`;
    el("monitor-status").textContent = evidence.mismatch ? "显示正常 / 过程偏离" : evidence.blocked ? "校验阻断异常" : "与过程一致";
    el("plant").style.display = state.scenario === "industrial" ? "" : "none";
    el("car").style.display = state.scenario === "vehicle" ? "" : "none";
    el("car").removeAttribute("hidden");
    el("tank-level").setAttribute("y", String(299 - evidence.actual * 0.85));
    el("tank-level").setAttribute("height", String(evidence.actual * 0.85));
    el("diagram").setAttribute("aria-label", `${scenario.source}经过${scenario.controller}作用于${scenario.destination}。${scenario.process}${evidence.actual}%，监控反馈${evidence.reported}%，${evidence.status}。`);
    el("visual").hidden = isDebate;
    el("debate").hidden = !isDebate;
    el("slide-copy").hidden = !isSlide;
    el("slide-number").textContent = `学习目标 · ${scenario.objective}`;
    el("slide-title").textContent = `${state.phase + 1}. ${scenario.stages[state.phase]}`;
    el("slide-body").textContent = scenario.cues[state.phase];
    el("playback").hidden = isDebate;
    el("timeline").hidden = isDebate;
    el("evidence").hidden = isDebate;
    root.querySelector(".showcase-parameters").hidden = isDebate;
    el("status").textContent = `${scenario.stages[state.phase]} · ${evidence.status}`;
    el("play").querySelector("span").textContent = state.playing ? "暂停" : state.phase === 5 ? "重新播放" : isSlide ? "自动讲解" : "播放演示";
    el("play").querySelector("i").className = `fas fa-${state.playing ? "pause" : "play"}`;
    el("step").textContent = isSlide ? "下一页" : "下一步";
    el("step").disabled = state.phase === 5;
    el("timeline").innerHTML = scenario.stages.map((label, index) => `<button type="button" data-showcase-phase="${index}" ${index === state.phase ? 'aria-current="step"' : ""}><b>${index + 1}</b><span>${escape(label)}</span></button>`).join("");
    const channels = [["下发指令", `${evidence.commanded}%`, "控制端"], [scenario.process, `${evidence.actual}%`, "独立观测"], ["监控反馈", `${evidence.reported}%`, "仪表画面"], ["证据差异", `${evidence.mismatch} 个百分点`, evidence.blocked ? "独立校验阻断" : "过程与反馈之差"]];
    el("evidence").innerHTML = channels.map(([name, value, detail]) => `<div><span>${escape(name)}</span><strong>${escape(value)}</strong><small>${escape(detail)}</small></div>`).join("");
    el("intensity").value = String(state.intensity);
    el("intensity-value").value = `${state.intensity} 个百分点`;
    el("verify").checked = state.verified;
    el("cue-label").textContent = isSlide ? "本页教师讲稿" : isDebate ? "课堂组织建议" : "教师讲解提示";
    el("cue").textContent = isDebate ? "生成后可通过平台课堂组织学生加入；预演中的立场与试投票不会计入真实学情。" : scenario.cues[state.phase];
    const round = debate[state.round];
    el("debate-topic").textContent = scenario.debate;
    el("debate-contain").textContent = round[1];
    el("debate-verify").textContent = round[2];
    el("debate-moderator").textContent = round[3];
    el("round-label").textContent = `第 ${state.round + 1} 轮 · ${round[0]}`;
    el("round-prev").disabled = state.round === 0;
    el("round-next").disabled = state.round === 2;
    root.querySelectorAll("[data-showcase-vote]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.showcaseVote === state.vote)));
    el("vote-result").textContent = state.vote ? `你的试投票：${state.vote === "contain" ? "优先控制影响" : "优先核验证据"}（仅当前页面）` : "试投票仅保留在当前页面";
    el("generate").querySelector("span").textContent = isDebate ? "用 AI 生成我的课堂辩论" : isSlide ? "用 AI 生成我的动态课件" : "用 AI 生成我的演示";
    el("comparison").textContent = `同一偏移的对照：未开启独立校验时过程负载可达 ${evidence.peakWithoutCheck}%；开启校验时维持 ${evidence.peakWithCheck}%。${state.phase === 5 ? "本轮已恢复到初始可信读数。" : "继续播放，观察变化如何传递到过程与反馈。"}`;
    el("events").innerHTML = state.events.length ? state.events.map((event) => `<li>${escape(event.label)} · 过程 ${event.actual}% / 反馈 ${event.reported}% · ${escape(event.status)}</li>`).join("") : "<li>尚未操作；播放或调节参数后记录同步更新。</li>";
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !root.contains(button)) return;
    if (button.dataset.showcaseCase) dispatch({ type: "scenario", value: button.dataset.showcaseCase });
    else if (button.dataset.showcaseMode) { event.stopPropagation(); dispatch({ type: "mode", value: button.dataset.showcaseMode }); }
    else if (button.dataset.showcasePhase != null) dispatch({ type: "seek", value: button.dataset.showcasePhase });
    else if (button.dataset.showcaseVote) dispatch({ type: "vote", value: button.dataset.showcaseVote });
  });
  root.querySelector(".showcase-modes").addEventListener("keydown", (event) => {
    const tabs = [...root.querySelectorAll("[data-showcase-mode]")];
    const current = tabs.indexOf(document.activeElement);
    if (current < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    dispatch({ type: "mode", value: tabs[next].dataset.showcaseMode }); tabs[next].focus();
  });
  el("play").addEventListener("click", () => dispatch({ type: state.playing ? "pause" : "play" }));
  el("step").addEventListener("click", () => dispatch({ type: "step" }));
  el("reset").addEventListener("click", () => dispatch({ type: "reset" }));
  el("intensity").addEventListener("input", (event) => dispatch({ type: "intensity", value: event.target.value }));
  el("verify").addEventListener("change", (event) => dispatch({ type: "verify", value: event.target.checked }));
  el("round-prev").addEventListener("click", () => dispatch({ type: "round", value: -1 }));
  el("round-next").addEventListener("click", () => dispatch({ type: "round", value: 1 }));
  el("debate-reset").addEventListener("click", () => { state = model.reduce(state, { type: "reset" }); dispatch({ type: "mode", value: "debate" }); });
  el("fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch (_) { el("status").textContent = "当前浏览器不支持全屏，可使用浏览器缩放查看。"; }
  });
  el("generate").addEventListener("click", () => {
    const scenario = model.scenarios[state.scenario];
    const goal = state.mode === "debate"
      ? `生成一份可在平台预览、编辑并发布到课堂的多角色 AI 辩论，命题为“${scenario.debate}”。包含教师主持、安全负责人、运行负责人和学生参与；三轮立论、质询、综合决策，角色立场、证据要求与四项评价量规。`
      : state.mode === "slides"
      ? "生成一份可在平台预览、编辑并发布的 12 页动态课件。需要清晰关系图、动态案例、随堂思考题和逐页同步教师讲稿，不能只有文字列表。"
      : "生成一个可在平台预览、编辑并发布的可操作动态模拟演示。需要控制链与反馈链可视化、5–8 个状态、播放与重置、一个数值调节和独立校验开关、同步证据、分支对照及教师讲解提示。";
    const prompt = `围绕“${scenario.name}”，${goal}学习目标：${scenario.objective}采用隔离的浏览器概念仿真与教学数值，不连接真实设备。请用已有的统一教学生成流程交付。`;
    root.dispatchEvent(new CustomEvent("teaching:compose", { bubbles: true, detail: { content: prompt } }));
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) dispatch({ type: "pause" }); });
  new MutationObserver(() => { if (document.getElementById("teaching-dashboard")?.hidden && state.playing) dispatch({ type: "pause" }); }).observe(document.getElementById("teaching-dashboard"), { attributes: true, attributeFilter: ["hidden"] });
  render();
})();
