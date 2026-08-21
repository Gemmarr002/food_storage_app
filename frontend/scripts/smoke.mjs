// 食光 V1.3 移动端冒烟测试：playwright-core + 系统 Chrome，390x844 视口
// 覆盖 V1.3_MVP 第 32 节验收核心流程
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const results = []
const errors = []
const ok = (name) => { results.push(`✅ ${name}`); console.log(`✅ ${name}`) }
const fail = (name, e) => { results.push(`❌ ${name}: ${e}`); console.log(`❌ ${name}: ${e}`) }

async function step(name, fn) {
  console.log(`▶ ${name}`)
  try { await fn(); ok(name) } catch (e) { fail(name, String(e).split('\n')[0]) }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.setDefaultTimeout(8000)
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

try {
  await step('首页加载（食材页 + 概览统计）', async () => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.getByText('我的食材', { exact: true }).first().waitFor({ timeout: 20000 })
    await page.getByText(/种食材/).first().waitFor({ timeout: 8000 })
  })

  await step('食材字典别名自动补全（西红柿 -> 番茄）', async () => {
    await page.getByRole('button', { name: '添加' }).click()
    await page.getByPlaceholder('如：番茄').fill('西红')
    // 建议列表的行按钮带"保质期约"后缀，避免误点被弹层遮住的种子卡片
    await page.locator('button').filter({ hasText: '保质期约' }).first().waitFor({ timeout: 8000 })
    await page.locator('button').filter({ hasText: '保质期约' }).first().click()
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByText('已成功添加 番茄').waitFor({ timeout: 8000 })
  })

  await step('菜谱页：来源切换 + 只看能直接做 + 过敏隐藏提示', async () => {
    await page.getByRole('button', { name: '菜谱', exact: true }).click()
    await page.getByText('灵感菜谱', { exact: true }).waitFor({ timeout: 8000 })
    for (const t of ['系统菜谱', '我的菜谱']) await page.getByRole('button', { name: t, exact: true }).first().waitFor({ timeout: 8000 })
    await page.getByText(/已隐藏 \d+ 道含过敏食材的菜谱/).waitFor({ timeout: 8000 })
    const body = await page.textContent('body')
    if (body.includes('宫保鸡丁')) throw new Error('含花生的宫保鸡丁未被隐藏')
    await page.getByRole('button', { name: '只看能直接做' }).click()
    await page.waitForTimeout(300)
  })

  await step('我的菜谱空状态', async () => {
    await page.getByRole('button', { name: '我的菜谱', exact: true }).click()
    await page.getByText('还没有自建菜谱').waitFor({ timeout: 8000 })
    await page.getByRole('button', { name: '全部', exact: true }).first().click()
  })

  await step('一键生成周计划（早1午2晚2）', async () => {
    await page.getByRole('button', { name: '计划', exact: true }).click()
    await page.getByRole('button', { name: '生成周计划' }).click()
    await page.getByRole('button', { name: '生成本周计划' }).click()
    await page.getByText('已生成本周计划').waitFor({ timeout: 8000 })
    await page.waitForTimeout(400)
    const pending = await page.getByText('暂未安排').count()
    if (pending > 0) throw new Error(`生成后仍有 ${pending} 餐未安排`)
  })

  await step('缺啥买啥 -> 采购联动（含合并弹窗）', async () => {
    await page.getByRole('button', { name: '缺啥买啥' }).click()
    await page.waitForTimeout(600)
    const mergeBtn = page.getByRole('button', { name: '确认', exact: true })
    await Promise.race([
      mergeBtn.waitFor({ timeout: 4000 }).catch(() => {}),
      page.getByText(/已加入 \d+ 项采购清单/).waitFor({ timeout: 4000 }).catch(() => {}),
    ])
    if (await mergeBtn.count()) {
      await mergeBtn.click()
      await page.getByText('采购清单已更新').waitFor({ timeout: 8000 })
    }
  })

  await step('采购页展示计划来源条目', async () => {
    await page.getByRole('button', { name: /采购/ }).first().click()
    await page.getByText('采购清单', { exact: true }).waitFor({ timeout: 8000 })
    const src = await page.getByText(/来自：饮食计划/).count()
    if (src === 0) throw new Error('没有来自饮食计划的采购项')
  })

  await step('刷新后数据持久化（IndexedDB）', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('我的食材', { exact: true }).first().waitFor({ timeout: 20000 })
    const cards = await page.getByText(/预计剩余|已过期/).count()
    if (cards < 6) throw new Error(`食材卡片数 ${cards} < 6，数据可能丢失`)
  })

  await step('PWA：manifest + Service Worker 注册', async () => {
    const hasManifest = await page.evaluate(() => !!document.querySelector('link[rel="manifest"]'))
    if (!hasManifest) throw new Error('manifest link 缺失')
    // HTTP 局域网地址不是安全上下文，浏览器不提供 SW API（属预期，跳过注册检查）
    const secure = await page.evaluate(() => window.isSecureContext)
    if (!secure) return
    await page.evaluate(() => navigator.serviceWorker.register('/sw.js')).catch(() => {})
    await page.waitForTimeout(1000)
    const reg = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration()
      return r ? (r.active?.state || 'installing') : null
    })
    if (!reg) throw new Error('Service Worker 未注册')
  })

  await step('我的页数据概览', async () => {
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.getByText('数据管理').click()
    await page.getByText('数据概览').waitFor({ timeout: 8000 })
    await page.getByText('采购清单').first().waitFor({ timeout: 8000 })
  })
} finally {
  await browser.close()
}

console.log('\n===== 汇总 =====')
console.log(results.join('\n'))
const errFiltered = errors.filter(e => !e.includes('favicon') && !e.includes('_vercel/insights') && !e.includes('Failed to load resource: the server responded with a status of 404'))
console.log(`\nJS错误: ${errFiltered.length ? '\n' + errFiltered.join('\n') : '无'}`)
process.exit(results.some(r => r.startsWith('❌')) || errFiltered.length ? 1 : 0)
