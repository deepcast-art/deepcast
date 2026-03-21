import { useRef } from 'react'

/**
 * Same fields & styling as the upload page — used for new uploads and editing films.
 */
export default function FilmForm({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  thumbnailPreview,
  onThumbnailSelect,
  thumbInputRef: thumbInputRefProp,
  videoFile,
  onVideoFileChange,
  fileInputRef: fileInputRefProp,
  /** When true, submit can proceed without a video (metadata-only edit). */
  videoOptional = false,
  /** Shown above the video picker in edit mode */
  videoStatusHint = null,
  error,
  submitLabel = 'Upload film',
  disabled = false,
  onSubmit,
}) {
  const thumbInternal = useRef(null)
  const fileInternal = useRef(null)
  const thumbInputRef = thumbInputRefProp ?? thumbInternal
  const fileInputRef = fileInputRefProp ?? fileInternal

  return (
    <form onSubmit={onSubmit} className="space-y-6 animate-fade-in animate-delay-200">
      {error && (
        <div className="text-error text-sm text-center bg-error/10 rounded-none py-2 px-4">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          required
          className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
          placeholder="Film title"
        />
      </div>

      <div>
        <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={3}
          className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors resize-none"
          placeholder="A brief description of your film"
        />
      </div>

      <div>
        <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">Thumbnail</label>
        <input
          ref={thumbInputRef}
          type="file"
          accept="image/*"
          onChange={onThumbnailSelect}
          className="hidden"
        />
        {thumbnailPreview ? (
          <div
            className="relative w-[100px] h-[100px] rounded-none overflow-hidden bg-bg-card cursor-pointer"
            onClick={() => thumbInputRef.current?.click()}
          >
            <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-full object-cover" />
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
          {videoOptional ? 'Video file (optional)' : 'Video file'}
        </label>
        {videoStatusHint && (
          <p className="text-text-muted text-xs mb-2">{videoStatusHint}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={(e) => onVideoFileChange(e.target.files?.[0] || null)}
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
            <span className="text-xs">{videoOptional ? 'Select new video to replace current' : 'Select video file'}</span>
          )}
        </button>
      </div>

      <button
        type="submit"
        disabled={disabled || !title?.trim() || (!videoOptional && !videoFile)}
        className="w-full bg-ink text-warm font-medium rounded-none py-3 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
      >
        {submitLabel}
      </button>
    </form>
  )
}
