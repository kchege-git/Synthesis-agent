import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUSES = ['New', 'In Progress', 'Applied', 'Deferred', 'Deprioritized']

// ── helpers ──────────────────────────────────────────────────────────────────

function fitBadge(score) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold'
  if (score >= 70) return `${base} bg-green-100 text-green-800`
  if (score >= 50) return `${base} bg-yellow-100 text-yellow-800`
  return `${base} bg-red-100 text-red-800`
}

function recBadge(rec) {
  const map = {
    'Apply Now':        'bg-indigo-100 text-indigo-800',
    'Network First':    'bg-blue-100 text-blue-800',
    'Apply + Network':  'bg-purple-100 text-purple-800',
    'Deprioritize':     'bg-gray-100 text-gray-600',
  }
  const colour = map[rec] ?? 'bg-gray-100 text-gray-600'
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colour}`
}

function buildProfileSummary(p) {
  return [
    p.name          && `Name: ${p.name}`,
    p.school        && `School/Employer: ${p.school}`,
    p.target_roles  && `Target roles: ${p.target_roles}`,
    p.target_locations && `Target locations: ${p.target_locations}`,
    p.priorities    && `Priorities: ${p.priorities}`,
    p.constraints   && `Constraints: ${p.constraints}`,
    p.resume_text   && `Resume:\n${p.resume_text}`,
  ].filter(Boolean).join('\n')
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Opportunities() {
  const [company, setCompany]       = useState('')
  const [careersUrl, setCareersUrl] = useState('')
  const [scanning, setScanning]     = useState(false)
  const [scanError, setScanError]   = useState(null)
  const [scanLog, setScanLog]       = useState('')

  const [opportunities, setOpportunities] = useState([])
  const [loadingTable, setLoadingTable]   = useState(true)

  // load table on mount
  useEffect(() => { loadOpportunities() }, [])

  async function loadOpportunities() {
    setLoadingTable(true)
    const { data, error } = await supabase
      .from('opportunities')
      .select('*')
      .order('date_detected', { ascending: false })
    if (!error) setOpportunities(data ?? [])
    setLoadingTable(false)
  }

  async function handleScan() {
    if (!company.trim() || !careersUrl.trim()) {
      setScanError('Please enter both a company name and a careers page URL.')
      return
    }
    setScanning(true)
    setScanError(null)
    setScanLog('Fetching user profile…')

    try {
      // 1. fetch profile
      const { data: profile, error: profileErr } = await supabase
        .from('user_profile')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

      if (profileErr) throw new Error(`Profile fetch failed: ${profileErr.message}`)
      if (!profile?.anthropic_api_key) throw new Error('No Anthropic API key found in Settings. Please add it first.')

      // 2. fetch careers page via CORS proxy
      setScanLog('Fetching careers page…')
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(careersUrl)}`
      const proxyRes = await fetch(proxyUrl)
      if (!proxyRes.ok) throw new Error(`CORS proxy request failed (HTTP ${proxyRes.status})`)
      const proxyJson = await proxyRes.json()
      const rawHtml   = proxyJson.contents ?? ''

      // strip HTML tags to plain text
      const pageText = rawHtml
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 15000) // keep within token budget

      if (!pageText) throw new Error('Could not extract text from the careers page.')

      // 3. call Anthropic API
      setScanLog('Asking Claude to identify matching roles…')
      const profileSummary = buildProfileSummary(profile)
      const prompt = `You are a recruiting assistant. The user has the following profile:\n${profileSummary}\n\nHere is the raw text of ${company}'s careers page:\n${pageText}\n\nIdentify all open roles. For each role return: role_title, fit_score (integer 0–100 based on profile match), recommendation (one of: Apply Now, Network First, Apply + Network, Deprioritize), rationale (one sentence). Only include roles with fit_score above 40. Return only a valid JSON array with no other text.`

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         profile.anthropic_api_key,
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

      if (!anthropicRes.ok) {
        const errBody = await anthropicRes.text()
        throw new Error(`Anthropic API error (HTTP ${anthropicRes.status}): ${errBody}`)
      }

      const anthropicJson = await anthropicRes.json()
      const rawText = anthropicJson.content?.[0]?.text ?? ''

      // 4. parse JSON
      setScanLog('Parsing results…')
      let roles
      try {
        // tolerate ```json ... ``` fences
        const jsonMatch = rawText.match(/\[[\s\S]*\]/)
        if (!jsonMatch) throw new Error('No JSON array found in response.')
        roles = JSON.parse(jsonMatch[0])
      } catch (parseErr) {
        throw new Error(`Could not parse Claude's response: ${parseErr.message}\n\nRaw response:\n${rawText}`)
      }

      if (!Array.isArray(roles) || roles.length === 0) {
        setScanLog('No matching roles found above the fit threshold.')
        setScanning(false)
        return
      }

      // 5. insert into Supabase
      setScanLog(`Saving ${roles.length} role(s) to Supabase…`)
      const rows = roles.map(r => ({
        company:       company.trim(),
        role_title:    r.role_title    ?? '',
        fit_score:     Number(r.fit_score) || 0,
        recommendation: r.recommendation ?? '',
        rationale:     r.rationale     ?? '',
        status:        'New',
        date_detected: new Date().toISOString(),
        job_url:       careersUrl.trim(),
      }))

      const { error: insertErr } = await supabase.from('opportunities').insert(rows)
      if (insertErr) throw new Error(`Failed to save opportunities: ${insertErr.message}`)

      setScanLog('')
      setCompany('')
      setCareersUrl('')
      await loadOpportunities()
    } catch (err) {
      setScanError(err.message)
      setScanLog('')
    } finally {
      setScanning(false)
    }
  }

  async function handleStatusChange(id, newStatus) {
    setOpportunities(prev =>
      prev.map(o => o.id === id ? { ...o, status: newStatus } : o)
    )
    await supabase.from('opportunities').update({ status: newStatus }).eq('id', id)
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Opportunities</h1>

      {/* ── scan form ── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Scan a careers page</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Company name"
            value={company}
            onChange={e => { setCompany(e.target.value); setScanError(null) }}
            disabled={scanning}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
          />
          <input
            type="url"
            placeholder="https://company.com/careers"
            value={careersUrl}
            onChange={e => { setCareersUrl(e.target.value); setScanError(null) }}
            disabled={scanning}
            className="flex-[2] rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
          />
          <button
            onClick={handleScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {scanning ? (
              <>
                <Spinner />
                Scanning…
              </>
            ) : 'Scan'}
          </button>
        </div>

        {/* status / progress */}
        {scanning && scanLog && (
          <p className="mt-3 text-sm text-indigo-600 flex items-center gap-2">
            <Spinner small /> {scanLog}
          </p>
        )}

        {/* error */}
        {scanError && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 whitespace-pre-wrap">
            {scanError}
          </div>
        )}
      </div>

      {/* ── table ── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loadingTable ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Spinner /> Loading…
          </div>
        ) : opportunities.length === 0 ? (
          <p className="text-center py-16 text-gray-400 text-sm">
            No opportunities yet. Scan a careers page above to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Company', 'Role Title', 'Fit Score', 'Recommended Action', 'Rationale', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {opportunities.map(opp => (
                  <tr key={opp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{opp.company}</td>
                    <td className="px-4 py-3 text-gray-700">{opp.role_title}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={fitBadge(opp.fit_score)}>{opp.fit_score}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={recBadge(opp.recommendation)}>{opp.recommendation}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">{opp.rationale}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <select
                        value={opp.status ?? 'New'}
                        onChange={e => handleStatusChange(opp.id, e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {opp.job_url ? (
                        <a
                          href={opp.job_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                        >
                          View →
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── small reusable spinner ─────────────────────────────────────────────────────
function Spinner({ small }) {
  const size = small ? 'h-3 w-3' : 'h-4 w-4'
  return (
    <svg className={`${size} animate-spin text-current`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
