'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, Dispatch, ElementType, ReactNode, SetStateAction } from 'react'
import { BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleUserRound, Download, Heart, Home, ImagePlus, MoreHorizontal, Pencil, Plus, Refrigerator, Search, ShoppingBag, ShoppingCart, Sparkles, Trash2, Upload, Wand2, X } from 'lucide-react'
import type { Ingredient, Meal, MealPlan, Preferences, Recipe, ShoppingItem, Tab } from '@/lib/types'
import { CATEGORIES, DIFFICULTIES, FLAVORS, PREF_TIME_OPTIONS, SYSTEM_RECIPES, TIME_OPTIONS, UNITS, computeFreshness, defaultPrefs, dictUnit, filterByDiet, getWeek, iconFor, matchPct, normalize, searchDict, seedIngredients, seedPlan, seedShopping, toDateKey } from '@/lib/data'
import type { PlanContext, PlanFilters } from '@/lib/planner'
import { collectMissing, generateDayPlan, generateWeekPlan } from '@/lib/planner'
import { loadAll, saveAll } from '@/lib/db'
import { buildAiContext } from '@/lib/aiContext'
import { consumeCozeSse } from '@/lib/chatStream'

const field = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20'
const primary = 'rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground'
const secondary = 'rounded-xl border border-border px-4 py-2.5 text-sm font-semibold'
const dangerBtn = 'rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-white'

type ShopDraft = { name: string; normalizedName: string; quantity: number; unit: string; source: string }

// crypto.randomUUID 仅在安全上下文（HTTPS / localhost）可用；手机经局域网 IP 走 HTTP 时不存在，需回退
const uid = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

function statusColor(status: string) {
  if (status === '新鲜') return 'bg-green-100 text-green-700'
  if (status === '尽快食用') return 'bg-yellow-100 text-yellow-700'
  if (status === '临期') return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

// 压缩用户上传的菜谱图片为 dataURL，控制 IndexedDB 体积
function compressImage(file: File, maxDim = 720, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('图片读取失败'))
      img.src = String(reader.result)
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function Sheet({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 flex items-end bg-foreground/30" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <section className="max-h-[90%] w-full overflow-y-auto rounded-t-3xl bg-background">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-5 py-4">
          <h2 className="font-bold">{title}</h2>
          <button aria-label="关闭" onClick={close}><X className="size-5" /></button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  )
}

function ConfirmBox({ text, cancel, ok, okText = '确定', cancelText = '取消', danger = false }: { text: string; cancel: () => void; ok: () => void; okText?: string; cancelText?: string; danger?: boolean }) {
  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-foreground/35 p-7">
      <div className="w-full rounded-2xl bg-background p-5 shadow-xl">
        <h2 className="font-bold">请确认</h2>
        <p className="py-5 text-sm leading-6 text-muted-foreground">{text}</p>
        <div className="grid grid-cols-2 gap-3">
          <button className={secondary} onClick={cancel}>{cancelText}</button>
          <button className={danger ? dangerBtn : primary} onClick={ok}>{okText}</button>
        </div>
      </div>
    </div>
  )
}

function Empty({ icon, copy, action }: { icon: ReactNode; copy: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="rounded-full bg-secondary p-5 text-primary">{icon}</div>
      <p className="text-sm leading-6 text-muted-foreground">{copy}</p>
      {action}
    </div>
  )
}

function Dropdown({ label, options, selected, multi, onChange, active }: { label: string; options: string[]; selected: string[]; multi: boolean; onChange: (next: string[]) => void; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const toggle = (o: string) => {
    if (multi) onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o])
    else { onChange([o]); setOpen(false) }
  }
  const openDropdown = () => {
    // 用 fixed 定位弹出，避免被外层滚动容器 overflow 裁剪；下方空间不足时自动改为向上弹出
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const cardH = 200
      const below = window.innerHeight - r.bottom
      setPos({
        top: below >= cardH ? r.bottom + 8 : Math.max(8, r.top - cardH - 8),
        left: Math.max(8, Math.min(r.left, window.innerWidth - 200 - 8)),
      })
    }
    setOpen(v => !v)
  }
  return (
    <div className="relative">
      <button ref={btnRef} onClick={openDropdown} className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
        {label}{active && multi && <span>·{selected.length}</span>}<ChevronDown className="size-3.5" />
      </button>
      {open && <>
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
        <div className="fixed z-40 w-48 rounded-2xl border bg-background p-3 shadow-xl" style={{ top: pos.top, left: pos.left }}>
          <div className="flex flex-wrap gap-2">
            {options.map(o => (
              <button key={o} onClick={() => toggle(o)} className={`rounded-full px-3 py-1.5 text-xs ${selected.includes(o) ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>{o}</button>
            ))}
          </div>
          {multi && selected.length > 0 && <button className="mt-2 w-full text-center text-xs text-muted-foreground" onClick={() => onChange([])}>清空</button>}
        </div>
      </>}
    </div>
  )
}

// 将生成结果按所选餐次合并进既有计划（未选中的餐次保留原内容）
function mergeGenerated(p: MealPlan, gen: MealPlan, meals: Meal[]): MealPlan {
  const next = { ...p }
  for (const [k, day] of Object.entries(gen)) {
    const cur = next[k] ?? { 早餐: [], 午餐: [], 晚餐: [] }
    const nd = { ...cur }
    for (const m of meals) nd[m] = day[m] ?? []
    next[k] = nd
  }
  return next
}

export default function FoodApp() {
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('食材')
  const [ingredients, setIngredients] = useState<Ingredient[]>(seedIngredients)
  const [recipes, setRecipes] = useState<Recipe[]>(SYSTEM_RECIPES)
  const [favorites, setFavorites] = useState<string[]>(['r1', 'r4'])
  const [shopping, setShopping] = useState<ShoppingItem[]>(seedShopping)
  const [plan, setPlan] = useState<MealPlan>(seedPlan)
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs)
  const [sheet, setSheet] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [profile, setProfile] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [confirmBox, setConfirmBox] = useState<null | { text: string; okText?: string; cancelText?: string; danger?: boolean; onOk: () => void }>(null)
  const [mergeDlg, setMergeDlg] = useState<null | { conflicts: { draft: ShopDraft; existing: ShoppingItem }[]; choices: boolean[] }>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiLocal, setAiLocal] = useState(true)
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const aiSessionRef = useRef<string>('')

  useEffect(() => {
    loadAll().then(data => {
      if (data) {
        if (Array.isArray(data.ingredients)) setIngredients(data.ingredients)
        setRecipes([...SYSTEM_RECIPES, ...(Array.isArray(data.myRecipes) ? data.myRecipes : [])])
        if (Array.isArray(data.favorites)) setFavorites(data.favorites)
        if (Array.isArray(data.shopping)) setShopping(data.shopping)
        if (data.plan && typeof data.plan === 'object') setPlan(data.plan)
        if (data.preferences && typeof data.preferences === 'object') setPrefs(data.preferences)
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!loaded) return
    saveAll({ ingredients, myRecipes: recipes.filter(r => !r.isSystem), favorites, shopping, plan, preferences: prefs })
  }, [loaded, ingredients, recipes, favorites, shopping, plan, prefs])

  // PWA Service Worker（仅生产环境注册，避免干扰开发热更新）
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  const notify = (s: string) => { setToast(s); setTimeout(() => setToast(''), 1800) }
  const close = () => { setSheet(''); setTarget(null) }

  const selectedRecipe = recipes.find(r => r.id === target)
  const selectedIngredient = ingredients.find(i => i.id === target)

  const { visible: visibleByDiet, allergyHidden } = useMemo(() => filterByDiet(recipes, prefs), [recipes, prefs])
  const stock = useMemo(() => new Set(ingredients.filter(i => i.lifeState === 'active').map(i => normalize(i.name))), [ingredients])
  const expiring = useMemo(() => new Set(ingredients.filter(i => i.lifeState === 'active' && (i.status === '临期' || i.status === '尽快食用')).map(i => normalize(i.name))), [ingredients])
  const planCtx = useMemo<PlanContext>(() => ({ stock, expiring, favorites }), [stock, expiring, favorites])

  const toggleFavorite = (id: string) => setFavorites(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id])

  // 统一的采购清单加入入口：先合并批次内同名项，再与清单冲突项弹窗确认（增加数量 / 保留原数量）
  const addItemsToShopping = (incoming: ShopDraft[]) => {
    const merged = new Map<string, ShopDraft>()
    for (const it of incoming) {
      const key = `${it.normalizedName}|${it.unit}`
      const prev = merged.get(key)
      if (prev) merged.set(key, { ...prev, quantity: prev.quantity + it.quantity })
      else merged.set(key, it)
    }
    const fresh: ShoppingItem[] = []
    const conflicts: { draft: ShopDraft; existing: ShoppingItem }[] = []
    for (const it of merged.values()) {
      const existing = shopping.find(s => normalize(s.name) === it.normalizedName && s.unit === it.unit && !s.checked)
      if (existing) conflicts.push({ draft: it, existing })
      else fresh.push({ id: uid(), name: it.name, normalizedName: it.normalizedName, quantity: it.quantity, unit: it.unit, checked: false, source: it.source })
    }
    if (fresh.length) setShopping(x => [...x, ...fresh])
    if (conflicts.length) setMergeDlg({ conflicts, choices: conflicts.map(() => true) })
    else notify(conflicts.length ? '采购清单已更新' : `已加入 ${fresh.length} 项采购清单`)
  }
  const applyMerge = () => {
    if (!mergeDlg) return
    const { conflicts, choices } = mergeDlg
    const ids = new Set(conflicts.filter((_, i) => choices[i]).map(c => c.existing.id))
    setShopping(x => x.map(s => {
      if (!ids.has(s.id)) return s
      const add = conflicts.find(c => c.existing.id === s.id)?.draft.quantity ?? 0
      return { ...s, quantity: s.quantity + add }
    }))
    setMergeDlg(null)
    notify('采购清单已更新')
  }

  // AI 助手：每轮注入最新本地事实，并流式消费 Coze Coding Agent SSE。
  const sendChat = async (text: string) => {
    const q = text.trim()
    if (!q || q.length > 2_000 || aiBusy) return
    if (!aiSessionRef.current) aiSessionRef.current = crypto.randomUUID()
    const history: ChatMsg[] = [
      ...chat,
      { role: 'user', content: q },
      { role: 'assistant', content: '', status: 'streaming', retryText: q },
    ]
    const assistantIndex = history.length - 1
    setChat(history)
    setAiBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          sessionId: aiSessionRef.current,
          context: aiLocal ? buildAiContext(ingredients, prefs) : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error((data?.error as string) ?? 'AI 助手出错了，请稍后再试')
      }
      let reply = ''
      await consumeCozeSse(res, chunk => {
        reply += chunk
        setChat(current => current.map((item, index) =>
          index === assistantIndex ? { ...item, content: reply, status: 'streaming' } : item,
        ))
      })
      setChat(current => current.map((item, index) =>
        index === assistantIndex ? { ...item, content: reply || '（无回复）', status: 'done' } : item,
      ))
    } catch (error) {
      const message = error instanceof Error ? error.message : '网络错误，请稍后再试'
      setChat(current => current.map((item, index) =>
        index === assistantIndex ? { ...item, content: `发送失败：${message}`, status: 'error' } : item,
      ))
      notify(message)
    } finally {
      setAiBusy(false)
    }
  }

  const newAiConversation = () => {
    if (aiBusy) return
    aiSessionRef.current = crypto.randomUUID()
    setChat([])
    notify('已新建对话')
  }

  // 食材：加入采购清单（去重）
  const requestAddToShop = (ing: Ingredient) => { setTarget(ing.id); setSheet('addToShop') }
  const deleteIngredient = () => {
    setConfirmBox({ text: '确定丢弃/删除这个食材吗？', okText: '删除', danger: true, onOk: () => { setIngredients(x => x.filter(i => i.id !== target)); close(); notify('已删除') } })
  }
  const addToStock = (s: ShoppingItem) => {
    setIngredients(x => [{ id: uid(), name: s.name, normalizedName: normalize(s.name), icon: iconFor(s.name), quantity: s.quantity, unit: s.unit, storage: '冷藏', addedAt: toDateKey(new Date()), shelfLifeDays: 7, daysLeft: 7, status: '新鲜', lifeState: 'active' }, ...x])
    notify(`${s.name} 已加入食材库存`)
  }

  // 数据管理
  const doExport = () => {
    const data = { exportedAt: new Date().toISOString(), ingredients, myRecipes: recipes.filter(r => !r.isSystem), favorites, shopping, plan, preferences: prefs }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const d = new Date()
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    a.href = url; a.download = `my-food-data-${dateStr}.json`; a.click()
    URL.revokeObjectURL(url)
    notify('已导出所有数据')
  }
  const doImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result))
        setIngredients(Array.isArray(d.ingredients) ? d.ingredients : [])
        setRecipes([...SYSTEM_RECIPES, ...(Array.isArray(d.myRecipes) ? d.myRecipes : [])])
        setFavorites(Array.isArray(d.favorites) ? d.favorites : [])
        setShopping(Array.isArray(d.shopping) ? d.shopping : [])
        setPlan(d.plan && typeof d.plan === 'object' ? d.plan : {})
        setPrefs(d.preferences && typeof d.preferences === 'object' ? d.preferences : defaultPrefs)
        notify('导入成功，数据已恢复')
      } catch { notify('导入失败：文件格式不正确') }
    }
    reader.readAsText(file)
  }
  const fileInputDone = (file: File) => {
    setConfirmBox({ text: '导入将覆盖当前所有数据，是否继续？', okText: '确认导入', onOk: () => doImport(file) })
  }
  const doClear = () => {
    setConfirmBox({ text: '此操作将删除所有本地数据，包括食材、菜谱、计划、采购清单，且不可恢复。确定继续吗？', okText: '确定清空', danger: true, onOk: () => { setIngredients([]); setRecipes(SYSTEM_RECIPES); setFavorites([]); setShopping([]); setPlan({}); setPrefs(defaultPrefs); notify('已清空全部本地数据') } })
  }

  if (!loaded) {
    return <main className="flex min-h-screen items-center justify-center bg-muted"><p className="text-sm text-muted-foreground">加载中…</p></main>
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted sm:p-6">
      <div className="relative flex h-dvh w-full max-w-[390px] flex-col overflow-hidden bg-background shadow-2xl sm:h-[844px] sm:rounded-[28px]">
        {toast && <div className="absolute left-1/2 top-7 z-[90] -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-xs text-background">{toast}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto pb-5 no-scrollbar">
          {tab === '食材' && <Ingredients items={ingredients} add={() => setSheet('addIngredient')} menu={id => { setTarget(id); setSheet('ingredientMenu') }} />}
          {tab === '菜谱' && <RecipesPage recipes={visibleByDiet} favorites={favorites} toggle={toggleFavorite} open={id => { setTarget(id); setSheet('recipe') }} stock={stock} onCreate={() => setSheet('createRecipe')} hiddenCount={allergyHidden} />}
          {tab === '计划' && <PlanView plan={plan} recipes={visibleByDiet} setPlan={setPlan} open={id => { setTarget(id); setSheet('recipe') }} notify={notify} ctx={planCtx} prefs={prefs} addShopping={addItemsToShopping} weekOffset={weekOffset} setWeekOffset={setWeekOffset} />}
          {tab === '采购' && <Shopping items={shopping} setItems={setShopping} add={() => setSheet('addShop')} edit={id => { setTarget(id); setSheet('editShop') }} clear={() => setConfirmBox({ text: '确定清空全部采购项吗？', okText: '清空', onOk: () => { setShopping([]); notify('采购清单已清空') } })} stock={addToStock} />}
          {tab === '我的' && <Profile page={profile} setPage={setProfile} favRecipes={visibleByDiet.filter(r => favorites.includes(r.id))} myRecipes={recipes.filter(r => !r.isSystem)} favorites={favorites} stock={stock} toggle={toggleFavorite} open={id => { setTarget(id); setSheet('recipe') }} onCreate={() => setSheet('createRecipe')} prefs={prefs} setPrefs={setPrefs} ingredients={ingredients} shopping={shopping} plan={plan} onExport={doExport} onImport={fileInputDone} onClear={doClear} />}
        </div>
        {!aiOpen && (
          <button aria-label="AI 助手" onClick={() => setAiOpen(true)} className="absolute bottom-20 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Sparkles className="size-5" />
          </button>
        )}
        <Nav tab={tab} setTab={t => { setTab(t); setProfile('') }} count={shopping.length} />

        {sheet === 'ingredientMenu' && selectedIngredient && <IngredientMenu item={selectedIngredient} close={close} edit={() => setSheet('editIngredient')} shop={() => requestAddToShop(selectedIngredient)} remove={() => { setIngredients(x => x.filter(i => i.id !== target)); close(); notify('已标记为已用完') }} del={deleteIngredient} saveNote={n => setIngredients(x => x.map(y => y.id === selectedIngredient.id ? { ...y, note: n } : y))} />}
        {sheet === 'editIngredient' && selectedIngredient && <IngredientForm initial={selectedIngredient} close={close} notify={notify} save={i => { setIngredients(x => x.map(y => y.id === i.id ? i : y)); close(); notify('食材已更新') }} />}
        {sheet === 'addIngredient' && <IngredientForm close={close} notify={notify} save={i => { setIngredients(x => [i, ...x]); close(); notify(`已成功添加 ${i.name}`) }} />}
        {sheet === 'addToShop' && selectedIngredient && <AddToShopForm item={selectedIngredient} close={close} notify={notify} save={s => { addItemsToShopping([s]); close() }} />}
        {sheet === 'recipe' && selectedRecipe && <RecipeDetail recipe={selectedRecipe} favorite={favorites.includes(selectedRecipe.id)} close={close} toggle={() => toggleFavorite(selectedRecipe.id)} edit={() => setSheet('editRecipe')} addPlan={() => setSheet('planPicker')} allergy={prefs.allergy} stock={stock} addShopping={addItemsToShopping} onDelete={!selectedRecipe.isSystem ? () => setConfirmBox({ text: `确定删除「${selectedRecipe.title}」吗？`, okText: '删除', danger: true, onOk: () => { setRecipes(x => x.filter(r => r.id !== selectedRecipe.id)); close(); notify('已删除菜谱') } }) : undefined} />}
        {sheet === 'editRecipe' && selectedRecipe && <RecipeForm recipe={selectedRecipe} notify={notify} close={() => setSheet('recipe')} save={r => { setRecipes(x => x.map(i => i.id === r.id ? r : i)); close(); notify('菜谱已更新') }} />}
        {sheet === 'createRecipe' && <RecipeForm close={close} create notify={notify} save={r => { setRecipes(x => [r, ...x]); close(); notify('已保存到我的菜谱') }} />}
        {sheet === 'planPicker' && selectedRecipe && <PlanPicker target={selectedRecipe.id} plan={plan} setPlan={setPlan} close={close} notify={notify} />}
        {sheet === 'addShop' && <ShopForm close={close} notify={notify} save={s => { addItemsToShopping([s]); close() }} />}
        {sheet === 'editShop' && <ShopForm initial={shopping.find(x => x.id === target)} close={close} notify={notify} save={s => { setShopping(x => x.map(y => y.id === target ? { ...y, ...s } : y)); close(); notify('采购项已更新') }} />}

        {confirmBox && <ConfirmBox text={confirmBox.text} okText={confirmBox.okText} cancelText={confirmBox.cancelText} danger={confirmBox.danger} cancel={() => setConfirmBox(null)} ok={() => { confirmBox.onOk(); setConfirmBox(null) }} />}
        {mergeDlg && <MergeDlg dlg={mergeDlg} setChoices={c => setMergeDlg(d => d ? { ...d, choices: c } : d)} cancel={() => setMergeDlg(null)} ok={applyMerge} />}
        {aiOpen && (
          <AiChat
            messages={chat}
            busy={aiBusy}
            aiLocal={aiLocal}
            setAiLocal={setAiLocal}
            onSend={sendChat}
            onNewConversation={newAiConversation}
            onOpenRecipe={id => { setAiOpen(false); setTarget(id); setSheet('recipe') }}
            recipes={recipes}
            close={() => setAiOpen(false)}
          />
        )}
      </div>
    </main>
  )
}

function Nav({ tab, setTab, count }: { tab: Tab; setTab: (x: Tab) => void; count: number }) {
  const xs: [Tab, ElementType][] = [['食材', Home], ['菜谱', BookOpen], ['计划', CalendarDays], ['采购', ShoppingBag], ['我的', CircleUserRound]]
  return (
    <nav className="grid grid-cols-5 border-t bg-background px-2 pb-2 pt-2">
      {xs.map(([x, I]) => (
        <button key={x} onClick={() => setTab(x)} className={`relative flex flex-col items-center gap-1 text-[11px] ${x === tab ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
          <I className="size-5" />
          {x === '采购' && count > 0 && <b className="absolute right-2 top-0 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">{count}</b>}
          <span>{x}</span>
        </button>
      ))}
    </nav>
  )
}

const STATUS_FILTERS = ['全部', '新鲜', '尽快食用', '临期', '已过期']

function Ingredients({ items, add, menu }: { items: Ingredient[]; add: () => void; menu: (id: string) => void }) {
  const [statusFilter, setStatusFilter] = useState('全部')
  const shown = statusFilter === '全部' ? items : items.filter(i => i.status === statusFilter)
  const nearCount = items.filter(i => i.status === '临期').length
  const expiredCount = items.filter(i => i.status === '已过期').length
  return (
    <>
      <header className="flex items-end justify-between px-5 pb-4 pt-7">
        <div>
          <p className="text-xs text-muted-foreground">{items.length} 种食材 · {nearCount} 种临期 · {expiredCount} 种预计已过期</p>
          <h1 className="text-2xl font-bold">我的食材</h1>
        </div>
        <button className={primary} onClick={add}><Plus className="mr-1 inline size-4" />添加</button>
      </header>
      {!!items.length && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-4 [scrollbar-width:none]">
          {STATUS_FILTERS.map(s => (
            <button key={s} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => setStatusFilter(s)}>{s}</button>
          ))}
        </div>
      )}
      {!items.length
        ? <Empty icon={<Refrigerator className="size-9" />} copy="冰箱还空着，快去采购吧！" action={<button className={primary} onClick={add}>添加食材</button>} />
        : !shown.length
          ? <p className="pt-10 text-center text-sm text-muted-foreground">没有「{statusFilter}」状态的食材</p>
          : <div className="grid grid-cols-2 gap-3 px-5">
            {shown.map(i => (
              <article key={i.id} onClick={() => menu(i.id)} className="cursor-pointer rounded-2xl border bg-card p-4 shadow-sm transition active:scale-[0.98]">
                <div className="flex items-start justify-between">
                  <span className="text-4xl">{i.icon}</span>
                  <button aria-label={`${i.name}菜单`} onClick={e => { e.stopPropagation(); menu(i.id) }}><MoreHorizontal className="size-5 text-muted-foreground" /></button>
                </div>
                <h3 className="mt-3 font-bold">{i.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{i.quantity}{i.unit} · {i.storage}</p>
                {i.note && <p className="mt-1 truncate text-[10px] text-muted-foreground">📝 {i.note}</p>}
                <div className="mt-3 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-1 text-[10px] ${statusColor(i.status)}`}>{i.status}</span>
                  <span className="text-[10px] text-muted-foreground">{i.daysLeft > 0 ? `预计剩余 ${i.daysLeft} 天` : '已过期'}</span>
                </div>
              </article>
            ))}
          </div>}
    </>
  )
}

function IngredientMenu({ item, close, edit, shop, remove, del, saveNote }: { item: Ingredient; close: () => void; edit: () => void; shop: () => void; remove: () => void; del: () => void; saveNote: (note: string) => void }) {
  const [note, setNote] = useState(item.note ?? '')
  const [saved, setSaved] = useState(false)
  const doSave = () => { saveNote(note.trim()); setSaved(true); setTimeout(() => setSaved(false), 1500) }
  const rows = [
    { Icon: Pencil, label: '编辑食材', cls: '', onClick: edit },
    { Icon: ShoppingCart, label: '加入采购清单', cls: '', onClick: shop },
    { Icon: CheckCircle2, label: '已用完', cls: 'text-green-600', onClick: remove },
    { Icon: Trash2, label: '丢弃/删除', cls: 'text-red-500', onClick: del },
  ]
  return (
    <Sheet title={item.name} close={close}>
      {saved && <div className="absolute inset-0 z-[80] flex items-center justify-center bg-foreground/35"><div className="flex items-center gap-2 rounded-2xl bg-background px-8 py-5 shadow-xl"><CheckCircle2 className="size-5 text-green-600" /><p className="text-sm font-semibold">保存成功</p></div></div>}
      <div className="flex flex-col gap-1">
        <label className="mb-2 block text-sm">备注
          <div className="mt-2 flex gap-2">
            <input className={field} placeholder="如：做沙拉用" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doSave() }} />
            <button className="shrink-0 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground" onClick={doSave}>保存</button>
          </div>
        </label>
        {rows.map(r => (
          <button key={r.label} onClick={r.onClick} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-secondary">
            <r.Icon className={`size-5 ${r.cls}`} />
            <span className={r.cls}>{r.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function IngredientForm({ initial, close, save, notify }: { initial?: Ingredient; close: () => void; save: (i: Ingredient) => void; notify: (s: string) => void }) {
  const blank: Ingredient = { id: uid(), name: '', normalizedName: '', icon: '🧺', quantity: 1, unit: '个', storage: '冷藏', addedAt: toDateKey(new Date()), shelfLifeDays: 7, daysLeft: 7, status: '新鲜', lifeState: 'active' }
  const [f, setF] = useState<Ingredient>(initial ?? blank)
  // 数字输入用字符串暂存：type=number 清空会被强制回 0，存字符串才能全部删掉重填
  const [qtyText, setQtyText] = useState(String(initial?.quantity ?? 1))
  const [shelfText, setShelfText] = useState(String(initial?.shelfLifeDays ?? 7))
  const suggestions = useMemo(() => (f.name.trim() && normalize(f.name) !== f.name.trim() ? [] : searchDict(f.name)).filter(d => d.name !== f.name.trim()).slice(0, 8), [f.name])
  const applyDict = (name: string, icon: string, unit: string, shelfLifeDays: number) => {
    const { daysLeft, status } = computeFreshness(f.addedAt, shelfLifeDays)
    setF({ ...f, name, normalizedName: name, icon, unit, shelfLifeDays, daysLeft, status })
    setShelfText(String(shelfLifeDays))
  }
  const setName = (name: string) => {
    const { daysLeft, status } = computeFreshness(f.addedAt, f.shelfLifeDays)
    setF({ ...f, name, normalizedName: normalize(name), icon: iconFor(name), daysLeft, status })
  }
  const recompute = (patch: Partial<Ingredient>) => {
    const next = { ...f, ...patch }
    const { daysLeft, status } = computeFreshness(next.addedAt, next.shelfLifeDays)
    setF({ ...next, daysLeft, status })
  }
  const saveIt = () => {
    const name = f.name.trim()
    if (!name) return notify('请填写食材名称')
    const qty = +qtyText
    if (!qtyText.trim() || Number.isNaN(qty) || qty <= 0) return notify('请填写数量（需大于 0）')
    const shelf = Math.floor(+shelfText)
    if (!shelfText.trim() || Number.isNaN(shelf) || shelf < 1) return notify('请填写保质期天数（至少 1 天）')
    const info = searchDict(name).find(d => d.name === name)
    const final: Ingredient = { ...f, name, quantity: qty, shelfLifeDays: shelf }
    if (info && final.normalizedName !== info.name) { final.icon = info.icon; final.unit = info.unit || final.unit }
    const { daysLeft, status } = computeFreshness(final.addedAt, shelf)
    save({ ...final, normalizedName: normalize(name), daysLeft, status })
  }
  return (
    <Sheet title={initial ? '编辑食材' : '添加食材'} close={close}>
      <div className="relative flex flex-col gap-4">
        <label className="text-sm">名称（支持从食材字典自动补全）
          <input autoFocus className={`${field} mt-2`} placeholder="如：番茄" value={f.name} onChange={e => setName(e.target.value)} />
        </label>
        {suggestions.length > 0 && (
          <div className="absolute top-14 z-40 w-full rounded-xl border bg-background p-2 shadow-xl">
            {suggestions.map(d => (
              <button key={d.name} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary" onClick={() => applyDict(d.name, d.icon, d.unit, d.shelfLifeDays)}>
                <span>{d.icon}</span>{d.name}
                <span className="ml-auto text-[10px] text-muted-foreground">默认 {d.unit} · 保质期约 {d.shelfLifeDays} 天</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">数量<input inputMode="decimal" className={`${field} mt-2`} value={qtyText} onChange={e => setQtyText(e.target.value)} /></label>
          <label className="text-sm">单位<select className={`${field} mt-2`} value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}>{UNITS.map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">入库日期<input type="date" className={`${field} mt-2`} value={f.addedAt} onChange={e => recompute({ addedAt: e.target.value })} /></label>
          <label className="text-sm">保质期（天）<input inputMode="numeric" className={`${field} mt-2`} value={shelfText} onChange={e => {
            setShelfText(e.target.value)
            const n = Math.floor(+e.target.value)
            if (e.target.value.trim() && !Number.isNaN(n) && n >= 1) recompute({ shelfLifeDays: n })
          }} /></label>
        </div>
        <label className="text-sm">储存方式<select className={`${field} mt-2`} value={f.storage} onChange={e => setF({ ...f, storage: e.target.value })}>{['冷藏', '冷冻', '常温'].map(x => <option key={x}>{x}</option>)}</select></label>
        <p className="text-xs text-muted-foreground">当前状态：{statusColor(f.status) && ''}<span className={`rounded-full px-2 py-1 ${statusColor(f.status)}`}>{f.status}</span>{f.daysLeft > 0 ? ` · 预计剩余 ${f.daysLeft} 天` : ''}</p>
        <button className={primary} onClick={saveIt}>保存</button>
      </div>
    </Sheet>
  )
}

function AddToShopForm({ item, close, save, notify }: { item: Ingredient; close: () => void; save: (s: ShopDraft) => void; notify: (s: string) => void }) {
  const [qtyText, setQtyText] = useState(String(item.quantity))
  const [unit, setUnit] = useState(item.unit)
  return (
    <Sheet title="加入采购清单" close={close}>
      <div className="flex flex-col gap-4">
        <label className="text-sm">名称<input className={`${field} mt-2 opacity-70`} value={item.name} readOnly /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">数量<input inputMode="decimal" className={`${field} mt-2`} value={qtyText} onChange={e => setQtyText(e.target.value)} /></label>
          <label className="text-sm">单位<select className={`${field} mt-2`} value={unit} onChange={e => setUnit(e.target.value)}>{UNITS.map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <button className={primary} onClick={() => {
          const qty = +qtyText
          if (!qtyText.trim() || Number.isNaN(qty) || qty <= 0) return notify('请填写数量（需大于 0）')
          save({ name: item.name, normalizedName: normalize(item.name), quantity: qty, unit, source: '食材库存' })
        }}>加入</button>
      </div>
    </Sheet>
  )
}

const SOURCE_TABS = ['全部', '系统菜谱', '我的菜谱'] as const

function RecipesPage({ recipes, favorites, toggle, open, stock, onCreate, hiddenCount }: { recipes: Recipe[]; favorites: string[]; toggle: (id: string) => void; open: (id: string) => void; stock: Set<string>; onCreate: () => void; hiddenCount: number }) {
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<(typeof SOURCE_TABS)[number]>('全部')
  const [onlyCookable, setOnlyCookable] = useState(false)
  const [fCat, setFCat] = useState<string[]>([])
  const [fFlavor, setFFlavor] = useState<string[]>([])
  const [fTime, setFTime] = useState<string[]>(['不限'])
  const [fDiff, setFDiff] = useState<string[]>([])

  const filtered = useMemo(() => {
    let list = source === '全部' ? recipes : recipes.filter(r => r.isSystem === (source === '系统菜谱'))
    const q = search.trim()
    if (q) list = list.filter(r => r.title.includes(q) || r.needs.some(n => n.includes(q) || normalize(n).includes(q)) || r.prep.includes(q) || r.seasoning.includes(q))
    if (fCat.length) list = list.filter(r => fCat.includes(r.category))
    if (fFlavor.length) list = list.filter(r => fFlavor.includes(r.flavor))
    if (fTime[0] !== '不限') list = list.filter(r => r.time <= Number(fTime[0]))
    if (fDiff.length) list = list.filter(r => fDiff.includes(r.difficulty))
    if (onlyCookable) list = list.filter(r => matchPct(r, stock) === 100)
    return [...list].sort((a, b) => matchPct(b, stock) - matchPct(a, stock))
  }, [recipes, source, search, fCat, fFlavor, fTime, fDiff, onlyCookable, stock])

  return (
    <>
      <header className="flex items-end justify-between px-5 pb-4 pt-7">
        <div><p className="text-xs text-muted-foreground">今天吃什么</p><h1 className="text-2xl font-bold">灵感菜谱</h1></div>
        <button className={primary} onClick={onCreate}><Plus className="mr-1 inline size-4" />创建菜谱</button>
      </header>
      <div className="px-5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            {SOURCE_TABS.map(s => (
              <button key={s} className={`rounded-full px-3 py-1.5 text-xs font-medium ${source === s ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => setSource(s)}>{s}</button>
            ))}
          </div>
          <button className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${onlyCookable ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => setOnlyCookable(v => !v)}>只看能直接做</button>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input className={`${field} pl-9`} placeholder="搜索食材或菜品" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Dropdown label="品类" options={CATEGORIES} selected={fCat} multi onChange={setFCat} active={fCat.length > 0} />
          <Dropdown label="口味" options={FLAVORS} selected={fFlavor} multi onChange={setFFlavor} active={fFlavor.length > 0} />
          <Dropdown label="时间" options={TIME_OPTIONS} selected={fTime} multi={false} onChange={setFTime} active={fTime[0] !== '不限'} />
          <Dropdown label="难度" options={DIFFICULTIES} selected={fDiff} multi onChange={setFDiff} active={fDiff.length > 0} />
        </div>
      </div>
      {filtered.length
        ? <RecipeGrid items={filtered} favorites={favorites} open={open} toggle={toggle} stock={stock} />
        : source === '我的菜谱' && !recipes.some(r => !r.isSystem)
          ? <Empty icon={<BookOpen className="size-9" />} copy="还没有自建菜谱，创建一道属于自己的菜谱吧。" action={<button className={primary} onClick={onCreate}>创建菜谱</button>} />
          : <Empty icon={<Search className="size-9" />} copy="没有符合条件的菜谱，换个筛选条件试试。" />}
      {hiddenCount > 0 && <p className="px-5 pt-3 text-center text-xs text-muted-foreground">已隐藏 {hiddenCount} 道含过敏食材的菜谱</p>}
    </>
  )
}

function RecipeGrid({ items, favorites, open, toggle, stock }: { items: Recipe[]; favorites: string[]; open: (id: string) => void; toggle: (id: string) => void; stock: Set<string> }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-5">
      {items.map(r => {
        const pct = matchPct(r, stock)
        return (
          <article key={r.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <button className="flex h-20 w-full items-center justify-center overflow-hidden bg-secondary text-5xl" onClick={() => open(r.id)}>
              {r.image ? <img src={r.image} alt={r.title} className="h-full w-full object-cover" /> : iconFor(r.needs[0] || r.title)}
            </button>
            <div className="p-3">
              <div className="flex items-start justify-between gap-2">
                <button className="text-left text-sm font-bold" onClick={() => open(r.id)}>{r.title}{!r.isSystem && <span className="ml-1 rounded bg-secondary px-1 text-[9px] font-normal text-muted-foreground">我的</span>}</button>
                <button aria-label={`收藏${r.title}`} onClick={() => toggle(r.id)}><Heart className={`size-4 ${favorites.includes(r.id) ? 'fill-primary text-primary' : ''}`} /></button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{r.category} · {r.flavor} · {r.time}分钟 · {r.difficulty}</p>
              <div className="mt-2 border-t pt-2">
                <p className={`text-[10px] font-semibold ${pct === 100 ? 'text-green-600' : 'text-amber-600'}`}>库存匹配度：{pct}%</p>
                <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {r.needs.map(n => { const ok = stock.has(normalize(n)); return <span key={n} className={`text-[10px] ${ok ? 'text-green-600' : 'text-muted-foreground'}`}>{ok ? '✓' : '×'}{n}</span> })}
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function RecipeDetail({ recipe, favorite, close, toggle, edit, addPlan, allergy, stock, addShopping, onDelete }: { recipe: Recipe; favorite: boolean; close: () => void; toggle: () => void; edit: () => void; addPlan: () => void; allergy: string[]; stock: Set<string>; addShopping: (items: ShopDraft[]) => void; onDelete?: () => void }) {
  const allergySet = useMemo(() => new Set(allergy.map(normalize)), [allergy])
  const hits = useMemo(() => [...new Set([...recipe.needs, ...recipe.allergens].filter(n => allergySet.has(normalize(n))))], [recipe, allergySet])
  const missing = useMemo(() => recipe.needs.filter(n => !stock.has(normalize(n))), [recipe, stock])
  const addMissing = () => addShopping(missing.map(n => ({ name: n, normalizedName: normalize(n), quantity: 1, unit: dictUnit(n), source: '菜谱' })))
  return (
    <Sheet title="菜谱详情" close={close}>
      <div className="flex flex-col gap-5">
        {hits.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">⚠️ 此菜谱含有您的过敏食材：{hits.join('、')}，请谨慎确认。</div>}
        <div className="flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-7xl">
          {recipe.image ? <img src={recipe.image} alt={recipe.title} className="h-full w-full object-cover" /> : iconFor(recipe.needs[0] || recipe.title)}
        </div>
        <div className="flex items-start justify-between">
          <div><h2 className="text-2xl font-bold">{recipe.title}</h2><p className="mt-1 text-sm text-muted-foreground">{recipe.category} · {recipe.flavor} · {recipe.time}分钟 · {recipe.difficulty}{recipe.isSystem ? '' : ' · 我的菜谱'}</p></div>
          <button onClick={toggle}><Heart className={`size-6 ${favorite ? 'fill-primary text-primary' : ''}`} /></button>
        </div>
        <section>
          <h3 className="font-bold">所需食材</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recipe.needs.map(n => { const ok = stock.has(normalize(n)); return <span key={n} className={`rounded-full px-2.5 py-1 text-xs ${ok ? 'bg-green-50 text-green-700' : 'bg-secondary text-muted-foreground'}`}>{ok ? '✓ 已有' : '× 缺'} {n}</span> })}
          </div>
          {missing.length > 0 && <button className="mt-3 text-xs font-medium text-primary" onClick={addMissing}>将缺少的 {missing.length} 种食材加入采购清单</button>}
        </section>
        <section><h3 className="font-bold">食材与调料准备</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{recipe.prep}</p><p className="text-sm leading-6 text-muted-foreground">调料：{recipe.seasoning}</p></section>
        <section><h3 className="font-bold">烹饪步骤</h3><ol className="mt-3 flex flex-col gap-3">{recipe.steps.map((x, i) => <li key={i} className="flex gap-3 text-sm leading-6"><b className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</b>{x}</li>)}</ol></section>
        <div className="grid grid-cols-2 gap-3">
          <button className={secondary} onClick={edit}>编辑菜谱</button>
          <button className={primary} onClick={addPlan}>加入饮食计划</button>
        </div>
        {onDelete && <button className="w-full text-center text-sm text-destructive" onClick={onDelete}>删除这道菜谱</button>}
      </div>
    </Sheet>
  )
}

function RecipeForm({ recipe, close, save, create, notify }: { recipe?: Recipe; close: () => void; save: (r: Recipe) => void; create?: boolean; notify: (s: string) => void }) {
  const blank: Recipe = { id: uid(), title: '', category: '中式', flavor: '咸鲜', time: 15, difficulty: '简单', needs: [], prep: '', seasoning: '', steps: [], isSystem: false, allergens: [] }
  const [f, setF] = useState<Recipe>(recipe ? { ...recipe, steps: [...recipe.steps] } : blank)
  // 时间输入用字符串暂存，允许清空重填；保存时统一校验
  const [timeText, setTimeText] = useState(String(recipe?.time ?? 15))
  const [needs, setNeeds] = useState((recipe?.needs ?? []).join('、'))
  const [imgBusy, setImgBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const step = (i: number, v: string) => setF({ ...f, steps: f.steps.map((x, n) => n === i ? v : x) })
  const pickImage = async (file: File) => {
    setImgBusy(true)
    const url = await compressImage(file).catch(() => null)
    if (url) setF(prev => ({ ...prev, image: url }))
    setImgBusy(false)
  }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) pickImage(file)
    e.target.value = ''
  }
  const saveIt = () => {
    if (!f.title.trim()) return notify('请填写菜品名称')
    const time = Math.floor(+timeText)
    if (!timeText.trim() || Number.isNaN(time) || time < 1) return notify('请填写烹饪时间（分钟，至少 1 分钟）')
    save({ ...f, title: f.title.trim(), time, needs: needs.split(/[，,、\s]+/).map(s => s.trim()).filter(Boolean), image: f.image || undefined })
  }
  return (
    <Sheet title={create ? '创建我的菜谱' : '编辑菜谱'} close={close}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <button aria-label="上传菜谱图片" className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-muted-foreground" onClick={() => fileRef.current?.click()}>
            {f.image ? <img src={f.image} alt="菜谱配图" className="h-full w-full object-cover" /> : <ImagePlus className="size-6" />}
          </button>
          <div className="flex-1">
            <p className="text-sm">配图（可选，仅保存在本机）</p>
            <p className="mt-1 text-xs text-muted-foreground">{imgBusy ? '处理图片中…' : '点击左侧图片图标上传，自动压缩保存。'}</p>
            {f.image && <button className="mt-2 text-xs text-destructive" onClick={() => setF({ ...f, image: undefined })}>移除图片</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        </div>
        <label className="text-sm">菜品名称<input autoFocus className={`${field} mt-2`} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">分类<select className={`${field} mt-2`} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="text-sm">口味<select className={`${field} mt-2`} value={f.flavor} onChange={e => setF({ ...f, flavor: e.target.value })}>{FLAVORS.map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="text-sm">时间（分钟）<input inputMode="numeric" className={`${field} mt-2`} value={timeText} onChange={e => setTimeText(e.target.value)} /></label>
          <label className="text-sm">难度<select className={`${field} mt-2`} value={f.difficulty} onChange={e => setF({ ...f, difficulty: e.target.value })}>{DIFFICULTIES.map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <label className="text-sm">所需食材（用顿号或逗号分隔）<input className={`${field} mt-2`} placeholder="如：番茄、鸡蛋" value={needs} onChange={e => setNeeds(e.target.value)} /></label>
        <label className="text-sm">食材准备<textarea className={`${field} mt-2`} value={f.prep} onChange={e => setF({ ...f, prep: e.target.value })} /></label>
        <label className="text-sm">调料准备<textarea className={`${field} mt-2`} value={f.seasoning} onChange={e => setF({ ...f, seasoning: e.target.value })} /></label>
        <div className="flex flex-col gap-3">
          <b className="text-sm">烹饪步骤</b>
          {f.steps.map((x, i) => (
            <div key={i} className="flex gap-2">
              <textarea aria-label={`步骤${i + 1}`} className={field} value={x} onChange={e => step(i, e.target.value)} />
              <button aria-label={`删除步骤${i + 1}`} onClick={() => setF({ ...f, steps: f.steps.filter((_, n) => n !== i) })}><X className="size-4" /></button>
            </div>
          ))}
          <button className={secondary} onClick={() => setF({ ...f, steps: [...f.steps, ''] })}><Plus className="mr-1 inline size-4" />添加步骤</button>
        </div>
        <button className={primary} onClick={saveIt}>{create ? '保存' : '保存更改'}</button>
      </div>
    </Sheet>
  )
}

function PlanPicker({ target, plan, setPlan, close, notify }: { target: string; plan: MealPlan; setPlan: Dispatch<SetStateAction<MealPlan>>; close: () => void; notify: (s: string) => void }) {
  const week = getWeek()
  const [day, setDay] = useState(week[0].key)
  const [meal, setMeal] = useState<Meal>('早餐')
  const confirm = () => {
    setPlan(p => {
      const cur = p[day] || { 早餐: [], 午餐: [], 晚餐: [] }
      const list = cur[meal] || []
      if (list.includes(target)) return p
      return { ...p, [day]: { ...cur, [meal]: [...list, target] } }
    })
    close(); notify('已加入饮食计划')
  }
  return (
    <Sheet title="加入饮食计划" close={close}>
      <p className="mb-3 text-sm text-muted-foreground">选择日期与餐次，将这道菜加入计划。</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="max-h-64 overflow-y-auto rounded-xl border p-1">
          {week.map(d => (
            <button key={d.key} onClick={() => setDay(d.key)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${day === d.key ? 'bg-primary text-primary-foreground' : ''}`}><b className="mr-1">{d.w}</b>{d.label}</button>
          ))}
        </div>
        <div className="max-h-64 overflow-y-auto rounded-xl border p-1">
          {(['早餐', '午餐', '晚餐'] as Meal[]).map(m => (
            <button key={m} onClick={() => setMeal(m)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${meal === m ? 'bg-primary text-primary-foreground' : ''}`}>{m}</button>
          ))}
        </div>
      </div>
      <button className={`${primary} mt-4 w-full`} onClick={confirm}>加入计划</button>
    </Sheet>
  )
}

function PlanView({ plan, recipes, setPlan, open, notify, ctx, prefs, addShopping, weekOffset, setWeekOffset }: {
  plan: MealPlan; recipes: Recipe[]; setPlan: Dispatch<SetStateAction<MealPlan>>; open: (id: string) => void; notify: (s: string) => void
  ctx: PlanContext; prefs: Preferences; addShopping: (items: ShopDraft[]) => void
  weekOffset: number; setWeekOffset: (n: number) => void
}) {
  const week = getWeek(weekOffset)
  const [day, setDay] = useState(week[0].key)
  const [menu, setMenu] = useState<{ meal: Meal; id: string } | null>(null)
  const [replace, setReplace] = useState<{ meal: Meal; id: string } | null>(null)
  const [weekGen, setWeekGen] = useState(false)
  const [confirm, setConfirm] = useState<null | { text: string; okText?: string; danger?: boolean; onOk: () => void }>(null)
  const slots = plan[day] || { 早餐: [], 午餐: [], 晚餐: [] }

  const prefsFilters = (): PlanFilters => ({
    flavors: prefs.flavors.length ? prefs.flavors : undefined,
    maxTime: prefs.time !== '不限' ? Number(prefs.time) : undefined,
    difficulties: prefs.difficulty.length ? prefs.difficulty : undefined,
  })

  const remove = (meal: Meal, id: string) => { setPlan(p => ({ ...p, [day]: { ...slots, [meal]: slots[meal].filter(x => x !== id) } })); setMenu(null); notify('已从计划移除') }

  const genToday = () => {
    const today = toDateKey(new Date())
    const meals: Meal[] = ['早餐', '午餐', '晚餐']
    const run = () => {
      const gen = generateDayPlan(recipes, today, { meals, perMeal: { 早餐: 1, 午餐: 2, 晚餐: 2 }, filters: prefsFilters() }, ctx)
      setPlan(p => mergeGenerated(p, gen, meals))
      setDay(today)
      notify('已生成今日计划（早1 午2 晚2）')
    }
    const has = meals.some(m => plan[today]?.[m]?.length)
    if (has) setConfirm({ text: '今天已有计划，生成将覆盖今日三餐安排，是否继续？', okText: '生成', onOk: run })
    else run()
  }

  const genWeek = (meals: Meal[], perMeal: Record<Meal, number>, filters: PlanFilters) => {
    const gen = generateWeekPlan(recipes, week.map(d => d.key), { meals, perMeal, filters }, ctx)
    setPlan(p => mergeGenerated(p, gen, meals))
    setWeekGen(false)
    notify('已生成本周计划')
  }

  const clearDay = () => setConfirm({ text: `确定清空 ${day} 的全部安排吗？`, okText: '清空', danger: true, onOk: () => { setPlan(p => { const n = { ...p }; delete n[day]; return n }); notify('已清空当天计划') } })
  const clearWeek = () => setConfirm({ text: '确定清空本周（周一至周日）的全部计划吗？', okText: '清空', danger: true, onOk: () => { setPlan(p => { const n = { ...p }; week.forEach(d => delete n[d.key]); return n }); notify('已清空本周计划') } })

  const buyMissing = () => {
    const weekPlan: MealPlan = {}
    week.forEach(d => { if (plan[d.key]) weekPlan[d.key] = plan[d.key] })
    const missing = collectMissing(weekPlan, recipes, ctx.stock)
    if (!missing.length) { notify('本周计划不缺食材，库存充足'); return }
    addShopping(missing.map(m => ({ ...m, source: '饮食计划' })))
  }

  return (
    <>
      <header className="px-5 pb-3 pt-7">
        <div className="flex items-center justify-between">
          <button aria-label="上一周" onClick={() => setWeekOffset(weekOffset - 1)}><ChevronLeft /></button>
          <div className="text-center"><p className="text-xs text-muted-foreground">{weekOffset === 0 ? '本周' : weekOffset < 0 ? '前几周' : '之后几周'}饮食安排</p><h1 className="text-xl font-bold">{week[0].label} - {week[6].label}</h1></div>
          <button aria-label="下一周" onClick={() => setWeekOffset(weekOffset + 1)}><ChevronRight /></button>
        </div>
      </header>
      <div className="flex justify-between px-5 pb-3">
        {week.map(d => (
          <button key={d.key} onClick={() => setDay(d.key)} className={`flex w-10 flex-col items-center justify-center rounded-xl py-1.5 text-xs ${day === d.key ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}><span>{d.w}</span><b>{d.day}</b></button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 px-5 pb-4">
        <button className="flex items-center justify-center gap-1 rounded-xl border border-border py-2.5 text-xs font-semibold" onClick={genToday}><Sparkles className="size-4 text-primary" />今日计划</button>
        <button className="flex items-center justify-center gap-1 rounded-xl border border-border py-2.5 text-xs font-semibold" onClick={() => setWeekGen(true)}><Wand2 className="size-4 text-primary" />生成周计划</button>
        <button className="flex items-center justify-center gap-1 rounded-xl border border-border py-2.5 text-xs font-semibold" onClick={buyMissing}><ShoppingCart className="size-4 text-primary" />缺啥买啥</button>
      </div>
      <div className="flex flex-col gap-5 px-5">
        {(['早餐', '午餐', '晚餐'] as Meal[]).map(meal => (
          <section key={meal}>
            <h2 className="mb-2 text-sm font-bold">{meal}</h2>
            <div className="flex flex-col gap-2">
              {slots[meal].map(id => {
                const r = recipes.find(x => x.id === id)
                return r && (
                  <article key={id} className="flex items-center gap-3 rounded-2xl border p-3">
                    {r.image
                      ? <img src={r.image} alt={r.title} className="size-10 shrink-0 rounded-lg object-cover" />
                      : <span className="text-3xl">{iconFor(r.needs[0] || r.title)}</span>}
                    <button className="min-w-0 flex-1 text-left" onClick={() => open(id)}><b className="block truncate text-sm">{r.title}</b><span className="text-[10px] text-muted-foreground">{r.time}分钟 · {r.flavor}</span></button>
                    <button aria-label={`${r.title}计划菜单`} onClick={() => setMenu({ meal, id })}><MoreHorizontal className="size-5" /></button>
                  </article>
                )
              })}
              {!slots[meal].length && <p className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground">暂未安排</p>}
            </div>
          </section>
        ))}
      </div>
      <div className="flex justify-end gap-4 px-5 pt-6">
        <button className="text-xs text-muted-foreground" onClick={clearDay}>清空当天</button>
        <button className="text-xs text-muted-foreground" onClick={clearWeek}>清空本周</button>
      </div>

      {menu && <Sheet title="计划菜品" close={() => setMenu(null)}><div className="flex flex-col gap-2"><button className="rounded-xl p-3 text-left text-sm" onClick={() => open(menu.id)}>查看菜谱</button><button className="rounded-xl p-3 text-left text-sm" onClick={() => { setReplace(menu); setMenu(null) }}>替换</button><button className="rounded-xl p-3 text-left text-sm text-destructive" onClick={() => remove(menu.meal, menu.id)}>移除</button></div></Sheet>}
      {replace && <Sheet title="替换菜品" close={() => setReplace(null)}><div className="flex flex-col gap-3">{[...recipes].filter(x => x.id !== replace.id).sort((a, b) => matchPct(b, ctx.stock) - matchPct(a, ctx.stock)).slice(0, 20).map(r => <button key={r.id} className="flex items-center gap-3 rounded-2xl border p-3 text-left" onClick={() => { setPlan(p => ({ ...p, [day]: { ...slots, [replace.meal]: slots[replace.meal].map(x => x === replace.id ? r.id : x) } })); setReplace(null); notify('菜品已替换') }}><span className="text-3xl">{iconFor(r.needs[0] || r.title)}</span><span><b className="block text-sm">{r.title}</b><small className="text-muted-foreground">{r.time}分钟 · {r.flavor} · 匹配 {matchPct(r, ctx.stock)}%</small></span></button>)}</div></Sheet>}
      {weekGen && <WeekGenSheet close={() => setWeekGen(false)} defaultFilters={prefsFilters()} onGenerate={genWeek} />}
      {confirm && <ConfirmBox text={confirm.text} okText={confirm.okText ?? '确定'} danger={confirm.danger} cancel={() => setConfirm(null)} ok={() => { confirm.onOk(); setConfirm(null) }} />}
    </>
  )
}

function WeekGenSheet({ close, defaultFilters, onGenerate }: { close: () => void; defaultFilters: PlanFilters; onGenerate: (meals: Meal[], perMeal: Record<Meal, number>, filters: PlanFilters) => void }) {
  const [meals, setMeals] = useState<Meal[]>(['早餐', '午餐', '晚餐'])
  const [counts, setCounts] = useState<Record<Meal, number>>({ 早餐: 1, 午餐: 2, 晚餐: 2 })
  const [fCat, setFCat] = useState<string[]>([])
  const [fFlavor, setFFlavor] = useState<string[]>(defaultFilters.flavors ?? [])
  const [fTime, setFTime] = useState('不限')
  const [fDiff, setFDiff] = useState<string[]>(defaultFilters.difficulties ?? [])
  const toggleMeal = (m: Meal) => setMeals(x => x.includes(m) ? x.filter(y => y !== m) : [...x, m])
  return (
    <Sheet title="生成周计划" close={close}>
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="mb-2 text-sm font-bold">生成餐次</h3>
          <div className="flex gap-2">
            {(['早餐', '午餐', '晚餐'] as Meal[]).map(m => (
              <button key={m} className={`rounded-full px-4 py-2 text-sm ${meals.includes(m) ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => toggleMeal(m)}>{meals.includes(m) ? '☑' : '☐'} {m}</button>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-bold">每餐菜品数</h3>
          <div className="flex flex-col gap-2">
            {(['早餐', '午餐', '晚餐'] as Meal[]).filter(m => meals.includes(m)).map(m => (
              <div key={m} className="flex items-center justify-between">
                <span className="text-sm">{m}</span>
                <div className="flex gap-1">
                  {[1, 2, 3].map(n => (
                    <button key={n} className={`size-8 rounded-lg text-sm ${counts[m] === n ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => setCounts(c => ({ ...c, [m]: n }))}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-bold">筛选偏好</h3>
          <div className="flex flex-wrap gap-2">
            <Dropdown label="品类" options={CATEGORIES} selected={fCat} multi onChange={setFCat} active={fCat.length > 0} />
            <Dropdown label="口味" options={FLAVORS} selected={fFlavor} multi onChange={setFFlavor} active={fFlavor.length > 0} />
            <Dropdown label="难度" options={DIFFICULTIES} selected={fDiff} multi onChange={setFDiff} active={fDiff.length > 0} />
            <Dropdown label="最长用时" options={['15', '30', '45', '60', '不限']} selected={[fTime]} multi={false} onChange={x => setFTime(x[0])} active={fTime !== '不限'} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">品类与难度偏好作用于午晚餐；早餐固定从轻食（主食/甜点/饮品/西式）中挑选。</p>
        </section>
        <p className="rounded-xl bg-secondary p-3 text-xs leading-5 text-muted-foreground">将按库存匹配度与临期食材优先安排，并尽量避免 3 天内重复。所选餐次的现有安排会被覆盖。</p>
        <button className={primary} disabled={!meals.length} onClick={() => onGenerate(meals, counts, { categories: fCat, flavors: fFlavor, maxTime: fTime === '不限' ? undefined : Number(fTime), difficulties: fDiff })}>{meals.length ? '生成本周计划' : '请选择至少一个餐次'}</button>
      </div>
    </Sheet>
  )
}

function Shopping({ items, setItems, add, edit, clear, stock }: { items: ShoppingItem[]; setItems: Dispatch<SetStateAction<ShoppingItem[]>>; add: () => void; edit: (id: string) => void; clear: () => void; stock: (s: ShoppingItem) => void }) {
  const done = items.filter(x => x.checked).length
  const sorted = [...items].sort((a, b) => Number(a.checked) - Number(b.checked))
  return (
    <>
      <header className="px-5 pb-4 pt-7">
        <div className="flex items-end justify-between">
          <div><p className="text-xs text-muted-foreground">买齐再出发</p><h1 className="text-2xl font-bold">采购清单</h1></div>
          {items.length > 0 && <div className="flex gap-3">
            {done > 0 && <button className="text-xs text-muted-foreground" onClick={() => setItems(x => x.filter(y => !y.checked))}>清除已完成</button>}
            <button className="text-xs text-muted-foreground" onClick={clear}>清空</button>
          </div>}
        </div>
        {items.length > 0 && <><div className="mt-4 flex justify-between text-xs"><span>已完成 {done}/{items.length}</span><span>{Math.round(done / items.length * 100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${done / items.length * 100}%` }} /></div></>}
      </header>
      <div className="px-5">
        <button className={`${primary} mb-4 w-full`} onClick={add}><Plus className="mr-1 inline size-4" />添加采购项</button>
        {!items.length
          ? <Empty icon={<ShoppingBag className="size-9" />} copy="采购清单空空的，添加需要购买的食材吧。" />
          : <div className="flex flex-col gap-2">
              {sorted.map(s => (
                <article key={s.id} className="rounded-2xl border p-3">
                  <div className="flex items-center gap-3">
                    <button aria-label={`${s.checked ? '取消完成' : '完成'}${s.name}`} onClick={() => setItems(x => x.map(y => y.id === s.id ? { ...y, checked: !y.checked } : y))} className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${s.checked ? 'bg-primary text-primary-foreground' : ''}`}>{s.checked && <Check className="size-4" />}</button>
                    <div className={`min-w-0 flex-1 ${s.checked ? 'text-muted-foreground line-through' : ''}`}><b className="text-sm">{s.name} {s.quantity}{s.unit}</b><p className="mt-1 text-[10px] text-muted-foreground">来自：{s.source}</p></div>
                    <button aria-label={`编辑${s.name}`} onClick={() => edit(s.id)}><MoreHorizontal className="size-5 text-muted-foreground" /></button>
                    <button aria-label={`删除${s.name}`} onClick={() => setItems(x => x.filter(y => y.id !== s.id))}><X className="size-4 text-muted-foreground" /></button>
                  </div>
                  {s.checked && <button className="ml-9 mt-3 text-xs font-medium text-primary" onClick={() => stock(s)}>加入食材库存</button>}
                </article>
              ))}
            </div>}
      </div>
    </>
  )
}

function ShopForm({ initial, close, save, notify }: { initial?: ShoppingItem; close: () => void; save: (s: ShopDraft) => void; notify: (s: string) => void }) {
  const [f, setF] = useState<ShoppingItem>(initial ?? { id: uid(), name: '', normalizedName: '', quantity: 1, unit: '个', checked: false, source: '手动添加' })
  // 数字输入用字符串暂存，允许清空重填；保存时统一校验
  const [qtyText, setQtyText] = useState(String(initial?.quantity ?? 1))
  const saveIt = () => {
    if (!f.name.trim()) return notify('请填写采购项名称')
    const qty = +qtyText
    if (!qtyText.trim() || Number.isNaN(qty) || qty <= 0) return notify('请填写数量（需大于 0）')
    save({ name: f.name.trim(), normalizedName: normalize(f.name.trim()), quantity: qty, unit: f.unit, source: f.source })
  }
  return (
    <Sheet title={initial ? '编辑采购项' : '添加采购项'} close={close}>
      <div className="flex flex-col gap-4">
        <label className="text-sm">名称<input autoFocus className={`${field} mt-2`} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">数量<input inputMode="decimal" className={`${field} mt-2`} value={qtyText} onChange={e => setQtyText(e.target.value)} /></label>
          <label className="text-sm">单位<select className={`${field} mt-2`} value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}>{UNITS.map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <button className={primary} onClick={saveIt}>保存</button>
      </div>
    </Sheet>
  )
}

// 采购清单重复项合并弹窗：合并数量 或 保留原数量
function MergeDlg({ dlg, setChoices, cancel, ok }: { dlg: { conflicts: { draft: ShopDraft; existing: ShoppingItem }[]; choices: boolean[] }; setChoices: (c: boolean[]) => void; cancel: () => void; ok: () => void }) {
  return (
    <div className="absolute inset-0 z-[75] flex items-center justify-center bg-foreground/35 p-6">
      <div className="flex max-h-[85%] w-full flex-col overflow-y-auto rounded-2xl bg-background p-5 shadow-xl">
        <h2 className="font-bold">采购清单中已有以下食材</h2>
        <div className="mt-3 flex flex-col gap-3">
          {dlg.conflicts.map((c, i) => (
            <div key={c.existing.id} className="rounded-xl border p-3">
              <p className="text-sm font-semibold">{c.draft.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">清单已有 {c.existing.quantity}{c.existing.unit}，本次加入 {c.draft.quantity}{c.draft.unit}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className={`rounded-lg py-2 text-xs font-medium ${dlg.choices[i] ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => setChoices(dlg.choices.map((v, n) => n === i ? true : v))}>增加为 {c.existing.quantity + c.draft.quantity} {c.existing.unit}</button>
                <button className={`rounded-lg py-2 text-xs font-medium ${!dlg.choices[i] ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => setChoices(dlg.choices.map((v, n) => n === i ? false : v))}>保留原数量</button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className={secondary} onClick={cancel}>全部保留原数量</button>
          <button className={primary} onClick={ok}>确认</button>
        </div>
      </div>
    </div>
  )
}

function Profile({ page, setPage, favRecipes, myRecipes, favorites, stock, toggle, open, onCreate, prefs, setPrefs, ingredients, shopping, plan, onExport, onImport, onClear }: {
  page: string; setPage: (x: string) => void
  favRecipes: Recipe[]; myRecipes: Recipe[]; favorites: string[]; stock: Set<string>
  toggle: (id: string) => void; open: (id: string) => void; onCreate: () => void
  prefs: Preferences; setPrefs: Dispatch<SetStateAction<Preferences>>
  ingredients: Ingredient[]; shopping: ShoppingItem[]; plan: MealPlan
  onExport: () => void; onImport: (file: File) => void; onClear: () => void
}) {
  const [pickFor, setPickFor] = useState<'' | 'allergy' | 'avoid'>('')

  if (page === '收藏') {
    return <>
      <header className="flex items-center gap-3 px-5 pb-4 pt-7"><button onClick={() => setPage('')}><ChevronLeft /></button><h1 className="text-2xl font-bold">我的收藏</h1></header>
      {!favRecipes.length ? <Empty icon={<Heart className="size-9" />} copy="还没有收藏菜谱。" /> : <RecipeGrid items={favRecipes} favorites={favorites} open={open} toggle={toggle} stock={stock} />}
    </>
  }

  if (page === '菜谱') {
    return <>
      <header className="flex items-center gap-3 px-5 pb-4 pt-7"><button onClick={() => setPage('')}><ChevronLeft /></button><h1 className="text-2xl font-bold">我的菜谱</h1></header>
      {!myRecipes.length
        ? <Empty icon={<BookOpen className="size-9" />} copy="还没有自建菜谱，上传一道属于自己的菜谱吧。" action={<button className={primary} onClick={onCreate}>上传菜谱</button>} />
        : <>
          <RecipeGrid items={myRecipes} favorites={favorites} open={open} toggle={toggle} stock={stock} />
          <div className="px-5 pt-4"><button className={`${primary} w-full`} onClick={onCreate}><Plus className="mr-1 inline size-4" />上传菜谱</button></div>
        </>}
    </>
  }

  if (page === '忌口') {
    return <>
      <header className="flex items-center gap-3 px-5 pb-4 pt-7"><button onClick={() => setPage('')}><ChevronLeft /></button><h1 className="text-2xl font-bold">忌口 / 过敏源</h1></header>
      <div className="flex flex-col gap-6 px-5">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold">过敏源（强制排除）</h2>
            <button className="text-xs font-medium text-primary" onClick={() => setPickFor('allergy')}>+ 添加</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {prefs.allergy.length
              ? prefs.allergy.map(x => <button key={x} onClick={() => setPrefs(p => ({ ...p, allergy: p.allergy.filter(z => z !== x) }))} className="rounded-full bg-red-50 px-3 py-2 text-sm text-red-600">{x} ×</button>)
              : <p className="text-xs text-muted-foreground">未设置。设置后含该食材的菜谱将被直接隐藏。</p>}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold">忌口食材（默认不展示）</h2>
            <button className="text-xs font-medium text-primary" onClick={() => setPickFor('avoid')}>+ 添加</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {prefs.avoid.length
              ? prefs.avoid.map(x => <button key={x} onClick={() => setPrefs(p => ({ ...p, avoid: p.avoid.filter(z => z !== x) }))} className="rounded-full bg-secondary px-3 py-2 text-sm">{x} ×</button>)
              : <p className="text-xs text-muted-foreground">未设置。设置后含该食材的菜谱默认不展示。</p>}
          </div>
        </section>
        <p className="text-xs leading-5 text-muted-foreground">过敏将强制排除相关菜谱并在菜谱页提示隐藏数量；忌口菜谱默认不展示。根据菜谱中已登记的食材进行过滤，请结合实际配料自行确认。</p>
      </div>
      {pickFor && <DictPicker title={pickFor === 'allergy' ? '添加过敏源' : '添加忌口食材'} exclude={pickFor === 'allergy' ? [...prefs.allergy, ...prefs.avoid] : [...prefs.avoid, ...prefs.allergy]} close={() => setPickFor('')} onConfirm={names => { setPrefs(p => pickFor === 'allergy' ? { ...p, allergy: [...new Set([...p.allergy, ...names])] } : { ...p, avoid: [...new Set([...p.avoid, ...names])] }); setPickFor('') }} />}
    </>
  }

  if (page === '偏好') {
    return <>
      <header className="flex items-center gap-3 px-5 pb-4 pt-7"><button onClick={() => setPage('')}><ChevronLeft /></button><h1 className="text-2xl font-bold">默认饮食偏好</h1></header>
      <div className="flex flex-col gap-5 px-5">
        <Preference title="常用口味" values={FLAVORS} selected={prefs.flavors} change={x => setPrefs({ ...prefs, flavors: x })} />
        <label className="text-sm font-bold">最大做饭时间<select className={`${field} mt-2`} value={prefs.time} onChange={e => setPrefs({ ...prefs, time: e.target.value })}>{PREF_TIME_OPTIONS.map(x => <option key={x} value={x}>{x === '不限' ? '不限' : `${x} 分钟`}</option>)}</select></label>
        <Preference title="常用难度" values={DIFFICULTIES} selected={prefs.difficulty} change={x => setPrefs({ ...prefs, difficulty: x })} />
        <label className="text-sm font-bold">默认人数<input inputMode="numeric" className={`${field} mt-2`} value={prefs.people} onChange={e => setPrefs({ ...prefs, people: e.target.value })} /></label>
        <p className="text-xs leading-5 text-muted-foreground">以上偏好会作为「一键生成今日/周计划」的默认筛选条件。</p>
      </div>
    </>
  }

  if (page === '数据') {
    return <>
      <header className="flex items-center gap-3 px-5 pb-4 pt-7"><button onClick={() => setPage('')}><ChevronLeft /></button><h1 className="text-2xl font-bold">数据管理</h1></header>
      <DataManage ingredients={ingredients} myRecipes={myRecipes} favorites={favorites} plan={plan} shopping={shopping} onExport={onExport} onImport={onImport} onClear={onClear} />
    </>
  }

  return <>
    <header className="px-5 pb-5 pt-7"><p className="text-xs text-muted-foreground">你的食光档案</p><h1 className="text-2xl font-bold">我的</h1></header>
    <div className="flex flex-col gap-3 px-5">
      {[
        ['收藏', '我的收藏', `${favorites.length} 道菜谱`],
        ['菜谱', '我的菜谱', `${myRecipes.length} 道菜谱`],
        ['忌口', '忌口 / 过敏源', `${prefs.allergy.length + prefs.avoid.length} 项过滤`],
        ['偏好', '默认饮食偏好', '口味、时间与人数'],
        ['数据', '数据管理', '导出 / 导入 / 清空'],
      ].map(([key, title, sub]) => (
        <button key={key} onClick={() => setPage(key)} className="flex items-center justify-between rounded-2xl border p-4 text-left">
          <span><b className="block text-sm">{title}</b><small className="text-muted-foreground">{sub}</small></span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </button>
      ))}
    </div>
  </>
}

// 从食材字典多选过敏/忌口食材，支持自定义名称
function DictPicker({ title, exclude, close, onConfirm }: { title: string; exclude: string[]; close: () => void; onConfirm: (names: string[]) => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const excluded = useMemo(() => new Set(exclude), [exclude])
  const list = useMemo(() => searchDict(q).filter(d => !excluded.has(d.name)).slice(0, 60), [q, excluded])
  const addCustom = () => {
    const n = custom.trim()
    if (!n || excluded.has(n) || sel.includes(n)) return
    setSel(x => [...x, n]); setCustom('')
  }
  return (
    <div className="absolute inset-0 z-[70] flex items-end bg-foreground/35" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <section className="flex max-h-[85%] w-full flex-col rounded-t-3xl bg-background">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold">{title}</h2>
          <button aria-label="关闭" onClick={close}><X className="size-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input className={`${field} pl-9`} placeholder="搜索食材字典" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {sel.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{sel.map(x => <button key={x} className="rounded-full bg-primary px-3 py-1.5 text-xs text-primary-foreground" onClick={() => setSel(s => s.filter(y => y !== x))}>{x} ×</button>)}</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {list.map(d => (
              <button key={d.name} className={`rounded-full px-3 py-1.5 text-xs ${sel.includes(d.name) ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => setSel(s => s.includes(d.name) ? s.filter(y => y !== d.name) : [...s, d.name])}>{d.icon} {d.name}</button>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">字典里没有？手动添加：</p>
          <div className="mt-2 flex gap-2">
            <input className={field} placeholder="输入自定义食材名" value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCustom() }} />
            <button className={`${primary} shrink-0`} onClick={addCustom}>添加</button>
          </div>
        </div>
        <div className="border-t p-5">
          <button className={`${primary} w-full`} onClick={() => onConfirm(sel)}>确认{sel.length ? `（已选 ${sel.length} 项）` : ''}</button>
        </div>
      </section>
    </div>
  )
}

function DataManage({ ingredients, myRecipes, favorites, plan, shopping, onExport, onImport, onClear }: {
  ingredients: Ingredient[]; myRecipes: Recipe[]; favorites: string[]; plan: MealPlan; shopping: ShoppingItem[]
  onExport: () => void; onImport: (file: File) => void; onClear: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const days = Object.keys(plan).length
  const rows = [
    ['我的食材', `${ingredients.length} 种`],
    ['我的菜谱', `${myRecipes.length} 道`],
    ['收藏菜谱', `${favorites.length} 道`],
    ['饮食计划', `${days} 天`],
    ['采购清单', `${shopping.length} 项`],
  ]
  return (
    <div className="flex flex-col gap-6 px-5">
      <section>
        <h2 className="mb-3 text-sm font-bold">数据概览</h2>
        <div className="rounded-2xl border p-4">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between py-1.5 text-sm"><span className="text-muted-foreground">{k}</span><b>{v}</b></div>)}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-bold">导出数据</h2>
        <button className={`${primary} w-full`} onClick={onExport}><Download className="mr-1 inline size-4" />导出所有数据</button>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">生成 my-food-data-日期.json 备份文件，包含食材、菜谱、收藏、计划、采购与偏好。</p>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-bold">导入数据</h2>
        <button className={`${secondary} w-full`} onClick={() => fileRef.current?.click()}><Upload className="mr-1 inline size-4" />导入数据</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
      </section>
      <section>
        <h2 className="mb-3 text-sm font-bold text-destructive">危险操作</h2>
        <button className={`${dangerBtn} w-full`} onClick={onClear}>清空全部数据</button>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">系统内置菜谱不会被删除，只会删除你的本地数据。</p>
      </section>
    </div>
  )
}

function Preference({ title, values, selected, change }: { title: string; values: string[]; selected: string[]; change: (x: string[]) => void }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      <div className="flex flex-wrap gap-2">{values.map(x => <button key={x} className={`rounded-full px-4 py-2 text-sm ${selected.includes(x) ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => change(selected.includes(x) ? selected.filter(y => y !== x) : [...selected, x])}>{x}</button>)}</div>
    </section>
  )
}

type ChatMsg = {
  role: 'user' | 'assistant'
  content: string
  status?: 'streaming' | 'done' | 'error'
  retryText?: string
}

// 在 AI 回复里找出命中的本地菜谱（复用 normalize 匹配 title），供"查看菜谱"按钮使用
function findMentionedRecipes(text: string, recipes: Recipe[]): Recipe[] {
  return recipes.filter(r => r.title && text.includes(r.title))
}

function AiChat({ messages, busy, aiLocal, setAiLocal, onSend, onNewConversation, onOpenRecipe, recipes, close }: {
  messages: ChatMsg[]
  busy: boolean
  aiLocal: boolean
  setAiLocal: (x: boolean) => void
  onSend: (text: string) => void
  onNewConversation: () => void
  onOpenRecipe: (id: string) => void
  recipes: Recipe[]
  close: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const submit = () => {
    const v = inputRef.current?.value ?? ''
    if (!v.trim() || busy) return
    onSend(v)
    if (inputRef.current) inputRef.current.value = ''
  }

  const quicks = ['我晚上想用家里的东西做点清淡的，推荐一下', '优先消耗快要过期的食材', '我只有番茄和鸡蛋，能做啥']

  return (
    <Sheet title="AI 助手" close={close}>
      <div className="flex h-[70vh] flex-col">
        {/* 本地数据开关 */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">接入我的食材数据</span>
            <button className="rounded-full border px-2.5 py-1 text-[11px]" onClick={onNewConversation} disabled={busy}>新对话</button>
          </div>
          <button
            aria-label="切换接入本地数据"
            onClick={() => setAiLocal(!aiLocal)}
            className={`relative h-6 w-11 rounded-full transition-colors ${aiLocal ? 'bg-primary' : 'bg-secondary'}`}
          >
            <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${aiLocal ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="px-5 pt-1 text-[11px] text-muted-foreground">{aiLocal ? '推荐将基于你家中的食材、忌口与过敏源，优先消耗临期食材。' : '推荐将基于网络热门菜品，不读取你的本地数据。'}</div>

        {/* 消息列表 */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="rounded-2xl rounded-tl-sm bg-secondary p-3 text-sm leading-6 text-muted-foreground">你好！我是食光 AI 助手，可以帮你快速决定今天吃什么。打开上方开关，我会结合你家中的食材、忌口和过敏源来推荐。</p>
              <div className="mt-1 flex flex-wrap gap-2">{quicks.map(q => <button key={q} className="rounded-full border border-border px-3 py-1.5 text-xs" onClick={() => onSend(q)}>{q}</button>)}</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i}>
              <div className={`rounded-2xl p-3 text-sm leading-6 ${m.role === 'user' ? 'ml-8 rounded-tr-sm bg-primary text-primary-foreground' : 'mr-8 rounded-tl-sm bg-secondary'}`}>
                {m.role === 'assistant' ? <div className="whitespace-pre-wrap">{m.content || (m.status === 'streaming' ? '正在回答…' : '')}</div> : m.content}
              </div>
              {m.status === 'error' && m.retryText && (
                <button className="mt-1 text-xs text-primary underline" onClick={() => m.retryText && onSend(m.retryText)} disabled={busy}>重新发送</button>
              )}
              {m.role === 'assistant' && m.status !== 'error' && findMentionedRecipes(m.content, recipes).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {findMentionedRecipes(m.content, recipes).map(r => (
                    <button key={r.id} onClick={() => onOpenRecipe(r.id)} className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs text-primary">
                      <span>{iconFor(r.needs[0] || r.title)}</span>查看「{r.title}」
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

        </div>

        {/* 输入区 */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <input ref={inputRef} className={field} maxLength={2000} placeholder="问点什么？比如：晚上吃什么" onKeyDown={e => { if (e.key === 'Enter') submit() }} />
            <button className={`${primary} shrink-0 px-5`} onClick={submit} disabled={busy}>发送</button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
