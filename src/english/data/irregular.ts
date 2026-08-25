/* Inflected form -> lemma, for the words English does not inflect by rule.
 *
 * Written by hand, and it is the whole dictionary this pipeline has: German
 * ships about 8,000 lines of generated tables, and English ships this. That is
 * the honest state of it. English regular inflection really is rules - plural
 * -s, past -ed, participle -ing - and lemmatize.ts covers those without a
 * table, so what is left is the irregular tail plus the handful of nouns that
 * change their vowel.
 *
 * Chosen for what a family types rather than for coverage of the language:
 * eating, drinking, sleeping, washing, going, wanting, hurting.
 *
 * Note what a mapping here does not do. "left" is mapped to "leave" and "felt"
 * to "feel", but neither is what gets searched first: lang/shared.ts asks for
 * the written word before any lemma of it, so somebody who types "left" is
 * shown the direction if the collection has one. These are the second
 * question, and they only get asked when the first one came back empty.
 */
const table: Record<string, string> = {
  // to be, to have, to do - mostly stopwords, but a board may be given one alone
  am: 'be', are: 'be', is: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', having: 'have',
  does: 'do', did: 'do', done: 'do', doing: 'do',

  // nouns that change instead of adding -s
  children: 'child', feet: 'foot', teeth: 'tooth', men: 'man', women: 'woman',
  mice: 'mouse', geese: 'goose', people: 'person', lives: 'life',
  knives: 'knife', leaves: 'leaf', wolves: 'wolf', shelves: 'shelf',
  halves: 'half', loaves: 'loaf', wives: 'wife', thieves: 'thief',
  scarves: 'scarf', calves: 'calf', hooves: 'hoof',

  // the verbs a day is made of
  ate: 'eat', eaten: 'eat',
  drank: 'drink', drunk: 'drink',
  went: 'go', gone: 'go', goes: 'go',
  ran: 'run',
  saw: 'see', seen: 'see',
  made: 'make',
  took: 'take', taken: 'take',
  gave: 'give', given: 'give',
  came: 'come',
  got: 'get', gotten: 'get',
  said: 'say',
  told: 'tell',
  thought: 'think',
  brought: 'bring',
  bought: 'buy',
  caught: 'catch',
  taught: 'teach',
  found: 'find',
  felt: 'feel',
  left: 'leave',
  held: 'hold',
  heard: 'hear',
  kept: 'keep',
  slept: 'sleep',
  sat: 'sit',
  stood: 'stand',
  wrote: 'write', written: 'write',
  sang: 'sing', sung: 'sing',
  swam: 'swim', swum: 'swim',
  flew: 'fly', flown: 'fly',
  drew: 'draw', drawn: 'draw',
  threw: 'throw', thrown: 'throw',
  knew: 'know', known: 'know',
  grew: 'grow', grown: 'grow',
  blew: 'blow', blown: 'blow',
  wore: 'wear', worn: 'wear',
  broke: 'break', broken: 'break',
  spoke: 'speak', spoken: 'speak',
  chose: 'choose', chosen: 'choose',
  forgot: 'forget', forgotten: 'forget',
  began: 'begin', begun: 'begin',
  rang: 'ring', rung: 'ring',
  fell: 'fall', fallen: 'fall',
  fed: 'feed',
  met: 'meet',
  paid: 'pay',
  lost: 'lose',
  built: 'build',
  sent: 'send',
  spent: 'spend',
  woke: 'wake', woken: 'wake',
  drove: 'drive', driven: 'drive',
  rode: 'ride', ridden: 'ride',
  hid: 'hide', hidden: 'hide',
  bit: 'bite', bitten: 'bite',
  swept: 'sweep',
  bent: 'bend',
  lent: 'lend',

  // comparatives that replace the word rather than adding to it
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
};

export default table;
