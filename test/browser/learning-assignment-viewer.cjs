const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const {test} = require("node:test");
const {createContext, runInContext} = require("node:vm");

const source = resolve(__dirname, "../../dojo_theme/static/js/dojo");
const scripts = ["core/request-client.js", "learning-common.js", "learning-assignment.js"];
const assignmentId = "plant-growth";
const legacyKey = `aisecedu:assignment:${assignmentId}:draft:v2`;
const scope = id => `aisecedu:assignment:${assignmentId}:viewer:${id}`;
const key = id => `${scope(id)}:draft:v3`;
const draft = answer => JSON.stringify({answers: {leaf: answer}, savedAt: "2026-01-02T10:00:00Z"});
const flush = () => new Promise(resolve => setImmediate(resolve));

function assignment() {
  return {
    title: "Plant growth", courseName: "Natural science", status: "PUBLISHED",
    itemCount: 1, maxScore: 5, items: [{
      id: "leaf", position: 0, type: "SHORT_ANSWER", points: 5,
      title: "Leaves", prompt: "Why do leaves need light?", required: true, config: {},
    }],
  };
}

function browser() {
  const values = new Map([
    [legacyKey, draft("Unknown draft")],
    [key(1), draft("Leaves need light for photosynthesis.")],
  ]);
  const channels = [];
  const open = (viewerId, {status: initialStatus = 200, assignmentFields = {}} = {}) => {
    const requests = [];
    const reads = [];
    const writes = [];
    const elements = new Map();
    const control = {value: ""};
    let status = initialStatus;
    const getElementById = id => {
      if (!elements.has(id)) {
        const element = new EventTarget();
        Object.assign(element, {
          dataset: {assignmentId}, classList: {add() {}, remove() {}, toggle() {}},
          querySelectorAll: () => [],
          hidden: id === "learning-assignment-content",
        });
        Object.defineProperty(element, "textContent", {
          get() { return this.innerHTML; },
          set(value) { this.innerHTML = value; },
        });
        elements.set(id, element);
      }
      return elements.get(id);
    };
    const document = Object.assign(new EventTarget(), {
      getElementById, readyState: "loading", visibilityState: "visible",
      querySelectorAll: () => [], getElementsByName: () => [control],
    });
    const window = Object.assign(new EventTarget(), {
      setTimeout: (handler, delay) => setTimeout(handler, delay).unref(), clearTimeout,
      init: {csrfNonce: "synthetic-assignment-nonce"},
      AISecEduUI: {confirm: async () => true},
      localStorage: {
        getItem: name => { reads.push(name); return values.get(name) ?? null; },
        setItem: (name, value) => { writes.push(name); values.set(name, value); },
      },
      async fetch(url, options) {
        const body = options.body && JSON.parse(options.body);
        requests.push({url, headers: options.headers, method: options.method, body});
        const payload = status === 200
          ? {success: true, data: {viewerId, assignment: {...assignment(), ...assignmentFields}}}
          : {success: false, code: "VIEWER_MISMATCH", message: "Reload the assignment"};
        if (options.method === "POST" && status === 200) {
          payload.data.assignment.submission = {answers: body.answers, updated: "2026-01-02T10:01:00Z"};
        }
        return new Response(JSON.stringify(payload), {
          status, headers: {"content-type": "application/json"},
        });
      },
    });
    class BroadcastChannel extends EventTarget {
      constructor(name) {
        super();
        this.name = name;
        this.closed = false;
        channels.push(this);
      }

      postMessage(data) {
        for (const channel of channels) {
          if (channel !== this && !channel.closed && channel.name === this.name) {
            channel.dispatchEvent(new MessageEvent("message", {data}));
          }
        }
      }

      close() {
        this.closed = true;
      }
    }
    window.BroadcastChannel = BroadcastChannel;
    const navigator = {onLine: false};
    const context = createContext({window, document, navigator, AbortController, BroadcastChannel});
    for (const script of scripts) {
      runInContext(readFileSync(resolve(source, script), "utf8"), context, {filename: script});
    }
    return {
      requests, reads, writes, navigator, control, element: getElementById,
      setViewer: value => { viewerId = value; },
      setStatus: value => { status = value; },
      emit: event => window.dispatchEvent(new Event(event)),
      click: id => getElementById(id).dispatchEvent(new Event("click")),
    };
  };
  return {open, values, channels};
}

test("the learner's own drafts and cross-tab notices stay in their account scope", async () => {
  const {open, values, channels} = browser();
  const first = open(1);
  const same = open(1);
  const other = open(2);
  await flush();
  assert.match(first.element("la-form").innerHTML, /photosynthesis/);
  assert.doesNotMatch(other.element("la-form").innerHTML, /photosynthesis|Unknown draft/);
  assert.deepEqual(first.reads, [key(1)]);
  assert.deepEqual(other.reads, [key(2)]);
  assert.deepEqual(channels.map(channel => channel.name), [`${scope(1)}:sync`, `${scope(1)}:sync`, `${scope(2)}:sync`]);
  assert.equal(first.requests[0].headers["Cache-Control"], "no-cache");

  other.control.value = "A leaf takes in sunlight.";
  other.element("la-form").dispatchEvent(new Event("input"));
  assert.deepEqual(other.writes, [key(2)]);
  assert.equal(values.get(legacyKey), draft("Unknown draft"));
  assert.equal(values.get(key(1)), draft("Leaves need light for photosynthesis."));
  assert.match(values.get(key(2)), /takes in sunlight/);

  first.navigator.onLine = true;
  first.control.value = "Plants use light to make sugar.";
  first.click("la-save");
  await flush();
  const save = first.requests.at(-1);
  assert.equal(save.method, "POST");
  assert.equal(save.body.expectedViewerId, 1);
  assert.equal(save.body.action, "save");
  assert.equal(save.headers["CSRF-Token"], "synthetic-assignment-nonce");
  assert.match(same.element("learning-assignment-notice").textContent, /另一窗口更新/);
  assert.doesNotMatch(other.element("learning-assignment-notice").textContent || "", /另一窗口更新/);

  first.click("la-submit");
  await flush();
  assert.equal(first.requests.at(-1).body.expectedViewerId, 1);
  assert.equal(first.requests.at(-1).body.action, "submit");
});

test("an unverified or changed viewer cannot open another scope or write drafts", async () => {
  const {open, channels} = browser();
  const pending = open(undefined);
  pending.emit("beforeunload");
  await flush();
  pending.emit("beforeunload");
  assert.deepEqual([pending.reads, pending.writes, channels.length], [[], [], 0]);
  assert.equal(pending.element("learning-assignment-content").hidden, true);

  const denied = open(1, {status: 403});
  await flush();
  denied.emit("beforeunload");
  assert.deepEqual([denied.reads, denied.writes, channels.length], [[], [], 0]);
  assert.equal(denied.element("learning-assignment-content").hidden, true);

  const changed = open(1);
  await flush();
  changed.navigator.onLine = true;
  changed.setViewer(2);
  changed.emit("focus");
  await flush();
  changed.emit("beforeunload");
  assert.deepEqual(changed.reads, [key(1)]);
  assert.deepEqual(changed.writes, []);
  assert.equal(changed.element("learning-assignment-content").hidden, true);
  assert.equal(changed.element("la-form").textContent, "");
  assert.equal(channels[0].closed, true);
  changed.setViewer(1);
  changed.emit("focus");
  await flush();
  assert.equal(changed.requests.length, 2);
  assert.equal(changed.element("learning-assignment-content").hidden, true);

  const rejected = open(1);
  await flush();
  rejected.setStatus(409);
  rejected.navigator.onLine = true;
  rejected.click("la-save");
  await flush();
  rejected.emit("beforeunload");
  assert.equal(rejected.requests.at(-1).body.expectedViewerId, 1);
  assert.deepEqual(rejected.writes, []);
  assert.equal(rejected.element("learning-assignment-content").hidden, true);
  assert.equal(channels[1].closed, true);
});


test("submission policy applies to desktop, mobile and changes saved after reopening", async () => {
  const {open} = browser();
  for (const [fields, editable] of [
    [{submission: {status: "IN_PROGRESS", submittedAt: null}, settings: {allowResubmit: false}}, true],
    [{submission: {status: "IN_PROGRESS", submittedAt: "2026-01-01"}, settings: {allowResubmit: false}}, false],
    [{submission: {status: "GRADED", submittedAt: "2026-01-01"}, assessmentState: "READY"}, true],
    [{status: "CLOSED"}, false],
  ]) {
    const page = open(1, {assignmentFields: fields});
    await flush();
    assert.equal(page.element("la-submit").hidden, !editable);
    assert.equal(page.element("la-save").hidden, !editable);
    assert.equal(page.element("la-mobile-next").disabled, !editable);
    if (!editable) {
      assert.doesNotMatch(page.element("la-form").innerHTML, /photosynthesis/);
      for (const id of ["la-mobile-next", "la-submit", "la-save"]) page.click(id);
      await flush();
      assert.equal(page.requests.filter(r => r.method === "POST").length, 0);
    }
  }
});
