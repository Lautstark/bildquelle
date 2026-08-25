/* Verb -> the particles that make a different verb of it.
 *
 * English's answer to German's separable verbs, and it is the same problem
 * pointing the other way. German splits one written word across a clause -
 * "räum ... auf" - and has to put it back together. English writes two words
 * that mean one thing - "clean up" - and has to keep them together, because
 * "up" alone on a communication board is a direction and "clean up" is a
 * request to tidy a room.
 *
 * The guard is the same guard the German side uses: a merge only happens when
 * the pair is in this table. Most of these particles are also ordinary
 * prepositions - "put it ON the table" is not the phrasal "put on" - so a rule
 * that merged any verb with any following particle would eat the spatial words
 * that AAC needs most.
 *
 * Short and concrete on purpose. Every pair here is something somebody asks a
 * child to do.
 */
const table: Record<string, string[]> = {
  brush: ['off'],
  calm: ['down'],
  clean: ['up'],
  come: ['back', 'in', 'out'],
  cut: ['out'],
  dress: ['up'],
  drink: ['up'],
  eat: ['up'],
  get: ['up', 'dressed', 'off'],
  give: ['back'],
  go: ['out', 'away', 'back'],
  hang: ['up'],
  hold: ['on'],
  hurry: ['up'],
  lie: ['down'],
  look: ['for', 'after', 'out'],
  pick: ['up'],
  put: ['on', 'away', 'down', 'back'],
  sit: ['down', 'up'],
  slow: ['down'],
  stand: ['up'],
  switch: ['on', 'off'],
  take: ['off', 'out'],
  throw: ['away'],
  tidy: ['up'],
  turn: ['on', 'off', 'around'],
  wake: ['up'],
  wash: ['up'],
  wipe: ['up', 'off'],
};

export default table;
