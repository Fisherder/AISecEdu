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
    console.log('Desktop bootstrap origin, nonce, bundled code and single initialization: PASS');
})().catch(error => {console.error(error);process.exitCode = 1;});
