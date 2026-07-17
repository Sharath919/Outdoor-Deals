import Image from 'next/image'
import Link from 'next/link'
import { outdoorCategoryLabel } from '@/config/outdoorCategories'
import type { GuideListItem } from '@/lib/articles-server'

function formatPublishedDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type GuideCardProps = {
  article: GuideListItem
}

export default function GuideCard({ article }: GuideCardProps) {
  const categoryLabel = outdoorCategoryLabel(article.category)
  const publishedLabel = formatPublishedDate(article.published_at)
  const hasMedia = Boolean(article.hero_image_url)

  return (
    <article className={`guides-card${hasMedia ? '' : ' guides-card--no-media'}`}>
      <Link href={`/guides/${article.slug}`} className="guides-card-link">
        {hasMedia ? (
          <div className="guides-card-media">
            <Image
              src={article.hero_image_url}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="guides-card-image"
            />
            {categoryLabel ? <span className="guides-card-category">{categoryLabel}</span> : null}
          </div>
        ) : null}
        <div className="guides-card-body">
          {!hasMedia && categoryLabel ? (
            <span className="guides-card-category guides-card-category--inline">{categoryLabel}</span>
          ) : null}
          <h2 className="guides-card-title">{article.title}</h2>
          {article.meta_description ? (
            <p className="guides-card-excerpt">{article.meta_description}</p>
          ) : null}
          <div className="guides-card-meta">
            {publishedLabel ? <time dateTime={article.published_at ?? undefined}>{publishedLabel}</time> : null}
            <span className="guides-card-cta">Read guide</span>
          </div>
        </div>
      </Link>
    </article>
  )
}
