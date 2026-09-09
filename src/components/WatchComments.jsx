import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { relativeTime } from '../lib/relativeTime'
import { COMMENT_MAX_LENGTH, COMMENT_UNAVAILABLE_MESSAGE, commentBodyError } from '../lib/commentBody'

/**
 * "Join the conversation" — comments on the watch page (founder direction
 * 2026-09-09; visual spec in docs/watch-page-spec.md §3e). Rendered below
 * the story section and before the footer — never above the player, never
 * on the landing page.
 *
 * WHO SEES IT: the section fetches only when a signed-in session AND the
 * film's id both exist, and renders ONLY after the server answered 200
 * (the server admits claimants of this film and the film's creator —
 * server/commentRules.js). A visitor without a claim, a signed-out
 * browser, an older API without the route, or any failure → nothing at
 * all. No placeholder, no spinner.
 *
 * Identity: the server resolves first names and ticket numbers at read
 * time; this component never sends anything about a person. Oldest first,
 * always; no polling — the list loads with the page and refreshes after
 * the viewer posts. Replies render one level, indented under their
 * top-level comment. "Reply" and "Remove" (owner only) are bare
 * tracked-caps text — the affordance-law amendment of 2026-09-09.
 */

/** The composer's / a comment's circle: the filmmaker's photo frame at
 *  40px (32px on replies), holding the person's initial in Garamond italic
 *  — or the creator's portrait from filmStory.js. */
function Circle({ initial, photoUrl, small = false }) {
  return (
    <div
      aria-hidden
      className={`${small ? 'h-8 w-8' : 'h-10 w-10'} flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-warm/15 bg-tint-track`}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-full w-full scale-[1.12] object-cover" />
      ) : (
        <span
          className={`font-serif-v3 italic leading-none text-warm/60 ${small ? 'text-[0.9375rem]' : 'text-[1.0625rem]'}`}
        >
          {initial}
        </span>
      )}
    </div>
  )
}

const initialOf = (name) => String(name || '').trim().charAt(0).toUpperCase() || '·'

/** One composer, reused at the top and at the end of a thread (the reply). */
function Composer({ viewer, photoUrl, small = false, onSubmit, busy, error, autoFocus = false, idSuffix }) {
  const [value, setValue] = useState('')
  const ref = useRef(null)
  const inputId = `comment-body-${idSuffix}`

  /** A single line that grows with the text — height follows scrollHeight. */
  const grow = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const submit = async (e) => {
    e.preventDefault()
    const ok = await onSubmit(value)
    if (ok) {
      setValue('')
      requestAnimationFrame(grow)
    }
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-4">
      <Circle initial={initialOf(viewer.firstName)} photoUrl={viewer.isCreator ? photoUrl : null} small={small} />
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="sr-only">
          Write a comment
        </label>
        <textarea
          ref={ref}
          id={inputId}
          rows={1}
          value={value}
          maxLength={COMMENT_MAX_LENGTH}
          onChange={(e) => {
            setValue(e.target.value)
            grow()
          }}
          placeholder="Write a comment"
          className="block w-full resize-none overflow-hidden border-b border-warm/20 bg-transparent px-0 py-2 font-sans font-light text-[1.0625rem] leading-[1.6] text-warm transition-colors duration-300 placeholder:font-serif-v3 placeholder:italic placeholder:text-warm/40 focus:border-accent focus:outline-none"
        />
        {/* A failed post: the inline message in the error colour under the
            field, the way name-rule errors read in the share modal;
            nothing is lost from the field. */}
        {error && <p className="mt-2 font-sans text-xs text-error/90">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <p className="font-sans font-normal text-[11px] uppercase tracking-[0.24em] text-muted">
            You’ll appear as {viewer.firstName}
            {viewer.ticketNo != null && <> · Ticket No. {viewer.ticketNo}</>}
          </p>
          {/* The section's ONLY gold: the Post box (border accent/60, accent
              text, caps 0.8125rem/0.28em, min-h 48). */}
          <button
            type="submit"
            disabled={busy}
            className="min-h-[48px] cursor-pointer touch-manipulation border border-accent/60 px-7 py-3 font-sans font-normal text-[0.8125rem] uppercase tracking-[0.28em] text-accent transition-colors duration-300 hover:border-accent hover:bg-accent hover:text-ink focus-visible:border-accent focus-visible:bg-accent focus-visible:text-ink focus-visible:outline-none disabled:opacity-50"
          >
            {busy ? 'One moment…' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  )
}

const ACTION_CLASS =
  'cursor-pointer touch-manipulation font-sans font-normal text-[11px] uppercase tracking-[0.24em] text-muted transition-colors hover:text-warm focus-visible:text-warm focus-visible:outline-none'

function CommentItem({ comment, photoUrl, small = false, canModerate, onReply, onRemove, confirmingRemove, onArmRemove }) {
  const { author } = comment
  return (
    <article className="flex items-start gap-4" data-comment-id={comment.id}>
      <Circle initial={initialOf(author.firstName)} photoUrl={author.isCreator ? photoUrl : null} small={small} />
      <div className="min-w-0 flex-1">
        {/* "SOFIA · Ticket No. 41 · 2 hours ago" — the name in caps warm/90,
            the rest muted, one tracked line. */}
        <p className="font-sans font-normal text-xs tracking-[0.26em] text-muted">
          <span className="uppercase text-warm/90">{author.firstName}</span>
          {author.ticketNo != null && <> · Ticket No. {author.ticketNo}</>}
          {' · '}
          <time dateTime={comment.createdAt}>{relativeTime(comment.createdAt)}</time>
        </p>
        <p className="mt-2.5 max-w-[62ch] whitespace-pre-wrap font-sans font-light text-[1.0625rem] leading-[1.85] text-warm/80">
          {comment.body}
        </p>
        <p className="mt-3 flex gap-6">
          {onReply && (
            <button type="button" onClick={onReply} className={ACTION_CLASS}>
              Reply
            </button>
          )}
          {canModerate && (
            /* Two clicks (founder, 2026-09-09): the first turns the text to
               "Confirm remove", the second removes; clicking anywhere else
               resets it (the parent's document listener). */
            <button
              type="button"
              data-confirm-remove={comment.id}
              onClick={confirmingRemove ? onRemove : onArmRemove}
              className={ACTION_CLASS}
            >
              {confirmingRemove ? 'Confirm remove' : 'Remove'}
            </button>
          )}
        </p>
      </div>
    </article>
  )
}

export default function WatchComments({ filmId, filmmakerPhotoUrl = null }) {
  const [state, setState] = useState(null) // { comments, viewer } once the server said 200
  const [busyKey, setBusyKey] = useState(null) // 'top' or the parent id whose composer is posting
  const [topError, setTopError] = useState('')
  const [replyTo, setReplyTo] = useState(null) // the top-level comment id with an open reply composer
  const [replyError, setReplyError] = useState('')
  const [confirmRemoveId, setConfirmRemoveId] = useState(null) // the comment whose Remove is armed

  /** An armed "Confirm remove" resets on any pointer-down outside that
   *  button, and on Escape. */
  useEffect(() => {
    if (!confirmRemoveId) return
    const onPointerDown = (e) => {
      const armed = e.target?.closest?.('[data-confirm-remove]')
      if (!armed || armed.getAttribute('data-confirm-remove') !== confirmRemoveId) setConfirmRemoveId(null)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setConfirmRemoveId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [confirmRemoveId])

  const sessionToken = async () => {
    const { data: { session } = {} } = await supabase.auth.getSession()
    return session?.access_token || null
  }

  useEffect(() => {
    if (!filmId) return
    let cancelled = false
    ;(async () => {
      try {
        const token = await sessionToken()
        if (!token) return
        const data = await api.getFilmComments(filmId, token)
        if (cancelled || !data?.viewer) return
        setState({ comments: Array.isArray(data.comments) ? data.comments : [], viewer: data.viewer })
      } catch {
        /* no section: a visitor without a claim, an older API, or a failure */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filmId])

  if (!state) return null
  const { comments, viewer } = state

  /** The list refreshes after the viewer posts (no polling). */
  const refresh = async () => {
    const token = await sessionToken()
    if (!token) return
    const data = await api.getFilmComments(filmId, token)
    if (data?.viewer) {
      setState({ comments: Array.isArray(data.comments) ? data.comments : [], viewer: data.viewer })
    }
  }

  const post = async (body, parentCommentId, setError) => {
    const bodyError = commentBodyError(body)
    if (bodyError) {
      setError(bodyError)
      return false
    }
    setBusyKey(parentCommentId || 'top')
    setError('')
    let posted = false
    try {
      const token = await sessionToken()
      if (!token) throw new Error(COMMENT_UNAVAILABLE_MESSAGE)
      await api.postFilmComment(filmId, { body, parentCommentId }, token)
      posted = true
      // The refresh is best-effort: the comment IS posted, so a failed
      // re-read must never read as a failed post (that invited a duplicate).
      await refresh().catch(() => {})
      return true
    } catch (err) {
      if (posted) return true
      const message = err?.message
      setError(message && message !== 'forbidden' ? message : COMMENT_UNAVAILABLE_MESSAGE)
      return false
    } finally {
      setBusyKey(null)
    }
  }

  const remove = async (commentId) => {
    setConfirmRemoveId(null)
    try {
      const token = await sessionToken()
      if (!token) return
      await api.adminRemoveComment(commentId, token)
      await refresh()
    } catch {
      /* the list simply keeps the comment; the founder can retry */
    }
  }

  const topLevel = comments.filter((c) => !c.parentId)
  const repliesOf = (id) => comments.filter((c) => c.parentId === id)

  return (
    <section
      aria-label="Join the conversation"
      className="mx-auto mt-12 w-full max-w-[42rem] border-t border-warm/15 pt-10 text-left min-[900px]:mt-[clamp(3rem,6svh,4.5rem)]"
    >
      <h2 className="font-sans font-normal text-[11px] uppercase tracking-[0.32em] text-muted">
        Join the conversation
      </h2>

      {/* Composer first. The empty state is the heading and the composer,
          nothing else. */}
      <div className="mt-7">
        <Composer
          viewer={viewer}
          photoUrl={filmmakerPhotoUrl}
          onSubmit={(body) => post(body, null, setTopError)}
          busy={busyKey === 'top'}
          error={topError}
          idSuffix="top"
        />
      </div>

      {topLevel.length > 0 && (
        <div className="mt-10">
          {topLevel.map((c, i) => {
            const replies = repliesOf(c.id)
            const replying = replyTo === c.id
            return (
              <div key={c.id} className={i > 0 ? 'mt-9' : ''}>
                <CommentItem
                  comment={c}
                  photoUrl={filmmakerPhotoUrl}
                  canModerate={viewer.canModerate === true}
                  onReply={() => {
                    setReplyError('')
                    setReplyTo(replying ? null : c.id)
                  }}
                  onRemove={() => remove(c.id)}
                  confirmingRemove={confirmRemoveId === c.id}
                  onArmRemove={() => setConfirmRemoveId(c.id)}
                />
                {(replies.length > 0 || replying) && (
                  /* Replies: indented 56px under their parent on a left
                     hairline, 32px circles, 24px apart; the reply composer
                     sits at the end of the thread. */
                  <div className="ml-14 mt-6 border-l border-warm/10 pl-5">
                    {replies.map((r, j) => (
                      <div key={r.id} className={j > 0 ? 'mt-6' : ''}>
                        <CommentItem
                          comment={r}
                          photoUrl={filmmakerPhotoUrl}
                          small
                          canModerate={viewer.canModerate === true}
                          onRemove={() => remove(r.id)}
                          confirmingRemove={confirmRemoveId === r.id}
                          onArmRemove={() => setConfirmRemoveId(r.id)}
                        />
                      </div>
                    ))}
                    {replying && (
                      <div className={replies.length > 0 ? 'mt-6' : ''}>
                        <Composer
                          viewer={viewer}
                          photoUrl={filmmakerPhotoUrl}
                          small
                          autoFocus
                          onSubmit={async (body) => {
                            const ok = await post(body, c.id, setReplyError)
                            if (ok) setReplyTo(null)
                            return ok
                          }}
                          busy={busyKey === c.id}
                          error={replyError}
                          idSuffix={`reply-${c.id}`}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
