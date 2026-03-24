import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STATUSES = ['New', 'In Progress', 'Applied', 'Deferred', 'Deprioritized']

// ── shared helpers ─────────────────────────────────────────────────────────────

function fitBadge(score) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold'
  if (score >= 70) return `${base} bg-green-100 text-green-800`
  if (score >= 50) return `${base} bg-yellow-100 text-yellow-800`
  return `${base} bg-red-100 text-red-800`
}

function recBadge(rec) {
  const map = {
    'Apply Now':       'bg-indigo-100 text-indigo-800',
    'Network First':   'bg-blue-100   text-blue-800',
    'Apply + Network': 'bg-purple-100 text-purple-800',
    'Deprioritize':    'bg-gray-100   text-gray-600',
  }
  const colour = map[rec] ?? 'bg-gray-100 text-gray-600'
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colour}`
}

function buildProfileSummary(p) {
  return [
    p.name             && `Name: ${p.name}`,
    p.school           && `School/Employer: ${p.school}`,
    p.target_roles     && `Target roles: ${p.target_roles}`,
    p.target_locations && `Target locations: ${p.target_locations}`,
    p.priorities       && `Priorities: ${p.priorities}`,
    p.constraints      && `Constraints: ${p.constraints}`,
    p.resume_text      && `Resume:\n${p.resume_text}`,
    p.cover_letter_sample && `Sample cover letter:\n${p.cover_letter_sample}`,
    p.story_bank       && `Story bank:\n${p.story_bank}`,
  ].filter(Boolean).join('\n\n')
}

async function callClaude(apiKey, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API error (HTTP ${res.status}): ${body}`)
  }
  const json = await res.json()
  return json.content?.[0]?.text ?? ''
}

// ── sub-components ─────────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-700">{label}</h2>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  )
}

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 whitespace-pre-wrap">
      {message}
    </div>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-50"
    >
      {copied ? 'Copied!' : 'Copy to clipboard'}
    </button>
  )
}

function Spinner({ small } = {}) {
  const size = small ? 'h-3 w-3' : 'h-4 w-4'
  return (
    <svg className={`${size} animate-spin text-current`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

const inputCls  = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
const btnPrimary = 'inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50'

// ── main component ─────────────────────────────────────────────────────────────

export default function OpportunityDetail() {
  const { id } = useParams()

  const [opp, setOpp]           = useState(null)
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)

  // editable fields
  const [status, setStatus] = useState('New')
  const [notes, setNotes]   = useState('')
  const [jdText, setJdText] = useState('')

  // task modal
  const [showModal, setShowModal]   = useState(false)
  const [taskType, setTaskType]     = useState('')
  const [taskDue, setTaskDue]       = useState('')
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskError, setTaskError]   = useState(null)

  // section C
  const [coverContent, setCoverContent]   = useState('')
  const [coverArtId, setCoverArtId]       = useState(null)
  const [coverLoading, setCoverLoading]   = useState(false)
  const [coverError, setCoverError]       = useState(null)

  // section D — each item: { id, question_text, content, loading, error }
  const [shortAnswers, setShortAnswers] = useState([])
  const [newQuestion, setNewQuestion]   = useState('')
  const [draftingNew, setDraftingNew]   = useState(false)
  const [newQError, setNewQError]       = useState(null)

  // section E
  const [cvContent, setCvContent] = useState('')
  const [cvLoading, setCvLoading] = useState(false)
  const [cvError, setCvError]     = useState(null)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    setLoadError(null)
    const [oppRes, artRes] = await Promise.all([
      supabase.from('opportunities').select('*').eq('id', id).single(),
      supabase.from('application_artifacts').select('*').eq('opportunity_id', id).order('created_at'),
    ])
    if (oppRes.error) { setLoadError(`Could not load opportunity: ${oppRes.error.message}`); setLoading(false); return }
    const o = oppRes.data
    setOpp(o)
    setStatus(o.status ?? 'New')
    setNotes(o.notes ?? '')
    setJdText(o.jd_text ?? '')

    if (!artRes.error) {
      const arts = artRes.data ?? []
      const cover = arts.find(a => a.artifact_type === 'cover_letter')
      if (cover) { setCoverContent(cover.content ?? ''); setCoverArtId(cover.id) }
      setShortAnswers(
        arts
          .filter(a => a.artifact_type === 'short_answer')
          .map(a => ({ id: a.id, question_text: a.question_text ?? '', content: a.content ?? '', loading: false, error: null }))
      )
    }
    setLoading(false)
  }

  async function fetchProfile() {
    const { data, error } = await supabase.from('user_profile').select('*').eq('id', 1).maybeSingle()
    if (error || !data) throw new Error('Could not load user profile.')
    if (!data.anthropic_api_key) throw new Error('No Anthropic API key found. Please add it in Settings.')
    return data
  }

  // ── section A handlers ──────────────────────────────────────────────────────

  async function handleStatusChange(val) {
    setStatus(val)
    await supabase.from('opportunities').update({ status: val }).eq('id', id)
  }

  async function handleNotesBlur() {
    await supabase.from('opportunities').update({ notes }).eq('id', id)
  }

  async function handleAddTask(e) {
    e.preventDefault()
    if (!taskType.trim()) { setTaskError('Task type is required.'); return }
    setTaskSaving(true); setTaskError(null)
    const { error } = await supabase.from('tasks').insert({
      opportunity_id: id,
      task_type:      taskType.trim(),
      due_date:       taskDue || null,
      status:         'Today',
    })
    if (error) { setTaskError(`Failed to save: ${error.message}`); setTaskSaving(false); return }
    setShowModal(false); setTaskType(''); setTaskDue('')
    setTaskSaving(false)
  }

  // ── section B handler ───────────────────────────────────────────────────────

  async function handleJdBlur() {
    await supabase.from('opportunities').update({ jd_text: jdText }).eq('id', id)
    setOpp(prev => ({ ...prev, jd_text: jdText }))
  }

  // ── section C handler ───────────────────────────────────────────────────────

  async function handleGenerateCoverLetter() {
    setCoverLoading(true); setCoverError(null)
    try {
      const profile = await fetchProfile()
      const prompt  = `Write a tailored cover letter for the role of ${opp.role_title} at ${opp.company}. Use only the user's real experience. Match language to the job description. Do not fabricate anything.\n\nProfile:\n${buildProfileSummary(profile)}\n\nJD:\n${jdText || '(not provided)'}`
      const result  = await callClaude(profile.anthropic_api_key, prompt)
      setCoverContent(result)
      if (coverArtId) {
        await supabase.from('application_artifacts').update({ content: result }).eq('id', coverArtId)
      } else {
        const { data } = await supabase.from('application_artifacts')
          .insert({ opportunity_id: id, artifact_type: 'cover_letter', content: result })
          .select('id').single()
        if (data) setCoverArtId(data.id)
      }
    } catch (err) { setCoverError(err.message) }
    finally { setCoverLoading(false) }
  }

  // ── section D handlers ──────────────────────────────────────────────────────

  async function handleDraftNew() {
    if (!newQuestion.trim()) { setNewQError('Please enter a question.'); return }
    setDraftingNew(true); setNewQError(null)
    try {
      const profile = await fetchProfile()
      const prompt  = `Draft a concise answer under 150 words to this application question using only the user's real experience.\n\nQuestion: ${newQuestion}\n\nProfile:\n${buildProfileSummary(profile)}\n\nJD:\n${jdText || '(not provided)'}`
      const result  = await callClaude(profile.anthropic_api_key, prompt)
      const { data } = await supabase.from('application_artifacts')
        .insert({ opportunity_id: id, artifact_type: 'short_answer', question_text: newQuestion.trim(), content: result })
        .select('id').single()
      setShortAnswers(prev => [...prev, { id: data?.id, question_text: newQuestion.trim(), content: result, loading: false, error: null }])
      setNewQuestion('')
    } catch (err) { setNewQError(err.message) }
    finally { setDraftingNew(false) }
  }

  function patchAnswer(idx, patch) {
    setShortAnswers(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a))
  }

  // ── section E handler ───────────────────────────────────────────────────────

  async function handleCvSuggestions() {
    setCvLoading(true); setCvError(null)
    try {
      const profile = await fetchProfile()
      const prompt  = `Compare this CV to the job description. Suggest specific bullet edits, keyword additions, and flag any gaps where the CV does not address a key requirement. Be concrete. Do not invent experience.\n\nCV:\n${profile.resume_text || '(not provided)'}\n\nJD:\n${jdText || '(not provided)'}`
      const result  = await callClaude(profile.anthropic_api_key, prompt)
      setCvContent(result)
    } catch (err) { setCvError(err.message) }
    finally { setCvLoading(false) }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-16">
        <Spinner /> Loading…
      </div>
    )
  }

  if (loadError || !opp) {
    return (
      <div>
        <Link to="/opportunities" className="text-indigo-600 text-sm hover:underline">← Back</Link>
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {loadError ?? 'Opportunity not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link to="/opportunities" className="text-indigo-600 text-sm hover:underline">← Back to Opportunities</Link>

      {/* ── A: Overview ── */}
      <Section label="A — Overview">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-gray-800">{opp.role_title}</p>
            <p className="text-gray-500 text-sm">{opp.company}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={fitBadge(opp.fit_score)}>{opp.fit_score} fit</span>
            <span className={recBadge(opp.recommendation)}>{opp.recommendation}</span>
          </div>
        </div>

        {opp.rationale && (
          <p className="text-sm text-gray-600 italic">{opp.rationale}</p>
        )}

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Status</label>
          <select
            value={status}
            onChange={e => handleStatusChange(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            rows={3}
            placeholder="Private notes about this opportunity…"
            className={inputCls}
          />
        </div>

        <div>
          <button onClick={() => setShowModal(true)} className={btnPrimary}>
            + Add Task
          </button>
        </div>
      </Section>

      {/* ── B: Job Description ── */}
      <Section label="B — Job Description">
        <p className="text-xs text-gray-400">Paste the full JD below. Saved automatically when you click away.</p>
        <textarea
          value={jdText}
          onChange={e => setJdText(e.target.value)}
          onBlur={handleJdBlur}
          rows={12}
          placeholder="Paste the job description here…"
          className={inputCls}
        />
      </Section>

      {/* ── C: Cover Letter ── */}
      <Section label="C — Cover Letter">
        <button onClick={handleGenerateCoverLetter} disabled={coverLoading} className={btnPrimary}>
          {coverLoading ? <><Spinner small /> Generating…</> : 'Generate Cover Letter'}
        </button>
        <ErrorBanner message={coverError} />
        {coverContent && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <CopyButton text={coverContent} />
            </div>
            <textarea
              value={coverContent}
              onChange={e => setCoverContent(e.target.value)}
              rows={16}
              className={inputCls}
            />
          </div>
        )}
      </Section>

      {/* ── D: Short Answer Drafts ── */}
      <Section label="D — Short Answer Drafts">
        {shortAnswers.length > 0 && (
          <div className="space-y-5">
            {shortAnswers.map((ans, idx) => (
              <div key={ans.id ?? idx} className="space-y-2">
                <p className="text-sm font-medium text-gray-700">{ans.question_text}</p>
                <ErrorBanner message={ans.error} />
                {ans.content && (
                  <div className="space-y-1">
                    <div className="flex justify-end">
                      <CopyButton text={ans.content} />
                    </div>
                    <textarea
                      value={ans.content}
                      onChange={e => patchAnswer(idx, { content: e.target.value })}
                      rows={6}
                      className={inputCls}
                    />
                  </div>
                )}
                {ans.loading && (
                  <div className="flex items-center gap-2 text-indigo-600 text-sm">
                    <Spinner small /> Drafting…
                  </div>
                )}
                <hr className="border-gray-100" />
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">New application question</label>
          <textarea
            value={newQuestion}
            onChange={e => { setNewQuestion(e.target.value); setNewQError(null) }}
            rows={3}
            placeholder="e.g. Why do you want to work here?"
            className={inputCls}
          />
          <ErrorBanner message={newQError} />
          <button onClick={handleDraftNew} disabled={draftingNew} className={btnPrimary}>
            {draftingNew ? <><Spinner small /> Drafting…</> : 'Draft Answer'}
          </button>
        </div>
      </Section>

      {/* ── E: CV Tailoring ── */}
      <Section label="E — CV Tailoring Suggestions">
        <button onClick={handleCvSuggestions} disabled={cvLoading} className={btnPrimary}>
          {cvLoading ? <><Spinner small /> Analysing…</> : 'Get CV Suggestions'}
        </button>
        <ErrorBanner message={cvError} />
        {cvContent && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <CopyButton text={cvContent} />
            </div>
            <textarea
              value={cvContent}
              onChange={e => setCvContent(e.target.value)}
              rows={14}
              className={inputCls}
            />
          </div>
        )}
      </Section>

      {/* ── Task Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Add Task</h3>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task type</label>
                <input
                  type="text"
                  value={taskType}
                  onChange={e => { setTaskType(e.target.value); setTaskError(null) }}
                  placeholder="e.g. Send follow-up email"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
                <input
                  type="date"
                  value={taskDue}
                  onChange={e => setTaskDue(e.target.value)}
                  className={inputCls}
                />
              </div>
              <ErrorBanner message={taskError} />
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setTaskType(''); setTaskDue(''); setTaskError(null) }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button type="submit" disabled={taskSaving} className={btnPrimary}>
                  {taskSaving ? <><Spinner small /> Saving…</> : 'Save task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
