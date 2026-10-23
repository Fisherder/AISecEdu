const assert = require('node:assert/strict');
const { submit, observe } = require('./revise-cinematic-assembly-api.cjs');

const configuration = Object.freeze({
  target: { artifact: 'artifact_1a218d1fed7a42d2b1928376e39c260c', materialization: 'job_a790e3f3250b4880923db2d2a9d7107d', revision: 3 },
  status: 'DRAFT', prerequisiteKind: 'artifact.revise', expectedModelCount: 4,
  key: 'cinematic-v18-board-readable-phase-signs-r3',
  instruction: '请仅改善主板作品版本3中 annotation-panel 和 status-panel 两块空白牌面的真实呈现，继续原作品，不换新例。当前运行时的 box/plane 已支持顶层 surfaceText:{lines:[...],color:"#e7f2fa",chapterTitle:true}：lines为1-4行固定短句；当chapterTitle=true时最多3行固定短句，第四行位置追加准确的当前chapters.title，由唯一播放时间自动更新，暂停/单步/seek/reset同步，不需要也不支持自己写文字轨道或JS。这是本次真实能力，不是设想。请让annotation-panel用surfaceText清楚说明“逻辑示意，不是物理内存”“不代表真实内存地址”，与原说明语义一致；让status-panel用surfaceText.lines:["当前阶段"]并设置chapterTitle:true，真正显示当前教学章节，不再只靠空白块位移和亮度假称显示。两牌改为共用scene-base空余前沿的低矮、平放、有接触的深色高对比铭牌，不遮住主板/逻辑栈/局部信息标记，不超出基座，不新增其他对象；根据真实尺寸、旋转、assembly关系完成接触，并可改这两个牌的label/detail以准确描述实际功能。原status-panel已有position轨道若因贴合基座需要坐标换算，只允许整体平移其全部关键帧，保留相对位移、全部时间和emissive；不能删轨道、制造额外运动或删原需求。其余七节点全部字段、四精细模型及全部参数、CPU和DIMM端口摆放、帧和局部信息所有轨道、84秒时长、十章节尤其52/55/63/67四阶段标题说明、全部镜头、原始完整合同/coverage和标题都保留。字段只可改两牌和对应必要装配关系；不要发布给学生，仍保存为仅教师可见草稿。',
});

async function main() {
  assert.ok(process.argv.length === 3 && ['--submit', '--observe'].includes(process.argv[2]));
  const fs = require('node:fs'), path = require('node:path');
  const root = path.resolve(__dirname, '..'), dir = path.join(root, 'cache/cinematic-controls/board-signs-v18');
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
  console.error(JSON.stringify({ failure: error.name, message: 'Scoped board sign revision did not complete; inspect saved receipt before submitting again' }));
  process.exitCode = 1;
});
