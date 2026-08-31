import { describe, it, expect } from 'vitest';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';

describe('security subject profile prompt rendering', () => {
  it('includes pedagogy snippet + curriculum context when subjectProfile is true', () => {
    const rendered = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: '为现代密码学生成一节课',
      pdfContent: 'None',
      availableImages: 'None',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaEnabled: false,
      researchContext: 'None',
      teacherContext: '',
      subjectProfile: true,
      curriculumContext: '## 课程上下文：现代密码学',
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.system).toContain('Cybersecurity Subject Profile');
    expect(rendered!.user).toContain('## 课程上下文：现代密码学');
  });

  it('omits security snippet when subjectProfile is false', () => {
    const rendered = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: 'Teach me photosynthesis',
      pdfContent: 'None',
      availableImages: 'None',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaEnabled: false,
      researchContext: 'None',
      teacherContext: '',
      subjectProfile: false,
      curriculumContext: 'None',
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.system).not.toContain('Cybersecurity Subject Profile');
  });

  it('code-content includes code-policy snippet when subjectProfile is true', () => {
    const rendered = buildPrompt(PROMPT_IDS.CODE_CONTENT, { subjectProfile: true });
    expect(rendered).not.toBeNull();
    expect(rendered!.system).toContain('Cybersecurity Code-Generation Policy');
  });

  it('code-content omits code-policy snippet when subjectProfile is false', () => {
    const rendered = buildPrompt(PROMPT_IDS.CODE_CONTENT, { subjectProfile: false });
    expect(rendered).not.toBeNull();
    expect(rendered!.system).not.toContain('Cybersecurity Code-Generation Policy');
  });

  it('slide-content includes pedagogy when subjectProfile is true', () => {
    const rendered = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, { subjectProfile: true });
    expect(rendered).not.toBeNull();
    expect(rendered!.system).toContain('Cybersecurity Subject Profile');
  });

  it('quiz-content includes pedagogy when subjectProfile is true', () => {
    const rendered = buildPrompt(PROMPT_IDS.QUIZ_CONTENT, { subjectProfile: true });
    expect(rendered).not.toBeNull();
    expect(rendered!.system).toContain('Cybersecurity Subject Profile');
  });
});
