type AuthorBioProps = {
  authorName: string
  initials: string
  bio?: string
}

export default function AuthorBio({ authorName, initials, bio }: AuthorBioProps) {
  const defaultBio = `${authorName} tests outdoor gear on real trips — not in a lab. We buy our own gear and may earn a commission from qualifying purchases, but recommendations stay independent.`

  return (
    <div className="author-bio">
      <div className="avatar">{initials}</div>
      <div>
        <h3>Why trust us</h3>
        <h4>{authorName}</h4>
        <p>{bio ?? defaultBio}</p>
      </div>
    </div>
  )
}
