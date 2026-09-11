const fs = require("node:fs");
const assert = require("node:assert/strict");
const pw = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => i % 2 ? a : [...a, [v.replace(/^--/, ""), all[i + 1]]], []));
const base = args["base-url"], dir = args.state;
const generation = JSON.parse(fs.readFileSync(dir + "/generation.json"));
const stateFile = dir + "/classroom-state.json";
const state = JSON.parse(fs.readFileSync(stateFile));
const credentials = JSON.parse(fs.readFileSync(args.credentials));
const report = { checks: [], errors: [], evidenceRequests: [] };

(async () => {
  const teacher = await pw.request.newContext({ baseURL: base, ignoreHTTPSErrors: true, extraHTTPHeaders: { Authorization: "Bearer frontend-session" } });
  async function api(client, method, path, data, statuses = [200, 201, 202]) {
    const response = await client.fetch(new URL(path, base).href, { method, data, timeout: 120000 });
    const body = await response.json();
    assert.ok(statuses.includes(response.status()) && body.success, `${method} ${path} HTTP ${response.status()}: ${JSON.stringify(body).slice(0, 350)}`);
    return body.data;
  }
  await api(teacher, "POST", "/pwncollege_api/v1/auth/login", { name: credentials.username, password: credentials.password });
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_BINARY, headless: true });
  const track = page => page.on("pageerror", error => report.errors.push(error.message));
  try {
    const teacherContext = await browser.newContext({ storageState: await teacher.storageState(), ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1050 } });
    const page = await teacherContext.newPage(); track(page);
    await page.goto(generation.runs.simulation.preview, { waitUntil: "domcontentloaded" });
    await page.locator('#teaching-artifact[data-preview-state="ready"]').waitFor({ timeout: 60000 });
    await page.locator("#artifact-start-classroom").click();
    await page.waitForURL(/\/agent-runtime\/classroom\//, { timeout: 60000 });
    const sessionId = new URL(page.url()).pathname.split("/").at(-1);
    state.simulationSession = sessionId;
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
    report.checks.push("Teacher starts the current artifact version through its visible button");
    const student = await pw.request.newContext({ baseURL: base, ignoreHTTPSErrors: true, extraHTTPHeaders: { Authorization: "Bearer frontend-session" } });
    await api(student, "POST", "/pwncollege_api/v1/auth/login", { name: state.user.name, password: state.user.password });
    const context = await browser.newContext({ storageState: await student.storageState(), ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1050 } });
    const learner = await context.newPage(); track(learner);
    learner.on("requestfinished", async request => {
      if (request.url().includes("/api/integration/aisecedu/events") && request.method() === "POST") {
        const response = await request.response();
        report.evidenceRequests.push({ body: request.postDataJSON(), status: response.status() });
      }
    });
    await learner.goto(base + "/classrooms/" + sessionId, { waitUntil: "domcontentloaded" });
    await learner.waitForURL(/\/agent-runtime\/classroom\//, { timeout: 60000 });
    await learner.waitForFunction(() => document.querySelector("iframe"), { timeout: 60000 });
    let widget;
    for (let i = 0; i < 60; i++) {
      widget = learner.frames().find(frame => frame !== learner.mainFrame());
      if (widget && await widget.locator("#deviation").count()) break;
      await learner.waitForTimeout(500);
    }
    assert.ok(widget && await widget.locator("#deviation").count(), "Generated simulation widget missing");
    await learner.waitForTimeout(1800);
    await widget.locator('[data-phase-button="3"]').click();
    assert.equal(await widget.locator("#value-process").innerText(), "80%");
    assert.equal(await widget.locator("#value-monitor").innerText(), "50%");
    await widget.locator("#verification").check();
    assert.equal(await widget.locator("#value-process").innerText(), "50%");
    await widget.locator("#deviation").focus(); await widget.locator("#deviation").press("End");
    await widget.locator("#verification").uncheck();
    assert.equal(await widget.locator("#value-process").innerText(), "100%");
    await widget.locator('[data-phase-button="4"]').click();
    await widget.locator('[data-phase-button="5"]').click();
    await learner.waitForTimeout(1200);
    await learner.screenshot({ path: dir + "/student-control-classroom.png" });
    report.checks.push("Generated industrial process responds to parameters, concealed feedback and verification");
    const analyticsPath = "/pwncollege_api/v1/teaching/progress/" + generation.course.referenceId + "/classroom";
    const analytics = await api(teacher, "GET", analyticsPath);
    assert.equal(analytics.participantCount, 1);
    assert.ok(analytics.responseCount >= 1, "Actual student responses were not counted");
    assert.ok(analytics.completionCount >= 1, "Actual completed simulation was not counted");
    report.analytics = analytics;
    report.checks.push("Actual browser interactions reach the teacher's course analytics");
    const sent = report.evidenceRequests.find(item => item.body.type === "student.response");
    assert.ok(sent && sent.status === 200, "Runtime bridge did not accept student evidence");
    const duplicate = await api(context.request, "POST", "/agent-runtime/api/integration/aisecedu/events", sent.body);
    assert.equal(duplicate.deduplicated, true);
    assert.equal((await api(teacher, "GET", analyticsPath)).responseCount, analytics.responseCount);
    const forbidden = await student.get(analyticsPath);
    assert.ok([403, 404].includes(forbidden.status()));
    const ignored = await api(teacherContext.request, "POST", "/agent-runtime/api/integration/aisecedu/events", sent.body);
    assert.equal(ignored.accepted, false);
    report.checks.push("Retries are idempotent, students cannot read teacher analytics, teacher previews do not count");
    fs.writeFileSync(dir + "/student-classroom-browser.json", JSON.stringify({ body: await learner.locator("body").innerText(), controls: await learner.locator("button,input,textarea").evaluateAll(es => es.map(e => ({ tag: e.tagName, label: e.getAttribute("aria-label"), title: e.getAttribute("title"), placeholder: e.getAttribute("placeholder"), text: e.innerText?.slice(0, 80) }))) }, null, 2));
    assert.deepEqual(report.errors, []);
    report.passed = true;
    await student.dispose();
  } catch (error) {
    report.failure = error.message;
    for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: dir + "/classroom-failure-" + browser.contexts().indexOf(context) + ".png" }).catch(() => {});
      fs.writeFileSync(dir + "/classroom-failure-dom-" + browser.contexts().indexOf(context) + ".json", JSON.stringify({ body: await page.locator("body").innerText().catch(() => ""), frames: page.frames().map(frame => frame.url().split("?")[0]) }, null, 2));
    }
    throw error;
  } finally {
    fs.writeFileSync(dir + "/classroom-acceptance.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks, failure: report.failure, requests: report.evidenceRequests.map(item => ({ type: item.body.type, status: item.status })) }));
    await browser.close(); await teacher.dispose();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
