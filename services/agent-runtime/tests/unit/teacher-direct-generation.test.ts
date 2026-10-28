import {afterEach,describe,expect,it,vi} from 'vitest';
import {normalizeTeacherIntent,teacherRequirementHandlingBrief} from '@/lib/server/agent-harness/teacher-intent';

afterEach(()=>vi.unstubAllEnvs());
const authority={prompt:'制作私有 RSA 二维演示，默认参数61、53、17、65，可修改消息并做对照实验，不发布。',context:{}};
describe('teacher co-creation complete requirements',()=>{
  it('proceeds to reviewable proposals when the teacher supplied complete requirements',()=>{
    vi.stubEnv('AISECEDU_TEACHER_REQUIREMENTS_MODE','complete-request');
    const result=normalizeTeacherIntent({kind:'create',summary:'制作私有 RSA 演示',needsClarification:false,questions:[]},authority);
    expect(result.clarification.state).toBe('not-required');expect(result.clarification.questions).toEqual([]);expect(result.request).toBe(authority.prompt);
    expect(teacherRequirementHandlingBrief()).toContain('不要追加');
  });
  it('still waits for an actual missing choice',()=>{
    vi.stubEnv('AISECEDU_TEACHER_REQUIREMENTS_MODE','complete-request');
    const result=normalizeTeacherIntent({kind:'create',summary:'制作教学活动',needsClarification:true,questions:[{id:'audience',text:'面向初学者还是已学过密码学的学生？',choices:['初学者','已学过密码学']}]},authority);
    expect(result.clarification.state).toBe('awaiting-input');expect(result.clarification.questions[0].id).toBe('audience');
  });
  it('retains the existing confirmation behavior when the development policy is disabled',()=>{
    vi.stubEnv('AISECEDU_TEACHER_REQUIREMENTS_MODE','');
    const result=normalizeTeacherIntent({kind:'create',summary:'制作私有 RSA 演示',needsClarification:false,questions:[]},authority);
    expect(result.clarification.state).toBe('awaiting-input');expect(teacherRequirementHandlingBrief()).toBe('');
  });
});
