/** Amazon Associates + PA-API settings stored in ai_config. */

export type AmazonAffiliateConfig = {
  associateTag: string
  marketplace: string
  siteName: string
  siteUrl: string
  accentColor: string
  authorName: string
  authorInitials: string
  disclosureText: string
  /** Set when access key exists in DB — never expose the key to the client. */
  hasPaapiAccessKey: boolean
  /** Set when secret key exists in DB. */
  hasPaapiSecretKey: boolean
}

export const AMAZON_CONFIG_KEYS = [
  'amazon_associate_tag',
  'amazon_marketplace',
  'amazon_paapi_access_key',
  'amazon_paapi_secret_key',
  'amazon_site_name',
  'amazon_site_url',
  'amazon_accent_color',
  'amazon_author_name',
  'amazon_author_initials',
  'amazon_disclosure_text',
] as const

export type AmazonConfigKey = (typeof AMAZON_CONFIG_KEYS)[number]

export const DEFAULT_AMAZON_AFFILIATE_CONFIG: Omit<
  AmazonAffiliateConfig,
  'hasPaapiAccessKey' | 'hasPaapiSecretKey'
> = {
  associateTag: '',
  marketplace: 'www.amazon.com',
  siteName: 'Outdoor Deals',
  siteUrl: 'https://outdoordeals.com',
  accentColor: '#2D4A2B',
  authorName: 'Outdoor Deals Team',
  authorInitials: 'OD',
  disclosureText:
    'We may earn a commission from qualifying purchases, but our recommendations are independent.',
}

/** Server-side only — includes secret keys. */
export type AmazonAffiliateSecrets = {
  paapiAccessKey: string
  paapiSecretKey: string
}

export type AmazonAffiliateServerConfig = Omit<
  AmazonAffiliateConfig,
  'hasPaapiAccessKey' | 'hasPaapiSecretKey'
> &
  AmazonAffiliateSecrets
