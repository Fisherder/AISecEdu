document.addEventListener("DOMContentLoaded", function () {
    if (!init?.userId) return;
    const key = `aisecedu-awards-checked:${init.userId}`;
    try {
        const checkedAt = Number(sessionStorage.getItem(key) || 0);
        if (Date.now() - checkedAt < 15 * 60 * 1000) return;
    } catch (error) {
        /* storage can be disabled */
    }
    const check = () => {
        checkUserAwards()
            .then(response => {
                try { sessionStorage.setItem(key, String(Date.now())); } catch (error) { /* noop */ }
                handleAwardPopup(response);
            })
            .catch(() => {});
    };
    const schedule = () => {
        if (typeof requestIdleCallback === "function") requestIdleCallback(check, {timeout: 3000});
        else window.setTimeout(check, 1800);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, {once: true});
});

function checkUserAwards() {
    const endpoint = `/api/v1/users/${init.userId}/awards`;
    if (window.AISecEdu && typeof window.AISecEdu.get === "function") {
        return window.AISecEdu.get(endpoint, {
            unwrap: false,
            timeoutMs: 7000,
            cacheTtlMs: 30000,
            dedupeKey: `user-awards:${init.userId}`,
        });
    }
    const client = window.CTFd && typeof window.CTFd.fetch === "function"
        ? window.CTFd.fetch.bind(window.CTFd)
        : window.fetch.bind(window);
    return client(endpoint, {
        method: "GET",
        credentials: "same-origin",
        headers: {"Accept": "application/json"}
    }).then(response => response.json());
}

function handleAwardPopup(response) {
    if (!response?.success || !response.data?.length) return;

    const award = response.data.sort((a, b) => new Date(a.date) - new Date(b.date)).pop();

    const lastAwardDate = new Date(award.date);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const lastPopup = new Date(localStorage.getItem("lastPopup"));

    if (lastAwardDate <= twoDaysAgo || lastAwardDate <= lastPopup) return;

    localStorage.setItem("lastPopup", lastAwardDate.toISOString());

    showAwardPopup(award);
}

function showAwardPopup(award) {
    const isBelt = ["orange", "yellow", "green", "blue"].includes(award.name);
    if (isBelt) {
        return renderPopup(`你已获得 ${award.name} 玄甲成就等级！`, `<i class="fas fa-award fa-5x brand-green" aria-hidden="true"></i>`)
    }

    var icon = award.icon
    if (!award.icon) {
        fetch("/pwncollege_api/v1/dojos")
        .then(response => response.json())
        .then(result => {
            const dojos = result["dojos"]
            dojos.forEach(entry => {
                if (entry["hex_id"] == award.category) {
                    icon = entry["award"]["emoji"]
                }
            })
            renderPopup(`你已获得 ${icon} 徽章！`, `<div class="emoji-display">${icon}</div>`)
        })
    }
    else {
        renderPopup(`你已获得 ${icon} 徽章！`, `<div class="emoji-display">${icon}</div>`)
    }
}

function renderPopup(message, image) {
    const urlRoot = window.CTFd && window.CTFd.config
        ? window.CTFd.config.urlRoot
        : "";
    const popupContent = {
        header: "恭喜！",
        body: message,
        image: image,
        logos: {
            platform: `${urlRoot}/themes/dojo_theme/static/img/aisecedu-mark.svg`
        }
    };

    const popup = document.createElement("div");
    popup.className = "popup-overlay";
    popup.innerHTML = `
        <div class="popup-content">
            <button id="closePopup">&times;</button>
            ${popupContent.image}
            <h1>${popupContent.header}</h1>
            <p>${popupContent.body}</p>
            <img src="${popupContent.logos.platform}" class="logo-image" alt="玄甲">
        </div>
    `;

    document.body.appendChild(popup);
    popup.querySelector("#closePopup").addEventListener("click", () => {
        popup.remove();
    });

    popup.addEventListener("click", (e) => {
        if (e.target === popup){
            popup.remove();
        }
    });
}
