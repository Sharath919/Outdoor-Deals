import fs from 'node:fs'
import path from 'node:path'
import { transformHtmlTemplate } from '@unhead/react/server'

type ServerHead = Parameters<typeof transformHtmlTemplate>[0]

/** HTML shells produced by `npm run build` — prefer empty SSR shell with placeholders. */
const TEMPLATE_CANDIDATES = [
  'dist/client/ssr-template.html',
  'dist/client/index.html',
  'dist/client/404.html',
] as const

const ROOT_OPEN = '<div id="root">'

export function resolveTemplatePath(): string {
  const cwd = process.cwd()
  for (const rel of TEMPLATE_CANDIDATES) {
    const templatePath = path.resolve(cwd, rel)
    if (fs.existsSync(templatePath)) return templatePath
  }
  throw new Error(
    `SSR HTML template not found. Tried: ${TEMPLATE_CANDIDATES.join(', ')} (cwd=${cwd})`,
  )
}

export function loadClientTemplate(): string {
  return fs.readFileSync(resolveTemplatePath(), 'utf-8')
}

/** Replace #root inner HTML even when the shell was previously prerendered (no placeholder). */
function injectAppHtml(template: string, appHtml: string): string {
  if (template.includes('<!--app-html-->')) {
    return template.replace('<!--app-html-->', appHtml)
  }

  const rootIdx = template.indexOf(ROOT_OPEN)
  if (rootIdx === -1) {
    return template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
  }

  const innerStart = rootIdx + ROOT_OPEN.length
  let depth = 1
  let i = innerStart
  while (i < template.length && depth > 0) {
    const nextOpen = template.indexOf('<div', i)
    const nextClose = template.indexOf('</div>', i)
    if (nextClose === -1) break
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1
      i = nextOpen + 4
    } else {
      depth -= 1
      if (depth === 0) {
        return (
          template.slice(0, innerStart) +
          appHtml +
          template.slice(nextClose)
        )
      }
      i = nextClose + 6
    }
  }

  return template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
}

export async function injectRenderedHtml(
  template: string,
  appHtml: string,
  head: ServerHead,
): Promise<string> {
  const html = injectAppHtml(template, appHtml)
  return transformHtmlTemplate(head, html)
}
