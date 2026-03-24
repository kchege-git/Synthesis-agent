import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const COLUMNS = ['Today', 'This Week', 'Deferred', 'Completed']

const COLUMN_STYLES = {
  'Today':     { header: 'bg-indigo-600 text-white',         dot: 'bg-indigo-400' },
  'This Week': { header: 'bg-blue-500   text-white',         dot: 'bg-blue-300'   },
  'Deferred':  { header: 'bg-gray-400   text-white',         dot: 'bg-gray-300'   },
  'Completed': { header: 'bg-green-600  text-white',         dot: 'bg-green-400'  },
}

const inputCls   = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
const btnPrimary = 'inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50'

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-current" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function formatDate(d) {
  if (!d) return null
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

export default function Tasks() {
  const [tasks, setTasks]               = useState([])
  const [opportunities, setOpportunities] = useState([])
  const [loading, setLoading]           = useState(true)

  // modal state
  const [showModal, setShowModal] = useState(false)
  const [oppId, setOppId]         = useState('')
  const [taskType, setTaskType]   = useState('')
  const [dueDate, setDueDate]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [modalError, setModalError] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [tasksRes, oppsRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('*, opportunities(company, role_title)')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('opportunities')
        .select('id, company, role_title')
        .order('date_detected', { ascending: false }),
    ])
    if (!tasksRes.error)  setTasks(tasksRes.data ?? [])
    if (!oppsRes.error)   setOpportunities(oppsRes.data ?? [])
    setLoading(false)
  }

  async function handleStatusChange(taskId, newStatus) {
    // optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
  }

  async function handleAddTask(e) {
    e.preventDefault()
    if (!taskType.trim()) { setModalError('Task type is required.'); return }
    setSaving(true); setModalError(null)
    const { error } = await supabase.from('tasks').insert({
      opportunity_id: oppId || null,
      task_type:      taskType.trim(),
      due_date:       dueDate || null,
      status:         'Today',
    })
    if (error) { setModalError(`Failed to save: ${error.message}`); setSaving(false); return }
    setShowModal(false)
    setOppId(''); setTaskType(''); setDueDate('')
    setSaving(false)
    await loadAll()
  }

  function closeModal() {
    setShowModal(false)
    setOppId(''); setTaskType(''); setDueDate(''); setModalError(null)
  }

  const byColumn = col => tasks.filter(t => (t.status ?? 'Today') === col)

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* header row */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Tasks</h1>
        <button onClick={() => setShowModal(true)} className={btnPrimary}>
          + Add Task
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-16 justify-center">
          <Spinner /> Loading…
        </div>
      ) : (
        /* ── kanban board ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {COLUMNS.map(col => {
            const colTasks = byColumn(col)
            const { header, dot } = COLUMN_STYLES[col]
            return (
              <div key={col} className="flex flex-col rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-50">
                {/* column header */}
                <div className={`${header} px-4 py-3 flex items-center justify-between`}>
                  <span className="font-semibold text-sm">{col}</span>
                  <span className="text-xs font-medium opacity-80 bg-white/20 rounded-full px-2 py-0.5">
                    {colTasks.length}
                  </span>
                </div>

                {/* cards */}
                <div className="flex flex-col gap-3 p-3 min-h-[120px]">
                  {colTasks.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">No tasks</p>
                  )}
                  {colTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      dot={dot}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add Task modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Add Task</h3>
            <form onSubmit={handleAddTask} className="space-y-4">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opportunity <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  value={oppId}
                  onChange={e => setOppId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— No linked opportunity —</option>
                  {opportunities.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.company} — {o.role_title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task type</label>
                <input
                  type="text"
                  value={taskType}
                  onChange={e => { setTaskType(e.target.value); setModalError(null) }}
                  placeholder="e.g. Send follow-up email"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className={inputCls}
                />
              </div>

              {modalError && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className={btnPrimary}>
                  {saving ? <><Spinner /> Saving…</> : 'Save task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── task card ──────────────────────────────────────────────────────────────────

function TaskCard({ task, dot, onStatusChange }) {
  const opp     = task.opportunities
  const company = opp?.company   ?? '—'
  const role    = opp?.role_title ?? '—'

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 space-y-2">
      {/* company + role */}
      {task.opportunity_id ? (
        <Link
          to={`/opportunities/${task.opportunity_id}`}
          className="block text-xs font-semibold text-indigo-600 hover:text-indigo-800 leading-snug"
        >
          {company}
          <span className="block font-normal text-gray-500">{role}</span>
        </Link>
      ) : (
        <div className="text-xs text-gray-400 italic">No linked opportunity</div>
      )}

      {/* task type */}
      <p className="text-sm font-medium text-gray-800 leading-snug">{task.task_type}</p>

      {/* due date */}
      {task.due_date && (
        <p className="text-xs text-gray-400">Due {formatDate(task.due_date)}</p>
      )}

      {/* status dropdown */}
      <select
        value={task.status ?? 'Today'}
        onChange={e => onStatusChange(task.id, e.target.value)}
        className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      >
        {COLUMNS.map(s => <option key={s}>{s}</option>)}
      </select>
    </div>
  )
}
