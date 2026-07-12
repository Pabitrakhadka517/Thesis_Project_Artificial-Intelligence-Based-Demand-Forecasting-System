import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useSelector } from 'react-redux'
import {
  Bot, Send, Trash2, Download, Sparkles, Package,
  TrendingUp, ShoppingCart, BarChart2, Truck, Bell,
  AlertTriangle, RefreshCw, ChevronRight, Zap, X,
  ClipboardList, DollarSign, Activity,
} from 'lucide-react'
import { chatService } from '@/services/chatService'
import { selectUser }  from '@/store/slices/authSlice'
import { Card }        from '@/components/common/Card'

// ── Markdown-style renderer ───────────────────────────────────────────────────

function renderInline(text) {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function renderTable(rows, key) {
  if (rows.length < 2) return null
  const headers = rows[0].split('|').map(c => c.trim()).filter(Boolean)
  const body    = rows.slice(2).map(r => r.split('|').map(c => c.trim()).filter(Boolean))
  return (
    <div key={key} className="overflow-x-auto my-2 rounded-lg" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr style={{ background: 'var(--surface-muted)' }}>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: ri < body.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AIText({ text }) {
  if (!text) return null

  const lines   = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '8px 0' }} />)
      i++
      continue
    }

    // Markdown table — collect consecutive pipe rows
    if (line.trim().startsWith('|')) {
      const tableRows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableRows.push(lines[i])
        i++
      }
      elements.push(renderTable(tableRows, `table-${i}`))
      continue
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />)
    } else if (/^#{1,3}\s/.test(line)) {
      const level   = (line.match(/^(#{1,3})/)?.[1] || '#').length
      const content = line.replace(/^#{1,3}\s/, '')
      const sizes   = ['text-[15px]', 'text-[13px]', 'text-[12px]']
      elements.push(
        <p key={i} className={`font-bold ${sizes[level - 1] || 'text-[13px]'} mt-3 mb-1`} style={{ color: 'var(--text-primary)' }}>
          {renderInline(content)}
        </p>
      )
    } else if (/^[📦📈⚠️🛒💰💡🔴🟡🟢🔵✅❌•\-\*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const [prefix, ...rest] = line.split(/\s(.+)/)
      elements.push(
        <div key={i} className="flex gap-2 text-[12px] leading-snug">
          <span className="shrink-0" style={{ color: 'var(--text-secondary)' }}>{prefix}</span>
          <span style={{ color: 'var(--text-secondary)' }}>{renderInline(rest.join('') || '')}</span>
        </div>
      )
    } else if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
      elements.push(
        <p key={i} className="font-semibold text-[13px]" style={{ color: 'var(--text-primary)' }}>
          {line.replace(/\*\*/g, '')}
        </p>
      )
    } else {
      elements.push(
        <p key={i} className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {renderInline(line)}
        </p>
      )
    }
    i++
  }

  return <div className="space-y-1">{elements}</div>
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg,#6D28D9,#8B5CF6)' }}>
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map(i => (
            <motion.span key={i} className="h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--brand-purple)' }}
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Single chat message ────────────────────────────────────────────────────────

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex justify-end"
      >
        <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-tr-sm text-[13px] leading-relaxed"
          style={{
            background:  'linear-gradient(135deg,var(--brand-primary),#0353A4)',
            color:       '#fff',
            boxShadow:   '0 2px 8px rgba(3,4,94,.35)',
          }}>
          {msg.content}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3"
    >
      <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: 'linear-gradient(135deg,#6D28D9,#8B5CF6)' }}>
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="px-4 py-3 rounded-2xl rounded-tl-sm"
          style={{
            background:  'var(--surface-card)',
            border:      '1px solid var(--border)',
            boxShadow:   'var(--shadow-sm)',
          }}>
          <AIText text={msg.content} />
        </div>

        {/* Recommendations chips */}
        {msg.recommendations?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 ml-1">
            {msg.recommendations.slice(0, 3).map((r, i) => (
              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                style={{
                  background: r.priority === 'high' ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)',
                  color:      r.priority === 'high' ? '#EF4444' : '#F59E0B',
                  border:     `1px solid ${r.priority === 'high' ? 'rgba(239,68,68,.25)' : 'rgba(245,158,11,.25)'}`,
                }}>
                {r.priority === 'high' ? '🔴' : '🟡'} {r.product}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1.5 ml-1">
          {msg.timestamp && (
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {msg.source && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{
              background: msg.source === 'llm'   ? 'rgba(139,92,246,.12)'
                        : msg.source === 'cache' ? 'rgba(34,197,94,.10)'
                        : 'rgba(59,130,246,.10)',
              color:      msg.source === 'llm'   ? '#8B5CF6'
                        : msg.source === 'cache' ? '#22C55E'
                        : '#3B82F6',
            }}>
              {msg.source === 'llm' ? '✨ AI Enhanced' : msg.source === 'cache' ? '⚡ Cached' : '📊 Local BI'}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Insight card ──────────────────────────────────────────────────────────────

const INSIGHT_COLORS = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.2)',  icon: AlertTriangle },
  warning:  { color: '#F59E0B', bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.2)', icon: Package },
  forecast: { color: '#8B5CF6', bg: 'rgba(139,92,246,.08)', border: 'rgba(139,92,246,.2)', icon: TrendingUp },
  info:     { color: '#3B82F6', bg: 'rgba(59,130,246,.08)', border: 'rgba(59,130,246,.2)', icon: Bell },
}

function InsightCard({ insight, onAsk }) {
  const s  = INSIGHT_COLORS[insight.type] || INSIGHT_COLORS.info
  const Ic = s.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-3 cursor-pointer group transition-all"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
      onClick={() => onAsk(`Tell me more about: ${insight.title} — ${insight.product || ''}`)}
    >
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: `${s.color}20` }}>
          <Ic className="h-3.5 w-3.5" style={{ color: s.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold leading-tight" style={{ color: s.color }}>
            {insight.title}
          </p>
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
            {insight.message}
          </p>
          {insight.action && (
            <p className="text-[10px] mt-1 font-medium flex items-center gap-1"
              style={{ color: s.color }}>
              {insight.action} <ChevronRight className="h-3 w-3" />
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: Package,      label: 'Low Stock',     color: '#EF4444', bg: 'rgba(239,68,68,.1)',   q: 'Which products are low in stock right now?' },
  { icon: TrendingUp,   label: 'Demand Fcst',   color: '#8B5CF6', bg: 'rgba(139,92,246,.1)',  q: 'Show demand forecast for the next 30 days.' },
  { icon: ShoppingCart, label: 'Purchase Rec',  color: '#3B82F6', bg: 'rgba(59,130,246,.1)',  q: 'What should I purchase today?' },
  { icon: Activity,     label: 'Inv. Health',   color: '#22C55E', bg: 'rgba(34,197,94,.1)',   q: 'Show inventory health summary.' },
  { icon: BarChart2,    label: 'Sales Summary', color: '#F59E0B', bg: 'rgba(245,158,11,.1)',  q: 'What were the sales this month?' },
  { icon: Truck,        label: 'Suppliers',     color: '#06B6D4', bg: 'rgba(6,182,212,.1)',   q: 'Which supplier has the best performance?' },
  { icon: Sparkles,     label: 'AI Insights',   color: '#EC4899', bg: 'rgba(236,72,153,.1)',  q: 'Give me AI insights and recommendations for today.' },
  { icon: ClipboardList,label: 'Fcst Accuracy', color: '#14B8A6', bg: 'rgba(20,184,166,.1)',  q: 'Show forecast accuracy metrics for trained models.' },
]

function QuickAction({ action, onClick }) {
  const Ic = action.icon
  return (
    <button
      onClick={() => onClick(action.q)}
      className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all hover:scale-105 active:scale-95"
      style={{
        background: action.bg,
        border:     `1px solid ${action.color}25`,
        minWidth:   0,
      }}
    >
      <div className="h-8 w-8 rounded-lg flex items-center justify-center"
        style={{ background: `${action.color}20` }}>
        <Ic className="h-4 w-4" style={{ color: action.color }} />
      </div>
      <span className="text-[10px] font-semibold leading-tight" style={{ color: action.color }}>
        {action.label}
      </span>
    </button>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyChat({ onAsk }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
      <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'linear-gradient(135deg,#6D28D9,#8B5CF6)', boxShadow: '0 8px 24px rgba(139,92,246,.35)' }}>
        <Bot className="h-8 w-8 text-white" />
      </div>
      <h2 className="text-[18px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        StockWise AI Assistant
      </h2>
      <p className="text-[13px] mb-6 max-w-xs" style={{ color: 'var(--text-muted)' }}>
        Ask me anything about inventory, demand forecasts, purchase decisions, or supplier performance.
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
        {[
          'Which products are low in stock?',
          'What should I purchase today?',
          'Show demand forecast for rice.',
          'Which supplier is most reliable?',
        ].map((q, i) => (
          <button key={i} onClick={() => onAsk(q)}
            className="text-[11px] px-3 py-2 rounded-lg text-left transition-colors"
            style={{
              background: 'var(--surface-muted)',
              border:     '1px solid var(--border)',
              color:      'var(--text-secondary)',
            }}>
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Export conversation ────────────────────────────────────────────────────────

function exportChat(messages) {
  const lines = messages.map(m => {
    const time = m.timestamp ? new Date(m.timestamp).toLocaleString() : ''
    const role = m.role === 'user' ? 'You' : 'StockWise AI'
    return `[${time}] ${role}:\n${m.content}\n`
  })
  const blob = new Blob([lines.join('\n---\n\n')], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `stockwise-chat-${new Date().toISOString().split('T')[0]}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIAssistantPage() {
  const user        = useSelector(selectUser)
  const queryClient = useQueryClient()

  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState('')
  const [isTyping,   setIsTyping]   = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Load chat history on mount
  const { isLoading: historyLoading } = useQuery({
    queryKey: ['chat-history'],
    queryFn:  async () => {
      const res = await chatService.getHistory(50)
      const msgs = res.data?.data?.messages || []
      if (msgs.length && !historyLoaded) {
        setMessages(msgs.map(m => ({ ...m, id: Math.random() })))
        setHistoryLoaded(true)
      }
      return msgs
    },
    staleTime: Infinity,
    retry: false,
  })

  // Suggestions
  const { data: suggestionsData } = useQuery({
    queryKey: ['chat-suggestions'],
    queryFn:  async () => {
      const res = await chatService.getSuggestions()
      return res.data?.data?.suggestions || res.data?.suggestions || []
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const suggestions = suggestionsData || []

  // Proactive insights
  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ['chat-insights'],
    queryFn:  async () => {
      const res = await chatService.getInsights()
      return res.data?.data?.insights || res.data?.insights || []
    },
    staleTime: 2 * 60 * 1000,
    retry: false,
  })
  const insights = insightsData || []

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (message) => chatService.sendMessage(message),
    onMutate: (message) => {
      const userMsg = { id: Date.now(), role: 'user', content: message, timestamp: new Date().toISOString() }
      setMessages(prev => [...prev, userMsg])
      setIsTyping(true)
    },
    onSuccess: (res) => {
      const d = res.data?.data || res.data
      const aiMsg = {
        id:              Date.now() + 1,
        role:            'assistant',
        content:         d.response || 'No response received.',
        insights:        d.insights        || [],
        recommendations: d.recommendations || [],
        source:          d.source || 'local',
        timestamp:       new Date().toISOString(),
      }
      setMessages(prev => [...prev, aiMsg])
      setIsTyping(false)
    },
    onError: () => {
      const errMsg = {
        id:        Date.now() + 1,
        role:      'assistant',
        content:   '⚠️ Unable to reach the AI service. Please check your connection and try again.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errMsg])
      setIsTyping(false)
    },
  })

  const handleSend = useCallback(() => {
    const msg = input.trim()
    if (!msg || sendMutation.isPending) return
    setInput('')
    textareaRef.current?.focus()
    sendMutation.mutate(msg)
  }, [input, sendMutation])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleQuickAsk = useCallback((q) => {
    if (sendMutation.isPending) return
    sendMutation.mutate(q)
  }, [sendMutation])

  const handleClear = async () => {
    try {
      await chatService.clearHistory()
      setMessages([])
      queryClient.invalidateQueries({ queryKey: ['chat-history'] })
    } catch {
      // silent
    }
  }

  const isBusy = sendMutation.isPending || isTyping

  return (
    <div className="page-enter h-full flex flex-col gap-4" style={{ maxHeight: 'calc(100vh - 96px)' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#6D28D9,#8B5CF6)', boxShadow: '0 4px 14px rgba(139,92,246,.4)' }}>
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
              AI Inventory Assistant
            </h1>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Local BI Engine · Always-on · AI Enhanced
            </p>
          </div>
          <span className="ai-badge ml-2">AI</span>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <>
              <button
                onClick={() => exportChat(messages)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <Download className="h-3.5 w-3.5" /> Export
              </button>
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#EF4444' }}>
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Body: chat + sidebar ── */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── Chat panel ── */}
        <div className="flex flex-col flex-1 min-w-0 rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>

          {/* Quick actions bar */}
          <div className="shrink-0 px-4 pt-4 pb-3"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Quick Actions
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {QUICK_ACTIONS.map((a, i) => (
                <QuickAction key={i} action={a} onClick={handleQuickAsk} />
              ))}
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {historyLoading && (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            )}

            {!historyLoading && messages.length === 0 && (
              <EmptyChat onAsk={handleQuickAsk} />
            )}

            <AnimatePresence initial={false}>
              {messages.map(msg => (
                <ChatMessage key={msg.id || msg.timestamp} msg={msg} />
              ))}
            </AnimatePresence>

            {isTyping && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="shrink-0 p-4"
            style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={isBusy}
                  placeholder="Ask about inventory, demand forecast, purchase decisions…"
                  className="w-full resize-none rounded-xl px-4 py-3 text-[13px] outline-none transition-all"
                  style={{
                    background:  'var(--surface-input)',
                    border:      '1px solid var(--border)',
                    color:       'var(--text-primary)',
                    minHeight:   44,
                    maxHeight:   120,
                    lineHeight:  '1.5',
                    boxShadow:   'inset 0 1px 2px rgba(0,0,0,.04)',
                  }}
                  onInput={e => {
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                  }}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isBusy}
                className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg,#6D28D9,#8B5CF6)',
                  boxShadow:  '0 2px 8px rgba(139,92,246,.4)',
                }}>
                {isBusy
                  ? <RefreshCw className="h-4 w-4 text-white animate-spin" />
                  : <Send className="h-4 w-4 text-white" />
                }
              </button>
            </div>
            <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
              Enter to send · Shift+Enter for new line · AI responses use real business data
            </p>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: '100%' }}>

          {/* AI Insights */}
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4" style={{ color: '#F59E0B' }} />
              <p className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>
                AI Insights
              </p>
              {insightsLoading && <RefreshCw className="h-3 w-3 animate-spin ml-auto" style={{ color: 'var(--text-muted)' }} />}
            </div>

            {!insightsLoading && insights.length === 0 && (
              <p className="text-[11px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
                No critical issues detected.
              </p>
            )}

            <div className="space-y-2">
              <AnimatePresence>
                {insights.map((ins, i) => (
                  <InsightCard key={i} insight={ins} onAsk={handleQuickAsk} />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Suggested questions */}
          <div className="rounded-2xl p-4"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4" style={{ color: '#8B5CF6' }} />
              <p className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Suggested Questions
              </p>
            </div>
            <div className="space-y-1.5">
              {(suggestions.length ? suggestions : [
                'Which products are low in stock?',
                'What should I purchase today?',
                'Show inventory health summary.',
              ]).slice(0, 8).map((q, i) => (
                <button key={i} onClick={() => handleQuickAsk(q)} disabled={isBusy}
                  className="w-full text-left text-[11px] px-3 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                  style={{
                    background: 'var(--surface-muted)',
                    border:     '1px solid var(--border-subtle)',
                    color:      'var(--text-secondary)',
                  }}>
                  <ChevronRight className="h-3 w-3 shrink-0" style={{ color: 'var(--brand-purple)' }} />
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* User role badge */}
          <div className="rounded-2xl p-4"
            style={{ background: 'linear-gradient(135deg,rgba(109,40,217,.08),rgba(139,92,246,.04))', border: '1px solid rgba(139,92,246,.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Bot className="h-4 w-4" style={{ color: '#8B5CF6' }} />
              <p className="text-[12px] font-bold" style={{ color: '#8B5CF6' }}>Context</p>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Responses are tailored for your role:
            </p>
            <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize"
              style={{ background: 'rgba(139,92,246,.15)', color: '#8B5CF6' }}>
              <Sparkles className="h-3 w-3" />
              {user?.role?.replace('_', ' ') || 'Staff'}
            </span>
            <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
              Answers come from a local BI engine using real MongoDB data — no internet required. AI polishes the wording when available.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
