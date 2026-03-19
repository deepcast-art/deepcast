import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import InviteForm from '../components/InviteForm'

export default function Upload() {
  const { profile } = useAuth()
  const navigate = useNavigate()
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

  function handleThumbnailSelect(e) {
    const file = e.target.files[0]
    if (file) {
      setThumbnailFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => setThumbnailPreview(ev.target.result)
      reader.readAsDataURL(file)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!videoFile) {
      setError('Please select a video file.')
      return
    }

    setError('')
    setUploading(true)
    setStep('uploading')

    try {
      // Upload thumbnail to Supabase Storage if provided
      let thumbnailUrl = null
      if (thumbnailFile) {
        const ext = thumbnailFile.name.split('.').pop()
        const path = `thumbnails/${Date.now()}.${ext}`
        const { error: thumbError } = await supabase.storage
          .from('film-assets')
          .upload(path, thumbnailFile)

        if (!thumbError) {
          const { data: urlData } = supabase.storage
            .from('film-assets')
            .getPublicUrl(path)
          thumbnailUrl = urlData.publicUrl
        }
      }

      // Create film record
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

      // Get Mux upload URL
      const { uploadUrl, assetId } = await api.createUploadUrl(filmData.id)

      // Upload video to Mux using PUT
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

      // Poll for asset status
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

      // Timeout after 10 minutes
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
      setUploading(false)
    }
  }

  if (step === 'ready' && film) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="max-w-lg mx-auto text-center animate-fade-in">
          <p className="text-accent text-sm tracking-[0.3em] uppercase mb-8">Deepcast</p>
          <h1 className="text-2xl font-display mb-2">Your film is ready</h1>
          <p className="text-text-muted text-sm mb-10">
            Send your first seed invitations to start spreading the screening.
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
            <Link
              to="/dashboard"
              className="text-text-muted text-sm hover:text-text transition-colors"
            >
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
          <p className="text-accent text-sm tracking-[0.3em] uppercase mb-8">Deepcast</p>

          {step === 'uploading' ? (
            <>
              <h2 className="text-xl font-display mb-6">Uploading your film</h2>
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

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-lg mx-auto">
        <div className="mb-10 animate-fade-in">
          <Link to="/dashboard" className="text-text-muted text-sm hover:text-text transition-colors">
            &larr; Dashboard
          </Link>
          <h1 className="text-2xl font-display mt-6">Upload a film</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in animate-delay-200">
          {error && (
            <div className="text-error text-sm text-center bg-error/10 rounded-none py-2 px-4">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="Film title"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors resize-none"
              placeholder="A brief description of your film"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
              Thumbnail
            </label>
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/*"
              onChange={handleThumbnailSelect}
              className="hidden"
            />
            {thumbnailPreview ? (
              <div
                className="relative w-[100px] h-[100px] rounded-none overflow-hidden bg-bg-card cursor-pointer"
                onClick={() => thumbInputRef.current?.click()}
              >
                <img
                  src={thumbnailPreview}
                  alt="Thumbnail preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-bg/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <span className="text-[10px]">Change</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => thumbInputRef.current?.click()}
                className="w-full aspect-video border-2 border-dashed border-border rounded-none flex flex-col items-center justify-center gap-2 text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs">Upload thumbnail</span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
              Video file
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => setVideoFile(e.target.files[0])}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-none py-8 flex flex-col items-center justify-center gap-2 text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              {videoFile ? (
                <span className="text-xs text-accent">{videoFile.name}</span>
              ) : (
                <span className="text-xs">Select video file</span>
              )}
            </button>
          </div>

          <button
            type="submit"
            disabled={uploading || !title || !videoFile}
            className="w-full bg-ink text-warm font-medium rounded-none py-3 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
          >
            Upload film
          </button>
        </form>
      </div>
    </div>
  )
}
