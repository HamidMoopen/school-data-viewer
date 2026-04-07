'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Post = { id: number; post_url: string; post_text: string; author_name: string | null; date_relative: string; scraped_comment_count: number }
type Comment = { id: number; post_id: number; author_name: string; comment_text: string; relative_date: string; likes: number; post_text?: string }

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Record<number, Comment[]>>({})
  const [search, setSearch] = useState('')
  const [expandedPost, setExpandedPost] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'posts' | 'comments'>('posts')
  const [commentSearch, setCommentSearch] = useState('')
  const [allComments, setAllComments] = useState<Comment[]>([])
  const [sortBy, setSortBy] = useState<'comments' | 'recent'>('comments')

  useEffect(() => { loadPosts() }, [])

  async function loadPosts() {
    setLoading(true)
    const { data } = await supabase.from('fb_school_discussions').select('id, post_url, post_text, author_name, date_relative, scraped_comment_count').order('scraped_comment_count', { ascending: false })
    setPosts(data || [])
    setLoading(false)
  }

  async function loadComments(postId: number) {
    if (comments[postId]) return
    const { data } = await supabase.from('fb_comments').select('id, post_id, author_name, comment_text, relative_date, likes').eq('post_id', postId).order('likes', { ascending: false })
    setComments(prev => ({ ...prev, [postId]: data || [] }))
  }

  async function searchComments() {
    if (!commentSearch.trim()) return
    const { data } = await supabase.from('fb_comments').select('id, post_id, author_name, comment_text, relative_date, likes').ilike('comment_text', `%${commentSearch}%`).order('likes', { ascending: false }).limit(100)
    const postIds = [...new Set((data || []).map(c => c.post_id))]
    const { data: postData } = await supabase.from('fb_school_discussions').select('id, post_text').in('id', postIds)
    const postMap: Record<number, string> = {}
    postData?.forEach(p => { postMap[p.id] = p.post_text })
    setAllComments((data || []).map(c => ({ ...c, post_text: postMap[c.post_id] })))
  }

  function toggleExpand(postId: number) {
    if (expandedPost === postId) { setExpandedPost(null) } else { setExpandedPost(postId); loadComments(postId) }
  }

  const filtered = posts.filter(p => !search.trim() || (p.post_text || '').toLowerCase().includes(search.toLowerCase()) || (p.author_name || '').toLowerCase().includes(search.toLowerCase()))
  const sorted = [...filtered].sort((a, b) => sortBy === 'comments' ? b.scraped_comment_count - a.scraped_comment_count : b.id - a.id)

  function exportCSV() {
    const rows = ['ID,URL,Author,Text,Date,Comments']
    sorted.forEach(p => rows.push([p.id, p.post_url, p.author_name || '', `"${(p.post_text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`, p.date_relative, p.scraped_comment_count].join(',')))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'school_choice_data.csv'; a.click()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-1">School Choice Data Explorer</h1>
        <p className="text-gray-400 text-sm mb-6">SA School Discovery Network — {posts.length} posts, 2486 comments</p>
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('posts')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'posts' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}>Posts</button>
          <button onClick={() => setTab('comments')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'comments' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}>Search Comments</button>
        </div>
        {tab === 'posts' && (<>
          <div className="flex gap-2 mb-4">
            <input type="text" placeholder="Search posts..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500" />
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"><option value="comments">Most Comments</option><option value="recent">Most Recent</option></select>
            <button onClick={exportCSV} className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded-lg text-sm">Export CSV</button>
          </div>
          <p className="text-xs text-gray-500 mb-3">{sorted.length} posts</p>
          {loading ? <p className="text-gray-400">Loading...</p> : (
            <div className="space-y-3">{sorted.map(post => (
              <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {post.author_name && <span className="text-blue-400 text-xs font-medium">{post.author_name}</span>}
                      {post.date_relative && <span className="text-gray-500 text-xs">{post.date_relative}</span>}
                    </div>
                    <p className="text-sm text-gray-200" style={{display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>{post.post_text || '(image post)'}</p>
                  </div>
                  <button onClick={() => toggleExpand(post.id)} className="ml-4 bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-xs whitespace-nowrap">
                    {expandedPost === post.id ? 'Hide' : `${post.scraped_comment_count} comments`}
                  </button>
                </div>
                <a href={post.post_url} target="_blank" rel="noopener" className="text-xs text-blue-500 hover:underline mt-1 inline-block">View on Facebook</a>
                {expandedPost === post.id && (
                  <div className="mt-3 border-t border-gray-800 pt-3 space-y-2">
                    {!comments[post.id] ? <p className="text-xs text-gray-500">Loading...</p> : comments[post.id].map(c => (
                      <div key={c.id} className="bg-gray-800/50 rounded p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-blue-300 text-xs font-medium">{c.author_name || 'Unknown'}</span>
                          <span className="text-gray-500 text-xs">{c.relative_date}</span>
                          {c.likes > 0 && <span className="text-yellow-500 text-xs">{c.likes} likes</span>}
                        </div>
                        <p className="text-xs text-gray-300">{c.comment_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}</div>
          )}
        </>)}
        {tab === 'comments' && (<>
          <div className="flex gap-2 mb-4">
            <input type="text" placeholder="Search comments (Great Hearts, IEP, Basis...)" value={commentSearch} onChange={e => setCommentSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchComments()} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500" />
            <button onClick={searchComments} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm">Search</button>
          </div>
          {allComments.length > 0 && <p className="text-xs text-gray-500 mb-3">{allComments.length} results (by likes)</p>}
          <div className="space-y-2">{allComments.map(c => (
            <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-blue-300 text-xs font-medium">{c.author_name || 'Unknown'}</span>
                <span className="text-gray-500 text-xs">{c.relative_date}</span>
                {c.likes > 0 && <span className="text-yellow-500 text-xs">{c.likes} likes</span>}
              </div>
              <p className="text-sm text-gray-200 mb-2">{c.comment_text}</p>
              {c.post_text && <p className="text-xs text-gray-500 border-t border-gray-800 pt-1 mt-1" style={{display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>Re: {c.post_text}</p>}
            </div>
          ))}</div>
        </>)}
      </div>
    </div>
  )
}
