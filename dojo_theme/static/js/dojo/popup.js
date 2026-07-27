document.addEventListener("DOMContentLoaded", function () {
    if (!init?.userId) return;

    checkUserAwards()
        .then(handleAwardPopup)
        .catch(error => console.error("成就检查失败：", error));
});

function checkUserAwards() {
    const endpoint = `/api/v1/users/${init.userId}/awards`;
    return CTFd.fetch(endpoint, {
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
        return renderPopup(`你已获得 ${award.name} AISecEdu 成就等级！`, `<i class="fas fa-award fa-5x brand-green" aria-hidden="true"></i>`)
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
    const popupContent = {
        header: "恭喜！",
        body: message,
        image: image,
        logos: {
            platform: `${CTFd.config.urlRoot}/themes/dojo_theme/static/img/aisecedu-mark.svg`,
            linkedin: `${CTFd.config.urlRoot}/themes/dojo_theme/static/img/dojo/linkedin_logo.svg`,
            x: `${CTFd.config.urlRoot}/themes/dojo_theme/static/img/dojo/x_logo.svg`
        },
        profileUrl: `${window.location.protocol}//${window.location.host}/hacker/${init.userId}`
    };

    const popup = document.createElement("div");
    popup.className = "popup-overlay";
    popup.innerHTML = `
        <div class="popup-content">
            <button id="closePopup">&times;</button>
            ${popupContent.image}
            <h1>${popupContent.header}</h1>
            <p>${popupContent.body}</p>
            <img src="${popupContent.logos.platform}" class="logo-image" alt="AISecEdu">
            <div class="social-share">
                <a href="https://linkedin.com/share?url=${popupContent.profileUrl}"
                    class="share-button"
                    target="_blank"
                    aria-label="分享到 LinkedIn">
                    <img src="${popupContent.logos.linkedin}">
                    <span title="分享到 LinkedIn"></span>分享
                </a>
                <a href="https://twitter.com/intent/tweet?url=${popupContent.profileUrl}"
                    class="share-button"
                    target="_blank"
                    aria-label="分享到 X">
                    <img src="${popupContent.logos.x}">
                    <span title="分享到 X"></span>分享
                </a>
            </div>
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
