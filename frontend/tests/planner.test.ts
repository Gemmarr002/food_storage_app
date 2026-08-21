import { describe, expect, it } from 'vitest'
import { SYSTEM_RECIPES, matchPct, normalize } from '@/lib/data'
import type { Meal, MealPlan, Recipe } from '@/lib/types'
import { candidatePool, collectMissing, generateDayPlan, generateWeekPlan } from '@/lib/planner'

const ALL: Meal[] = ['早餐', '午餐', '晚餐']
const emptyCtx = { stock: new Set<string>(), expiring: new Set<string>(), favorites: [] as string[] }
const weekKeys = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23']

describe('candidatePool 候选池', () => {
  it('早餐来自轻食池，午晚餐来自正餐池', () => {
    const bf = candidatePool(SYSTEM_RECIPES, '早餐')
    const lunch = candidatePool(SYSTEM_RECIPES, '午餐')
    expect(bf.every(r => ['主食', '甜点', '饮品', '西式'].includes(r.category))).toBe(true)
    expect(lunch.some(r => r.category === '中式')).toBe(true)
    expect(bf.some(r => r.category === '中式' && r.needs.length >= 3)).toBe(false)
  })
  it('时间与难度筛选生效', () => {
    const pool = candidatePool(SYSTEM_RECIPES, '晚餐', { maxTime: 15, difficulties: ['简单'] })
    expect(pool.every(r => r.time <= 15 && r.difficulty === '简单')).toBe(true)
  })
  it('品类筛选不作用于早餐（避免早餐被筛空）', () => {
    const pool = candidatePool(SYSTEM_RECIPES, '早餐', { categories: ['中式'] })
    expect(pool.length).toBeGreaterThan(0)
  })
})

describe('generateWeekPlan 周计划', () => {
  it('生成 7 天且每餐数量符合设置', () => {
    const gen = generateWeekPlan(SYSTEM_RECIPES, weekKeys, { meals: ALL, perMeal: { 早餐: 1, 午餐: 2, 晚餐: 2 } }, emptyCtx)
    expect(Object.keys(gen)).toEqual(weekKeys)
    for (const k of weekKeys) {
      expect(gen[k].早餐).toHaveLength(1)
      expect(gen[k].午餐).toHaveLength(2)
      expect(gen[k].晚餐).toHaveLength(2)
    }
  })
  it('同一天不重复同一道菜', () => {
    const gen = generateWeekPlan(SYSTEM_RECIPES, weekKeys, { meals: ALL, perMeal: { 早餐: 3, 午餐: 3, 晚餐: 3 } }, emptyCtx)
    for (const k of weekKeys) {
      const ids = [...gen[k].早餐, ...gen[k].午餐, ...gen[k].晚餐]
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
  it('库存覆盖率高与临期食材的菜优先入选', () => {
    // 只给鸡蛋：早餐池里煎蛋(鸡蛋)是 100% 匹配，应排在所有半匹配轻食之前
    const ctx = { stock: new Set(['鸡蛋']), expiring: new Set(['鸡蛋']), favorites: [] as string[] }
    const gen = generateWeekPlan(SYSTEM_RECIPES, [weekKeys[0]], { meals: ['早餐'], perMeal: { 早餐: 1 } }, ctx)
    expect(gen[weekKeys[0]].早餐[0]).toBe('r40') // 煎蛋
  })
  it('既有计划作为历史，3 天内已安排的菜被降权', () => {
    // 空库存：早餐池所有菜同为 0 分，按菜谱顺序先选 r18 皮蛋瘦肉粥、次日 r19 鸡蛋饼
    const ctx = { stock: new Set<string>(), expiring: new Set<string>(), favorites: [] as string[] }
    const opts = { meals: ['早餐'] as Meal[], perMeal: { 早餐: 1 } }
    const [k0, k1] = weekKeys
    // 无历史：k0 选 r18；次日 r18 被重复惩罚降权，让位 r19
    const a = generateWeekPlan(SYSTEM_RECIPES, [k0, k1], opts, ctx)
    expect(a[k0].早餐[0]).toBe('r18')
    expect(a[k1].早餐[0]).toBe('r19')
    // 有历史（r18 已在 k0 安排过）：生成时 r18 立即被降权，k0 直接选 r19
    const b = generateWeekPlan(SYSTEM_RECIPES, [k0, k1], opts, ctx, { [k0]: { 早餐: ['r18'], 午餐: [], 晚餐: [] } })
    expect(b[k0].早餐[0]).toBe('r19')
    expect(b[k1].早餐[0]).toBe('r29')
  })
})

describe('generateDayPlan 日计划', () => {
  it('默认早1午2晚2', () => {
    const gen = generateDayPlan(SYSTEM_RECIPES, '2026-08-18', { meals: ALL, perMeal: { 早餐: 1, 午餐: 2, 晚餐: 2 } }, emptyCtx)
    expect(gen['2026-08-18'].早餐).toHaveLength(1)
    expect(gen['2026-08-18'].午餐).toHaveLength(2)
    expect(gen['2026-08-18'].晚餐).toHaveLength(2)
  })
})

describe('collectMissing 计划缺失食材汇总', () => {
  it('汇总计划菜谱中库存没有的主料并按字典给默认单位', () => {
    const plan: MealPlan = { '2026-08-18': { 早餐: ['r1'], 午餐: [], 晚餐: [] } } // 番茄炒蛋
    const stock = new Set(['鸡蛋'])
    const missing = collectMissing(plan, SYSTEM_RECIPES, stock)
    expect(missing).toHaveLength(1)
    expect(missing[0].name).toBe('番茄')
    expect(missing[0].unit).toBe('个')
    expect(missing[0].normalizedName).toBe('番茄')
  })
  it('同一食材跨菜谱去重', () => {
    const plan: MealPlan = { '2026-08-18': { 早餐: ['r1'], 午餐: ['r45'], 晚餐: [] } } // 番茄炒蛋 + 番茄疙瘩汤
    const missing = collectMissing(plan, SYSTEM_RECIPES, new Set(['鸡蛋']))
    const names = missing.map(m => m.normalizedName)
    expect(names.filter(n => n === '番茄')).toHaveLength(1)
  })
  it('别名库存同样算已有', () => {
    const plan: MealPlan = { '2026-08-18': { 早餐: ['r1'], 午餐: [], 晚餐: [] } }
    const missing = collectMissing(plan, SYSTEM_RECIPES, new Set(['鸡蛋', '西红柿']))
    expect(missing).toHaveLength(0)
  })
})

describe('matchPct 与周计划组合冒烟', () => {
  it('生成的周计划全部为系统菜谱中的有效 id', () => {
    const gen = generateWeekPlan(SYSTEM_RECIPES, weekKeys, { meals: ALL, perMeal: { 早餐: 1, 午餐: 2, 晚餐: 2 } }, emptyCtx)
    const ids = new Set(SYSTEM_RECIPES.map(r => r.id))
    for (const k of weekKeys) {
      for (const id of [...gen[k].早餐, ...gen[k].午餐, ...gen[k].晚餐]) expect(ids.has(id)).toBe(true)
    }
  })
  it('Recipe 排序分随库存变化（matchPct 单调）', () => {
    const r: Recipe = SYSTEM_RECIPES[0]
    const a = matchPct(r, new Set(['番茄']))
    const b = matchPct(r, new Set(['番茄', '鸡蛋']))
    expect(b).toBeGreaterThan(a)
    expect(normalize('西红柿')).toBe('番茄')
  })
})
