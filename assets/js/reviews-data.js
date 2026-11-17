/*
 * Vayora: published customer reviews.
 *
 * Reviews sent through the "Write a review" form arrive by email (subject "New Vayora review: …").
 * To publish one, copy it into the list below exactly as the customer wrote it. Only add reviews
 * that a real customer sent you and agreed to have published. Never write or edit reviews yourself.
 *
 *   name      Name as the customer asked it to be shown, e.g. "Priya S."
 *   city      Optional, e.g. "Chennai"
 *   rating    Whole number from 1 to 5
 *   title     Optional short headline
 *   text      The review
 *   date      Date received, as YYYY-MM-DD
 *   verified  true only if their order is marked paid in your Orders table; otherwise leave it out
 *
 * Example (remove the // at the start of each line to use the pattern):
 *   // { name: 'Priya S.', city: 'Chennai', rating: 5, title: 'Short headline', text: 'Their words.', date: '2026-12-01', verified: true },
 *
 * The rating summary (average, count and bars) is worked out from this list automatically.
 */
window.VAYORA_REVIEWS = [
];
