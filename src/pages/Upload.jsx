import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import InviteForm from '../components/InviteForm'
import DeepcastLogo from '../components/DeepcastLogo'
import FilmForm from '../components/FilmForm'
import { ensureHttpsUrl } from '../lib/httpsUrl.js'

export default function Upload() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editFilmId = searchParams.get('edit')

  const fileInputRef = useRef(null)
  const thumbInputRef = useRef(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoFile, setVideoFile] = useState(null)
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [thumbnailPreview, setThumbnailPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [film, setFilm] = useState(null)
  const [error, setError] = useState('')
  const [step, setStep] = useState('form') // form, uploading, processing, ready
  const [loadingEditFilm, setLoadingEditFilm] = useState(!!editFilmId)
  const [existingFilm, setExistingFilm] = useState(null)

  const handleThumbnailSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) {
      setThumbnailFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => setThumbnailPreview(ev.target.result)
      reader.readAsDataURL(file)
    }
  }, [])

  useEffect(() => {
    if (!editFilmId || !profile?.id) {
      setLoadingEditFilm(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoadingEditFilm(true)
      const { data, error: fetchError } = await supabase
        .from('films')
        .select('*')
        .eq('id', editFilmId)
        .single()

      if (cancelled) return

      if (fetchError || !data || data.creator_id !== profile.id) {
        navigate('/dashboard', { replace: true })
        return
      }

      setExistingFilm(data)
      setTitle(data.title || '')
      setDescription(data.description || '')
      setThumbnailPreview(ensureHttpsUrl(data.thumbnail_url) ?? data.thumbnail_url ?? null)
      setThumbnailFile(null)
      setVideoFile(null)
      setLoadingEditFilm(false)
    })()

    return () => {
      cancelled = true
    }
  }, [editFilmId, profile?.id, navigate])

  async function uploadThumbnailIfNeeded() {
    if (!thumbnailFile) return null
    const ext = thumbnailFile.name.split('.').pop()
    const path = `thumbnails/${Date.now()}.${ext}`
    const { error: thumbError } = await supabase.storage.from('film-assets').upload(path, thumbnailFile)

    if (thumbError) return null
    const { data: urlData } = supabase.storage.from('film-assets').getPublicUrl(path)
    return ensureHttpsUrl(urlData.publicUrl) ?? urlData.publicUrl
  }

  async function saveMetadataOnly(filmId, baseFilm) {
    const thumbUrl =
      (await uploadThumbnailIfNeeded()) ??
      ensureHttpsUrl(baseFilm.thumbnail_url) ??
      baseFilm.thumbnail_url ??
      null

    const { error: upErr } = await supabase
      .from('films')
      .update({
        title: title.trim(),
        description: description.trim(),
        thumbnail_url: thumbUrl,
      })
      .eq('id', filmId)

    if (upErr) throw upErr
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!editFilmId && !videoFile) {
      setError('Please select a video file.')
      return
    }

    setError('')
    setUploading(true)

    try {
      // ——— Edit: metadata only (no new video) ———
      if (editFilmId && existingFilm && !videoFile) {
        await saveMetadataOnly(editFilmId, existingFilm)
        setUploading(false)
        navigate('/dashboard')
        return
      }

      // ——— Edit: replace video ———
      if (editFilmId && existingFilm && videoFile) {
        setStep('uploading')

        let thumbnailUrl = ensureHttpsUrl(existingFilm.thumbnail_url) ?? existingFilm.thumbnail_url ?? null
        if (thumbnailFile) {
          const uploaded = await uploadThumbnailIfNeeded()
          if (uploaded) thumbnailUrl = uploaded
        }

        await supabase
          .from('films')
          .update({
            title: title.trim(),
            description: description.trim(),
            thumbnail_url: thumbnailUrl,
            status: 'processing',
            mux_asset_id: null,
            mux_playback_id: null,
          })
          .eq('id', editFilmId)

        const { uploadUrl, assetId } = await api.createUploadUrl(editFilmId)

        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
          }
        }

        await new Promise((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(new Error('Upload failed'))
          }
          xhr.onerror = () => reject(new Error('Upload failed'))
          xhr.send(videoFile)
        })

        setStep('processing')
        setProcessing(true)

        const pollInterval = setInterval(async () => {
          try {
            const { status, playbackId } = await api.getAssetStatus(assetId)

            if (status === 'ready' && playbackId) {
              clearInterval(pollInterval)

              await supabase
                .from('films')
                .update({
                  mux_asset_id: assetId,
                  mux_playback_id: playbackId,
                  status: 'ready',
                })
                .eq('id', editFilmId)

              setFilm({
                ...existingFilm,
                id: editFilmId,
                mux_playback_id: playbackId,
                status: 'ready',
              })
              setProcessing(false)
              setStep('ready')
            }
          } catch {
            // keep polling
          }
        }, 5000)

        setTimeout(() => {
          clearInterval(pollInterval)
          setProcessing((p) => {
            if (p) {
              setFilm({ ...existingFilm, id: editFilmId })
              setStep('ready')
              return false
            }
            return p
          })
        }, 600000)

        setUploading(false)
        return
      }

      // ——— Create new film ———
      setStep('uploading')

      let thumbnailUrl = null
      if (thumbnailFile) {
        const uploaded = await uploadThumbnailIfNeeded()
        thumbnailUrl = uploaded
      }

      const { data: filmData, error: filmError } = await supabase
        .from('films')
        .insert({
          creator_id: profile.id,
          title,
          description,
          thumbnail_url: thumbnailUrl,
          status: 'processing',
        })
        .select()
        .single()

      if (filmError) throw filmError

      const { uploadUrl, assetId } = await api.createUploadUrl(filmData.id)

      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error('Upload failed'))
        }
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.send(videoFile)
      })

      setStep('processing')
      setProcessing(true)

      const pollInterval = setInterval(async () => {
        try {
          const { status, playbackId } = await api.getAssetStatus(assetId)

          if (status === 'ready' && playbackId) {
            clearInterval(pollInterval)

            await supabase
              .from('films')
              .update({
                mux_asset_id: assetId,
                mux_playback_id: playbackId,
                status: 'ready',
              })
              .eq('id', filmData.id)

            setFilm({ ...filmData, mux_playback_id: playbackId, status: 'ready' })
            setProcessing(false)
            setStep('ready')
          }
        } catch (err) {
          // Keep polling
        }
      }, 5000)

      setTimeout(() => {
        clearInterval(pollInterval)
        if (processing) {
          setFilm(filmData)
          setStep('ready')
          setProcessing(false)
        }
      }, 600000)
    } catch (err) {
      setError(err.message)
      setStep('form')
    } finally {
      setUploading(false)
    }
  }

  if (loadingEditFilm) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (step === 'ready' && film) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="max-w-lg mx-auto text-center animate-fade-in">
          <div className="flex justify-center mb-8">
            <DeepcastLogo variant="ink" className="h-8" />
          </div>
          <h1 className="text-2xl font-display mb-2">
            {editFilmId ? 'Your film is updated' : 'Your film is ready'}
          </h1>
          <p className="text-text-muted text-sm mb-10">
            {editFilmId
              ? 'Share new invitations when you’re ready.'
              : 'Send your first seed invitations to start spreading the screening.'}
          </p>

          <InviteForm
            filmId={film.id}
            filmTitle={title}
            filmDescription={description}
            senderName={profile.name}
            senderEmail={profile.email}
            senderId={profile.id}
            maxInvites={10}
            unlimited
          />

          <div className="mt-10">
            <Link to="/dashboard" className="text-text-muted text-sm hover:text-text transition-colors">
              Go to dashboard &rarr;
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'uploading' || step === 'processing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="max-w-sm w-full text-center animate-fade-in">
          <div className="flex justify-center mb-8">
            <DeepcastLogo variant="ink" className="h-8" />
          </div>

          {step === 'uploading' ? (
            <>
              <h2 className="text-xl font-display mb-6">
                {editFilmId ? 'Uploading new video' : 'Uploading your film'}
              </h2>
              <div className="w-full h-1 bg-border rounded-none overflow-hidden mb-4">
                <div
                  className="h-full bg-accent transition-all duration-300 rounded-none"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-text-muted text-sm">{uploadProgress}%</p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-display mb-6">Processing your film</h2>
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-text-muted text-sm">
                This may take a few moments. Your film is being encoded for optimal playback.
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  const isEdit = Boolean(editFilmId && existingFilm)
  const videoHint =
    isEdit && existingFilm?.status === 'ready'
      ? 'Current video is live. Choose a file only if you want to replace it (re-encodes on Mux).'
      : isEdit && existingFilm?.status === 'processing'
        ? 'Video is still processing. You can replace it once ready, or save title/description/thumbnail now without a new file.'
        : isEdit
          ? 'Choose a new video file only if you want to replace the uploaded file.'
          : null

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-lg mx-auto">
        <div className="mb-10 animate-fade-in">
          <Link to="/dashboard" className="text-text-muted text-sm hover:text-text transition-colors">
            &larr; Dashboard
          </Link>
          <h1 className="text-2xl font-display mt-6">{isEdit ? 'Edit film' : 'Upload a film'}</h1>
          {isEdit && (
            <p className="text-text-muted text-sm mt-2">
              Update details anytime. Add a new video file only when you want to replace the current one.
            </p>
          )}
        </div>

        <FilmForm
          title={title}
          onTitleChange={setTitle}
          description={description}
          onDescriptionChange={setDescription}
          thumbnailPreview={thumbnailPreview}
          onThumbnailSelect={handleThumbnailSelect}
          thumbInputRef={thumbInputRef}
          videoFile={videoFile}
          onVideoFileChange={setVideoFile}
          fileInputRef={fileInputRef}
          videoOptional={isEdit}
          videoStatusHint={videoHint}
          error={error}
          submitLabel={isEdit ? 'Save changes' : 'Upload film'}
          disabled={uploading}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  )
}
