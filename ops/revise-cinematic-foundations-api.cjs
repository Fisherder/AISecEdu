const assert = require('node:assert/strict');
const { submit, observe } = require('./revise-cinematic-assembly-api.cjs');
const configuration = Object.freeze({
  target: { artifact: 'artifact_7356dac10ff44d27a103da6b39f9208b', materialization: 'job_b30971977e824e979b9b535ebcc5db62', revision: 3 },
  status: 'DRAFT',
  prerequisiteKind: 'artifact.revise',
  key: 'cinematic-v15-valve-foundations-r3',
  instruction: '请在原阀门作品版本3上继续定向修正装配底脚悬空，仍使用原六个精细模型，不换示例、不改为二维、不删除任何原教学对象或阶段。上次四个管夹与两个自建圆柱支撑已对齐，这些保持不变；原阀门/管路的位置、旋转、缩放和全部参数、法兰端口接合、七阶段、72秒时长、原镜头和所有原轨道保持不变。真实Three.js几何复核显示共用基座base顶面Y=-2.2，但两阀门原资产底座底面Y=-2.05，四段管路原资产自带支架的底脚也悬空：straight上游两只脚底Y=-1.7091898889326733，elbow下游两只脚底Y=-1.635150807998463。请增加有明确尺寸、简洁深色金属材质的真实承托台座/垫座，使每一个原资产底脚都有从共用基座顶面到该脚底的连续支撑，不要只改文字、隐藏底脚或把整个管路下移破坏法兰同轴。阀门底板可用一块低矮台座，直管和弯管的两只脚分别承托或用合理形状的共用底台。真实世界脚底投影范围如下，X/Z范围包含了实际旋转后的底板，设计台座顶面应完全覆盖脚底且略留边：主阀门mount=[0,-2.05,2.202929534565165]，对照阀门Z=-2.197070465434835，阀门底板原始尺寸1.96×0.14×1.37，需按真实规范化与scale换算；pipe-up-main第一脚X[-5.512954652764725,-5.009877426652766]、第二脚X[-3.0483299546583194,-2.5452527285463606]，两脚Z[1.7541057134708093,2.6517533556595208]；pipe-down-main第一脚X[2.747092259280903,3.2318966542585486]、Z[1.752940336866912,2.5901719673488417]，第二脚X[4.191263338936196,5.096138702183907]、Z[2.8709026878127206,3.4996051609382848]；对照管路对应脚的X/Y一致，Z全部减4.4。以上是实测几何事实，不是要求照抄一个手工新场景；请根据完整SceneIR和真实资产参数验证并构造台座。台座底面准确落在Y=-2.2、顶面准确接触相应脚底，使用assembly.floor或明确的真实相对关系。不要引入新的发光块、标签堆积或悬浮说明板。对照装置新增承托件必须与原对照阀门/管路一致：0至57秒隐藏，58秒出现，不能提前露出空台座。主装置新增承托件常显且随拆解复原保持固定。其他原正确内容包括固定教学边界声明保持不变；保留原标题、完整需求合同、所有控件，完成后仍为仅教师可见的草稿。',
});

const wideningConfiguration = Object.freeze({
  target: { artifact: configuration.target.artifact, materialization: 'job_344815cfec9c45838230758f004f89ca', revision: 4 },
  status: 'DRAFT', prerequisiteKind: 'artifact.revise',
  key: 'cinematic-v16-valve-seat-footprint-r4',
  instruction: '请仅修正当前版本4的两只阀门承托台座 valve-seat-main 和 valve-seat-cmp 的宽度与深度。上一修订已正确补齐八个管路底脚，所有原节点、六个精细模型、模型参数与变换、所有原轨道和镜头、七个章节、72秒时长、十个台座的高度/位置、对照显隐均保持不变。几何验收发现这两只阀门台座用了原始建模宽深，未完整覆盖规范化后的真实阀门底板。请使用本次assetGeometry中valve实例的world-at-time-zero supportSurfaces底板包络，而不是原始1.96×1.37尺寸，计算台座所需width/depth，使顶面完全覆盖对应阀门真实底板并在四边各留约0.05场景单位余量。两个台座height=0.15和既有位置不变，底面应继续接触共用基座顶面、顶面继续接触阀门底脚；不允许缩小阀门底板、改scale、移管路、隐藏部件或只改说明来通过。只输出这两个台座尺寸的必要定向修订，保留完整原需求合同与原标题，仍为仅教师可见草稿。',
});

async function main() {
  assert.ok(process.argv.length === 3 && ['--submit', '--observe', '--widen-submit', '--widen-observe'].includes(process.argv[2]));
  const fs = require('node:fs'), path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const widening = process.argv[2].startsWith('--widen-');
  const activeConfiguration = widening ? wideningConfiguration : configuration;
  const dir = path.join(root, 'cache/cinematic-controls', widening ? 'valve-seat-v16' : 'valve-foundations-v15');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const io = {
    exists: name => fs.existsSync(path.join(dir, name)),
    load: name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
    save: (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 }),
    writeOnce: (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' }),
  };
  const api = require('./cinematic-tunnel-api.cjs').createTunnelApi(JSON.parse(fs.readFileSync(path.join(root, 'cache/acceptance/browser-state.json'), 'utf8')));
  console.log(JSON.stringify(await (process.argv[2].endsWith('submit') ? submit : observe)(api, io, activeConfiguration)));
}

module.exports = { configuration, wideningConfiguration };
if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ failure: error.name, message: 'Scoped foundation revision did not complete; inspect saved receipt before submitting again' }));
  process.exitCode = 1;
});
