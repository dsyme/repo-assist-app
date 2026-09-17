import { PTALItem } from '@shared/types'

/** Build a human-friendly action title for a PTAL item. */
export function ptalActionTitle(item: PTALItem): { verb: string; number: string; title: string } {
  const cleanTitle = item.title.replace(/^\[Repo Assist\]\s*/, '')
  const number = `#${item.number}`
  if (item.lastActivity.type === 'comment') {
    return { verb: 'Check comment on', number, title: cleanTitle }
  }
  if (item.lastActivity.type === 'commit') {
    return { verb: 'Review update on', number, title: cleanTitle }
  }
  if (item.type === 'pr') {
    return { verb: 'Review', number, title: cleanTitle }
  }
  return { verb: 'Review', number, title: cleanTitle }
}
