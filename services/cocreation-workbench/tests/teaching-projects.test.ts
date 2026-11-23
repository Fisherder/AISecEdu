import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayTeachingReply, teachingProjectDraft, teachingProjects } from '../src/core/teaching-projects.ts';

test('hides obsolete capability sentences while keeping teaching content', () => {
  assert.equal(displayTeachingReply('我是玄甲教学智能体。当前我只支持文字问答。'), '我是玄甲教学智能体。');
  assert.equal(displayTeachingReply('可以生成教案。\n\n当前这条对话只支持文字问答。\n\n还有辩论。'),
    '可以生成教案。\n\n还有辩论。');
  assert.equal(displayTeachingReply('文字问答可以用来检查学生理解。'), '文字问答可以用来检查学生理解。');
});

test('selecting a new project replaces the previous starter and keeps the teaching brief', () => {
  const [lesson, debate] = teachingProjects;
  const draft = teachingProjectDraft(lesson.prompt, '观察水分');
  assert.equal(teachingProjectDraft(debate.prompt, draft), debate.prompt + '观察水分');
});
