function submitChallenge(event) {
    event.preventDefault();
    const item = $(event.currentTarget).closest(".accordion-item");
    const challenge_id = parseInt(item.find('.challenge-numeric-id').val())
    const answer_input = item.find(".challenge-answer");
    const submission = answer_input.val()

    const flag_regex = /pwn.college{.*}/;
    if (submission.match(flag_regex) == null) {
        return;
    }

    answer_input.prop("disabled", true);

    if (submission == "pwn.college{practice}") {
        var message = "这是练习 Flag。请点击上方“启动”以普通学习者权限运行题目，并找到真实 Flag。"
        return renderSubmissionResponse({"data": {"status": "practice", "message": message}}, item);
    }

    return CTFd.api.post_challenge_attempt({}, {"challenge_id": challenge_id, "submission": submission})
        .then(response => renderSubmissionResponse(response, item));
};

function renderSubmissionResponse(response, item) {
    const result = response.data;

    const result_message = item.find(".result-message");
    const result_notification = item.find(".result-notification");
    const answer_input = item.find(".challenge-answer");
    const unsolved_flag = item.find(".challenge-unsolved");
    const total_solves = item.find(".total-solves");

    const header = item.find('[id^="challenges-header-"]');
    const current_challenge_id = parseInt(header.attr('id').match(/(\d+)$/)[1]);
    const next_challenge_button = $(`#challenges-header-button-${current_challenge_id + 1}`);

    result_notification.removeClass();
    result_message.text(result.message);

    function appendScoreAction() {
        const challengeId = Number(item.find(".challenge-numeric-id").val());
        if (!Number.isInteger(challengeId) || challengeId < 1) return;
        $("<a>")
            .addClass("btn btn-sm btn-outline-success challenge-score-action")
            .attr("href", `/learning/scores/latest/${challengeId}`)
            .text("查看评分")
            .appendTo(result_message);
    }

    if (result.status === "authentication_required") {
        window.location =
            CTFd.config.urlRoot +
            "/login?next=" +
            CTFd.config.urlRoot +
            window.location.pathname +
            window.location.hash;
        return;
    } else if (result.status === "incorrect") {
        result_notification.addClass(
            "alert alert-danger alert-dismissable text-center"
        );

        answer_input.removeClass("correct");
        answer_input.addClass("wrong");
        setTimeout(function() {
            answer_input.removeClass("wrong");
        }, 10000);
    } else if (result.status === "practice") {
        result_notification.addClass(
            "alert alert-danger alert-dismissable text-center"
        );

        answer_input.removeClass("correct");
        answer_input.addClass("wrong");
        setTimeout(function() {
            answer_input.removeClass("wrong");
        }, 10000);
    } else if (result.status === "correct") {
        result_notification.addClass(
            "alert alert-success alert-dismissable text-center"
        );

        unsolved_flag.removeClass("challenge-unsolved");
        unsolved_flag.addClass("challenge-solved");
        if(unsolved_flag.hasClass("far") && unsolved_flag.hasClass("fa-flag")) {
            unsolved_flag.removeClass("far")
            unsolved_flag.addClass("fas")
        }

        total_solves.text(
            (parseInt(total_solves.text().trim().split(" ")[0]) + 1) + " 次完成"
        );

        answer_input.val("");
        answer_input.removeClass("wrong");
        answer_input.addClass("correct");
        appendScoreAction();
        const challenge_name = item.find('.challenge-reference').val()
        const module_name = item.find('.challenge-module').val()
        const dojo_name = init.dojo

        const survey_notification = item.find(".survey-notification")

        CTFd.fetch(`/pwncollege_api/v1/dojos/${dojo_name}/${module_name}/${challenge_name}/surveys`, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        }).then(function (response) {
            if(response.status != 200) return Promise.reject()
            return response.json()
        }).then(function (data) {
            if(data.type === "none") return
            if(Math.random() > data.probability) return
            survey_notification.addClass(
                "alert-warning alert-dismissable"
            );
            survey_notification.slideDown();
        })
        unlockChallenge(next_challenge_button);
        checkUserAwards()
        .then(handleAwardPopup)
        .catch(error => console.error("Award check failed:", error));
    } else if (result.status === "already_solved") {
        result_notification.addClass(
            "alert alert-info alert-dismissable text-center"
        );

        answer_input.addClass("correct");
        appendScoreAction();
    } else if (result.status === "paused") {
        result_notification.addClass(
            "alert alert-warning alert-dismissable text-center"
        );
    } else if (result.status === "ratelimited") {
        result_notification.addClass(
            "alert alert-warning alert-dismissable text-center"
        );

        answer_input.addClass("too-fast");
        setTimeout(function() {
            answer_input.removeClass("too-fast");
        }, 10000);
    }
    result_notification.slideDown();
    setTimeout(function() {
        item.find(".alert").slideUp();
        answer_input.prop("disabled", false);
    }, 10000);
}

function unlockChallenge(challenge_button) {
    if (challenge_button.length && challenge_button.hasClass('disabled')) {
        challenge_button.removeClass('disabled');
        const icon = challenge_button.find('.fa-lock');
        icon.removeClass('fa-lock');
        icon.addClass('fa-flag');

        const item = challenge_button.closest(".accordion-item");
        const module_id = item.find(".challenge-module").val();
        const challenge_id = item.find(".challenge-reference").val();
        const description = item.find(".challenge-description");

        CTFd.fetch(`/pwncollege_api/v1/dojos/${init.dojo}/${module_id}/${challenge_id}/description`)
            .then(response => response.json())
            .then(data => description.html(data.description));
    }
}


async function startChallenge(event) {
    event.preventDefault();
    const item = $(event.currentTarget).closest(".accordion-item");
    const module = item.find(".challenge-module").val()
    const challenge = item.find(".challenge-reference").val()
    const practice = event.currentTarget.dataset.practice === "true";
    const activeChallenge = $(".challenge-name.challenge-active").first();
    const selectedChallenge = item.find(".challenge-name").first();
    if (activeChallenge.length && !activeChallenge.is(selectedChallenge)) {
        const confirmed = window.AISecEduUI && await window.AISecEduUI.confirm(
            `当前运行中的题目环境会被替换。切换到“${selectedChallenge.data("challenge-name") || challenge}”后，可保留的工作区数据和历史回放仍会保留。`,
            {
                title: "切换题目",
                subtitle: "保留学习记录，替换当前运行环境",
                confirmLabel: "切换并启动",
            }
        );
        if (!confirmed) return;
    }

    item.find(".challenge-init")
        .addClass("disabled-button")
        .prop("disabled", true);

    const workspace = item.find(".challenge-workspace");
    let content = workspace.find("#workspace-iframe")[0];
    if (!content) {
        item.find(".iframe-wrapper").html('<iframe id="workspace-iframe" class="challenge-iframe" src="about:blank" allow="clipboard-read *; clipboard-write *; fullscreen *" allowfullscreen></iframe>');
        content = workspace.find("#workspace-iframe")[0];
    }
    if (item[0].workspaceStartController) item[0].workspaceStartController.abort();
    const startController = new AbortController();
    item[0].workspaceStartController = startController;
    if (content) {
        content.workspaceStartTrigger = event.currentTarget;
        content.dataset.workspaceService = "";
        workspace.removeClass("challenge-hidden");
        item.find(".challenge-init").addClass("challenge-hidden");
    }
    const startLoadId = content && typeof beginWorkspaceLoad === "function"
        ? beginWorkspaceLoad(content, "")
        : null;

    const showStartFailure = function (message) {
        result_message.text(message);
        result_notification
            .removeClass()
            .addClass('alert alert-warning alert-dismissable text-center')
            .slideDown();
        workspace.removeClass("challenge-hidden");
        item.find(".challenge-init")
            .addClass("challenge-hidden")
            .removeClass("disabled-button")
            .prop("disabled", false);
        if (content && startLoadId && typeof showWorkspaceLoadError === "function") {
            showWorkspaceLoadError(content, {error: message}, startLoadId);
            const panel = workspaceLoadingPanel(content);
            panel.find("[data-workspace-loading-title]").text("环境启动失败");
            panel.find("[data-workspace-loading-retry]").html('<i class="fas fa-redo" aria-hidden="true"></i>重新启动');
            panel.find("[data-workspace-loading-cancel]").prop("hidden", false).html('<i class="fas fa-arrow-left" aria-hidden="true"></i>返回题目说明');
        }
    };

    var params = {
        "dojo": init.dojo,
        "module": module,
        "challenge": challenge,
        "practice": practice,
    };

    const urlParams = new URLSearchParams(window.location.search);
    let as_user = urlParams.get("as_user");
    if (as_user) {
        params["as_user"] = as_user;
    }

    var result_notification = item.find('.result-notification');
    var result_message = item.find('.result-message');
    result_notification.removeClass('alert-danger');
    result_notification.addClass('alert alert-warning alert-dismissable text-center');
    result_message.html("正在加载。");
    result_notification.slideDown();
    var dot_max = 5;
    var dot_counter = 0;
    setTimeout(function loadmsg() {
        if (result_message.html().startsWith("正在加载")) {
            if (dot_counter < dot_max - 1){
                result_message.append(".");
                dot_counter++;
            }
            else {
                result_message.html("正在加载。");
                dot_counter = 0;
            }
            setTimeout(loadmsg, 500);
        }
    }, 500);

    CTFd.fetch('/pwncollege_api/v1/docker', {
        method: 'POST',
        credentials: 'same-origin',
        signal: startController.signal,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    }).then(function (response) {
        if (response.status === 403) {
            // User is not logged in or CTF is paused.
            window.location =
                CTFd.config.urlRoot +
                "/login?next=" +
                CTFd.config.urlRoot +
                window.location.pathname +
                window.location.hash;
        }
        return response.json();
    }).then(function (result) {
        var result_notification = item.find('.result-notification');
        var result_message = item.find('.result-message');

        result_notification.removeClass();

        if (result.success) {
            var message = "题目已成功启动！";
            result_message.html(message);
            result_notification.addClass('alert alert-info alert-dismissable text-center');

            $(".challenge-active").removeClass("challenge-active");
            item.find(".challenge-name").addClass("challenge-active");
            result_notification.slideDown();
            item.find(".challenge-init")
                .removeClass("disabled-button")
                .prop("disabled", false);
            $(".challenge-init").removeClass("challenge-hidden");
            $(".challenge-workspace").addClass("challenge-hidden");
            $(".iframe-wrapper").html("");
            item.find(".iframe-wrapper").html("<iframe id=\"workspace-iframe\" class=\"challenge-iframe\" src=\"about:blank\" allow=\"clipboard-read *; clipboard-write *; fullscreen *\" allowfullscreen></iframe>");
            const startedContent = item.find("#workspace-iframe")[0];
            if (startedContent) delete startedContent.workspaceStartTrigger;
            loadWorkspace();
            item.find(".challenge-init").addClass("challenge-hidden");
            item.find(".challenge-workspace").removeClass("challenge-hidden");
            item.find("#workspace-change-privilege")
                .attr("data-privileged", practice)
                .find("input")
                    .prop("checked", practice);
            windowResizeCallback("");
            moduleStartChallenge(event, channel);
            window.dispatchEvent(new CustomEvent("dojo:attempt-changed"));
        }
        else {
            showStartFailure("环境暂时无法启动。请重新启动；已有学习记录不会丢失。");
        }

        setTimeout(function() {
            item.find(".alert").slideUp();
        }, 60000);
    }).catch(function (error) {
        if (error && error.name === "AbortError") return;
        console.error(error);
        showStartFailure("环境启动请求未完成，请检查网络后重新启动。");
    }).finally(function () {
        if (item[0].workspaceStartController === startController) delete item[0].workspaceStartController;
    })
}

async function buildSurvey(item) {
    const form = item.find("form.survey-notification")
    if(form.html() === "") return

    // fix styles
    const challenge_id = item.find('.challenge-numeric-id').val()
    for(const style of form.find("style")) {
        let cssText = ""
        for(const rule of style.sheet.cssRules) {
            cssText += ".survey-id-" + challenge_id + " " + rule.cssText + " "
        }
        style.innerHTML = cssText
    }

    const customSubmits = item.find("[data-form-submit]")
    customSubmits.each((_, element) => {
        $(element).click(() => {
            surveySubmit(
                JSON.stringify({
                    response: $(element).attr("data-form-submit")
                }),
                item
            )
            form.slideUp()
        })
    })
    // csrf fix
    const formData = new FormData(form[0])
    form.submit(event => {
        event.preventDefault()
        surveySubmit(JSON.stringify(Object.fromEntries(formData)), item)
        form.slideUp()
    })
}

function surveySubmit(data, item) {
    const challenge_name = item.find('.challenge-reference').val()
    const module_name = item.find('.challenge-module').val()
    const dojo_name = init.dojo
    return CTFd.fetch(`/pwncollege_api/v1/dojos/${dojo_name}/${module_name}/${challenge_name}/surveys`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: data
    })
}

function markChallengeAsSolved(item) {
    const unsolved_flag = item.find(".challenge-unsolved");
    if (unsolved_flag.hasClass("challenge-solved")) {
        return;
    }

    unsolved_flag.removeClass("challenge-unsolved");
    unsolved_flag.addClass("challenge-solved");

    const total_solves = item.find(".total-solves");
    total_solves.text(
        (parseInt(total_solves.text().trim().split(" ")[0]) + 1) + " completions"
    );

    const answer_input = item.find(".challenge-answer");
    answer_input.val("");
    answer_input.removeClass("wrong");
    answer_input.addClass("correct");

    const header = item.find('[id^="challenges-header-"]');
    const current_challenge_id = parseInt(header.attr('id').match(/(\d+)$/)[1]);
    const next_challenge_button = $(`#challenges-header-button-${current_challenge_id + 1}`);

    unlockChallenge(next_challenge_button);
    checkUserAwards()
        .then(handleAwardPopup)
        .catch(error => console.error("Award check failed:", error));
}

function windowResizeCallback(event) {
    $(".challenge-iframe").css("aspect-ratio", `${window.innerWidth} / ${window.innerHeight}`);
}

function moduleStartChallenge(event, channel) {
    root = $(event.target).closest(".accordion-item-body").find(".workspace-controls");
    sendChallengeInfo(root, channel);
}

$(() => {
    channel.addEventListener("message", (event) => {
        var challenge_id = event.data["challenge-id"];
        $(".workspace-controls").each((index, item) => {
            item_chal_id = $(item).find(".current-challenge-id").prop("value");
            if (item_chal_id == challenge_id) {
                var priv = $(item).find("#workspace-change-privilege");
                if (priv.length > 0) {
                    priv.attr("data-privileged", event.data["challenge-privilege"]);
                    priv.find("input").prop("checked", event.data["challenge-privilege"] === "true");
                }

                refreshWorkspace($(item));
            }
        })
    });

    $(".accordion-item").on("show.bs.collapse", function (event) {
        $(event.currentTarget).find("iframe").each(function (i, iframe) {
            if ($(iframe).prop("src"))
                return;
            $(iframe).prop("src", function () {
                return $(this).data("src");
            });
        });
    });

    const broadcast = new BroadcastChannel('broadcast');
    broadcast.onmessage = (event) => {
        if (event.data.msg === 'challengeSolved') {
            const challenge_id = event.data.challenge_id;
            const item = $(`input.challenge-numeric-id[value='${challenge_id}']`).closest(".accordion-item");
            if (item.length) {
                markChallengeAsSolved(item);
            }
        }
    };

    var submits = $(".accordion-item").find(".challenge-answer");
    for (var i = 0; i < submits.length; i++) {
        submits[i].oninput = submitChallenge;
        submits[i].onkeyup = function (event) {
            if (event.key === "Enter") {
                submitChallenge(event);
            }
        };
    }
    $(".accordion-item").find(".challenge-start").click(startChallenge);
    $(".challenge-init").find(".challenge-priv").click(startChallenge);
    $(document).on("click", "[data-workspace-loading-retry]", function (event) {
        const workspace = $(this).closest(".challenge-workspace");
        const content = workspace.find("#workspace-iframe")[0];
        const trigger = content && content.workspaceStartTrigger;
        if (!trigger) return;
        event.preventDefault();
        startChallenge({
            preventDefault: function () {},
            currentTarget: trigger,
            target: trigger,
        });
    });
    $(document).on("click", "[data-workspace-loading-cancel]", function (event) {
        const workspace = $(this).closest(".challenge-workspace");
        const item = workspace.closest(".accordion-item");
        const content = workspace.find("#workspace-iframe")[0];
        const trigger = content && content.workspaceStartTrigger;
        if (!trigger) return;
        event.preventDefault();
        if (item[0].workspaceStartController) item[0].workspaceStartController.abort();
        if (typeof cancelWorkspaceLoad === "function") cancelWorkspaceLoad(content, {visible: false});
        delete content.workspaceStartTrigger;
        item.find(".challenge-init")
            .removeClass("challenge-hidden disabled-button")
            .prop("disabled", false);
        workspace.addClass("challenge-hidden");
        item.find(".iframe-wrapper").html("");
        trigger.focus();
    });

    window.addEventListener("resize", windowResizeCallback, true);
    windowResizeCallback("");
    $(".accordion-item").each((_, item) => {
        buildSurvey($(item))
    })
});
