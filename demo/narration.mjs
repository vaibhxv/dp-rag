// Demo script: on-screen caption (English) + spoken narration (Hinglish).
//
// The narration is written in Devanagari, with English terms spelled the way
// they are spoken (लाइब्रेरी, डॉक्यूमेंट), because macOS's Hindi voice "Lekha"
// pronounces those naturally; Latin-script words would be read badly.
//
// `sped: true` marks the line played over the sped-up ingestion segment: keep
// it short (the segment lasts ~6 s in the final video).
export const VOICE = 'Lekha';
export const RATE = 178; // words per minute

export const LINES = {
  intro: {
    caption: 'Sahayak: the Delhi Police knowledge desk. Local LLM + self-hosted Weaviate + scanned-PDF OCR. Nothing leaves the machine.',
    say: 'नमस्ते! ये है सहायक, दिल्ली पुलिस का नॉलेज डेस्क। ये पूरी तरह इसी लैपटॉप पर चलता है। लोकल एल एल एम, वीवियेट और ओ सी आर के साथ। कोई भी डेटा बाहर नहीं जाता।',
  },
  sidebar: {
    caption: 'Collapsible sidebar: new chat, ingest, library, collections and recent conversations',
    say: 'बाईं तरफ़ का साइडबार कोलैप्स हो जाता है। नई चैट, इन्जेस्ट, लाइब्रेरी और पुरानी बातचीत, सब एक ही जगह।',
  },
  ingestIntro: {
    caption: 'Add to the library: two scanned Delhi Gazette notifications (image-only PDFs, no text layer)',
    say: 'अब दो स्कैन किए हुए दिल्ली गैज़ेट नोटिफ़िकेशन डालते हैं। इन पी डी एफ़ में टेक्स्ट नहीं है, सिर्फ़ इमेज है।',
  },
  ingestSped: {
    caption: '⏩ Sped up: each file moves through Store → Read (OCR, English + Hindi) → Understand (local LLM) → Index (Weaviate)',
    say: 'हर फ़ाइल चार स्टेप से गुज़रती है। स्टोर, ओ सी आर, समरी, और इंडेक्स।',
    sped: true,
  },
  ingestReady: {
    caption: 'Both documents are ready: titled, summarised and indexed. The original scans are kept in the local SQLite store.',
    say: 'दोनों डॉक्यूमेंट तैयार हैं। ओरिजिनल फ़ाइल लोकल डेटाबेस में सेव रहती है।',
  },
  docSummary: {
    caption: 'Every document gets an AI-written title, summary and category, with its OCR text set page by page',
    say: 'हर डॉक्यूमेंट को टाइटल, समरी और कैटेगरी अपने आप मिलती है, और ओ सी आर टेक्स्ट पेज के हिसाब से दिखता है।',
  },
  docScan: {
    caption: 'The original scanned PDF, rendered in the app from the local file store',
    say: 'ओरिजिनल स्कैन भी यहीं, ऐप के अंदर खुल जाता है।',
  },
  askDoc: {
    caption: '“Ask this document” limits retrieval to one file',
    say: 'आस्क दिस डॉक्यूमेंट दबाने पर, सवाल सिर्फ़ इसी फ़ाइल में ढूँढा जाता है।',
  },
  askDocAnswer: {
    caption: 'The answer streams from the local LLM, with a citation seal and the exact line from the gazette as evidence',
    say: 'जवाब लोकल एल एल एम से आता है। साथ में साइटेशन सील, और सबूत के तौर पर गैज़ेट की असली लाइन।',
  },
  library: {
    caption: 'Library: real page thumbnails, categories written at ingestion, and a badge for every scanned file',
    say: 'ये है लाइब्रेरी। हर कार्ड पर असली पेज का थंबनेल, कैटेगरी, और स्कैन वाली फ़ाइल का बैज।',
  },
  collections: {
    caption: 'Collections filter the library in one click',
    say: 'कलेक्शन पर एक क्लिक से फ़िल्टर, और सर्च से तुरंत सही डॉक्यूमेंट मिल जाता है।',
  },
  newChat: {
    caption: 'Chat across all 25 documents. Starter questions were generated from the documents themselves.',
    say: 'अब नई चैट, सभी पच्चीस डॉक्यूमेंट्स पर। ये सुझाए गए सवाल डॉक्यूमेंट्स से ही बने हैं।',
  },
  keyFigures: {
    caption: 'Key figures are highlighted; the evidence slip quotes the exact line from page 2',
    say: 'ज़रूरी आँकड़े हाइलाइट होते हैं, और नीचे पेज दो की असली लाइन दिखती है।',
  },
  hover: {
    caption: 'Hover a citation seal to preview the passage…',
    say: 'साइटेशन सील पर माउस ले जाइए, पैसेज का प्रीव्यू दिख जाता है।',
  },
  clickPage: {
    caption: '…click it to open the page, with the answering line marked in amber',
    say: 'क्लिक करते ही वही पेज खुलता है, और जवाब वाली लाइन पीले रंग में मार्क होती है।',
  },
  original: {
    caption: 'Jump straight to the cited page in the original scan',
    say: 'और सीधे ओरिजिनल स्कैन का वही पेज।',
  },
  followUp: {
    caption: 'Follow-up questions use the conversation for context',
    say: 'फ़ॉलो-अप सवाल भी, पिछली बातचीत के हिसाब से समझ लेता है।',
  },
  anotherDoc: {
    caption: 'Answers come from whichever document holds the fact',
    say: 'जवाब उसी डॉक्यूमेंट से आता है, जिसमें वो जानकारी है।',
  },
  notCovered: {
    caption: 'Asked about something the documents do not contain, it says so instead of guessing',
    say: 'और अगर जानकारी डॉक्यूमेंट्स में नहीं है, तो ये अंदाज़ा नहीं लगाता। साफ़ बता देता है।',
  },
  history: {
    caption: 'Conversations are kept in the sidebar; pick one up where you left off',
    say: 'सारी बातचीत साइडबार में सेव रहती है। जहाँ छोड़ा था, वहीं से आगे बढ़िए।',
  },
  outro: {
    caption: 'Ingestion ✓  Library ✓  Cited answers ✓  — running entirely on this laptop',
    say: 'इन्जेशन, लाइब्रेरी, और सबूत के साथ जवाब। सब कुछ इसी लैपटॉप पर। धन्यवाद!',
  },
};
