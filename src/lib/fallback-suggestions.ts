const BASE_RESPONSES = [
  'हाँ बेटा',
  'ठीक है',
  'अभी नहीं',
  'मुझे चाहिए',
];

function keywordResponses(input: string) {
  const normalized = input.toLowerCase();

  if (/khana|khaana|bhook|bhukh|maggie|chai|tea|lunch|dinner|खाना|भूख|चाय|मैगी|लंच|डिनर/.test(normalized)) {
    return ['हाँ मुझे भूख लगी है', 'थोड़ा और बना दो', 'अभी नहीं खाना', 'पानी भी ले आओ'];
  }

  if (/paani|pani|water|piyu|pyas|thirst|पानी|प्यास/.test(normalized)) {
    return ['हाँ थोड़ा पानी दो', 'बहुत प्यास लगी है', 'ठंडा पानी लाओ', 'अभी नहीं चाहिए'];
  }

  if (/dard|pain|medicine|dawai|doctor|tabiyat|sick|fever|दर्द|दवाई|डॉक्टर|तबीयत|बुखार/.test(normalized)) {
    return ['मुझे दर्द हो रहा है', 'दवाई दे दो बेटा', 'डॉक्टर को बुलाओ', 'थोड़ा आराम चाहिए'];
  }

  if (/restroom|toilet|washroom|bathroom|wash|टॉयलेट|बाथरूम/.test(normalized)) {
    return ['वाशरूम ले चलो', 'अभी जाना है', 'थोड़ी देर रुक जाओ', 'जल्दी ले चलो'];
  }

  if (/thak|thaka|rest|sleep|so|sona|tired|थक|सोना|आराम/.test(normalized)) {
    return ['थोड़ा आराम करूंगी', 'अभी सोना है', 'बहुत थक गई हूँ', 'बाद में बात करते हैं'];
  }

  if (/haan|yes|okay|theek|thik|ji|ji haan|हाँ|हाँजी|ठीक/.test(normalized)) {
    return ['हाँ बेटा', 'ठीक है', 'बिल्कुल', 'ठीक से करो'];
  }

  if (/nahi|no|nahin|never|नहीं/.test(normalized)) {
    return ['नहीं मुझे नहीं चाहिए', 'अभी नहीं', 'मन नहीं है', 'बाद में'];
  }

  return BASE_RESPONSES;
}

export function createFallbackSuggestions(latestInput: string) {
  const candidates = keywordResponses(latestInput);
  return candidates.slice(0, 4);
}
