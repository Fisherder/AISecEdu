import UI from "./ui.js";
import * as util from "../core/input/util.js";
window.AISecEduNoVNC = {UI, util};
const script = document.createElement("script");
script.src = "http://10.92.35.7:8080/workspace/console-bootstrap.js";
script.dataset.consoleFrame = "1";
document.head.append(script);
