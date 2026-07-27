var error_template =
    '<div class="alert alert-danger alert-dismissable" role="alert">\n' +
    '  <span class="sr-only">错误：</span>\n' +
    '  <span id="message"></span>' +
    '  <button type="button" class="close" data-dismiss="alert" aria-label="关闭"><span aria-hidden="true">×</span></button>\n' +
    '</div>';

var success_template =
    '<div class="alert alert-success alert-dismissable submit-row" role="alert">\n' +
    '  <strong>成功！</strong>\n' +
    '  <span id="message"></span>' +
    '  <button type="button" class="close" data-dismiss="alert" aria-label="关闭"><span aria-hidden="true">×</span></button>\n' +
    '</div>';

var loading_template =
    '<div class="alert alert-warning alert-dismissable submit-row" role="alert">\n' +
    '  <strong>正在处理…</strong>\n' +
    '  <span id="message"></span>' +
    '  <button type="button" class="close" data-dismiss="alert" aria-label="关闭"><span aria-hidden="true">×</span></button>\n' +
    '</div>';

async function settingsConfirm(message, options) {
    return Boolean(
        window.AISecEduUI
        && await window.AISecEduUI.confirm(message, options || {})
    );
}

async function settingsPrompt(message, options) {
    if (!window.AISecEduUI) return null;
    return window.AISecEduUI.prompt(message, options || {});
}

function form_fetch_and_show(name, endpoint, method, success_message, confirm_msg = null) {
    const form = $(`#${name}-form`);
    const results = $(`#${name}-results`);
    form.off("submit.aisecedu").on("submit.aisecedu", async event => {
        event.preventDefault();
        results.empty().prop("hidden", false);
        const params = form.serializeJSON();
        if (confirm_msg) {
            const confirmed = await confirm_msg(form, params);
            if (!confirmed) return;
        }
        results.html(loading_template);
        try {
            const response = await CTFd.fetch(endpoint, {
                method,
                credentials: "same-origin",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(params)
            });
            const result = await response.json();
            if (result.success) {
                results.html(success_template);
                results.find("#message").text(success_message);
            } else {
                results.html(error_template);
                results.find("#message").html(result.error || "操作未完成。");
            }
        } catch (error) {
            results.html(error_template);
            results.find("#message").text(error.message || "请求失败，请稍后重试。");
        }
    });
}

function button_fetch_and_show(name, endpoint, method, data, success_message, abort_message, confirm_msg = null) {
    const button = $(`#${name}-button`);
    const results = $(`#${name}-results`);
    button.off("click.aisecedu").on("click.aisecedu", async () => {
        results.empty().prop("hidden", false);
        if (confirm_msg && !(await confirm_msg(data))) {
            results.html(error_template);
            results.find("#message").text(abort_message);
            return;
        }
        results.html(loading_template);
        try {
            const response = await CTFd.fetch(endpoint, {
                method,
                credentials: "same-origin",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (result.success) {
                results.html(success_template);
                results.find("#message").text(success_message);
            } else {
                results.html(error_template);
                results.find("#message").html(result.error || "操作未完成。");
            }
        } catch (error) {
            results.html(error_template);
            results.find("#message").text(error.message || "请求失败，请稍后重试。");
        }
    });
}

$(() => {
    form_fetch_and_show("ssh-key", "/pwncollege_api/v1/ssh_key", "POST", "SSH 公钥已更新。");
    form_fetch_and_show("discord", "/pwncollege_api/v1/discord", "DELETE", "Discord 账号已断开连接。");
    form_fetch_and_show("dojo-create", "/pwncollege_api/v1/dojos/create", "POST", "课程已创建。");
    form_fetch_and_show("dojo-promote-admin", `/pwncollege_api/v1/dojos/${init.dojo}/admins/promote`, "POST", "用户已提升为教师。", async (form, params) => {
        const userName = form.find(`#name-for-${params["user_id"]}`).text();
        return settingsConfirm(`确定将 ${userName}（UID ${params["user_id"]}）提升为教师吗？`, {
            title: "提升教师权限",
            confirmLabel: "提升",
        });
    });
    form_fetch_and_show("dojo-promote-dojo", `/pwncollege_api/v1/dojos/${init.dojo}/promote`, "POST", "课程已设为推荐课程。", async () => settingsConfirm("确定将此课程设为推荐课程吗？推荐课程会使用公开 slug 并展示在更多课程目录区。", {
        title: "设为推荐课程",
        confirmLabel: "确认设置",
    }));
    form_fetch_and_show("dojo-award-prune", `/pwncollege_api/v1/dojos/${init.dojo}/awards/prune`, "POST", "旧版徽章奖励已清理。", async () => settingsConfirm("确定根据更新后的完成要求清理所有已授予的表情徽章吗？", {
        title: "清理旧版徽章",
        confirmLabel: "清理",
        kind: "warning",
    }));
    button_fetch_and_show("dojo-delete", `/dojo/${init.dojo}/delete/`, "POST", {dojo: init.dojo}, "课程已删除。", "已取消删除课程。", async value => {
        const confirmation = await settingsPrompt(`此操作无法撤销。请输入课程 slug “${value.dojo}” 以确认删除。`, {
            title: "删除课程",
            inputLabel: "课程 slug",
            confirmLabel: "删除课程",
            kind: "danger",
        });
        return confirmation === value.dojo;
    });
    button_fetch_and_show("reset-home", "/pwncollege_api/v1/workspace/reset_home", "POST", {}, "Home 目录已重置。", "已取消重置 Home 目录。", async () => settingsConfirm("确定重置 Home 目录吗？当前目录会被打包，其他内容将被清除。", {
        title: "重置 Home 目录",
        confirmLabel: "重置",
        kind: "danger",
    }));
    $(".copy-button").off("click.aisecedu").on("click.aisecedu", event => {
        const input = $(event.target).parents(".input-group").children("input")[0];
        input.select();
        input.setSelectionRange(0, 128);
        navigator.clipboard.writeText(input.value);

        $(event.target).tooltip({
            title: "已复制！",
            trigger: "manual"
        });
        $(event.target).tooltip("show");

        setTimeout(function() {
            $(event.target).tooltip("hide");
        }, 1500);
    });
});
