import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const FIELDS = [
  { key: 'name', label: 'Name', type: 'input' },
  { key: 'school', label: 'School or current employer', type: 'input' },
  { key: 'target_roles', label: 'Target roles and functions', type: 'textarea' },
  { key: 'target_locations', label: 'Target locations', type: 'input' },
  { key: 'priorities', label: 'Priorities in natural language', type: 'textarea' },
  { key: 'constraints', label: 'Constraints in natural language', type: 'textarea' },
  { key: 'resume_text', label: 'Resume or CV text', type: 'textarea', large: true },
  { key: 'cover_letter_sample', label: 'Sample cover letter', type: 'textarea', large: true },
  { key: 'story_bank', label: 'Story bank — key accomplishments as bullet points', type: 'textarea', large: true },
  { key: 'anthropic_api_key', label: 'Anthropic API key', type: 'password' },
]

const EMPTY = Object.fromEntries(FIELDS.map(f => [f.key, '']))

export default function Settings() {
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null) // { type: 'success'|'error', message: string }

  useEffect(() => {
    async function fetchProfile() {
      const { data, error } = await supabase
        .from('user_profile')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

      if (error) {
        setStatus({ type: 'error', message: `Failed to load profile: ${error.message}` })
      } else if (data) {
        setForm(prev => ({ ...prev, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v ?? ''])) }))
      }
      setLoading(false)
    }
    fetchProfile()
  }, [])

  function handleChange(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (status) setStatus(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)

    const { error } = await supabase
      .from('user_profile')
      .upsert({ id: 1, ...form }, { onConflict: 'id' })

    if (error) {
      setStatus({ type: 'error', message: `Failed to save: ${error.message}` })
    } else {
      setStatus({ type: 'success', message: 'Settings saved successfully.' })
    }
    setSaving(false)
  }

  if (loading) {
    return <p className="text-gray-500">Loading profile…</p>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {FIELDS.map(({ key, label, type, large }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={key}>
              {label}
            </label>
            {type === 'input' && (
              <input
                id={key}
                type="text"
                value={form[key]}
                onChange={e => handleChange(key, e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            )}
            {type === 'password' && (
              <input
                id={key}
                type="password"
                value={form[key]}
                onChange={e => handleChange(key, e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            )}
            {type === 'textarea' && (
              <textarea
                id={key}
                value={form[key]}
                onChange={e => handleChange(key, e.target.value)}
                rows={large ? 10 : 4}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            )}
          </div>
        ))}

        {status && (
          <div
            className={`rounded-md px-4 py-3 text-sm font-medium ${
              status.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {status.message}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </div>
  )
}
