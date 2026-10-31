/**
 * The words of `./svelte/SymbolePanel`, and the one line its heading carries.
 *
 * The panel asks one question, „Welche Bilder?", and offers ARASAAC and
 * METACOM as two answers under it. It replaced, in bildhaft's settings, two
 * panels side by side and a button reading „Als Standard verwenden" under each,
 * which asked somebody to understand „Standardquelle" before they could pick.
 *
 * ## What the panel is, in four rules
 *
 * - **What cannot be picked is not offered as a pick.** METACOM is a card with
 *   no radio until its folder has been read; its one button sets it up, and
 *   once that is done METACOM is the answer.
 * - **One button where something is to be done, and nothing where it is not.**
 *   „Ordner wählen …" while METACOM is set up, „Zugriff erlauben" when the
 *   browser withdrew it, „Anderen Ordner wählen …" after a folder with no
 *   METACOM in it. A METACOM that is ready has its actions in a `⋯`.
 * - **A ZIP has no button of its own.** A folder picker shows no files, so the
 *   sentence says to choose the folder the ZIP lies in, and `MetacomProvider`
 *   reads the archive it finds there.
 * - **There is no cancel.** Setting up is one sentence and one button; going
 *   back is picking ARASAAC, which was the answer all along.
 *
 * The licence sentence is `metacom-panel`'s claim, shortened to the part a
 * person deciding needs: the pictures stay on this device. The link is the
 * same link.
 *
 * Filled positionally, for `metacom-panel.ts`'s reason: this package has no
 * `t()` and is not growing one.
 */
import type { ProviderStatus } from './types.js';
import { WORDS as METACOM, type PanelLang } from './metacom-panel.js';

export type { PanelLang };

/** The two answers. The panel offers no third. */
export type SymbolSource = 'arasaac' | 'metacom';

export interface SymboleWords {
  /** The radio group's accessible name. */
  question: string;
  arasaac: string;
  arasaacNote: string;
  metacom: string;
  /** Under METACOM before it is set up: what it takes. */
  metacomNeeds: string;
  /** The tag beside the name while METACOM cannot be picked. */
  notSetUp: string;
  settingUp: string;
  setUp: string;
  /** The one sentence while setting up. */
  pickFolder: string;
  /** Where the browser forgets the folder between visits (Safari, Firefox). */
  forgets: string;
  choose: string;
  chooseAnother: string;
  allow: string;
  licenceLink: string;
  licenceUrl: string;
  /** Shown on an English page only. */
  germanOnly: string;
  ready: (count: number, root: string) => string;
  reading: (root: string) => string;
  unpacking: (root: string) => string;
  found: (count: number) => string;
  noMetacom: (root: string) => string;
  noMetacomNote: string;
  unreadable: (root: string) => string;
  permission: (root: string) => string;
  permissionNote: string;
  more: string;
  reread: string;
  rereadNote: string;
  rendering: (segment: string) => string;
  noRendering: string;
  forget: string;
  forgetNote: string;
  /** Said once METACOM has been read in and is the answer. */
  nowMetacom: (count: number) => string;
  reread_done: string;
  forgotten: string;
  /** The panel heading: which answer is in force. */
  headArasaac: string;
  headMetacom: (count: number) => string;
}

const de = (count: number) => count.toLocaleString('de-DE');
const en = (count: number) => count.toLocaleString('en-GB');

export const WORDS: Record<PanelLang, SymboleWords> = {
  de: {
    question: 'Welche Bilder?',
    arasaac: 'ARASAAC',
    arasaacNote: 'Kostenlos und sofort da. Rund 13.000 Bilder.',
    metacom: 'METACOM',
    metacomNeeds: 'Dafür brauchst du eine eigene Lizenz und den METACOM-Ordner, der dazu gehört.',
    notSetUp: 'nicht eingerichtet',
    settingUp: 'wird eingerichtet',
    setUp: 'Einrichten …',
    pickFolder: 'Wähl deinen METACOM-Ordner. Hast du nur die ZIP-Datei, wähl den Ordner, in dem sie liegt.',
    forgets: 'Dein Browser sagt dazu vielleicht „hochladen“. Die Dateien bleiben aber auf deinem Gerät. '
      + 'Nach dem Neuladen wählst du den Ordner wieder.',
    choose: 'Ordner wählen …',
    chooseAnother: 'Anderen Ordner wählen …',
    allow: 'Zugriff erlauben',
    licenceLink: 'Noch keine Lizenz? Zu METACOM',
    licenceUrl: METACOM.de.licenceUrl,
    germanOnly: METACOM.de.germanOnly,
    ready: (count, root) => `${de(count)} Symbole aus „${root}“, nur auf diesem Gerät.`,
    reading: (root) => `„${root}“ wird gelesen …`,
    unpacking: (root) => `„${root}“ wird entpackt …`,
    found: (count) => `${de(count)} Bilder bisher.`,
    noMetacom: (root) => `In „${root}“ ist kein METACOM.`,
    noMetacomNote: 'Meist heißt der Ordner „METACOM_9_Desktop“.',
    unreadable: (root) => (root ? `„${root}“ ließ sich nicht lesen.` : 'Der Ordner ließ sich nicht lesen.'),
    permission: (root) => `Diese Seite darf „${root}“ gerade nicht lesen.`,
    permissionNote: 'Der Browser nimmt die Erlaubnis zwischen zwei Besuchen manchmal zurück. '
      + 'Bis du sie gibst, gilt ARASAAC.',
    more: 'Mehr zu METACOM',
    reread: 'Neu einlesen',
    rereadNote: 'Wenn im Ordner neue Bilder dazugekommen sind.',
    rendering: (segment) => `Darstellung: ${segment}`,
    noRendering: 'Darstellung: keine Vorliebe',
    forget: 'Ordner vergessen',
    forgetNote: 'Die Bilder bleiben auf der Festplatte. Danach gilt wieder ARASAAC.',
    nowMetacom: (count) => `METACOM ist eingerichtet: ${de(count)} Symbole.`,
    reread_done: METACOM.de.reread_done,
    forgotten: 'METACOM-Ordner vergessen. Es gilt wieder ARASAAC.',
    headArasaac: 'ARASAAC',
    headMetacom: (count) => `METACOM · ${de(count)} Symbole`,
  },
  en: {
    question: 'Which pictures?',
    arasaac: 'ARASAAC',
    arasaacNote: 'Free and there at once. About 13,000 pictures.',
    metacom: 'METACOM',
    metacomNeeds: 'You need a licence of your own and the METACOM folder that comes with it.',
    notSetUp: 'not set up',
    settingUp: 'being set up',
    setUp: 'Set up …',
    pickFolder: 'Choose your METACOM folder. If you only have the ZIP file, choose the folder it is in.',
    forgets: 'Your browser may call this “upload”. The files stay on your device all the same. '
      + 'After a reload you choose the folder again.',
    choose: 'Choose folder …',
    chooseAnother: 'Choose a different folder …',
    allow: 'Allow access',
    licenceLink: 'No licence yet? Go to METACOM',
    licenceUrl: METACOM.en.licenceUrl,
    germanOnly: METACOM.en.germanOnly,
    ready: (count, root) => `${en(count)} symbols from “${root}”, on this device only.`,
    reading: (root) => `Reading “${root}” …`,
    unpacking: (root) => `Unpacking “${root}” …`,
    found: (count) => `${en(count)} pictures so far.`,
    noMetacom: (root) => `There is no METACOM in “${root}”.`,
    noMetacomNote: 'The folder is usually called “METACOM_9_Desktop”.',
    unreadable: (root) => (root ? `“${root}” could not be read.` : 'The folder could not be read.'),
    permission: (root) => `This page may not read “${root}” right now.`,
    permissionNote: 'Browsers sometimes take the permission back between visits. '
      + 'Until you give it, ARASAAC is used.',
    more: 'More about METACOM',
    reread: 'Read again',
    rereadNote: 'When new pictures have been added to the folder.',
    rendering: (segment) => `Style: ${segment}`,
    noRendering: 'Style: no preference',
    forget: 'Forget folder',
    forgetNote: 'The pictures stay on the disk. ARASAAC is used again.',
    nowMetacom: (count) => `METACOM is set up: ${en(count)} symbols.`,
    reread_done: METACOM.en.reread_done,
    forgotten: 'METACOM folder forgotten. ARASAAC is used again.',
    headArasaac: 'ARASAAC',
    headMetacom: (count) => `METACOM · ${en(count)} symbols`,
  },
};

/**
 * The one line the panel's heading carries: which answer is in force.
 *
 * METACOM counts only when it is ready. A METACOM that is the stored answer
 * while its folder cannot be read is not what is drawn, so the heading says
 * ARASAAC, which is what the page is showing.
 */
export function headlineFor(
  current: SymbolSource, status: ProviderStatus, count: number, lang: PanelLang = 'de',
): string {
  const say = WORDS[lang];
  return current === 'metacom' && status.kind === 'ready' && count > 0
    ? say.headMetacom(count) : say.headArasaac;
}
