const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
    const listeners = new Map(), imports = [], greetings = [];
    const parent = {postMessage: (message, origin) => greetings.push({message, origin})};
    const window = {parent, addEventListener: (type, handler) => listeners.set(type, handler),
        removeEventListener: type => listeners.delete(type)};
    const context = vm.createContext({window, document: {documentElement: {dataset: {}},
        createElement: () => {throw Error('Embedded bootstrap must not fetch remote scripts');}}});
    const source = fs.readFileSync(path.resolve(__dirname, '../../workspace/services/desktop/keyboard-capture.js'), 'utf8');
    const module = new vm.SourceTextModule(source, {context, importModuleDynamically: async specifier => {
        imports.push(specifier);
        const bundled = new vm.SyntheticModule([], () => {}, {context});
        await bundled.link(() => {});await bundled.evaluate();return bundled;
    }});
    await module.link(async specifier => {
        if (specifier === './ui.js') return new vm.SyntheticModule(['default'], function () {
            this.setExport('default', {});
        }, {context});
        assert.equal(specifier, '../core/input/util.js');
        return new vm.SyntheticModule([], () => {}, {context});
    });
    await module.evaluate();
    assert.equal(greetings.length, 1);
    assert.equal(greetings[0].message.type, 'hello');
    const receive = listeners.get('message');assert.equal(typeof receive, 'function');
    const data = {channel: 'xuanjia:console-v1', type: 'init', nonce: 'a'.repeat(32)};
    for (const event of [
        {source: {}, origin: 'https://platform.example', data},
        {source: parent, origin: 'null', data},
        {source: parent, origin: 'https://platform.example', data: {...data, nonce: 'bad'}},
        {source: parent, origin: 'https://platform.example', data: {...data, channel: 'other'}},
    ]) await receive(event);
    assert.equal(imports.length, 0);assert.equal(window.XuanjiaConsoleParentOrigin, undefined);
    await receive({source: parent, origin: 'http://isolated-ci.example:8080', data});
    assert.deepEqual(imports, ['./aisecedu-console-frame.js']);
    assert.equal(window.XuanjiaConsoleParentOrigin, 'http://isolated-ci.example:8080');
    assert.equal(listeners.has('message'), false);
    await receive({source: parent, origin: 'https://later.example', data});
    assert.equal(imports.length, 1);
    assert.equal(window.XuanjiaConsoleParentOrigin, 'http://isolated-ci.example:8080');
    const proxy = fs.readFileSync(path.resolve(__dirname, '../../nginx/templates/workspace.conf.template'), 'utf8');
    assert.doesNotMatch(proxy, /if\s*\([^\n]*aisecedu-workspace-bridge/,
        'The workspace proxy must serve the bundled bridge instead of redirecting it to the legacy bootstrap');
    const frameListeners = new Map(), replies = [];
    const frameParent = {postMessage: (message, origin) => replies.push({message, origin})};
    const document = {documentElement: {dataset: {}, classList: {add() {}}},
        addEventListener() {}, createElement: () => ({}), head: {append() {}}};
    const frameWindow = {XuanjiaConsoleKind: 'code', XuanjiaConsoleParentOrigin: 'https://stale.example',
        addEventListener: (name, handler) => frameListeners.set(name, handler)};
    const frame = fs.readFileSync(path.resolve(__dirname, '../../workspace/services/remote-console-frame.js'), 'utf8');
    vm.runInNewContext(frame, {window: frameWindow, parent: frameParent, document,
        location: {origin: 'https://workspace.example'}, navigator: {clipboard: {}},
        KeyboardEvent: class {constructor(type, values) {this.type = type;Object.assign(this, values);}},
        setInterval() {}, setTimeout, clearTimeout, TextEncoder});
    assert.equal(replies.length, 1);assert.equal(replies[0].message.type, 'hello');
    const initializeFrame = frameListeners.get('message');
    const init = {...data, kind: 'code', readonly: true};
    await initializeFrame({source: frameParent, origin: 'https://platform.example',
        data: {channel: data.channel, type: 'command', action: 'copy', request: 'before-init'}});
    assert.equal(replies.length, 1, 'Commands require an initialized session and its nonce');
    for (const event of [
        {source: {}, origin: 'https://platform.example', data: init},
        {source: frameParent, origin: 'null', data: init},
        {source: frameParent, origin: 'https://platform.example', data: {...init, nonce: 'bad'}},
    ]) await initializeFrame(event);
    assert.equal(document.documentElement.dataset.consoleBridge, 'loaded');
    await initializeFrame({source: frameParent, origin: 'https://platform.example', data: init});
    assert.equal(document.documentElement.dataset.consoleBridge, 'ready');
    assert.equal(replies.at(-1).origin, 'https://platform.example');
    assert.equal(replies.at(-1).message.readonly, true);
    const count = replies.length;
    await initializeFrame({source: frameParent, origin: 'https://later.example', data: init});
    await initializeFrame({source: frameParent, origin: 'https://platform.example',
        data: {...init, type: 'command', action: 'paste', nonce: 'b'.repeat(32)}});
    assert.equal(replies.length, count);
    await initializeFrame({source: frameParent, origin: 'https://platform.example',
        data: {...init, type: 'command', action: 'paste', request: 'readonly-check', payload: {text: 'denied'}}});
    assert.equal(replies.at(-1).message.request, 'readonly-check');
    assert.match(replies.at(-1).message.error, /只读/);
    const delivered = [], effects = [];
    const target = {classList: {contains: name => name === 'xterm-helper-textarea'},
        dispatchEvent: event => {delivered.push(event);frameListeners.get('keydown')(event);}};
    frameListeners.get('keydown')({key: 'Escape', isTrusted: true, target,
        preventDefault: () => effects.push('prevented'), stopImmediatePropagation: () => effects.push('stopped')});
    assert.deepEqual(effects, ['prevented', 'stopped']);assert.equal(delivered.length, 1);
    assert.equal(delivered[0].key, 'Escape');assert.equal(delivered[0].keyCode, 27);
    const parentSource = fs.readFileSync(path.resolve(__dirname, '../../dojo_theme/static/js/dojo/remote-console.js'), 'utf8');
    const parentWindow = {addEventListener() {}};
    vm.runInNewContext(parentSource.replace('window.AISecEduRemoteConsole={', 'window.TestConsole=Console;window.AISecEduRemoteConsole={'), {
        window: parentWindow, document: {readyState: 'loading', addEventListener() {}, documentElement: {}},
        location: {href: 'https://platform.example/workspace'}, URL,
        MutationObserver: class {observe() {}},
    });
    const control = Object.create(parentWindow.TestConsole.prototype);
    const sent = [];
    control.frame = {src: 'https://workspace.example/workspace/aaaaaaaaaaaa:192.168.42.2/signature/6080/vnc.html',
        contentWindow: {postMessage: (message, origin) => sent.push({message, origin})}};
    control.nonce = 'a'.repeat(32);control.kind = 'desktop';control.workspaceId = 'aaaaaaaaaaaa';
    assert.deepEqual(Array.from(control.frameOrigins()), ['https://workspace.example', 'https://node-1.workspace.example']);
    control.initializeFrame();assert.deepEqual(sent.map(row => row.origin), Array.from(control.frameOrigins()));
    control.peerOrigin = 'https://node-1.workspace.example';assert.equal(control.frameOrigin(), control.peerOrigin);
    control.peerOrigin = 'https://unapproved.example';assert.equal(control.frameOrigin(), 'https://workspace.example');
    control.frame.src = 'https://workspace.example/workspace/aaaaaaaaaaaa/signature/6080/vnc.html';
    assert.deepEqual(Array.from(control.frameOrigins()), ['https://workspace.example']);
    for (const variant of ['', '.dev', '.min']) {
        assert.equal(fs.readFileSync(path.resolve(__dirname, `../../dojo_theme/static/js/dojo/remote-console-frame${variant}.js`), 'utf8').replace(/\r\n/g, '\n'), frame.replace(/\r\n/g, '\n'));
        assert.equal(fs.readFileSync(path.resolve(__dirname, `../../dojo_theme/static/js/dojo/remote-console${variant}.js`), 'utf8').replace(/\r\n/g, '\n'), parentSource.replace(/\r\n/g, '\n'));
    }
    console.log('Desktop bootstrap, node redirects, nonce, terminal Escape and asset parity: PASS');
})().catch(error => {console.error(error);process.exitCode = 1;});
