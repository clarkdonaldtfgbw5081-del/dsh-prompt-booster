import type { ConfigureCall } from '@deepseek-ai/dsh-llm'

/** Auxiliary rewriting uses the exact model's supported lightest effort. */
export const optimizationControls: ConfigureCall = (controls, model) => ({
  ...controls,
  ...(model.reasoning?.efforts[0] ? { reasoningEffort: model.reasoning.efforts[0].id } : {}),
})
