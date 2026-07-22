import UI from "./ui.js";
import {getKeycode, getKeysym} from "../core/input/util.js";

const MAX_CLIPBOARD_BYTES = 1048576;
let attachedRfb = null;
let remoteFocused = false;
let lastRemoteClipboard = "";
const remoteKeysDown = new Map();

function isFormControl(element) {
    return element && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(element.tagName);
}

function keyboardInput() {
    return document.getElementById("noVNC_keyboardinput") || document.getElementById("keyboardinput");
}

function focusRemoteKeyboard(force = false) {
    const input = keyboardInput();
    if (!input || (!force && isFormControl(document.activeElement) && document.activeElement !== input)) return;
    remoteFocused = true;
    input.focus({preventScroll: true});
    try {
        input.setSelectionRange(input.value.length, input.value.length);
    } catch (error) {}
}

function postClipboard(text) {
    lastRemoteClipboard = String(text || "").slice(0, MAX_CLIPBOARD_BYTES);
    window.parent.postMessage({type: "aisecedu:remote-clipboard", text: lastRemoteClipboard}, "*");
}

function receiveRemoteClipboard(event) {
    const text = event.detail && event.detail.text;
    postClipboard(text);
    if (navigator.clipboard && navigator.clipboard.writeText && document.hasFocus()) {
        navigator.clipboard.writeText(String(text || "").slice(0, MAX_CLIPBOARD_BYTES)).catch(() => {});
    }
}

function attachRfb() {
    const rfb = UI.rfb;
    if (!rfb || rfb === attachedRfb) return Boolean(rfb);
    if (attachedRfb) attachedRfb.removeEventListener("clipboard", receiveRemoteClipboard);
    attachedRfb = rfb;
    attachedRfb.addEventListener("clipboard", receiveRemoteClipboard);
    return true;
}

function pasteToRemote(text) {
    attachRfb();
    if (!attachedRfb || typeof attachedRfb.clipboardPasteFrom !== "function") return false;
    const safeText = String(text || "").slice(0, MAX_CLIPBOARD_BYTES);
    const panelText = document.getElementById("noVNC_clipboard_text");
    if (panelText) panelText.value = safeText;
    attachedRfb.clipboardPasteFrom(safeText);
    focusRemoteKeyboard(true);
    return true;
}

function releaseRemoteKeys() {
    if (!attachRfb()) return;
    for (const [code, keysym] of remoteKeysDown) attachedRfb.sendKey(keysym, code, false);
    remoteKeysDown.clear();
}

function isRemoteKeyboardTarget(element) {
    const container = document.getElementById("noVNC_container");
    return element === keyboardInput() || Boolean(
        container && element && element.tagName === "CANVAS" && container.contains(element)
    );
}

function relayRemoteKey(event) {
    if (!remoteFocused || !isRemoteKeyboardTarget(document.activeElement) || !attachRfb()) return;
    const code = getKeycode(event);
    let keysym = getKeysym(event);
    if (event.type === "keyup" && remoteKeysDown.has(code)) keysym = remoteKeysDown.get(code);
    if (!keysym) return;
    const input = keyboardInput();
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "keydown") {
        remoteKeysDown.set(code, keysym);
        attachedRfb.sendKey(keysym, code, true);
    } else {
        attachedRfb.sendKey(keysym, code, false);
        remoteKeysDown.delete(code);
    }
    setTimeout(function () {
        if (remoteFocused && !isFormControl(document.activeElement)) input.focus({preventScroll: true});
    }, 0);
}

function claimRemoteFocus() {
    remoteFocused = true;
    focusRemoteKeyboard(true);
    setTimeout(() => focusRemoteKeyboard(true), 0);
    setTimeout(() => focusRemoteKeyboard(true), 50);
}

function initializeWorkspaceBridge() {
    const container = document.getElementById("noVNC_container");
    const input = keyboardInput();
    if (!container || !input) return;
    for (const eventName of ["pointerdown", "mousedown", "mouseup", "click", "touchstart"]) {
        container.addEventListener(eventName, claimRemoteFocus, true);
    }
    input.addEventListener("focus", function () {
        remoteFocused = true;
    });
    input.addEventListener("blur", function () {
        releaseRemoteKeys();
        setTimeout(function () {
            if (remoteFocused && !isFormControl(document.activeElement)) focusRemoteKeyboard();
        }, 0);
    });
    window.addEventListener("keydown", relayRemoteKey, true);
    window.addEventListener("keyup", relayRemoteKey, true);
    document.addEventListener("pointerdown", function (event) {
        if (!container.contains(event.target) && event.target !== keyboardInput()) remoteFocused = false;
    }, true);
    document.addEventListener("paste", function (event) {
        if (!remoteFocused || document.activeElement !== keyboardInput()) return;
        const text = event.clipboardData && event.clipboardData.getData("text/plain");
        if (text) {
            event.preventDefault();
            event.stopImmediatePropagation();
            pasteToRemote(text);
        }
    }, true);
    setInterval(attachRfb, 500);
    window.addEventListener("blur", releaseRemoteKeys);
    window.addEventListener("focus", function () {
        if (remoteFocused) focusRemoteKeyboard();
    });
    window.AISecEduWorkspaceBridge = {
        focusRemoteKeyboard: () => focusRemoteKeyboard(true),
        pasteToRemote,
    };
    document.documentElement.dataset.aiseceduWorkspaceBridge = "ready";
    setTimeout(() => focusRemoteKeyboard(true), 0);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWorkspaceBridge, {once: true});
} else {
    initializeWorkspaceBridge();
}

window.addEventListener("message", function (event) {
    if (event.source !== window.parent || !event.data) return;
    if (event.data.type === "aisecedu:focus-remote-keyboard") {
        focusRemoteKeyboard(true);
    } else if (event.data.type === "aisecedu:clipboard-to-remote") {
        pasteToRemote(event.data.text);
    } else if (event.data.type === "aisecedu:clipboard-request") {
        postClipboard(lastRemoteClipboard);
    }
});

document.addEventListener("fullscreenchange", async function () {
    if (document.fullscreenElement && navigator.keyboard && navigator.keyboard.lock) {
        try {
            await navigator.keyboard.lock();
        } catch (error) {}
    } else if (navigator.keyboard && navigator.keyboard.unlock) {
        navigator.keyboard.unlock();
    }
    focusRemoteKeyboard(true);
});
