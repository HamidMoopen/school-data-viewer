'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

type Post = { id: number; post_url: string; post_text: string; author_name: string | null; date_relative: string; scraped_comment_count: number }
type Comment = { id: number; post_id: number; author_name: string; comment_text: string; relative_date: string; likes: number; is_reply: boolean }

const SCHOOLS: [string, RegExp][] = [
  ['Great Hearts', /great\s*hearts/i],
  ['Great Hearts Live Oak', /great\s*hearts\s*live\s*oak/i],
  ['Great Hearts Invictus', /great\s*hearts\s*invictus/i],
  ['Great Hearts Western Hills', /great\s*hearts\s*western/i],
  ['BASIS', /\bbasis\b(?!\s+(?:of|for|on|in|that|is))/i],
  ['Harmony', /\bharmony\s*(school|science|innovation)?/i],
  ['SST', /\bsst\b/i],
  ['Primer', /\bprimer\b/i],
  ['TriPoint', /\btri\s*point/i],
  ['Valor', /\bvalor\b/i],
  ['CAST', /\bcast\b\s*(middle|school|tech|med)/i],
  ['Mark Twain', /mark\s*twain/i],
  ['Promesa', /\bpromesa\b/i],
  ['YWLA/YMLA', /\b(ywla|ymla|young\s*women|young\s*men)\b/i],
  ['Steele Montessori', /steele\s*montessori/i],
  ['Antonian', /\bantonian\b/i],
  ['St. Anthony', /st\.?\s*anthony/i],
  ['Somerset Academy', /somerset\s*academy/i],
  ['Eleanor Kolitz (EKHLA)', /\b(ekhla|eleanor\s*kolitz|kolitz)\b/i],
  ['Founders Classical', /\bfounders\b/i],
  ['Legacy Traditional', /\blegacy\s*traditional\b/i],
  ['KIPP', /\bkipp\b/i],
  ['Acton Academy', /\bacton\b/i],
  ['LilyPad Farm', /lilypad/i],
  ['Blessed Sacrament', /blessed\s*sacrament/i],
  ['SAISD', /\bsaisd\b/i],
  ['NEISD', /\bneisd\b/i],
  ['NISD', /\bnisd\b/i],
  ['Comal ISD', /\bcomal\b/i],
  ['Alamo Heights ISD', /alamo\s*heights/i],
]

const POS_WORDS = /\b(love|great|amazing|excellent|wonderful|recommend|awesome|fantastic|best|thriving|positive|incredible|outstanding)\b/i
const NEG_WORDS = /\b(avoid|terrible|bad|toxic|worst|horrible|disappointing|poor|awful|nightmare|unacceptable|dismiss)\b/i

function sentiment(texts: string[]): { pos: number; neg: number; neu: number } {
  let pos = 0, neg = 0, neu = 0
  for (const t of texts) {
    const p = (t.match(POS_WORDS) || []).length
    const n = (t.match(NEG_WORDS) || []).length
    if (p > n) pos++; else if (n > p) neg++; else neu++
  }
  return { pos, neg, neu }
}

function download(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
}

function csvEscape(s: string) { return `"${(s || '').replace(/"/g, '""').replace(/\n/g, ' ')}"` }

function fbProfileUrl(name: string) {
  if (!name || name.startsWith('Anonymous')) return null
  return `https://www.facebook.com/search/people/?q=${encodeURIComponent(name)}`
}

function AuthorLink({ name, className = '' }: { name: string; className?: string }) {
  const url = fbProfileUrl(name)
  if (!url) return <span className={className}>{name || 'Anonymous'}</span>
  return <a href={url} target="_blank" rel="noopener" className={`${className} hover:underline cursor-pointer`} onClick={e => e.stopPropagation()}>{name}</a>
}

function PostLink({ url, children, className = '' }: { url: string; children: React.ReactNode; className?: string }) {
  if (!url) return <>{children}</>
  return <a href={url} target="_blank" rel="noopener" className={`${className} hover:underline`} onClick={e => e.stopPropagation()}>{children}</a>
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'schools' | 'commenters' | 'search' | 'export'>('overview')
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null)
  const [selectedCommenter, setSelectedCommenter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedPost, setExpandedPost] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from('fb_school_discussions').select('id, post_url, post_text, author_name, date_relative, scraped_comment_count').order('scraped_comment_count', { ascending: false }),
        supabase.from('fb_comments').select('id, post_id, author_name, comment_text, relative_date, likes, is_reply').order('likes', { ascending: false })
      ])
      setPosts(p || [])
      setComments(c || [])
      setLoading(false)
    }
    load()
  }, [])

  const commentsByPost = useMemo(() => {
    const map: Record<number, Comment[]> = {}
    comments.forEach(c => { (map[c.post_id] ||= []).push(c) })
    return map
  }, [comments])

  const postUrlMap = useMemo(() => {
    const map: Record<number, string> = {}
    posts.forEach(p => { map[p.id] = p.post_url })
    return map
  }, [posts])

  const schoolMentions = useMemo(() => {
    const counts: Record<string, { posts: Post[]; comments: Comment[]; name: string }> = {}
    SCHOOLS.forEach(([name]) => { counts[name] = { posts: [], comments: [], name } })

    posts.forEach(p => {
      const text = p.post_text || ''
      SCHOOLS.forEach(([name, rx]) => { if (rx.test(text)) counts[name].posts.push(p) })
    })
    comments.forEach(c => {
      const text = c.comment_text || ''
      SCHOOLS.forEach(([name, rx]) => { if (rx.test(text)) counts[name].comments.push(c) })
    })

    return Object.values(counts)
      .map(s => ({ ...s, total: s.posts.length + s.comments.length }))
      .filter(s => s.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [posts, comments])

  const topCommenters = useMemo(() => {
    const map: Record<string, { name: string; count: number; likes: number; comments: Comment[] }> = {}
    comments.forEach(c => {
      const name = c.author_name || ''
      if (!name || name.startsWith('Anonymous') || name === 'School Discovery Network') return
      if (!map[name]) map[name] = { name, count: 0, likes: 0, comments: [] }
      map[name].count++
      map[name].likes += c.likes || 0
      map[name].comments.push(c)
    })
    return Object.values(map)
      .map(c => ({ ...c, score: c.count * 2 + c.likes }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
  }, [comments])

  const uniqueCommenters = useMemo(() => {
    const names = new Set(comments.map(c => c.author_name).filter(n => n && n.length > 0))
    return names.size
  }, [comments])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { posts: [] as Post[], comments: [] as Comment[] }
    const q = searchQuery.toLowerCase()
    return {
      posts: posts.filter(p => (p.post_text || '').toLowerCase().includes(q)),
      comments: comments.filter(c => (c.comment_text || '').toLowerCase().includes(q))
    }
  }, [searchQuery, posts, comments])

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-gray-400 text-lg">Loading analytics...</div>
    </div>
  )

  const maxMentions = schoolMentions[0]?.total || 1

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-[family-name:var(--font-geist-sans)]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">SA School Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">School Discovery Network community insights &middot; {posts.length} discussions &middot; {comments.length.toLocaleString()} comments &middot; {uniqueCommenters} voices</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-gray-800 pb-px">
          {(['overview', 'schools', 'commenters', 'search', 'export'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${tab === t ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'}`}>
              {t === 'overview' ? 'Overview' : t === 'schools' ? 'Schools' : t === 'commenters' ? 'Top Commenters' : t === 'search' ? 'Search' : 'Export'}
            </button>
          ))}
        </div>

        {/* ===== OVERVIEW TAB ===== */}
        {tab === 'overview' && (
          <div className="space-y-8">
            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Posts', value: posts.length, color: 'border-blue-500', sub: 'school choice discussions' },
                { label: 'Total Comments', value: comments.length.toLocaleString(), color: 'border-emerald-500', sub: 'parent responses' },
                { label: 'Unique Voices', value: uniqueCommenters, color: 'border-purple-500', sub: 'distinct commenters' },
                { label: 'Avg Comments/Post', value: (comments.length / posts.length).toFixed(1), color: 'border-amber-500', sub: 'engagement rate' },
              ].map(s => (
                <div key={s.label} className={`bg-gray-900 border border-gray-800 border-l-4 ${s.color} rounded-lg p-5`}>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-sm text-gray-400 mt-1">{s.label}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Two columns */}
            <div className="grid grid-cols-2 gap-6">
              {/* Top Schools */}
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                <h2 className="text-lg font-semibold mb-4">Top Schools Mentioned</h2>
                <div className="space-y-3">
                  {schoolMentions.slice(0, 12).map((s, i) => (
                    <button key={s.name} onClick={() => { setSelectedSchool(s.name); setTab('schools') }}
                      className="w-full text-left group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300 group-hover:text-blue-400 transition-colors">
                          <span className="text-gray-600 mr-2">{i + 1}.</span>{s.name}
                        </span>
                        <span className="text-xs text-gray-500">{s.total} mentions</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(s.total / maxMentions) * 100}%` }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hot Discussions */}
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                <h2 className="text-lg font-semibold mb-4">Most Discussed Topics</h2>
                <div className="space-y-3">
                  {posts.slice(0, 10).map(p => (
                    <div key={p.id} className="flex items-start gap-3 group cursor-pointer" onClick={() => { setExpandedPost(expandedPost === p.id ? null : p.id) }}>
                      <div className="bg-blue-600/20 text-blue-400 text-xs font-bold rounded px-2 py-1 whitespace-nowrap mt-0.5">
                        {p.scraped_comment_count}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {p.post_text || '(image post)'}
                        </p>
                        {p.date_relative && <span className="text-xs text-gray-600">{p.date_relative}</span>}
                        {expandedPost === p.id && commentsByPost[p.id] && (
                          <div className="mt-2 space-y-1.5 border-l-2 border-gray-700 pl-3">
                            {commentsByPost[p.id].slice(0, 5).map(c => (
                              <div key={c.id} className="text-xs">
                                <AuthorLink name={c.author_name || 'Anon'} className="text-blue-400" />
                                {c.likes > 0 && <span className="text-yellow-600 ml-1">({c.likes})</span>}
                                <span className="text-gray-400 ml-1">{c.comment_text?.substring(0, 120)}...</span>
                              </div>
                            ))}
                            <a href={p.post_url} target="_blank" rel="noopener" className="text-xs text-blue-500 hover:underline">View all on Facebook</a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== SCHOOLS TAB ===== */}
        {tab === 'schools' && (
          <div className="flex gap-6">
            {/* School List */}
            <div className="w-72 shrink-0 space-y-1">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Schools ({schoolMentions.length})</h2>
              {schoolMentions.map(s => (
                <button key={s.name} onClick={() => setSelectedSchool(s.name)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-colors ${selectedSchool === s.name ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}>
                  <span>{s.name}</span>
                  <span className="text-xs opacity-60">{s.total}</span>
                </button>
              ))}
            </div>

            {/* School Detail */}
            <div className="flex-1 min-w-0">
              {!selectedSchool ? (
                <div className="text-gray-500 text-center py-20">Select a school to see analysis</div>
              ) : (() => {
                const school = schoolMentions.find(s => s.name === selectedSchool)
                if (!school) return null
                const allTexts = [...school.comments.map(c => c.comment_text), ...school.posts.map(p => p.post_text)]
                const sent = sentiment(allTexts)
                const total = sent.pos + sent.neg + sent.neu || 1

                return (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold">{selectedSchool}</h2>
                      <p className="text-gray-500 text-sm mt-1">{school.posts.length} posts &middot; {school.comments.length} comments mentioning this school</p>
                    </div>

                    {/* Sentiment */}
                    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3">Community Sentiment</h3>
                      <div className="flex h-4 rounded-full overflow-hidden">
                        <div className="bg-emerald-500" style={{ width: `${(sent.pos / total) * 100}%` }} />
                        <div className="bg-gray-600" style={{ width: `${(sent.neu / total) * 100}%` }} />
                        <div className="bg-red-500" style={{ width: `${(sent.neg / total) * 100}%` }} />
                      </div>
                      <div className="flex justify-between text-xs mt-2 text-gray-500">
                        <span className="text-emerald-400">{sent.pos} positive</span>
                        <span>{sent.neu} neutral</span>
                        <span className="text-red-400">{sent.neg} negative</span>
                      </div>
                    </div>

                    {/* Posts */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Discussions ({school.posts.length})</h3>
                      <div className="space-y-2">
                        {school.posts.slice(0, 15).map(p => (
                          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 cursor-pointer hover:border-gray-700" onClick={() => setExpandedPost(expandedPost === p.id ? null : p.id)}>
                            <p className="text-sm text-gray-200" style={{ display: '-webkit-box', WebkitLineClamp: expandedPost === p.id ? 20 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.post_text}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-gray-600">{p.date_relative}</span>
                              <span className="text-xs text-gray-600">{p.scraped_comment_count} comments</span>
                              <a href={p.post_url} target="_blank" rel="noopener" className="text-xs text-blue-500 hover:underline" onClick={e => e.stopPropagation()}>FB</a>
                            </div>
                            {expandedPost === p.id && commentsByPost[p.id] && (
                              <div className="mt-3 border-t border-gray-800 pt-3 space-y-2">
                                {commentsByPost[p.id].map(c => (
                                  <div key={c.id} className="text-xs pl-3 border-l-2 border-gray-700">
                                    <AuthorLink name={c.author_name || 'Anon'} className="text-blue-400 font-medium" />
                                    {c.likes > 0 && <span className="text-yellow-600 ml-1">{c.likes} likes</span>}
                                    <p className="text-gray-400 mt-0.5">{c.comment_text}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Top Comments */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Top Comments ({school.comments.length})</h3>
                      <div className="space-y-2">
                        {school.comments.slice(0, 20).map(c => (
                          <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <AuthorLink name={c.author_name || 'Anon'} className="text-blue-400 text-xs font-medium" />
                              {c.likes > 0 && <span className="text-yellow-500 text-xs">{c.likes} likes</span>}
                              <span className="text-gray-600 text-xs">{c.relative_date}</span>
                            </div>
                            <p className="text-sm text-gray-300">{c.comment_text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* ===== COMMENTERS TAB ===== */}
        {tab === 'commenters' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Top Contributors</h2>
            <p className="text-sm text-gray-500">Ranked by engagement score (comments x2 + likes received). Anonymous posters excluded.</p>
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 w-8">#</th>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-right px-4 py-3">Comments</th>
                    <th className="text-right px-4 py-3">Likes</th>
                    <th className="text-right px-4 py-3">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {topCommenters.map((c, i) => (
                    <>
                      <tr key={c.name} onClick={() => setSelectedCommenter(selectedCommenter === c.name ? null : c.name)}
                        className={`border-b border-gray-800/50 cursor-pointer transition-colors ${selectedCommenter === c.name ? 'bg-blue-600/10' : 'hover:bg-gray-800/50'}`}>
                        <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                        <td className="px-4 py-3 text-gray-200 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{c.count}</td>
                        <td className="px-4 py-3 text-right text-yellow-500">{c.likes}</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">{c.score}</td>
                      </tr>
                      {selectedCommenter === c.name && (
                        <tr key={`${c.name}-detail`}>
                          <td colSpan={5} className="px-4 py-3 bg-gray-800/30">
                            <div className="space-y-2 max-h-80 overflow-y-auto">
                              {c.comments.slice(0, 15).map(cm => (
                                <div key={cm.id} className="text-xs border-l-2 border-blue-600/30 pl-3 flex items-start gap-2">
                                  <div className="flex-1">
                                    {cm.likes > 0 && <span className="text-yellow-600">{cm.likes} likes &middot; </span>}
                                    <span className="text-gray-400">{cm.comment_text?.substring(0, 200)}{(cm.comment_text?.length || 0) > 200 ? '...' : ''}</span>
                                  </div>
                                  {postUrlMap[cm.post_id] && <a href={postUrlMap[cm.post_id]} target="_blank" rel="noopener" className="text-blue-500 hover:underline shrink-0">FB &rarr;</a>}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== SEARCH TAB ===== */}
        {tab === 'search' && (
          <div className="space-y-6">
            <input type="text" placeholder="Search all posts and comments..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" autoFocus />

            {searchQuery.trim() && (
              <div className="space-y-6">
                <p className="text-sm text-gray-500">{searchResults.posts.length} posts, {searchResults.comments.length} comments match &quot;{searchQuery}&quot;</p>

                {searchResults.posts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Posts</h3>
                    <div className="space-y-2">
                      {searchResults.posts.slice(0, 20).map(p => (
                        <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                          <p className="text-sm text-gray-200">{p.post_text?.substring(0, 300)}</p>
                          <div className="flex gap-3 mt-1">
                            <span className="text-xs text-gray-600">{p.scraped_comment_count} comments</span>
                            <a href={p.post_url} target="_blank" rel="noopener" className="text-xs text-blue-500 hover:underline">View</a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.comments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Comments</h3>
                    <div className="space-y-2">
                      {searchResults.comments.slice(0, 30).map(c => (
                        <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <AuthorLink name={c.author_name || 'Anon'} className="text-blue-400 text-xs font-medium" />
                            {c.likes > 0 && <span className="text-yellow-500 text-xs">{c.likes} likes</span>}
                            {postUrlMap[c.post_id] && <a href={postUrlMap[c.post_id]} target="_blank" rel="noopener" className="text-xs text-blue-500 hover:underline ml-auto">View post &rarr;</a>}
                          </div>
                          <p className="text-sm text-gray-300">{c.comment_text?.substring(0, 300)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== EXPORT TAB ===== */}
        {tab === 'export' && (
          <div className="space-y-6 max-w-lg">
            <h2 className="text-lg font-semibold">Export Data</h2>
            <div className="space-y-3">
              <button onClick={() => {
                const rows = ['id,url,author,text,date,comment_count']
                posts.forEach(p => rows.push([p.id, p.post_url, csvEscape(p.author_name || ''), csvEscape(p.post_text), p.date_relative, p.scraped_comment_count].join(',')))
                download(rows.join('\n'), 'posts.csv')
              }} className="w-full bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-gray-600 transition-colors">
                <div className="font-medium">Posts CSV</div>
                <div className="text-sm text-gray-500 mt-1">{posts.length} rows &middot; ID, URL, author, text, date, comment count</div>
              </button>

              <button onClick={() => {
                const rows = ['id,post_id,author,text,date,likes']
                comments.forEach(c => rows.push([c.id, c.post_id, csvEscape(c.author_name), csvEscape(c.comment_text), c.relative_date, c.likes].join(',')))
                download(rows.join('\n'), 'comments.csv')
              }} className="w-full bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-gray-600 transition-colors">
                <div className="font-medium">Comments CSV</div>
                <div className="text-sm text-gray-500 mt-1">{comments.length.toLocaleString()} rows &middot; ID, post_id, author, text, date, likes</div>
              </button>

              <button onClick={() => {
                const rows = ['school,total_mentions,post_mentions,comment_mentions,positive,negative,neutral']
                schoolMentions.forEach(s => {
                  const allTexts = [...s.comments.map(c => c.comment_text), ...s.posts.map(p => p.post_text)]
                  const sent = sentiment(allTexts)
                  rows.push([csvEscape(s.name), s.total, s.posts.length, s.comments.length, sent.pos, sent.neg, sent.neu].join(','))
                })
                download(rows.join('\n'), 'school_analysis.csv')
              }} className="w-full bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-gray-600 transition-colors">
                <div className="font-medium">School Analysis CSV</div>
                <div className="text-sm text-gray-500 mt-1">{schoolMentions.length} schools &middot; mentions, sentiment breakdown</div>
              </button>

              <button onClick={() => {
                const rows = ['rank,name,comments,likes,score']
                topCommenters.forEach((c, i) => rows.push([i + 1, csvEscape(c.name), c.count, c.likes, c.score].join(',')))
                download(rows.join('\n'), 'top_commenters.csv')
              }} className="w-full bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-gray-600 transition-colors">
                <div className="font-medium">Top Commenters CSV</div>
                <div className="text-sm text-gray-500 mt-1">{topCommenters.length} commenters &middot; ranked by engagement</div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
