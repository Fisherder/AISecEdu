import UI from "./ui.js";
import * as util from "../core/input/util.js";
window.AISecEduNoVNC = {UI, util};
if (window.parent !== window) {
    let bootstrapped = false;
    const initialize = async (event) => {
        if (bootstrapped || event.source !== window.parent || event.data?.channel !== "xuanjia:console-v1"
                || event.data.type !== "init" || !/^[a-f0-9]{32}$/.test(event.data.nonce || "")
                || !/^https?:\/\//.test(event.origin)) return;
        bootstrapped = true;
        window.removeEventListener("message", initialize);
        window.XuanjiaConsoleParentOrigin = event.origin;
        try {
            await import("./aisecedu-console-frame.js");
        } catch (error) {
            document.documentElement.dataset.consoleBridge = "module-unavailable";
        }
    };
    window.addEventListener("message", initialize);
    window.parent.postMessage({channel: "xuanjia:console-v1", type: "hello"}, "*");
} else {
    const script = document.createElement("script");
    script.src = "http://10.92.35.7:8080/workspace/console-bootstrap.js";
    script.dataset.consoleFrame = "1";
    document.head.append(script);
}
