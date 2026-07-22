document.addEventListener("DOMContentLoaded", function () {
    const modal = document.getElementById("create-unit-modal");
    const form = document.getElementById("create-unit-form");
    if (!modal || !form) return;

    const nameInput = document.getElementById("create-unit-name");
    const idInput = document.getElementById("create-unit-id");
    const descriptionInput = document.getElementById("create-unit-description");
    const submit = document.getElementById("create-unit-submit");
    const notice = document.getElementById("create-unit-notice");
    let idEdited = false;

    function slug(value) {
        return value
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 32)
            .replace(/-+$/g, "");
    }

    function showNotice(message, type) {
        notice.textContent = message || "";
        notice.className = `alert alert-${type || "danger"}`;
        notice.hidden = !message;
    }

    nameInput.addEventListener("input", function () {
        if (!idEdited) idInput.value = slug(nameInput.value);
    });
    idInput.addEventListener("input", function () {
        idEdited = Boolean(idInput.value);
        idInput.value = slug(idInput.value);
    });
    $(modal).on("shown.bs.modal", function () {
        nameInput.focus();
    });

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;
        submit.disabled = true;
        showNotice("");
        try {
            const response = await CTFd.fetch(
                `/pwncollege_api/v1/learning/dojos/${encodeURIComponent(modal.dataset.courseId)}/units`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {"Accept": "application/json", "Content-Type": "application/json"},
                    body: JSON.stringify({
                        id: idInput.value,
                        name: nameInput.value.trim(),
                        description: descriptionInput.value.trim(),
                    }),
                }
            );
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || "The unit could not be created.");
            window.location.assign(result.unit.url);
        } catch (error) {
            showNotice(error.message || "The unit could not be created.");
            submit.disabled = false;
        }
    });
});
