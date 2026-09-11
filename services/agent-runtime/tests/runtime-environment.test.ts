import { describe, expect, it } from 'vitest';
import { enforceTeacherGenerationOptions, requestedRuntimeEnvironment } from '@/lib/server/teacher-agent';

describe('teacher runtime environment', () => {
  it.each([
    ['用 Windows 出一道原生 C 程序运行题', 'windows'],
    ['使用 Linux 环境练习文件操作', 'linux'],
    ['不要 Linux，改用 Windows 远程桌面', 'windows'],
    ['不用 Windows，使用 Ubuntu', 'linux'],
    ['Use Windows 11 for the exercise', 'windows'],
    ['Compare Windows and Linux', null],
    ['编写一个简单程序', null],
  ])('preserves the environment in %s', (prompt, expected) => {
    expect(requestedRuntimeEnvironment(prompt!)).toBe(expected);
  });

  it.each(['Windows', 'Linux'])('retains %s through all generation choices', (environment) => {
    const prompt = `为当前章节使用 ${environment} 环境生成一道普通 C 程序运行实践题，完成后取得动态 Flag。`;
    const result = enforceTeacherGenerationOptions(prompt, {
      understanding: prompt,
      selectedSkills: [],
      plan: ['准备三种教学方案'],
      generationTarget: { targetTool: 'challenge.generate', artifactType: 'ctf-challenge', reason: prompt },
    }, {
      toolProposals: [{ tool: 'challenge.generate', arguments: { moduleIndex: 0, brief: prompt }, reason: prompt }],
    });
    const choices = result.generationOptions as {
      baseArguments: { constraints: { runtimeEnvironment: string } };
      options: Array<{ rewrittenPrompt: string }>;
    };
    expect(choices.baseArguments.constraints.runtimeEnvironment).toBe(environment.toLowerCase());
    expect(choices.options).toHaveLength(3);
    for (const option of choices.options) expect(option.rewrittenPrompt).toContain(`运行环境必须为 ${environment}`);
  });
});
