const assert = require('node:assert/strict');
const { submit, observe } = require('./revise-cinematic-assembly-api.cjs');

const configuration = Object.freeze({
  target: { artifact: 'artifact_7356dac10ff44d27a103da6b39f9208b', materialization: 'job_a9db17a710e84ae299761f828b1ce7c0', revision: 5 },
  status: 'DRAFT', prerequisiteKind: 'artifact.revise',
  key: 'cinematic-v17-valve-readable-mounted-sign-r5',
  instruction: '请仅修正当前版本5中的 notice-board 说明板：真实浏览器显示它是高空悬浮的大块空白板，遮挡和占据无意义空间。当前运行时已真正支持 box/plane 顶层 surfaceText:{lines:[...],color:"#e7f2fa"} 静态表面文字，box的本地±Z两面均可读，随实体旋转/显隐，点击可读全文；这不是动态文字轨道。保留 notice-board 原ID、represents、coverage完整对象要求和现有subtitle全文声明，将它改成一块小巧、深色、高对比的真实铭牌，平放并接触共用基座顶面的空余前沿区域，不再高空悬浮、不压住管路/底脚/流向标记，也不超出基座。用合适的真实宽高厚度、旋转和assembly相对关系保证接触；请根据当前SceneIR几何自行选择其尺寸与位置，而不是仅改说明。surfaceText按三行完整显示“教学概念模型”“不控制任何真实设备”“不冒充流体数值计算”，不缩写删除原声明，不发光闪烁。可调该铭牌的label/detail使其与实际静态铭牌一致；不增加其他对象。已有subtitle仍在画面标题区全程显示原声明，即使特写不取景铭牌也能读到。禁止调整其余27个节点的任何字段、六个精细模型及全部参数、十个承托台座、管夹和支撑、原轨道、镜头、七章节、72秒时长、原标题和原完整需求合同；保留旋转/缩放/画质/播放/拆解等原控件，不发布给学生，仍保存为仅教师可见草稿。',
});

async function main() {
  assert.ok(process.argv.length === 3 && ['--submit', '--observe'].includes(process.argv[2]));
  const fs = require('node:fs'), path = require('node:path');
  const root = path.resolve(__dirname, '..'), dir = path.join(root, 'cache/cinematic-controls/valve-sign-v17');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const io = {
    exists: name => fs.existsSync(path.join(dir, name)),
    load: name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
    save: (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 }),
    writeOnce: (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' }),
  };
  const api = require('./cinematic-tunnel-api.cjs').createTunnelApi(JSON.parse(fs.readFileSync(path.join(root, 'cache/acceptance/browser-state.json'), 'utf8')));
  console.log(JSON.stringify(await (process.argv[2] === '--submit' ? submit : observe)(api, io, configuration)));
}

module.exports = { configuration };
if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ failure: error.name, message: 'Scoped sign revision did not complete; inspect saved receipt before submitting again' }));
  process.exitCode = 1;
});
