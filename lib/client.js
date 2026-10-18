// dsh-context-budget — settings page (web bundle, ModuleLoader CJS format).
// Talks to the host half over the exact same-origin route; never touches files.
const factory = (require) => {
  const module = { exports: {} }
  const exports = module.exports
  Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
  const React = require('react')

  const CSS = [
    '.cb-wrap{font-size:13px;line-height:1.65;display:flex;flex-direction:column;gap:14px;padding:4px 2px;color:inherit}',
    '.cb-title{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}',
    '.cb-title h2{margin:0;font-size:16px}',
    '.cb-sub{opacity:.72;font-size:12px}',
    '.cb-card{border:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35));border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px}',
    '.cb-totals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
    '.cb-total{border:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25));border-radius:7px;padding:9px 11px}',
    '.cb-total b{display:block;font-size:20px;line-height:1.2;font-variant-numeric:tabular-nums}',
    '.cb-total span{font-size:11px;opacity:.7}',
    '.cb-presets{display:flex;gap:8px;flex-wrap:wrap}',
    '.cb-btn{font-size:12px;padding:4px 11px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.5));background:transparent;color:inherit;cursor:pointer;white-space:nowrap}',
    '.cb-btn:hover{border-color:currentColor}',
    '.cb-btn:disabled{opacity:.45;cursor:default}',
    '.cb-btn.primary{border-color:rgba(48,120,255,.65)}',
    '.cb-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18))}',
    '.cb-row:first-of-type{border-top:0}',
    '.cb-row-main{flex:1;min-width:0}',
    '.cb-row-name{font-weight:600}',
    '.cb-row-meta{font-size:11px;opacity:.65;font-variant-numeric:tabular-nums}',
    '.cb-pill{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.5));white-space:nowrap}',
    '.cb-pill.on{background:rgba(46,160,67,.16);border-color:rgba(46,160,67,.55)}',
    '.cb-pill.off{background:rgba(128,128,128,.12)}',
    '.cb-pill.core{opacity:.6}',
    '.cb-note{font-size:11px;opacity:.7;line-height:1.55}',
    '.cb-warn{color:rgba(219,154,4,.95)}',
    '.cb-msg{padding:8px 10px;border-radius:6px;font-size:12px}',
    '.cb-msg.ok{background:rgba(46,160,67,.14);border:1px solid rgba(46,160,67,.4)}',
    '.cb-msg.err{background:rgba(248,81,73,.14);border:1px solid rgba(248,81,73,.4)}',
  ].join('')

  function ensureCss() {
    if (typeof document === 'undefined') return
    if (document.querySelector('style[data-plugin-css="dsh-context-budget"]')) return
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-context-budget'
    tag.dataset.pluginCss = 'dsh-context-budget'
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  function api(op, args) {
    return fetch('/dsh-context-budget/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-plugin': 'dsh-context-budget' },
      body: JSON.stringify({ op, args: args || {} }),
    }).then(r => r.json()).catch(e => ({ ok: false, error: String((e && e.message) || e) }))
  }

  const fmt = (n) => {
    const v = Number(n) || 0
    return v >= 10000 ? (v / 10000).toFixed(1) + '万' : String(Math.round(v))
  }

  // `Page` is defined before `apply(ctx)` runs; the plugin context is only
  // available there, so keep a module-local handle instead of closing over
  // the apply parameter (which is undefined at render time).
  let pageCtx = null

  class PageBoundary extends React.Component {
    constructor(props) {
      super(props)
      this.state = { error: null }
    }
    static getDerivedStateFromError(error) {
      return { error }
    }
    render() {
      if (this.state.error) {
        return React.createElement('div', { className: 'cb-wrap' },
          React.createElement('div', { className: 'cb-title' }, React.createElement('h2', null, '上下文预算')),
          React.createElement('div', { className: 'cb-msg err' },
            '页面加载失败：' + String((this.state.error && this.state.error.message) || this.state.error)))
      }
      return this.props.children
    }
  }

  function Page() {
    const [status, setStatus] = React.useState(null)
    const [error, setError] = React.useState(null)
    const [busy, setBusy] = React.useState(false)
    const [msg, setMsg] = React.useState(null)

    const refresh = () => {
      api('status').then(res => {
        if (res && res.ok) {
          setStatus(res)
          setError(null)
        } else {
          setError((res && res.error) || '加载失败')
        }
      })
    }

    React.useEffect(() => { refresh() }, [])
    React.useEffect(() => pageCtx.interval(refresh, 5000), [])
    React.useEffect(() => {
      if (!msg) return
      return pageCtx.timeout(() => setMsg(null), 3000)
    }, [msg])

    const apply = (disabled) => {
      setBusy(true)
      setMsg(null)
      api('set', { disabled }).then(res => {
        if (res && res.ok) {
          setStatus(res)
          setMsg({ kind: 'ok', text: '已应用，下一次请求生效' })
        } else {
          setMsg({ kind: 'err', text: (res && res.error) || '应用失败' })
        }
      }).then(() => setBusy(false))
    }

    if (!status) {
      return React.createElement('div', { className: 'cb-wrap' },
        React.createElement('div', { className: 'cb-title' }, React.createElement('h2', null, '上下文预算')),
        error ? React.createElement('div', { className: 'cb-msg err' }, error) : React.createElement('div', { className: 'cb-sub' }, '加载中…'))
    }

    const disabled = status.disabled || []
    const groups = (status.groups || []).filter(g => g.toggle !== false)
    const core = (status.groups || []).find(g => g.id === 'core')
    const toggle = (id) => {
      const next = disabled.includes(id) ? disabled.filter(x => x !== id) : disabled.concat(id)
      apply(next)
    }
    const preset = (ids) => apply(ids)

    return React.createElement('div', { className: 'cb-wrap' },
      React.createElement('div', { className: 'cb-title' },
        React.createElement('h2', null, '上下文预算'),
        React.createElement('span', { className: 'cb-sub' }, '即时隐藏工具 schema，不改配置、不重启、不停止 MCP 进程')),
      msg ? React.createElement('div', { className: 'cb-msg ' + msg.kind }, msg.text) : null,
      React.createElement('div', { className: 'cb-card' },
        React.createElement('div', { className: 'cb-totals' },
          React.createElement('div', { className: 'cb-total' },
            React.createElement('b', null, fmt(status.totals.full)), React.createElement('span', null, '完整工具 + Skill 目录（约 tokens）')),
          React.createElement('div', { className: 'cb-total' },
            React.createElement('b', null, fmt(status.totals.current)), React.createElement('span', null, '当前生效（约 tokens）')),
          React.createElement('div', { className: 'cb-total' },
            React.createElement('b', null, fmt(status.totals.saved)), React.createElement('span', null, '已节省（约 tokens）'))),
        React.createElement('div', { className: 'cb-presets' },
          React.createElement('button', { className: 'cb-btn primary', disabled: busy, onClick: () => preset([]) }, '全部显示'),
          React.createElement('button', { className: 'cb-btn', disabled: busy, onClick: () => preset(['rea']) }, '只关 REA'),
          React.createElement('button', { className: 'cb-btn', disabled: busy, onClick: () => preset(['rea', 'mcp_other']) }, 'MCP 全关'),
          React.createElement('button', { className: 'cb-btn', disabled: busy, onClick: () => preset(['rea', 'mcp_other', 'skills', 'memory', 'schedule']) }, '精简模式'))),
      React.createElement('div', { className: 'cb-card' },
        React.createElement('div', { className: 'cb-row' },
          React.createElement('div', { className: 'cb-row-main' },
            React.createElement('div', { className: 'cb-row-name' }, '核心工具'),
            React.createElement('div', { className: 'cb-row-meta' }, (core ? core.count : 0) + ' 个，约 ' + fmt(core ? core.tokens : 0) + ' tokens，始终保留')),
          React.createElement('span', { className: 'cb-pill core' }, '只读')),
        groups.map(g => {
          const off = disabled.includes(g.id)
          return React.createElement('div', { className: 'cb-row', key: g.id },
            React.createElement('div', { className: 'cb-row-main' },
              React.createElement('div', { className: 'cb-row-name' }, g.label),
              React.createElement('div', { className: 'cb-row-meta' }, g.count + ' 个工具' + (g.id === 'skills' && status.catalogTokens ? ' / 目录约 ' + fmt(status.catalogTokens) + ' tokens' : '') + ' / 约 ' + fmt(g.tokens) + ' tokens')),
            React.createElement('span', { className: 'cb-pill ' + (off ? 'off' : 'on') }, off ? '已隐藏' : '生效中'),
            React.createElement('button', { className: 'cb-btn', disabled: busy, onClick: () => toggle(g.id) }, off ? '恢复' : '隐藏'))
        })),
      React.createElement('div', { className: 'cb-note' },
        '作用范围：所有会话与子代理，在下一次请求组装前生效。Skill 组的“隐藏”会连同 skill 目录一起停用；MCP 进程仍然存活，恢复时无需重连。',
        React.createElement('br'),
        'token 数为按工具 JSON schema 与 Skill 描述估算，实际以模型分词器为准。',
        status.scoped ? React.createElement('span', { className: 'cb-warn' },
          React.createElement('br'),
          '注意：约 ' + status.scoped + ' 个工具由动态 MCP 插件注册在会话作用域，restrict 无法隐藏它们；请用对应插件的 unload 控制。') : null))
  }

  module.exports = {
    name: 'dsh-context-budget-client',
    inject: ['timer'],
    apply(ctx) {
      pageCtx = ctx
      ensureCss()
      const slots = ctx.get('slots')
      if (!slots) return
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'context-budget', order: 18, label: '上下文预算' },
        () => React.createElement(PageBoundary, null, React.createElement(Page))))
    },
  }
  return module.exports
}

if (typeof window !== 'undefined' && window.__ModuleLoader__) {
  window.__ModuleLoader__.load({ id: 'dsh-context-budget', factory })
}
