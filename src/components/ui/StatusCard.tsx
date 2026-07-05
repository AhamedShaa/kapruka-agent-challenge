/**
 * StatusCard — shared design token for transactional/system responses.
 *
 * Visual language: lavender bg + left accent bar + key-value rows + optional CTA.
 * Used for: delivery quotes, order summaries, payment confirmations, errors.
 *
 * Width: always 100% of parent — the 768px column constraint lives in the chat
 * layout, not here.
 */
export { default, type ResponseCardRow } from '@/components/ui/ResponseCard.js';
