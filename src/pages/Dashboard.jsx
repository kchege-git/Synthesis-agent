import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ── helpers ────────────────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function sevenDaysAgoIso() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

function formatDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

function fitBadge(score) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold'
  if (score >= 70) return `${base} bg-green-100 text-green-800`
  if (score >= 50) return `${base} bg-yellow-100 text-yellow-800`
  return `${base} bg-red-100 text-red-800`
}

// ── stat widget ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent, loading }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4`}>
      <div className={`flex-shrink-0 h-12 w-12 rounded-lg flex items-center justify-center text-2xl ${accent}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        {loading ? (
          <div className="mt-1 h-7 w-10 rounded bg-gray-100 animate-pulse" />
        ) : (
          <p className="text-3xl font-bold text-gray-800">{value}</p>
        )}
      </div>
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [stats, setStats]         = useState({ newOpps: 0, urgentTasks: 0, inProgress: 0, drafts: 0 })
  const [topOpps, setTopOpps]     = useState([])
  const [urgentTasks, setUrgentTasks] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const today      = todayIso()
    const sevenAgo   = sevenDaysAgoIso()

    const [
      newOppsRes,
      urgentTasksCountRes,
      inProgressRes,
      draftsRes,
      topOppsRes,
      urgentTasksRes,
    ] = await Promise.all([
      // stat 1: new opportunities this week
      supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'New')
        .gte('date_detected', sevenAgo),

      // stat 2: urgent tasks (due today or earlier, not completed)
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .lte('due_date', today)
        .neq('status', 'Completed'),

      // stat 3: in-progress applications
      supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'In Progress'),

      // stat 4: drafts generated
      supabase
        .from('application_artifacts')
        .select('id', { count: 'exact', head: true }),

      // table 1: top opportunities
      supabase
        .from('opportunities')
        .select('id, company, role_title, fit_score, recommendation')
        .eq('status', 'New')
        .gte('fit_score', 70)
        .order('fit_score', { ascending: false })
        .limit(5),

      // table 2: urgent tasks with opportunity join
      supabase
        .from('tasks')
        .select('id, task_type, due_date, status, opportunity_id, opportunities(company, role_title)')
        .lte('due_date', today)
        .neq('status', 'Completed')
        .order('due_date', { ascending: true })
        .limit(5),
    ])

    setStats({
      newOpps:     newOppsRes.count       ?? 0,
      urgentTasks: urgentTasksCountRes.count ?? 0,
      inProgress:  inProgressRes.count    ?? 0,
      drafts:      draftsRes.count        ?? 0,
    })
    setTopOpps(topOppsRes.data     ?? [])
    setUrgentTasks(urgentTasksRes.data ?? [])
    setLoading(false)
  }

  const recBadge = rec => {
    const map = {
      'Apply Now':       'bg-indigo-100 text-indigo-800',
      'Network First':   'bg-blue-100   text-blue-800',
      'Apply + Network': 'bg-purple-100 text-purple-800',
      'Deprioritize':    'bg-gray-100   text-gray-600',
    }
    const cls = map[rec] ?? 'bg-gray-100 text-gray-600'
    return `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>

      {/* ── stat widgets ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="New Opportunities this week"
          value={stats.newOpps}
          icon="🔍"
          accent="bg-indigo-50"
          loading={loading}
        />
        <StatCard
          label="Urgent Tasks"
          value={stats.urgentTasks}
          icon="⚡"
          accent="bg-red-50"
          loading={loading}
        />
        <StatCard
          label="In Progress Applications"
          value={stats.inProgress}
          icon="📋"
          accent="bg-blue-50"
          loading={loading}
        />
        <StatCard
          label="Drafts Generated"
          value={stats.drafts}
          icon="✍️"
          accent="bg-green-50"
          loading={loading}
        />
      </div>

      {/* ── tables row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top Opportunities */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700">Top Opportunities</h2>
            <Link to="/opportunities" className="text-xs text-indigo-600 hover:underline">
              View all →
            </Link>
          </div>
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : topOpps.length === 0 ? (
            <EmptyState message="No high-fit new opportunities yet." />
          ) : (
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Company / Role', 'Fit', 'Action', ''].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topOpps.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 leading-snug">{o.company}</p>
                      <p className="text-gray-500 text-xs">{o.role_title}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={fitBadge(o.fit_score)}>{o.fit_score}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={recBadge(o.recommendation)}>{o.recommendation}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <Link
                        to={`/opportunities/${o.id}`}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Detail →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Urgent Tasks */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700">Urgent Tasks</h2>
            <Link to="/tasks" className="text-xs text-indigo-600 hover:underline">
              View board →
            </Link>
          </div>
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : urgentTasks.length === 0 ? (
            <EmptyState message="No urgent tasks. You're all caught up!" />
          ) : (
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Task', 'Opportunity', 'Due'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {urgentTasks.map(t => {
                  const opp = t.opportunities
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 leading-snug">{t.task_type}</p>
                        <span className={`mt-0.5 inline-block text-xs rounded-full px-1.5 py-0.5 font-medium ${
                          t.status === 'Today' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {opp ? (
                          <Link
                            to={`/opportunities/${t.opportunity_id}`}
                            className="text-xs text-indigo-600 hover:text-indigo-800 leading-snug"
                          >
                            <p className="font-medium">{opp.company}</p>
                            <p className="text-gray-500">{opp.role_title}</p>
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-medium text-red-600">{formatDate(t.due_date)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}

// ── micro-components ───────────────────────────────────────────────────────────

function LoadingSkeleton({ rows }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  )
}

function EmptyState({ message }) {
  return <p className="text-center py-10 text-gray-400 text-sm">{message}</p>
}
