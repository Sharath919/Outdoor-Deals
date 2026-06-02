import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { sectionBreakMarkerCard, sectionBreakMarkerUrl } from '@/utils/sectionBreak'

type SectionBreakDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (marker: string) => void
}

async function uploadSectionBreakImage(file: File): Promise<string> {
  let uploadBody: Blob
  const safeName = file.name.replace(/\s/g, '-').replace(/\.[^.]+$/, '') + '.jpg'

  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  uploadBody = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not convert image to JPEG'))),
      'image/jpeg',
      0.92,
    )
  })

  const fileName = `articles/section-breaks/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('article-images').upload(fileName, uploadBody, {
    upsert: true,
    contentType: 'image/jpeg',
  })
  if (error) throw new Error(error.message)

  const {
    data: { publicUrl },
  } = supabase.storage.from('article-images').getPublicUrl(fileName)
  return publicUrl
}

export default function SectionBreakDialog({
  open,
  onOpenChange,
  onInsert,
}: SectionBreakDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [useCardImage, setUseCardImage] = useState(false)

  const close = () => {
    setUseCardImage(false)
    onOpenChange(false)
  }

  const insertCard = () => {
    onInsert(sectionBreakMarkerCard())
    toast.success('Section break inserted (card image)')
    close()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    try {
      const publicUrl = await uploadSectionBreakImage(file)
      onInsert(sectionBreakMarkerUrl(publicUrl))
      toast.success('Section break image uploaded')
      close()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[#12101f] text-white">
        <DialogHeader>
          <DialogTitle className="text-amber-400/90 font-medium tracking-wide">
            Insert section break
          </DialogTitle>
          <DialogDescription className="text-white/50 text-sm">
            Full-width blurred divider with a ✦ symbol. Choose a custom image or the article card.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-white/10 p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-white/50">
              Option A — Upload image
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onFileChange}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 rounded-lg border border-amber-400/30 text-amber-400 text-sm hover:bg-amber-400/10 transition-colors disabled:opacity-40"
            >
              {uploading ? 'Uploading…' : 'Choose image file'}
            </button>
          </div>

          <div className="rounded-lg border border-white/10 p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-white/50">
              Option B — Card image
            </p>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={useCardImage}
                onChange={(e) => setUseCardImage(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-white/5 text-amber-400 focus:ring-amber-400/40"
              />
              <span className="text-sm text-white/70 group-hover:text-white/90">
                Use card image (blurred)
                <span className="block text-xs text-white/40 mt-0.5 font-normal">
                  Requires Tarot Card ID on this article
                </span>
              </span>
            </label>
            <button
              type="button"
              disabled={!useCardImage}
              onClick={insertCard}
              className="w-full py-2.5 rounded-lg bg-amber-400/15 border border-amber-400/40 text-amber-300 text-sm hover:bg-amber-400/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Insert card section break
            </button>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={close}
            className="text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
