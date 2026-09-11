const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => index % 2 ? pairs : [...pairs, [value.replace(/^--/, ""), values[index + 1]]], []));
const baseURL = options["base-url"];
const credentials = JSON.parse(fs.readFileSync(options.credentials));
const output = options.out;
fs.mkdirSync(output, { recursive: true });

(async () => {
  const client = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Authorization: "Bearer frontend-session" } });
  const login = await client.post("/pwncollege_api/v1/auth/login", { data: { name: credentials.username, password: credentials.password } });
  assert.equal(login.status(), 200, "Administrator login failed");
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_BINARY, headless: true });
  const context = await browser.newContext({ storageState: await client.storageState(), ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const report = { checks: [], widths: [], screenshots: [] };
  async function check(name, action) { await action(); report.checks.push(name); console.log("PASS", name); }
  try {
    await page.goto(baseURL + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator("#teaching-dashboard:not([hidden])").waitFor();
    await page.waitForFunction(() => document.getElementById("showcase-title")?.textContent === "当仪表正常，设备却在偏离");
    await check("login shows the unified teaching agent and visual case", async () => {
      assert.equal(await page.locator("#teaching-dashboard-title").innerText(), "AI 教学智能体");
      assert.equal(await page.locator("#showcase-monitor-value").textContent(), "50%");
    });
    await check("parameter, false feedback and independent verification branches", async () => {
      await page.locator('[data-showcase-phase="3"]').click();
      assert.equal(await page.locator("#showcase-process-value").textContent(), "80%");
      assert.equal(await page.locator("#showcase-monitor-value").textContent(), "50%");
      await page.locator("#showcase-intensity").focus();
      await page.locator("#showcase-intensity").press("End");
      assert.equal(await page.locator("#showcase-process-value").textContent(), "100%");
      await page.locator("#showcase-verify").check();
      assert.equal(await page.locator("#showcase-process-value").textContent(), "50%");
      assert.match(await page.locator("#showcase-status").innerText(), /阻断/);
    });
    await check("pause, complete playback, repeat reset and vehicle preset", async () => {
      await page.locator("#showcase-reset").click();
      await page.locator("#showcase-play").click();
      await page.waitForFunction(() => document.querySelector("#teaching-showcase").dataset.phase === "1");
      await page.locator("#showcase-play").click();
      await page.waitForTimeout(3600);
      assert.equal(await page.locator("#teaching-showcase").getAttribute("data-phase"), "1");
      await page.locator('[data-showcase-phase="5"]').click();
      await page.locator(".showcase-details summary").click();
      assert.match(await page.locator("#showcase-comparison").innerText(), /恢复/);
      await page.locator(".showcase-details summary").click();
      await page.locator("#showcase-reset").click(); await page.locator("#showcase-reset").click();
      assert.equal(await page.locator("#showcase-intensity").inputValue(), "30");
      assert.equal(await page.locator("#showcase-verify").isChecked(), false);
      await page.locator('[data-showcase-case="vehicle"]').click();
      assert.equal(await page.locator("#showcase-source").textContent(), "车载网关");
      assert.equal(await page.locator("#teaching-showcase").getAttribute("data-phase"), "0");
    });
    await check("synchronized slide notes, keyboard tabs and three debate rounds", async () => {
      await page.getByRole("tab", { name: /动态课件/ }).click();
      await page.locator('[data-showcase-phase="2"]').click();
      assert.match(await page.locator("#showcase-stage-label").innerText(), /第 3 页/);
      assert.equal(await page.locator("#showcase-slide-body").innerText(), await page.locator("#showcase-cue").innerText());
      await page.getByRole("tab", { name: /动态课件/ }).focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.getByRole("tab", { name: /课堂辩论/ }).getAttribute("aria-selected"), "true");
      await page.locator('[data-showcase-vote="contain"]').click();
      assert.match(await page.locator("#showcase-vote-result").innerText(), /仅当前页面/);
      await page.locator("#showcase-round-next").click(); await page.locator("#showcase-round-next").click();
      assert.match(await page.locator("#showcase-round-label").innerText(), /综合决策/);
      await page.locator("#showcase-debate-reset").click();
      assert.match(await page.locator("#showcase-round-label").innerText(), /第 1 轮/);
      assert.equal(await page.locator('[data-showcase-vote="contain"]').getAttribute("aria-pressed"), "false");
    });
    await check("case generation returns to the same teaching composer", async () => {
      await page.locator("#showcase-generate").click();
      assert.match(await page.locator("#teaching-dashboard-input").inputValue(), /多角色 AI 辩论/);
      assert.equal(await page.locator("#teaching-dashboard-send").isEnabled(), true);
      assert.equal(await page.locator(".teaching-conversation").isVisible(), false);
    });
    await page.getByRole("tab", { name: /动态演示/ }).click();
    await page.locator('[data-showcase-case="industrial"]').click();
    await page.locator('[data-showcase-phase="3"]').click();
    await check("dark stage text retains readable contrast in the light site theme", async () => {
      const ratios = await page.evaluate(() => {
        const luminance = color => { const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
        return ["#showcase-timeline button", ".showcase-evidence small"].map(selector => {
          const element = document.querySelector(selector); let parent = element; let background;
          do { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; } while (parent && (background === "rgba(0, 0, 0, 0)" || background === "transparent"));
          const a = luminance(getComputedStyle(element).color), b = luminance(background);
          return { selector, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
        });
      });
      for (const item of ratios) assert.ok(item.ratio >= 4.5, JSON.stringify(item));
    });
    for (const width of [1440, 768, 414, 375, 320]) {
      await page.setViewportSize({ width, height: width < 550 ? 2400 : 1700 });
      await page.locator("#teaching-showcase").scrollIntoViewIfNeeded();
      const layout = await page.locator("#teaching-showcase").evaluate((element) => ({ width: element.getBoundingClientRect().width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, right: element.getBoundingClientRect().right }));
      assert.ok(layout.scrollWidth <= layout.clientWidth + 1 && layout.right <= width + 1, `Showcase overflow at ${width}px: ${JSON.stringify(layout)}`);
      if (width < 550) assert.ok(await page.locator(".showcase-mobile-graph").isVisible());
      const filename = `teaching-showcase-${width}.png`;
      await page.locator("#teaching-showcase").screenshot({ path: path.join(output, filename), style: ".product-navbar{visibility:hidden!important}" });
      report.widths.push(width); report.screenshots.push(filename);
    }
    await check("reduced motion retains the visual state", async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.locator("#showcase-play").click();
      assert.equal(await page.locator(".showcase-rotor").evaluate((element) => getComputedStyle(element).animationName), "none");
      await page.locator("#showcase-play").click();
    });
    await check("course analytics loads real data or an explicit empty state", async () => {
      await page.locator("#teaching-visual-learning").scrollIntoViewIfNeeded();
      await page.locator("#learning-visual-refresh").click();
      await page.waitForFunction(() => document.querySelector("#learning-visual-content").getAttribute("aria-busy") !== "true");
      const text = await page.locator("#learning-visual-content").innerText();
      assert.match(text, /课程学生|等待第一份真实学习证据/);
      assert.doesNotMatch(text, /暂时无法读取/);
    });
    assert.deepEqual(errors, [], "Browser runtime errors");
    report.passed = true;
  } catch (error) {
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    report.browserErrors = errors;
    fs.writeFileSync(path.join(output, "ui-acceptance.json"), JSON.stringify(report, null, 2));
    await browser.close(); await client.dispose();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
