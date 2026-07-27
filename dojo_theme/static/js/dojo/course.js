var error_template =
    '<div class="alert alert-danger alert-dismissable" role="alert">\n' +
    '  <span class="sr-only">错误：</span>\n' +
    '  <span id="message"></span>' +
    '  <button type="button" class="close" data-dismiss="alert" aria-label="关闭"><span aria-hidden="true">×</span></button>\n' +
    '</div>';

var warning_template =
    '<div class="alert alert-warning alert-dismissable" role="alert">\n' +
    '  <span class="sr-only">警告：</span>\n' +
    '  <span id="message"></span>' +
    '  <button type="button" class="close" data-dismiss="alert" aria-label="关闭"><span aria-hidden="true">×</span></button>\n' +
    '</div>';

var success_template =
    '<div class="alert alert-success alert-dismissable submit-row" role="alert">\n' +
    '  <strong>成功！</strong>\n' +
    '  <span id="message"></span>' +
    '  <button type="button" class="close" data-dismiss="alert" aria-label="关闭"><span aria-hidden="true">×</span></button>\n' +
    '</div>';

function form_fetch_and_show(name, endpoint, method, success_message) {
    const form = $(`#${name}-form`);
    const results = $(`#${name}-results`);
    form.submit(event => {
        event.preventDefault();
        results.empty();
        const params = form.serializeJSON();

        CTFd.fetch(endpoint, {
            method,
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(params)
        }).then(response => {
            return response.json();
        }).then(result => {
            if (!result.success) {
                results.html(error_template);
                results.find("#message").html(result.error);
            } else if (result.warning) {
                results.html(warning_template);
                results.find("#message").html(result.warning);
            } else {
                results.html(success_template);
                results.find("#message").text(success_message);
            }
        });
    });
}

$(() => {
    form_fetch_and_show("identity", `/dojo/${init.dojo}/course/identity`, "PATCH", "课程身份信息已更新。");

    const navLinks = document.querySelectorAll(".nav-link");
    navLinks.forEach(link => {
        link.addEventListener("click", function () {
            const pathSegments = window.location.pathname.split("/");
            const clickedSegment = this.id.split("-")[1];
            const courseIndexFromEnd = [...pathSegments].reverse().findIndex(segment => segment === "course");
            const coursePosition = pathSegments.length - courseIndexFromEnd - 1;
            const newUrl = [...pathSegments.slice(0, coursePosition + 1), clickedSegment].join("/");
            history.pushState({}, "", newUrl);
        });
    });

    const pathSegments = window.location.pathname.split("/");
    const lastSegment = pathSegments[pathSegments.length - 1];
    const secondLastSegment = pathSegments[pathSegments.length - 2];
    if (lastSegment === "course") return;
    if (secondLastSegment === "course" && lastSegment) {
        const targetTab = document.querySelector(`#${lastSegment}`);
        const targetNav = document.querySelector(`#course-${lastSegment}-tab`);
        if (targetTab && targetNav) {
            document.querySelectorAll(".tab-pane.active").forEach(tab => tab.classList.remove("active"));
            targetTab.classList.add("active", "show");
            document.querySelectorAll(".nav-link.active").forEach(nav => nav.classList.remove("active"));
            targetNav.classList.add("active");
        }
    }
});
