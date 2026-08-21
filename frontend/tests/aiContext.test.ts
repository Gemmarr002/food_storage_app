import { describe, expect, it } from 'vitest'
import { buildAiContext } from '@/lib/aiContext'
import type { Ingredient, Preferences } from '@/lib/types'

const prefs: Preferences = {
  allergy: ['花生'],
  avoid: ['青椒'],
  flavors: ['清淡'],
  time: '不限',
  difficulty: [],
  people: '2',
}

const ingredients: Ingredient[] = [
  {
    id: 'i1', name: '西红柿', normalizedName: '番茄', icon: '🍅', quantity: 3, unit: '个',
    storage: '常温', addedAt: '2026-08-10', shelfLifeDays: 7, daysLeft: 2, status: '临期',
    lifeState: 'active',
  },
  {
    id: 'i2', name: '已吃完的鸡蛋', normalizedName: '鸡蛋', icon: '🥚', quantity: 0, unit: '个',
    storage: '冷藏', addedAt: '2026-08-01', shelfLifeDays: 30, daysLeft: 0, status: '已过期',
    lifeState: 'consumed',
  },
]

describe('buildAiContext Agent 本地上下文', () => {
  it('只发送 active 食材的白名单字段，并优先使用标准名', () => {
    expect(buildAiContext(ingredients, prefs)).toEqual({
      ingredients: [{ name: '番茄', quantity: 3, unit: '个', freshness: '临期' }],
      allergies: ['花生'],
      dislikes: ['青椒'],
    })
  })

  it('不包含菜谱、图片、内部 id 和历史数据', () => {
    const text = JSON.stringify(buildAiContext(ingredients, prefs))
    expect(text).not.toContain('image')
    expect(text).not.toContain('i1')
    expect(text).not.toContain('菜谱')
    expect(text).not.toContain('已吃完的鸡蛋')
  })
})
