import type { Ingredient, Preferences } from '@/lib/types'

export type AgentContext = {
  ingredients: Array<{
    name: string
    quantity: number
    unit: string
    freshness?: string
  }>
  allergies: string[]
  dislikes: string[]
}

/** 构建每轮发送给 Agent 的最小、结构化本地上下文。 */
export function buildAiContext(
  ingredients: Ingredient[],
  prefs: Preferences,
): AgentContext {
  return {
    ingredients: ingredients
      .filter(item => item.lifeState === 'active')
      .slice(0, 100)
      .map(item => ({
        name: item.normalizedName || item.name,
        quantity: item.quantity,
        unit: item.unit,
        ...(item.status ? { freshness: item.status } : {}),
      })),
    allergies: prefs.allergy.slice(0, 50),
    dislikes: prefs.avoid.slice(0, 50),
  }
}
