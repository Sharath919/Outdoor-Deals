/** Amazon Associates + Creators API settings stored in ai_config. */

export type AmazonAffiliateConfig = {
  /** Tracking ID on affiliate links (?tag=) for this site. */
  associateTag: string
  /** Partner tag tied to Creators API credentials (can differ from associateTag). */
  paapiPartnerTag: string
  marketplace: string
  /** Creators API credential version, e.g. 3.1 (NA LWA). */
  creatorsApiVersion: string
  siteName: string
  siteUrl: string
  accentColor: string
  authorName: string
  authorInitials: string
  disclosureText: string
  /** Set when Creators credential ID exists in DB — never expose the value to the client. */
  hasPaapiAccessKey: boolean
  /** Set when Creators credential secret exists in DB. */
  hasPaapiSecretKey: boolean
}

export const AMAZON_CONFIG_KEYS = [
  'amazon_associate_tag',
  'amazon_paapi_partner_tag',
  'amazon_marketplace',
  'amazon_creators_api_version',
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

/** Global toggle key for showing/hiding Amazon product images (stored in ai_config). */
export const SHOW_PRODUCT_IMAGES_KEY = 'show_product_images'

/** Site tracking ID for outbound Amazon links (?tag=). Not the Creators API partner tag. */
export const SITE_ASSOCIATE_TAG = 'gearnsteer-20'

export const DEFAULT_AMAZON_AFFILIATE_CONFIG: Omit<
  AmazonAffiliateConfig,
  'hasPaapiAccessKey' | 'hasPaapiSecretKey'
> = {
  associateTag: SITE_ASSOCIATE_TAG,
  paapiPartnerTag: '',
  marketplace: 'www.amazon.com',
  creatorsApiVersion: '3.1',
  siteName: 'GearAndSteer',
  siteUrl: 'https://gearandsteer.com',
  accentColor: '#2D4A2B',
  authorName: 'GearAndSteer Team',
  authorInitials: 'GS',
  disclosureText:
    'We may earn a commission from qualifying purchases, but our recommendations are independent.',
}

/** Server-side only — includes secret keys (Creators credential ID/secret). */
export type AmazonAffiliateSecrets = {
  paapiAccessKey: string
  paapiSecretKey: string
}

export type AmazonAffiliateServerConfig = Omit<
  AmazonAffiliateConfig,
  'hasPaapiAccessKey' | 'hasPaapiSecretKey'
> &
  AmazonAffiliateSecrets
