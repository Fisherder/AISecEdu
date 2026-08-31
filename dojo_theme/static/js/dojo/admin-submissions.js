(function () {
  "use strict";

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, {once: true});
    } else {
      callback();
    }
  }

  ready(function () {
    const selectAll = document.querySelector("[data-checkbox-all]");
    const selections = Array.from(document.querySelectorAll("[data-submission-id][type='checkbox']"));
    const deleteButton = document.getElementById("submission-delete-button");
    const correctButton = document.getElementById("correct-flags-button");
    const status = document.getElementById("submission-selection-status");
    const notify = (message, kind, options) => window.AISecEduUI?.notify(message, kind, options);

    function selectedIds() {
      return selections.filter(input => input.checked).map(input => Number(input.dataset.submissionId));
    }

    function updateSelectionState() {
      const count = selectedIds().length;
      if (status) status.textContent = count ? `已选择 ${count} 条提交` : "尚未选择提交";
      if (deleteButton) deleteButton.disabled = count === 0;
      if (correctButton) correctButton.disabled = count === 0;
      if (selectAll) {
        selectAll.checked = selections.length > 0 && count === selections.length;
        selectAll.indeterminate = count > 0 && count < selections.length;
      }
    }

    selectAll?.addEventListener("change", function () {
      selections.forEach(input => { input.checked = selectAll.checked; });
      updateSelectionState();
    });
    selections.forEach(input => input.addEventListener("change", updateSelectionState));

    async function loadSubmission(submissionId) {
      return window.AISecEdu.request(`/api/v1/submissions/${submissionId}`, {
        timeoutMs: 10000,
        cacheTtlMs: 5000,
        dedupeKey: `admin-submission-${submissionId}`,
      });
    }

    document.addEventListener("click", async function (event) {
      const copy = event.target.closest(".copy-flag[data-submission-id]");
      if (!copy) return;
      event.preventDefault();
      copy.disabled = true;
      try {
        const submission = await loadSubmission(Number(copy.dataset.submissionId));
        const provided = String(submission?.provided || "");
        if (!provided) throw new Error("该提交没有可复制的内容。");
        await navigator.clipboard.writeText(provided);
        notify("完整提交内容已复制。", "success");
      } catch (error) {
        notify(error.message || "暂时无法读取提交内容。", "danger", {
          duration: 6500,
          dedupeKey: `submission-copy-${copy.dataset.submissionId}`,
        });
      } finally {
        copy.disabled = false;
      }
    });

    async function mutateSelected(action) {
      const ids = selectedIds();
      if (!ids.length) {
        notify("请先选择至少一条提交。", "warning");
        return;
      }
      const deleting = action === "delete";
      const confirmed = await window.AISecEduUI.confirm(
        deleting
          ? `确定删除所选 ${ids.length} 条提交吗？删除后将重新计算相关成绩。`
          : `确定把所选 ${ids.length} 条提交标记为正确吗？`,
        {
          title: deleting ? "删除提交" : "更正判题结果",
          kind: deleting ? "danger" : "warning",
          confirmLabel: deleting ? "确认删除" : "确认更正",
          confirmStyle: deleting ? "danger" : "primary",
        },
      );
      if (!confirmed) return;

      [deleteButton, correctButton].filter(Boolean).forEach(button => { button.disabled = true; });
      const progress = notify(
        deleting ? `正在删除 ${ids.length} 条提交…` : `正在更正 ${ids.length} 条提交…`,
        "progress",
        {duration: 0, closeable: false},
      );
      const results = await Promise.allSettled(ids.map(submissionId => (
        window.AISecEdu.request(`/api/v1/submissions/${submissionId}`, {
          method: deleting ? "DELETE" : "PATCH",
          json: deleting ? undefined : {type: "correct"},
          unwrap: false,
          timeoutMs: 15000,
          idempotencyKey: `admin-submission-${action}-${submissionId}`,
        })
      )));
      progress?.close();
      const succeeded = results.filter(result => result.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (!failed) {
        notify(deleting ? "提交已删除，页面正在刷新。" : "判题结果已更正，页面正在刷新。", "success", {duration: 5000});
      } else if (succeeded) {
        notify(`已完成 ${succeeded} 条，${failed} 条未完成；页面将刷新以显示真实状态。`, "warning", {duration: 7000});
      } else {
        const first = results.find(result => result.status === "rejected");
        notify(first?.reason?.message || "操作未完成，请稍后重试。", "danger", {duration: 7000});
        updateSelectionState();
        return;
      }
      window.setTimeout(() => window.location.reload(), 350);
    }

    deleteButton?.addEventListener("click", () => mutateSelected("delete"));
    correctButton?.addEventListener("click", () => mutateSelected("correct"));
    updateSelectionState();
  });
})();
