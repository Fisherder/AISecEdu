import { useState } from 'react';
import { useWorkbench } from '../core/context';
import type { Data } from '../core/types';
import { Button, Dialog } from './ui';

export function GenerationConfirmation({
  bundle,
  option,
  messageId,
  onClose,
}: {
  bundle: Data;
  option: Data;
  messageId: number;
  onClose: () => void;
}) {
  const { state, controller: c } = useWorkbench();
  const count = Math.max(1, Number(bundle.baseArguments?.challengeCount || 1));
  const [items, setItems] = useState(() =>
    Array.from({ length: count }, (_, index) => ({
      itemIndex: index + 1,
      title: String(
        bundle.baseArguments?.constraints?.batchTopics?.[index] ||
          `${option.title}${count > 1 ? ` · 第 ${index + 1} 题` : ''}`,
      ).slice(0, 80),
      difficulty: count === 3 ? ['简单', '中等', '困难'][index] : '按当前方案',
    })),
  );
  const valid =
    items.every((item) => item.title.trim().length >= 2) &&
    new Set(items.map((item) => item.title.trim())).size === count;
  return (
    <Dialog title="确认实践题生成" onClose={onClose}>
      <div className="dialog-body">
        <p>生成 {count} 道独立实践题。请核对标题与难度；每道题都保留独立环境、验证和重试记录。</p>
        {items.map((item, index) => (
          <fieldset key={item.itemIndex}>
            <legend>第 {item.itemIndex} 道题</legend>
            <label className="field">
              题目标题
              <input
                value={item.title}
                minLength={2}
                maxLength={80}
                onChange={(event) =>
                  setItems(
                    items.map((row, i) =>
                      i === index ? { ...row, title: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label className="field">
              难度
              <select
                value={item.difficulty}
                onChange={(event) =>
                  setItems(
                    items.map((row, i) =>
                      i === index ? { ...row, difficulty: event.target.value } : row,
                    ),
                  )
                }
              >
                {['简单', '中等', '困难', '按当前方案'].map((label) => (
                  <option key={label}>{label}</option>
                ))}
              </select>
            </label>
          </fieldset>
        ))}
        <p className="quiet">生成后保存为草稿，审阅后再发布。</p>
      </div>
      <div className="dialog-actions">
        <Button onClick={onClose}>返回修改</Button>
        <Button
          className="primary"
          disabled={state.busy || !valid}
          onClick={() =>
            void c.run(async () => {
              await c.selectOption(messageId, option.id, {
                requestedCount: count,
                independence: 'independent_challenges',
                exerciseMode: 'CTF',
                publishMode: 'draft',
                items: items.map((item) => ({ ...item, title: item.title.trim() })),
              });
              onClose();
            })
          }
        >
          确认生成 {count} 道题
        </Button>
      </div>
    </Dialog>
  );
}
