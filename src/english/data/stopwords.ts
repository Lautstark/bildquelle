/* Function words a telegraphic board leaves out.
 *
 * Written by hand against the German list rather than taken from a standard
 * English stopword list, because the standard ones are built for search engines
 * and throw away most of what an AAC board is for. The German list is the
 * specification here: it drops articles, the auxiliary verbs and the modal
 * particles, and it keeps every personal pronoun, every preposition and every
 * negation. "ich", "unter" and "nicht" are all in it as words, not as noise.
 *
 * So, deliberately NOT here:
 *
 * - Pronouns. "I", "you", "me", "my" are among the most-pressed keys on a real
 *   board, and German keeps "ich" and "du" for the same reason.
 * - Prepositions. Spatial concepts carry meaning - "in", "on", "under",
 *   "behind" - and German's tokenizer goes out of its way to preserve them.
 *   "to" is left out of this list for that reason: it is the infinitive marker
 *   often enough, and a direction often enough, and the direction wins.
 * - "not" and "no". Negation is the whole content of a sentence that has it.
 * - The modals: can, could, may, might, must, should. "I can", "I must" and "I
 *   want" are sentences, and German keeps können and müssen for that reason.
 *   "will", "shall" and "would" ARE here - they are the pure future and
 *   subjunctive auxiliaries, and German drops "wird", "wäre" and "hätte".
 *
 * The entry worth arguing about is "do". It is the auxiliary in "I don't like
 * it" and a real verb in "do your homework", and this list drops both. German
 * has the same collision with "haben" and drops it, which is why it is here -
 * but if English coverage ever gets measured properly, this is the first line
 * to test rather than the last.
 */
const table: string[] = [
  'a', 'actually', 'already', 'am', 'an', 'anyway', 'are',
  'be', 'been', 'being',
  'did', 'do', 'does', 'done',
  'had', 'has', 'have', 'having',
  'indeed', 'is', 'just',
  'of', 'only', 'perhaps', 'quite', 'rather', 'really',
  'shall', 'so', 'somehow', 'such',
  'that', 'the', 'these', 'this', 'those',
  'very', 'was', 'were', 'which', 'whose', 'will', 'would',
];

export default table;
