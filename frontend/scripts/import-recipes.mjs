// 校验并导入外部生成的系统菜谱到 frontend/lib/data.ts
// 用法：node scripts/import-recipes.mjs [数据文件] [--write]
//   默认数据文件：../recipes_new.txt（项目根目录）；--write 才会真正写入 data.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argFile = process.argv.slice(2).find(a => !a.startsWith('--'))
const src = resolve(root, argFile ?? '../recipes_new.txt')
const write = process.argv.includes('--write')

// 与 lib/data.ts 的 DICT_ROWS 保持一致（106 种）
const DICT = `番茄 鸡蛋 牛奶 土豆 青椒 黄瓜 胡萝卜 洋葱 茄子 白菜 生菜 菠菜 西兰花 卷心菜 冬瓜 南瓜
白萝卜 山药 莲藕 红薯 玉米 四季豆 豇豆 芹菜 韭菜 苦瓜 丝瓜 豆芽 大蒜 生姜 小葱 香菇 蘑菇 金针菇
木耳 银耳 紫菜 豆腐 豆干 猪肉 排骨 牛肉 羊肉 鸡胸肉 鸡腿 鸡翅 虾 虾仁 鱼 带鱼 花蛤
酸奶 奶酪 黄油 奶油 花生 核桃 芝麻 面粉 面条 意面 大米 米饭 燕麦 面包 馒头 饺子皮 粉丝 红豆 绿豆
红枣 皮蛋 咸鸭蛋 火腿肠 培根 香肠 柠檬 香蕉 苹果 橙子 草莓 蓝莓 葡萄 西瓜 芒果 柚子 菠萝`.split(/\s+/)
const CATEGORIES = ['中式', '西式', '汤羹', '甜点', '饮品', '主食']
const FLAVORS = ['清淡', '咸鲜', '香辣', '酸甜', '甜味', '浓郁', '清爽']
const DIFFICULTIES = ['简单', '普通', '进阶']
const ALLERGENS = ['鸡蛋', '牛奶', '花生', '虾', '鱼', '芝麻', '核桃']
const BREAKFAST = ['主食', '甜点', '饮品', '西式']

// ---- 读取并清洗 ----
let raw = readFileSync(src, 'utf8').replace(/^﻿/, '').trim()
raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
raw = raw.replace(/^```.*$/gm, '')          // 批次间残留的 markdown 围栏行
raw = raw.replace(/\]\s*\n\s*\[/g, ',\n')   // 多批输出 = 多个 JSON 数组，合并为一个
let recipes
try { recipes = JSON.parse(raw) } catch (e) { console.error(`❌ JSON 解析失败: ${e.message}`); process.exit(1) }

// ---- 校验 ----
const errs = []
if (!Array.isArray(recipes)) { console.error('❌ 顶层不是 JSON 数组'); process.exit(1) }
if (recipes.length !== 60) errs.push(`数量为 ${recipes.length}，期望 60`)
const dictSet = new Set(DICT)
const ids = new Set(), titles = new Set()
recipes.forEach((r, i) => {
  const at = `#${i + 1}(${r.id ?? '?'} ${r.title ?? '?'})`
  if (typeof r.id !== 'string' || !/^r\d+$/.test(r.id)) errs.push(`${at} id 非法`)
  else {
    if (ids.has(r.id)) errs.push(`${at} id 重复`)
    ids.add(r.id)
    if (r.id !== `r${i + 1}`) errs.push(`${at} 编号不连续（期望 r${i + 1}）`)
  }
  if (typeof r.title !== 'string' || r.title.length < 2) errs.push(`${at} title 非法`)
  else {
    if (titles.has(r.title)) errs.push(`${at} title 重复`)
    titles.add(r.title)
  }
  if (!CATEGORIES.includes(r.category)) errs.push(`${at} category "${r.category}" 非法`)
  if (!FLAVORS.includes(r.flavor)) errs.push(`${at} flavor "${r.flavor}" 非法`)
  if (!DIFFICULTIES.includes(r.difficulty)) errs.push(`${at} difficulty "${r.difficulty}" 非法`)
  if (typeof r.time !== 'number' || r.time < 1 || r.time > 300) errs.push(`${at} time "${r.time}" 非法`)
  if (!Array.isArray(r.needs) || r.needs.length < 1 || r.needs.length > 6) errs.push(`${at} needs 数量 ${r.needs?.length} 不在 1-6`)
  else r.needs.forEach(n => { if (!dictSet.has(n)) errs.push(`${at} needs "${n}" 不在食材字典`) })
  if (!Array.isArray(r.allergens)) errs.push(`${at} allergens 非数组`)
  else r.allergens.forEach(a => { if (!ALLERGENS.includes(a)) errs.push(`${at} allergen "${a}" 非法`) })
  if (!Array.isArray(r.steps) || r.steps.length < 5 || r.steps.length > 12) errs.push(`${at} steps 数量 ${r.steps?.length} 不在 5-12`)
  else r.steps.forEach((s, j) => {
    if (typeof s !== 'string' || s.trim().length < 10) errs.push(`${at} 步骤${j + 1} 过短`)
    else if (/^\d+[.、）)]/.test(s.trim())) errs.push(`${at} 步骤${j + 1} 带编号前缀`)
  })
  for (const f of ['prep', 'seasoning']) {
    if (typeof r[f] !== 'string' || !r[f].trim()) errs.push(`${at} ${f} 为空`)
    else if (/适量|少许/.test(r[f])) errs.push(`${at} ${f} 含"适量/少许"`)
  }
})

// ---- 统计 ----
const byCat = {}, byDiff = {}
recipes.forEach(r => { byCat[r.category] = (byCat[r.category] ?? 0) + 1; byDiff[r.difficulty] = (byDiff[r.difficulty] ?? 0) + 1 })
const bfPool = recipes.filter(r => BREAKFAST.includes(r.category) && r.time <= 30)
console.log(`共 ${recipes.length} 道`)
console.log('品类分布:', JSON.stringify(byCat))
console.log('难度分布:', JSON.stringify(byDiff))
console.log(`早餐候选池(主食/甜点/饮品/西式 且 ≤30min): ${bfPool.length} 道`)
console.log('早餐池明细:', bfPool.map(r => `${r.id}${r.title}(${r.category}/${r.time}min/needs:${r.needs.join('+')})`).join(' | '))
console.log('含香菜/羊肉的菜:', recipes.filter(r => r.needs.some(n => ['香菜', '羊肉'].includes(n))).map(r => `${r.id}${r.title}`).join(' | ') || '无')
if (errs.length) { console.error(`\n❌ 共 ${errs.length} 个问题:\n${errs.join('\n')}`); process.exit(1) }
console.log('\n✅ 校验全部通过')

// ---- 写入 ----
if (write) {
  const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  const lines = recipes.map(r => {
    const args = [q(r.id), q(r.title), q(r.category), q(r.flavor), String(r.time), q(r.difficulty),
      `[${r.needs.map(q).join(', ')}]`, `[${r.allergens.map(q).join(', ')}]`, q(r.prep), q(r.seasoning), `[${r.steps.map(q).join(', ')}]`]
    return `  sys(${args.join(', ')}),`
  })
  const dataPath = resolve(root, 'lib/data.ts')
  let data = readFileSync(dataPath, 'utf8')
  const MARK = 'export const SYSTEM_RECIPES: Recipe[] = ['
  const start = data.indexOf(MARK)
  const end = data.indexOf('\n]\n', start)
  if (start < 0 || end < 0) { console.error('❌ data.ts 中找不到 SYSTEM_RECIPES 区段'); process.exit(1) }
  data = data.slice(0, start) + MARK + '\n' + lines.join('\n') + '\n]\n' + data.slice(end + 3)
  data = data.replace(/（内置 \d+ 道）/, `（内置 ${recipes.length} 道）`)
  writeFileSync(dataPath, data)
  console.log(`\n✅ 已写入 ${dataPath}（${recipes.length} 道）`)
}
