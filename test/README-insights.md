# 学情分析验证

## 纯统计合同

从仓库根目录运行，不需要数据库：

```bash
python3 - <<'PY'
import runpy
scope = runpy.run_path('test/test_insights_contract.py')
tests = [value for name, value in scope.items() if name.startswith('test_')]
for test in tests:
    test()
print('PASS', len(tests), 'contract tests')
PY
```

## DOM 与空间场景

使用 Node.js 和 jsdom 26.1.0。测试数据位于 `test/fixtures/insights-report.json`，明确为合成测试数据，不依赖生产学生信息。可把依赖装入独立临时目录，避免引入前端运行依赖：

```bash
npm install --prefix /tmp/xj-insights-tests --no-save jsdom@26.1.0
NODE_PATH=/tmp/xj-insights-tests/node_modules node test/insights-dom.cjs
NODE_PATH=/tmp/xj-insights-tests/node_modules node test/learning-atlas.cjs
```

覆盖身份与任务映射、场景分页、键盘入口、HTML 转义、核验未知结果、矩阵、详情、动效、隐私、大屏挂载恢复、竞态筛选、失败快照与跟进表单。DOM 测试不是浏览器布局测试。

## 发布验收

教师登录后检查课程学情的桌面普通视图、教学大屏和窄屏。打开具体正式回执，验证检查项分页；跟进测试应使用测试课程或回滚事务，不给真实学生留下测试计划。接口必须保持教师课程范围权限和 private/no-store；CSV 范围须与报告一致。

本轮研究、实现边界与真实浏览器结果见 `docs/学情态势台-DataV重构与验收.md`。
