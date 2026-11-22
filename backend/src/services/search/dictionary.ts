/**
 * Hindi / Hinglish → English health terms, so queries like "sar dard" or
 * "khansi ki dawa" can be searched in English medical sources. Longer phrases
 * are matched first. Indian drug names are mapped to the US names openFDA uses.
 */
const PHRASES: Array<[string, string]> = [
  ['sar dard', 'headache'], ['sir dard', 'headache'], ['sir me dard', 'headache'], ['pet dard', 'abdominal pain'],
  ['pet me dard', 'abdominal pain'], ['pet mein dard', 'abdominal pain'], ['pet ki gas', 'gas bloating'],
  ['kamar dard', 'back pain'], ['peeth dard', 'back pain'], ['jodo ka dard', 'joint pain'], ['jodon ka dard', 'joint pain'],
  ['ghutno ka dard', 'knee pain'], ['daant dard', 'toothache'], ['dant dard', 'toothache'], ['kaan dard', 'ear pain'],
  ['gale me dard', 'sore throat'], ['gala kharab', 'sore throat'], ['gale mein kharash', 'sore throat'],
  ['seene me dard', 'chest pain'], ['seene mein dard', 'chest pain'], ['seene me jalan', 'heartburn'],
  ['pet me jalan', 'acidity'], ['pet mein jalan', 'acidity'], ['khoon ki kami', 'anemia'], ['neend nahi', 'insomnia'],
  ['neend na aana', 'insomnia'], ['baal jhadna', 'hair loss'], ['baal girna', 'hair loss'], ['muh ke chale', 'mouth ulcer'],
  ['munh ke chhale', 'mouth ulcer'], ['sugar ki bimari', 'diabetes'], ['high bp', 'high blood pressure'],
  ['low bp', 'low blood pressure'], ['bp high', 'high blood pressure'], ['peshab me jalan', 'burning urination'],
  ['peshab mein jalan', 'burning urination'], ['nak band', 'nasal congestion'], ['naak band', 'nasal congestion'],
  ['bhookh na lagna', 'loss of appetite'], ['loose motion', 'diarrhea'], ['loose motions', 'diarrhea'],
  ['kamzori', 'weakness'], ['thakan', 'fatigue'],
  ['kutta kaat', 'dog bite'], ['kutte ne kaata', 'dog bite'], ['kutte ka kaatna', 'dog bite'], ['saanp kaat', 'snake bite'],
  ['saap kaat', 'snake bite'], ['bichhu kaat', 'scorpion sting'], ['machhar kaat', 'mosquito bite'], ['jal gaya', 'burn'],
  ['haddi toot', 'fracture'], ['naak se khoon', 'nosebleed'], ['nak se khoon', 'nosebleed'], ['dil ka daura', 'heart attack'],
];

const WORDS: Record<string, string> = {
  bukhar: 'fever', bukhaar: 'fever', khansi: 'cough', khasi: 'cough', zukam: 'common cold', jukam: 'common cold',
  sardi: 'common cold', ulti: 'vomiting', ultiyan: 'vomiting', dast: 'diarrhea', kabz: 'constipation',
  kabj: 'constipation', jalan: 'burning', khujli: 'itching', chakkar: 'dizziness', sujan: 'swelling', soojan: 'swelling',
  motapa: 'obesity', peeliya: 'jaundice', piliya: 'jaundice', pathri: 'kidney stone', bawasir: 'piles', mirgi: 'epilepsy',
  dama: 'asthma', tb: 'tuberculosis', chechak: 'chickenpox', khasra: 'measles', daad: 'ringworm', muhase: 'acne',
  dawa: 'medicine', dawai: 'medicine', ilaj: 'treatment', ilaaj: 'treatment', nuskha: 'home remedy', gharelu: 'home remedy',
  haldi: 'turmeric', adrak: 'ginger', lehsun: 'garlic', tulsi: 'holy basil', neem: 'neem', methi: 'fenugreek',
  jeera: 'cumin', ajwain: 'carom seeds', saunf: 'fennel', elaichi: 'cardamom', dalchini: 'cinnamon', laung: 'clove',
  shahad: 'honey', shehad: 'honey', amla: 'indian gooseberry', giloy: 'tinospora cordifolia', ghee: 'ghee',
  pudina: 'mint', ashwagandha: 'ashwagandha', triphala: 'triphala', mulethi: 'licorice', kalonji: 'nigella seeds',
  chot: 'injury', moch: 'sprain', behoshi: 'fainting', machhar: 'mosquito', bichhu: 'scorpion sting', jalna: 'burn',
  chai: 'tea', doodh: 'milk', paani: 'water', neend: 'sleep', vajan: 'body weight', wazan: 'body weight',
  // Hindi (Devanagari)
  बुखार: 'fever', खांसी: 'cough', जुकाम: 'common cold', सर्दी: 'common cold', उल्टी: 'vomiting', दस्त: 'diarrhea',
  कब्ज: 'constipation', खुजली: 'itching', चक्कर: 'dizziness', मधुमेह: 'diabetes', दवा: 'medicine', हल्दी: 'turmeric',
  अदरक: 'ginger', तुलसी: 'holy basil', सिरदर्द: 'headache', पीलिया: 'jaundice',
};

// Indian generic names that openFDA lists under a different (US) name
export const US_DRUG_NAMES: Record<string, string> = {
  paracetamol: 'acetaminophen',
  salbutamol: 'albuterol',
  adrenaline: 'epinephrine',
  frusemide: 'furosemide',
  lignocaine: 'lidocaine',
  glibenclamide: 'glyburide',
  pethidine: 'meperidine',
  mesalazine: 'mesalamine',
  rifampicin: 'rifampin',
  thyroxine: 'levothyroxine',
};

/** Translates known Hindi/Hinglish health words; unknown words are kept as they are */
export const toEnglishQuery = (query: string): string => {
  let text = ` ${query.toLowerCase().replace(/\s+/g, ' ').trim()} `;
  for (const [phrase, english] of PHRASES) {
    text = text.split(` ${phrase} `).join(` ${english} `);
  }
  const words = text
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => WORDS[w] ?? w)
    // Filler words that only add noise to an English search
    .filter((w) => !['ki', 'ka', 'ke', 'me', 'mein', 'ko', 'se', 'hai', 'kya', 'aur', 'ya', 'liye', 'to', 'kare', 'karein', 'karna', 'kaise', 'le', 'gaya', 'gayi', 'hota', 'ho', 'raha', 'rahi'].includes(w));
  return words.join(' ').trim();
};
