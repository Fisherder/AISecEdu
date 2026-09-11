(function (global) {
  "use strict";
  const scenarios = {
    industrial: {
      title: "当仪表正常，设备却在偏离",
      name: "工控 · 震网启发案例",
      description: "沿着工程站、控制器和物理过程，观察控制偏移与反馈失真。",
      objective: "区分控制指令、真实过程与监控反馈，解释独立校验的作用。",
      process: "过程负载", controller: "控制器 · PLC", source: "工程站", destination: "工业过程",
      debate: "发现工控异常后，应立即停机隔离，还是先交叉验证？",
      stages: ["正常运行", "异常变更", "控制偏移", "反馈失真", "交叉核验", "隔离恢复"],
      cues: [
        "先让学生找出控制链与反馈链，确认三个读数的一致性。",
        "一次未经核验的变更进入控制链。请学生预测哪个证据最先变化。",
        "比较下发指令与物理过程。开启独立校验，再观察相同变更的后果。",
        "只看监控画面是否足够？把仪表反馈与真实过程并排比较。",
        "引入独立观测，将反馈与过程交叉核验，找出证据差异。",
        "恢复可信控制并核对过程。请学生用证据解释两条路径的差异。"
      ]
    },
    vehicle: {
      title: "一条异常指令，如何影响整辆车",
      name: "车联网 · 信任边界案例",
      description: "沿着车载网关、域控制器与执行器，观察异常指令和安全联锁。",
      objective: "识别车载信任边界，比较网关校验与执行器独立联锁的效果。",
      process: "执行器负载", controller: "域控制器", source: "车载网关", destination: "车辆执行器",
      debate: "车辆出现可疑控制指令时，应立即降级，还是完成核验再处置？",
      stages: ["正常行驶", "异常输入", "指令偏移", "状态失真", "独立核验", "安全降级"],
      cues: [
        "识别网关、控制器和执行器，解释为何不能把所有输入视为可信。",
        "概念化的异常输入进入网关。请预测控制边界在哪里发挥作用。",
        "观察执行器负载变化。打开独立校验，比较同一输入的另一条路径。",
        "监控反馈与实际执行不一致。请学生指出还缺少哪一种证据。",
        "独立观测发现差异，把判断依据从单一仪表扩展到交叉核验。",
        "车辆进入安全降级状态。讨论安全、可用性与误报之间的取舍。"
      ]
    }
  };
  const clamp = (value, low, high) => Math.min(high, Math.max(low, Number(value) || 0));
  function initial(scenario) {
    return { scenario: scenarios[scenario] ? scenario : "industrial", mode: "simulation", phase: 0,
      intensity: 30, verified: false, playing: false, round: 0, vote: null, events: [] };
  }
  function evidence(state) {
    const offset = state.phase >= 2 && state.phase <= 4 ? state.intensity : 0;
    const blocked = state.verified && offset > 0;
    const actual = 50 + (blocked ? 0 : offset);
    const reported = state.phase === 3 && !state.verified ? 50 : actual;
    const mismatch = Math.abs(actual - reported);
    return { commanded: 50 + offset, actual, reported, mismatch, blocked,
      peakWithoutCheck: 50 + state.intensity, peakWithCheck: 50,
      status: state.phase === 5 ? "已恢复可信状态" : blocked ? "独立校验已阻断偏移" : mismatch ? "反馈与过程不一致" : offset ? "过程发生偏移" : "控制与反馈一致" };
  }
  function reduce(state, action) {
    if (action.type === "reset") return initial(state.scenario);
    if (action.type === "scenario") return initial(action.value);
    const next = { ...state };
    switch (action.type) {
      case "intensity": next.intensity = clamp(action.value, 0, 50); break;
      case "verify": next.verified = action.value === true; break;
      case "mode":
        if (!["simulation", "slides", "debate"].includes(action.value)) return state;
        next.mode = action.value; next.playing = false; break;
      case "play": next.phase = state.phase === 5 ? 0 : state.phase; next.playing = true; break;
      case "pause": next.playing = false; break;
      case "step": next.phase = clamp(state.phase + 1, 0, 5); next.playing = next.phase < 5 && state.playing; break;
      case "seek": next.phase = clamp(Math.round(action.value), 0, 5); next.playing = false; break;
      case "round": next.round = clamp(state.round + Number(action.value || 1), 0, 2); break;
      case "vote": next.vote = ["contain", "verify"].includes(action.value) ? action.value : null; break;
      default: return state;
    }
    if (["step", "seek", "verify", "intensity"].includes(action.type)) {
      const result = evidence(next);
      const label = scenarios[next.scenario].stages[next.phase];
      next.events = [...state.events, { phase: next.phase, label, ...result }].slice(-8);
    }
    return next;
  }
  const model = Object.freeze({ scenarios, initial, evidence, reduce });
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else global.AISecEduTeachingShowcase = model;
})(typeof window === "undefined" ? globalThis : window);
