import { describe, expect, it } from 'vitest'
import {
  INGREDIENT_DICT, SYSTEM_RECIPES, computeFreshness, dictUnit, filterByDiet,
  getWeek, iconFor, matchPct, normalize, searchDict, toDateKey,
} from '@/lib/data'
import type { Recipe } from '@/lib/types'

describe('normalize 别名表', () => {
  it('常见别名映射到标准名', () => {
    expect(normalize('西红柿')).toBe('番茄')
    expect(normalize('花生米')).toBe('花生')
    expect(normalize(' 马铃薯 ')).toBe('土豆')
    expect(normalize('包菜')).toBe('卷心菜')
  })
  it('非别名原样返回（去空格）', () => {
    expect(normalize(' 番茄 ')).toBe('番茄')
    expect(normalize('秋葵')).toBe('秋葵')
  })
})

describe('食材字典', () => {
  it('字典数量覆盖常见家庭食材（>=80）', () => {
    expect(INGREDIENT_DICT.length).toBeGreaterThanOrEqual(80)
  })
  it('searchDict 支持名称模糊搜索', () => {
    expect(searchDict('番').some(d => d.name === '番茄')).toBe(true)
    expect(searchDict('').length).toBe(INGREDIENT_DICT.length)
  })
  it('dictUnit 返回默认单位，未知食材回退为 个', () => {
    expect(dictUnit('牛奶')).toBe('盒')
    expect(dictUnit('不存在的食材')).toBe('个')
  })
  it('iconFor 命中字典 emoji', () => {
    expect(iconFor('番茄')).toBe('🍅')
    expect(iconFor('神秘食材')).toBe('🧺')
  })
})

describe('computeFreshness 新鲜度', () => {
  // 用「今天」的日期字符串为基准（toDateKey 取本地日期），并把各档落在区间中部，避免跨天/跨越界不稳定
  const daysAgo = (n: number) => toDateKey(new Date(Date.now() - n * 86400000))
  it('剩余 >5 天为新鲜', () => {
    expect(computeFreshness(daysAgo(1), 30).status).toBe('新鲜')
  })
  it('剩余 3-5 天为尽快食用', () => {
    // 入库 2 天前、保质 6 天 → 约剩 4 天（中段，稳定）
    expect(computeFreshness(daysAgo(2), 6).status).toBe('尽快食用')
  })
  it('剩余 1-2 天为临期', () => {
    // 入库 2 天前、保质 3 天 → 约剩 1 天（临期）
    expect(computeFreshness(daysAgo(2), 3).status).toBe('临期')
  })
  it('剩余 <=0 天为已过期', () => {
    // 入库 2 天前、保质 1 天 → 已过期
    expect(computeFreshness(daysAgo(2), 1).status).toBe('已过期')
  })
})

describe('matchPct 库存匹配度', () => {
  const r: Recipe = { ...SYSTEM_RECIPES[0] }
  it('全有 = 100%，部分按比例，全无 = 0%', () => {
    expect(matchPct(r, new Set(['番茄', '鸡蛋']))).toBe(100)
    expect(matchPct(r, new Set(['番茄']))).toBe(50)
    expect(matchPct(r, new Set())).toBe(0)
  })
  it('库存用别名也能匹配（花生米 -> 花生）', () => {
    const t = SYSTEM_RECIPES.find(x => x.title === '宫保鸡丁')!
    expect(matchPct(t, new Set(['鸡胸肉', '花生米', '黄瓜']))).toBe(100)
  })
})

describe('filterByDiet 过敏/忌口过滤', () => {
  const base = { flavors: [], difficulty: [], time: '不限', people: '2' }
  const recipes: Recipe[] = [
    { ...SYSTEM_RECIPES.find(r => r.title === '番茄炒蛋')! },
    { ...SYSTEM_RECIPES.find(r => r.title === '宫保鸡丁')! },       // 含花生
    { ...SYSTEM_RECIPES.find(r => r.title === '青椒肉丝')! },       // 含青椒
  ]
  it('过敏强制排除并统计隐藏数', () => {
    const { visible, allergyHidden } = filterByDiet(recipes, { ...base, allergy: ['花生'], avoid: [] })
    expect(visible.some(r => r.title === '宫保鸡丁')).toBe(false)
    expect(allergyHidden).toBe(1)
    expect(visible.some(r => r.title === '番茄炒蛋')).toBe(true)
  })
  it('忌口默认隐藏但不计入过敏隐藏数', () => {
    const { visible, allergyHidden } = filterByDiet(recipes, { ...base, allergy: [], avoid: ['青椒'] })
    expect(visible.some(r => r.title === '青椒肉丝')).toBe(false)
    expect(allergyHidden).toBe(0)
  })
  it('过敏通过 allergens 字段同样生效', () => {
    const { visible } = filterByDiet(recipes, { ...base, allergy: ['虾'], avoid: [] })
    expect(visible.some(r => r.allergens.includes('虾'))).toBe(false)
  })
})

describe('getWeek 周视图', () => {
  it('返回连续 7 天且首日为周一', () => {
    const week = getWeek()
    expect(week).toHaveLength(7)
    expect(week[0].w).toBe('一')
    expect(week[6].w).toBe('日')
    const t = week.map(d => new Date(d.key + 'T00:00:00').getTime())
    expect(t[1] - t[0]).toBe(86400000)
  })
  it('offset 翻周正确', () => {
    expect(new Date(getWeek(1)[0].key).getTime() - new Date(getWeek()[0].key).getTime()).toBe(7 * 86400000)
  })
})

describe('系统菜谱库', () => {
  it('数量满足 V1.3 的 50 道要求', () => {
    expect(SYSTEM_RECIPES.length).toBeGreaterThanOrEqual(50)
  })
  it('所有菜谱主料均可在食材字典中找到', () => {
    const dict = new Set(INGREDIENT_DICT.map(d => d.name))
    const missing = SYSTEM_RECIPES.flatMap(r => r.needs.filter(n => !dict.has(normalize(n))))
    expect(missing).toEqual([])
  })
})
