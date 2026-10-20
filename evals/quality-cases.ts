/** Representative, hand-authored scenarios; not a collected real-user dataset. */
export const QUALITY_CASES = [
  { id: 'slow', raw: '排查卡顿', valid: '诊断性能瓶颈，说明定位依据与验证方法。', invalid: '编写天气预报。' },
  { id: 'weekly', raw: '写周报', valid: '整理本周工作总结，突出进展与待办。', invalid: '编写一首诗。' },
  { id: 'screen', raw: '优化网页', valid: '改进界面的布局与可读性。', invalid: '整理会议纪要。' },
  { id: 'failure', raw: '排查故障', valid: '定位异常原因，说明复现与验证方法。', invalid: '设计风景作品集。' },
  { id: 'signin', raw: 'build a login screen', valid: 'Create a sign-in screen with clear interaction feedback.', invalid: 'Write a weather report.' },
  { id: 'docs', raw: '编写安装说明并补充卸载步骤', valid: '整理安装文档，并提供卸载指引。', invalid: '编写安装说明。', warning: 'lost_task_part' },
  { id: 'diagnosis-doc', raw: '修复加载异常并补充操作文档', valid: '修复加载异常，同时完善操作文档。', invalid: '修复加载异常。', warning: 'lost_task_part' },
  { id: 'mail-summary', raw: '写邮件并总结会议', valid: '起草邮件，并整理会议总结。', invalid: '起草邮件。', warning: 'lost_task_part' },
  { id: 'docs-en', raw: 'write installation docs and include uninstall steps', valid: 'Write install instructions and include uninstall instructions.', invalid: 'Write installation docs.', warning: 'lost_task_part' },
  { id: 'icon', raw: '优化插件图标并编写安装说明', valid: '调整插件图标，并整理安装文档。', invalid: '调整插件图标。', warning: 'lost_task_part' },
  { id: 'two-languages', raw: '翻译邮件并总结文章', valid: '完成邮件翻译，同时给出文章摘要。', invalid: '完成邮件翻译。', warning: 'lost_task_part' },
  { id: 'theme-docs', raw: '实现深色主题并补充升级说明', valid: '实现深色主题，并完善升级文档。', invalid: '实现深色主题。', warning: 'lost_task_part' },
] as const
