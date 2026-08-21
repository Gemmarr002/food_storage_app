import type { Meal, MealPlan, Recipe } from './types'
import { dictUnit, matchPct, normalize } from './data'

// 计划生成上下文：当前库存、临期食材、收藏
export interface PlanContext {
  stock: Set<string>      // 标准化食材名
  expiring: Set<string>   // 临期/尽快食用的标准化食材名
  favorites: string[]
}

export interface PlanFilters {
  categories?: string[]
  flavors?: string[]
  maxTime?: number       // 最长烹饪时间（分钟）
  difficulties?: string[]
}

export interface PlanGenOptions {
  meals: Meal[]
  perMeal: Partial<Record<Meal, number>>
  filters?: PlanFilters
}

// 早餐从轻量品类挑，午晚餐从正餐品类挑
const BREAKFAST_CATS = ['主食', '甜点', '饮品', '西式']
const MEAL_CATS = ['中式', '西式', '汤羹', '主食']

export function candidatePool(recipes: Recipe[], meal: Meal, filters?: PlanFilters): Recipe[] {
  const cats = meal === '早餐' ? BREAKFAST_CATS : MEAL_CATS
  let list = recipes.filter(r => cats.includes(r.category))
  const f = filters ?? {}
  // 品类筛选只作用于午晚餐（早餐品类固定为轻食池，避免早餐被筛空）
  if (meal !== '早餐' && f.categories?.length) list = list.filter(r => f.categories!.includes(r.category))
  if (f.flavors?.length) list = list.filter(r => f.flavors!.includes(r.flavor))
  if (f.maxTime) list = list.filter(r => r.time <= f.maxTime!)
  if (f.difficulties?.length) list = list.filter(r => f.difficulties!.includes(r.difficulty))
  return list
}

// 排序分：库存覆盖率 × 0.8 + 临期食材加成 + 收藏加成
export function scoreRecipe(r: Recipe, ctx: PlanContext): number {
  let s = matchPct(r, ctx.stock) * 0.8
  if (r.needs.some(n => ctx.expiring.has(normalize(n)))) s += 10
  if (ctx.favorites.includes(r.id)) s += 5
  return s
}

// 前 3 天内已安排过的菜重复惩罚
function recentPenalty(id: string, history: Map<string, number>, dayIdx: number): number {
  const last = history.get(id)
  if (last === undefined) return 0
  const gap = dayIdx - last
  return gap >= 0 && gap <= 3 ? 30 : 0
}

export function generateWeekPlan(
  recipes: Recipe[],
  weekKeys: string[],
  opts: PlanGenOptions,
  ctx: PlanContext,
  existing?: MealPlan,
): MealPlan {
  const result: MealPlan = {}
  // 用既有计划初始化重复惩罚历史
  const history = new Map<string, number>()
  if (existing) {
    weekKeys.forEach((k, i) => {
      const day = existing[k]
      if (!day) return
      ;([...day.早餐, ...day.午餐, ...day.晚餐] as string[]).forEach(id => history.set(id, i))
    })
  }
  weekKeys.forEach((key, dayIdx) => {
    const dayPlan: Record<Meal, string[]> = { 早餐: [], 午餐: [], 晚餐: [] }
    const usedToday = new Set<string>()
    for (const meal of opts.meals) {
      const pool = candidatePool(recipes, meal, opts.filters)
      const count = opts.perMeal[meal] ?? 2
      for (let n = 0; n < count; n++) {
        let best: Recipe | null = null
        let bestScore = -Infinity
        for (const r of pool) {
          if (usedToday.has(r.id)) continue // 同一天不重复
          const s = scoreRecipe(r, ctx) - recentPenalty(r.id, history, dayIdx)
          if (s > bestScore) { bestScore = s; best = r }
        }
        if (!best) break
        dayPlan[meal].push(best.id)
        usedToday.add(best.id)
        history.set(best.id, dayIdx)
      }
    }
    result[key] = dayPlan
  })
  return result
}

export function generateDayPlan(
  recipes: Recipe[],
  dateKey: string,
  opts: PlanGenOptions,
  ctx: PlanContext,
  existing?: MealPlan,
): MealPlan {
  return generateWeekPlan(recipes, [dateKey], opts, ctx, existing)
}

// 汇总计划中所有菜谱相对当前库存缺失的食材（去重）
export function collectMissing(
  plan: MealPlan,
  recipes: Recipe[],
  stockNames: Set<string>,
): { name: string; normalizedName: string; quantity: number; unit: string }[] {
  const missing = new Map<string, string>()
  const stock = new Set([...stockNames].map(normalize))
  for (const day of Object.values(plan ?? {})) {
    const ids = [...(day.早餐 ?? []), ...(day.午餐 ?? []), ...(day.晚餐 ?? [])] as string[]
    for (const id of ids) {
      const r = recipes.find(x => x.id === id)
      if (!r) continue
      for (const n of r.needs) {
        const nn = normalize(n)
        if (!stock.has(nn)) missing.set(nn, n)
      }
    }
  }
  return [...missing].map(([normalizedName, name]) => ({ name, normalizedName, quantity: 1, unit: dictUnit(normalizedName) }))
}
