export type Meal = '早餐' | '午餐' | '晚餐'
export type Tab = '食材' | '菜谱' | '计划' | '采购' | '我的'

export type Ingredient = {
  id: string
  name: string
  normalizedName: string
  icon: string
  quantity: number
  unit: string
  storage: string // 冷藏 | 冷冻 | 常温
  addedAt: string // 入库日期 YYYY-MM-DD
  shelfLifeDays: number
  daysLeft: number // 预计剩余天数（计算得出）
  status: string // 新鲜 | 尽快食用 | 临期 | 已过期
  lifeState: 'active' | 'consumed' | 'discarded'
  note?: string // 备注
}

export type Recipe = {
  id: string
  title: string
  category: string // 中式 | 西式 | 汤羹 | 甜点 | 饮品 | 主食
  flavor: string // 清淡 | 咸鲜 | 香辣 | 酸甜 | 甜味 | 浓郁 | 清爽
  time: number // 分钟
  difficulty: string // 简单 | 普通 | 进阶
  needs: string[] // 所需食材（标准化名）
  prep: string // 食材准备
  seasoning: string // 调料
  steps: string[]
  isSystem: boolean // 系统菜谱 true / 我的菜谱 false
  allergens: string[]
  image?: string // 菜谱配图（压缩后的 dataURL，仅用户菜谱）
}

export type ShoppingItem = {
  id: string
  name: string
  normalizedName: string
  quantity: number
  unit: string
  checked: boolean
  source: string // 手动添加 | 食材库存 | 菜谱 | 饮食计划
}

export type MealPlan = Record<string, Record<Meal, string[]>>

export type Preferences = {
  allergy: string[]
  avoid: string[]
  flavors: string[]
  time: string // '15' | '30' | '45' | '60' | '不限'
  difficulty: string[]
  people: string
}

export type AppData = {
  ingredients: Ingredient[]
  myRecipes: Recipe[]
  favorites: string[]
  shopping: ShoppingItem[]
  plan: MealPlan
  preferences: Preferences
}
