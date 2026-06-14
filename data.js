/* ============================================================
   Mes Voyages — données statiques (pays, phrases, jeux…)
   Chargé AVANT app.js.
   ============================================================ */

"use strict";

/* ===== Pays : drapeau, codes ISO, capitale, continent, langue ===== */

function normPays(s) {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const PAYS_ALIAS = {
  "angleterre": "royaume-uni", "uk": "royaume-uni", "ecosse": "royaume-uni",
  "usa": "etats-unis", "amerique": "etats-unis",
  "republique tcheque": "tchequie",
  "bali": "indonesie",
  "dubai": "emirats", "abou dabi": "emirats",
  "tahiti": "polynesie", "polynesie francaise": "polynesie",
  "hollande": "pays-bas",
  "coree": "coree du sud"
};

const PAYS_INFO = {
  "france":           { iso2: "FR", iso3: "FRA", flag: "🇫🇷", cap: "Paris",        cont: "Europe",   lang: null },
  "espagne":          { iso2: "ES", iso3: "ESP", flag: "🇪🇸", cap: "Madrid",       cont: "Europe",   lang: "es" },
  "italie":           { iso2: "IT", iso3: "ITA", flag: "🇮🇹", cap: "Rome",         cont: "Europe",   lang: "it" },
  "portugal":         { iso2: "PT", iso3: "PRT", flag: "🇵🇹", cap: "Lisbonne",     cont: "Europe",   lang: "pt" },
  "allemagne":        { iso2: "DE", iso3: "DEU", flag: "🇩🇪", cap: "Berlin",       cont: "Europe",   lang: "de" },
  "royaume-uni":      { iso2: "GB", iso3: "GBR", flag: "🇬🇧", cap: "Londres",      cont: "Europe",   lang: "en" },
  "irlande":          { iso2: "IE", iso3: "IRL", flag: "🇮🇪", cap: "Dublin",       cont: "Europe",   lang: "en" },
  "belgique":         { iso2: "BE", iso3: "BEL", flag: "🇧🇪", cap: "Bruxelles",    cont: "Europe",   lang: null },
  "suisse":           { iso2: "CH", iso3: "CHE", flag: "🇨🇭", cap: "Berne",        cont: "Europe",   lang: "de" },
  "pays-bas":         { iso2: "NL", iso3: "NLD", flag: "🇳🇱", cap: "Amsterdam",    cont: "Europe",   lang: "en" },
  "grece":            { iso2: "GR", iso3: "GRC", flag: "🇬🇷", cap: "Athènes",      cont: "Europe",   lang: "en" },
  "croatie":          { iso2: "HR", iso3: "HRV", flag: "🇭🇷", cap: "Zagreb",       cont: "Europe",   lang: "en" },
  "autriche":         { iso2: "AT", iso3: "AUT", flag: "🇦🇹", cap: "Vienne",       cont: "Europe",   lang: "de" },
  "norvege":          { iso2: "NO", iso3: "NOR", flag: "🇳🇴", cap: "Oslo",         cont: "Europe",   lang: "en" },
  "suede":            { iso2: "SE", iso3: "SWE", flag: "🇸🇪", cap: "Stockholm",    cont: "Europe",   lang: "en" },
  "danemark":         { iso2: "DK", iso3: "DNK", flag: "🇩🇰", cap: "Copenhague",   cont: "Europe",   lang: "en" },
  "finlande":         { iso2: "FI", iso3: "FIN", flag: "🇫🇮", cap: "Helsinki",     cont: "Europe",   lang: "en" },
  "islande":          { iso2: "IS", iso3: "ISL", flag: "🇮🇸", cap: "Reykjavik",    cont: "Europe",   lang: "en" },
  "pologne":          { iso2: "PL", iso3: "POL", flag: "🇵🇱", cap: "Varsovie",     cont: "Europe",   lang: "en" },
  "tchequie":         { iso2: "CZ", iso3: "CZE", flag: "🇨🇿", cap: "Prague",       cont: "Europe",   lang: "en" },
  "hongrie":          { iso2: "HU", iso3: "HUN", flag: "🇭🇺", cap: "Budapest",     cont: "Europe",   lang: "en" },
  "turquie":          { iso2: "TR", iso3: "TUR", flag: "🇹🇷", cap: "Ankara",       cont: "Europe",   lang: "en" },
  "maroc":            { iso2: "MA", iso3: "MAR", flag: "🇲🇦", cap: "Rabat",        cont: "Afrique",  lang: null },
  "tunisie":          { iso2: "TN", iso3: "TUN", flag: "🇹🇳", cap: "Tunis",        cont: "Afrique",  lang: null },
  "egypte":           { iso2: "EG", iso3: "EGY", flag: "🇪🇬", cap: "Le Caire",     cont: "Afrique",  lang: "en" },
  "afrique du sud":   { iso2: "ZA", iso3: "ZAF", flag: "🇿🇦", cap: "Pretoria",     cont: "Afrique",  lang: "en" },
  "kenya":            { iso2: "KE", iso3: "KEN", flag: "🇰🇪", cap: "Nairobi",      cont: "Afrique",  lang: "en" },
  "senegal":          { iso2: "SN", iso3: "SEN", flag: "🇸🇳", cap: "Dakar",        cont: "Afrique",  lang: null },
  "madagascar":       { iso2: "MG", iso3: "MDG", flag: "🇲🇬", cap: "Antananarivo", cont: "Afrique",  lang: null },
  "etats-unis":       { iso2: "US", iso3: "USA", flag: "🇺🇸", cap: "Washington",   cont: "Amérique du Nord", lang: "en" },
  "canada":           { iso2: "CA", iso3: "CAN", flag: "🇨🇦", cap: "Ottawa",       cont: "Amérique du Nord", lang: "en" },
  "mexique":          { iso2: "MX", iso3: "MEX", flag: "🇲🇽", cap: "Mexico",       cont: "Amérique du Nord", lang: "es" },
  "costa rica":       { iso2: "CR", iso3: "CRI", flag: "🇨🇷", cap: "San José",     cont: "Amérique du Nord", lang: "es" },
  "cuba":             { iso2: "CU", iso3: "CUB", flag: "🇨🇺", cap: "La Havane",    cont: "Amérique du Nord", lang: "es" },
  "bresil":           { iso2: "BR", iso3: "BRA", flag: "🇧🇷", cap: "Brasilia",     cont: "Amérique du Sud", lang: "pt" },
  "argentine":        { iso2: "AR", iso3: "ARG", flag: "🇦🇷", cap: "Buenos Aires", cont: "Amérique du Sud", lang: "es" },
  "perou":            { iso2: "PE", iso3: "PER", flag: "🇵🇪", cap: "Lima",         cont: "Amérique du Sud", lang: "es" },
  "chili":            { iso2: "CL", iso3: "CHL", flag: "🇨🇱", cap: "Santiago",     cont: "Amérique du Sud", lang: "es" },
  "colombie":         { iso2: "CO", iso3: "COL", flag: "🇨🇴", cap: "Bogota",       cont: "Amérique du Sud", lang: "es" },
  "japon":            { iso2: "JP", iso3: "JPN", flag: "🇯🇵", cap: "Tokyo",        cont: "Asie",     lang: "ja" },
  "chine":            { iso2: "CN", iso3: "CHN", flag: "🇨🇳", cap: "Pékin",        cont: "Asie",     lang: "en" },
  "coree du sud":     { iso2: "KR", iso3: "KOR", flag: "🇰🇷", cap: "Séoul",        cont: "Asie",     lang: "en" },
  "inde":             { iso2: "IN", iso3: "IND", flag: "🇮🇳", cap: "New Delhi",    cont: "Asie",     lang: "en" },
  "thailande":        { iso2: "TH", iso3: "THA", flag: "🇹🇭", cap: "Bangkok",      cont: "Asie",     lang: "th" },
  "vietnam":          { iso2: "VN", iso3: "VNM", flag: "🇻🇳", cap: "Hanoï",        cont: "Asie",     lang: "en" },
  "indonesie":        { iso2: "ID", iso3: "IDN", flag: "🇮🇩", cap: "Jakarta",      cont: "Asie",     lang: "en" },
  "malaisie":         { iso2: "MY", iso3: "MYS", flag: "🇲🇾", cap: "Kuala Lumpur", cont: "Asie",     lang: "en" },
  "singapour":        { iso2: "SG", iso3: "SGP", flag: "🇸🇬", cap: "Singapour",    cont: "Asie",     lang: "en" },
  "philippines":      { iso2: "PH", iso3: "PHL", flag: "🇵🇭", cap: "Manille",      cont: "Asie",     lang: "en" },
  "sri lanka":        { iso2: "LK", iso3: "LKA", flag: "🇱🇰", cap: "Colombo",      cont: "Asie",     lang: "en" },
  "emirats":          { iso2: "AE", iso3: "ARE", flag: "🇦🇪", cap: "Abou Dabi",    cont: "Asie",     lang: "en" },
  "jordanie":         { iso2: "JO", iso3: "JOR", flag: "🇯🇴", cap: "Amman",        cont: "Asie",     lang: "en" },
  "israel":           { iso2: "IL", iso3: "ISR", flag: "🇮🇱", cap: "Jérusalem",    cont: "Asie",     lang: "en" },
  "australie":        { iso2: "AU", iso3: "AUS", flag: "🇦🇺", cap: "Canberra",     cont: "Océanie",  lang: "en" },
  "nouvelle-zelande": { iso2: "NZ", iso3: "NZL", flag: "🇳🇿", cap: "Wellington",   cont: "Océanie",  lang: "en" },
  "polynesie":        { iso2: "PF", iso3: "PYF", flag: "🇵🇫", cap: "Papeete",      cont: "Océanie",  lang: null }
};

function countryInfo(name) {
  let k = normPays(name);
  if (PAYS_ALIAS[k]) k = PAYS_ALIAS[k];
  return PAYS_INFO[k] || null;
}

/* ===== Numéros d'urgence (par code ISO2 ; 112 par défaut) ===== */

const URGENCES = {
  US: "911", CA: "911", MX: "911", CR: "911", CU: "106",
  BR: "190 (police) / 192 (samu)", AR: "911", CL: "133", PE: "105", CO: "123",
  JP: "110 (police) / 119 (pompiers-samu)", CN: "110 (police) / 120 (samu)",
  KR: "112 (police) / 119 (samu)", TH: "191 (police) / 1669 (samu)",
  VN: "113", ID: "110 / 118", MY: "999", SG: "999", PH: "911", LK: "119",
  AU: "000", NZ: "111", AE: "999", JO: "911", IL: "100 (police) / 101 (samu)",
  MA: "19 (police) / 15 (samu)", TN: "197 (police) / 190 (samu)", EG: "122",
  ZA: "10111 (police) / 10177 (samu)", KE: "999", SN: "17", MG: "117",
  GB: "999 ou 112", TR: "112", IN: "112"
};

/* ===== Guide de conversation ===== */

const PHRASES_FR = [
  "Bonjour", "Bonsoir", "Au revoir", "S'il vous plaît", "Merci beaucoup",
  "Oui / Non", "Excusez-moi", "Parlez-vous anglais ?", "Je ne comprends pas",
  "Combien ça coûte ?", "L'addition, s'il vous plaît", "Où sont les toilettes ?",
  "Je voudrais…", "C'est délicieux !", "Au secours !", "Santé !"
];

const PHRASES = {
  en: { label: "🇬🇧 Anglais", list: ["Hello", "Good evening", "Goodbye", "Please", "Thank you very much", "Yes / No", "Excuse me", "Do you speak English?", "I don't understand", "How much is it?", "The bill, please", "Where are the toilets?", "I would like…", "It's delicious!", "Help!", "Cheers!"] },
  es: { label: "🇪🇸 Espagnol", list: ["Hola", "Buenas noches", "Adiós", "Por favor", "Muchas gracias", "Sí / No", "Perdón", "¿Habla inglés?", "No entiendo", "¿Cuánto cuesta?", "La cuenta, por favor", "¿Dónde están los baños?", "Quisiera…", "¡Está delicioso!", "¡Socorro!", "¡Salud!"] },
  it: { label: "🇮🇹 Italien", list: ["Buongiorno", "Buonasera", "Arrivederci", "Per favore", "Grazie mille", "Sì / No", "Scusi", "Parla inglese?", "Non capisco", "Quanto costa?", "Il conto, per favore", "Dove sono i bagni?", "Vorrei…", "È delizioso!", "Aiuto!", "Salute!"] },
  de: { label: "🇩🇪 Allemand", list: ["Hallo", "Guten Abend", "Auf Wiedersehen", "Bitte", "Vielen Dank", "Ja / Nein", "Entschuldigung", "Sprechen Sie Englisch?", "Ich verstehe nicht", "Wie viel kostet das?", "Die Rechnung, bitte", "Wo sind die Toiletten?", "Ich möchte…", "Das ist lecker!", "Hilfe!", "Prost!"] },
  pt: { label: "🇵🇹 Portugais", list: ["Olá", "Boa noite", "Adeus", "Por favor", "Muito obrigado", "Sim / Não", "Desculpe", "Fala inglês?", "Não entendo", "Quanto custa?", "A conta, por favor", "Onde é a casa de banho?", "Queria…", "Está delicioso!", "Socorro!", "Saúde!"] },
  ja: { label: "🇯🇵 Japonais", list: ["こんにちは (Konnichiwa)", "こんばんは (Konbanwa)", "さようなら (Sayōnara)", "お願いします (Onegai shimasu)", "ありがとうございます (Arigatō gozaimasu)", "はい / いいえ (Hai / Iie)", "すみません (Sumimasen)", "英語を話せますか？ (Eigo o hanasemasu ka?)", "わかりません (Wakarimasen)", "いくらですか？ (Ikura desu ka?)", "お会計お願いします (Okaikei onegai shimasu)", "トイレはどこですか？ (Toire wa doko desu ka?)", "…をください (… o kudasai)", "おいしい！ (Oishii!)", "助けて！ (Tasukete!)", "乾杯！ (Kanpai!)"] },
  th: { label: "🇹🇭 Thaï", list: ["สวัสดี (Sawatdii)", "สวัสดีตอนเย็น (Sawatdii ton yen)", "ลาก่อน (Laa kòn)", "กรุณา (Karunaa)", "ขอบคุณมาก (Khòp khun mâak)", "ใช่ / ไม่ (Châi / Mâi)", "ขอโทษ (Khǎw thôot)", "พูดอังกฤษได้ไหม (Phûut angkrit dâi mǎi?)", "ไม่เข้าใจ (Mâi khâo jai)", "เท่าไหร่ (Thâo rài?)", "เก็บเงินด้วย (Kèp ngern dûai)", "ห้องน้ำอยู่ที่ไหน (Hông náam yùu thîi nǎi?)", "ขอ… (Khǎw…)", "อร่อย！ (Aròi!)", "ช่วยด้วย！ (Chûai dûai!)", "ชนแก้ว！ (Chon kâew!)"] }
};

/* ===== Checklist administrative type (off = jours avant le départ) ===== */

const CHECKLIST_ADMIN = [
  { label: "🛂 Vérifier la validité du passeport / CNI (souvent 6 mois après le retour !)", off: 90 },
  { label: "📋 Vérifier si un visa ou une autorisation (ESTA, AVE…) est nécessaire", off: 75 },
  { label: "💉 Vérifier les vaccins recommandés", off: 60 },
  { label: "🚗 Permis de conduire international si location de voiture", off: 60, horsEU: true },
  { label: "🏥 Souscrire / vérifier l'assurance voyage et rapatriement", off: 30 },
  { label: "💳 Demander la carte européenne d'assurance maladie (gratuite)", off: 30, euOnly: true },
  { label: "📱 Vérifier le forfait téléphone à l'étranger (roaming)", off: 15 },
  { label: "🏦 Prévenir la banque du déplacement (éviter le blocage de carte)", off: 7 },
  { label: "📄 Photocopier / scanner passeport, billets, assurance", off: 7 },
  { label: "💶 Retirer un peu de monnaie locale ou d'euros", off: 3 },
  { label: "🏠 Donner l'itinéraire et les contacts à un proche", off: 2 },
  { label: "🧾 Enregistrement en ligne / cartes d'embarquement", off: 1 }
];

/* ===== Bingo du voyage (jeux de trajet) ===== */

const BINGO_ITEMS = [
  "Une vache 🐄", "Un tracteur 🚜", "Une voiture rouge", "Un camion citerne", "Une éolienne",
  "Un château d'eau", "Une plaque étrangère", "Une moto jaune", "Un tunnel", "Un péage",
  "Un panneau « animaux sauvages »", "Un train 🚆", "Un avion dans le ciel ✈️", "Une rivière",
  "Un château 🏰", "Un cycliste", "Un camping-car", "Un drapeau", "Une voiture de police 🚓",
  "Une ambulance", "Un cheval 🐴", "Des moutons 🐑", "Un clocher d'église", "Un pont",
  "Une fontaine", "Une cabine ou borne téléphonique", "Une voiture décapotable", "Un arc-en-ciel 🌈",
  "Quelqu'un qui dort 😴", "Une aire de jeux", "Un fast-food", "Une station-service"
];

/* ===== Météo : codes WMO → emoji + texte ===== */

const WMO = {
  0: ["☀️", "Grand soleil"], 1: ["🌤️", "Plutôt dégagé"], 2: ["⛅", "Partiellement nuageux"], 3: ["☁️", "Couvert"],
  45: ["🌫️", "Brouillard"], 48: ["🌫️", "Brouillard givrant"],
  51: ["🌦️", "Bruine légère"], 53: ["🌦️", "Bruine"], 55: ["🌧️", "Bruine dense"],
  61: ["🌧️", "Pluie légère"], 63: ["🌧️", "Pluie"], 65: ["🌧️", "Pluie forte"],
  66: ["🌧️", "Pluie verglaçante"], 67: ["🌧️", "Pluie verglaçante forte"],
  71: ["🌨️", "Neige légère"], 73: ["🌨️", "Neige"], 75: ["❄️", "Neige forte"], 77: ["❄️", "Grains de neige"],
  80: ["🌦️", "Averses légères"], 81: ["🌧️", "Averses"], 82: ["⛈️", "Averses violentes"],
  85: ["🌨️", "Averses de neige"], 86: ["❄️", "Fortes averses de neige"],
  95: ["⛈️", "Orage"], 96: ["⛈️", "Orage avec grêle"], 99: ["⛈️", "Orage violent avec grêle"]
};

function wmoInfo(code) { return WMO[code] || ["🌡️", "—"]; }

/* ===== Transports : vitesse moyenne (km/h), heures fixes, CO2 (g/pers/km) ===== */
/* Ordres de grandeur (base ADEME) : l'avion inclut 2 h de formalités aéroport. */

const TRANSPORT_EXTRA = {
  avion:   { speed: 700, fixed: 2,   co2: 230 },
  train:   { speed: 100, fixed: 0.5, co2: 30 },
  voiture: { speed: 80,  fixed: 0,   co2: 130 },
  bus:     { speed: 65,  fixed: 0,   co2: 35 },
  bateau:  { speed: 30,  fixed: 0.5, co2: 190 },
  velo:    { speed: 15,  fixed: 0,   co2: 0 },
  pied:    { speed: 4.5, fixed: 0,   co2: 0 }
};

/* ===== Conversions de tailles (vêtements & chaussures), valeurs approximatives ===== */
const CONV_SIZES = {
  vf: { label: "👚 Vêtements femme", cols: ["FR / EU", "US", "UK"], rows: [["34", "2", "6"], ["36", "4", "8"], ["38", "6", "10"], ["40", "8", "12"], ["42", "10", "14"], ["44", "12", "16"], ["46", "14", "18"]] },
  vh: { label: "👔 Vêtements homme", cols: ["FR / EU", "US / UK"], rows: [["44", "34"], ["46", "36"], ["48", "38"], ["50", "40"], ["52", "42"], ["54", "44"], ["56", "46"]] },
  cf: { label: "👠 Chaussures femme", cols: ["FR / EU", "US", "UK"], rows: [["36", "5", "3"], ["37", "6", "4"], ["38", "7", "5"], ["39", "8", "6"], ["40", "9", "7"], ["41", "10", "8"], ["42", "11", "9"]] },
  ch: { label: "👞 Chaussures homme", cols: ["FR / EU", "US", "UK"], rows: [["40", "7", "6"], ["41", "8", "7"], ["42", "8.5", "7.5"], ["43", "9.5", "8.5"], ["44", "10.5", "9.5"], ["45", "11.5", "10.5"], ["46", "12", "11"]] }
};

/* ===== Synthèse vocale : code langue du guide de conversation → locale BCP-47 ===== */
const PHRASE_LOCALE = { en: "en-US", es: "es-ES", it: "it-IT", de: "de-DE", pt: "pt-PT", ja: "ja-JP", th: "th-TH" };

/* ===== Spécialités à goûter & souvenirs à rapporter (par code ISO2) ===== */
const SPECIALITES = {
  FR: { food: ["Croissant & pain au chocolat", "Fromages & charcuterie", "Crêpes", "Macarons"], buy: ["Vin / champagne", "Savon de Marseille", "Spécialités régionales", "Béret"] },
  IT: { food: ["Pizza napolitaine", "Pâtes fraîches", "Gelato", "Tiramisu"], buy: ["Huile d'olive", "Limoncello", "Maroquinerie en cuir", "Café / moka"] },
  ES: { food: ["Tapas", "Paella", "Jamón ibérico", "Churros con chocolate"], buy: ["Huile d'olive", "Safran", "Éventail", "Céramique"] },
  PT: { food: ["Pastéis de nata", "Bacalhau", "Bifana", "Vinho verde"], buy: ["Porto", "Conserves de poisson", "Azulejos (carreaux)", "Objets en liège"] },
  DE: { food: ["Bretzel", "Currywurst", "Schnitzel", "Forêt-Noire"], buy: ["Bière", "Couteau de cuisine", "Décorations de Noël", "Réveil coucou"] },
  GB: { food: ["Fish & chips", "Scones & clotted cream", "English breakfast", "Pudding"], buy: ["Thé", "Marmelade", "Whisky (Écosse)", "Souvenirs royaux"] },
  US: { food: ["Burger", "Pancakes & sirop d'érable", "Barbecue", "Cheesecake"], buy: ["Sneakers", "Snacks introuvables en France", "Casquette d'équipe sportive", "Bourbon"] },
  JP: { food: ["Sushi & sashimi", "Ramen", "Takoyaki", "Mochi"], buy: ["Kit Kat aux saveurs locales", "Matcha & théière", "Papeterie", "Furoshiki / éventail"] },
  TH: { food: ["Pad thaï", "Mango sticky rice", "Curry vert", "Soupe tom yum"], buy: ["Soie thaïe", "Épices & pâtes de curry", "Savon sculpté", "Artisanat"] },
  MA: { food: ["Tajine", "Couscous", "Thé à la menthe", "Pâtisseries au miel"], buy: ["Huile d'argan", "Babouches", "Tapis", "Épices (ras el-hanout)"] },
  GR: { food: ["Souvláki / gyros", "Salade grecque", "Moussaka", "Baklava"], buy: ["Huile d'olive", "Miel", "Ouzo", "Éponge naturelle"] },
  NL: { food: ["Stroopwafel", "Frites-mayo", "Bitterballen", "Hareng cru"], buy: ["Fromage de Gouda", "Tulipes (bulbes)", "Sabots déco", "Délices au réglisse"] },
  BE: { food: ["Gaufres", "Frites", "Moules-frites", "Chocolat praliné"], buy: ["Chocolats", "Bière trappiste", "Dentelle", "Spéculoos"] }
};

/* ===== Idées de destinations pour « Où partir ? » =====
   type : mer / montagne / ville / decouverte / famille · budget : low / med / high · months : mois idéaux (1-12) */
const DESTINATIONS_IDEES = [
  { name: "Lisbonne", country: "Portugal", emoji: "🇵🇹", type: ["ville", "decouverte"], budget: "med", months: [4, 5, 6, 9, 10] },
  { name: "Algarve", country: "Portugal", emoji: "🏖️", type: ["mer", "famille"], budget: "med", months: [5, 6, 7, 8, 9] },
  { name: "Barcelone", country: "Espagne", emoji: "🇪🇸", type: ["ville", "mer"], budget: "med", months: [5, 6, 9, 10] },
  { name: "Rome", country: "Italie", emoji: "🇮🇹", type: ["ville", "decouverte"], budget: "med", months: [4, 5, 6, 9, 10] },
  { name: "Santorin", country: "Grèce", emoji: "🇬🇷", type: ["mer"], budget: "high", months: [5, 6, 9] },
  { name: "Marrakech", country: "Maroc", emoji: "🇲🇦", type: ["decouverte", "ville"], budget: "low", months: [3, 4, 10, 11] },
  { name: "Amsterdam", country: "Pays-Bas", emoji: "🇳🇱", type: ["ville", "famille"], budget: "med", months: [4, 5, 6, 7, 8, 9] },
  { name: "Vienne", country: "Autriche", emoji: "🇦🇹", type: ["ville"], budget: "med", months: [4, 5, 6, 9, 12] },
  { name: "Les Alpes", country: "France", emoji: "🏔️", type: ["montagne", "famille"], budget: "med", months: [1, 2, 3, 7, 8] },
  { name: "Côte d'Azur", country: "France", emoji: "🏖️", type: ["mer", "famille"], budget: "high", months: [6, 7, 8, 9] },
  { name: "Fjords de Norvège", country: "Norvège", emoji: "🇳🇴", type: ["montagne", "decouverte"], budget: "high", months: [6, 7, 8] },
  { name: "Islande", country: "Islande", emoji: "🇮🇸", type: ["decouverte", "montagne"], budget: "high", months: [6, 7, 8] },
  { name: "Tokyo", country: "Japon", emoji: "🇯🇵", type: ["ville", "decouverte"], budget: "high", months: [3, 4, 10, 11] },
  { name: "Thaïlande", country: "Thaïlande", emoji: "🇹🇭", type: ["mer", "decouverte"], budget: "med", months: [11, 12, 1, 2] },
  { name: "New York", country: "États-Unis", emoji: "🇺🇸", type: ["ville"], budget: "high", months: [4, 5, 6, 9, 10, 12] },
  { name: "Dubrovnik", country: "Croatie", emoji: "🇭🇷", type: ["mer", "ville"], budget: "med", months: [5, 6, 9] }
];

/* ===== Prises électriques (types + voltage par ISO2) ===== */
/* Un chargeur français (type C/E) passe dans les prises C, E et F. */

const PRISES = {
  FR: { t: "E", v: "230 V" }, ES: { t: "C/F", v: "230 V" }, IT: { t: "C/F/L", v: "230 V" },
  PT: { t: "C/F", v: "230 V" }, DE: { t: "C/F", v: "230 V" }, GB: { t: "G", v: "230 V" },
  IE: { t: "G", v: "230 V" }, BE: { t: "C/E", v: "230 V" }, CH: { t: "C/J", v: "230 V" },
  NL: { t: "C/F", v: "230 V" }, GR: { t: "C/F", v: "230 V" }, HR: { t: "C/F", v: "230 V" },
  AT: { t: "C/F", v: "230 V" }, NO: { t: "C/F", v: "230 V" }, SE: { t: "C/F", v: "230 V" },
  DK: { t: "C/E/F/K", v: "230 V" }, FI: { t: "C/F", v: "230 V" }, IS: { t: "C/F", v: "230 V" },
  PL: { t: "C/E", v: "230 V" }, CZ: { t: "C/E", v: "230 V" }, HU: { t: "C/F", v: "230 V" },
  TR: { t: "C/F", v: "230 V" }, MA: { t: "C/E", v: "220 V" }, TN: { t: "C/E", v: "230 V" },
  EG: { t: "C/F", v: "220 V" }, ZA: { t: "C/D/M/N", v: "230 V" }, KE: { t: "G", v: "240 V" },
  SN: { t: "C/D/E/K", v: "230 V" }, MG: { t: "C/D/E/J/K", v: "220 V" },
  US: { t: "A/B", v: "120 V ⚡" }, CA: { t: "A/B", v: "120 V ⚡" }, MX: { t: "A/B", v: "127 V ⚡" },
  CR: { t: "A/B", v: "120 V ⚡" }, CU: { t: "A/B/C/L", v: "110/220 V" },
  BR: { t: "C/N", v: "127/220 V" }, AR: { t: "C/I", v: "220 V" }, PE: { t: "A/B/C", v: "220 V" },
  CL: { t: "C/L", v: "220 V" }, CO: { t: "A/B", v: "110 V ⚡" },
  JP: { t: "A/B", v: "100 V ⚡" }, CN: { t: "A/C/I", v: "220 V" }, KR: { t: "C/F", v: "220 V" },
  IN: { t: "C/D/M", v: "230 V" }, TH: { t: "A/B/C/O", v: "230 V" }, VN: { t: "A/B/C", v: "220 V" },
  ID: { t: "C/F", v: "230 V" }, MY: { t: "G", v: "240 V" }, SG: { t: "G", v: "230 V" },
  PH: { t: "A/B/C", v: "220 V" }, LK: { t: "D/G/M", v: "230 V" }, AE: { t: "C/D/G", v: "230 V" },
  JO: { t: "B/C/D/F/G/J", v: "230 V" }, IL: { t: "C/H/M", v: "230 V" },
  AU: { t: "I", v: "230 V" }, NZ: { t: "I", v: "230 V" }, PF: { t: "C/E", v: "220 V" }
};

/* ===== Pourboires : usages locaux (par ISO2) ===== */

const TIPS = {
  US: "💵 Attendu : 15-20 % au restaurant (les serveurs en vivent), 1-2 $ par bagage/boisson.",
  CA: "💵 Attendu : 15-18 % au restaurant, comme aux États-Unis.",
  MX: "Usuel : ~10-15 % au restaurant si le service n'est pas inclus (« propina »).",
  GB: "10-12,5 % si le service n'est pas déjà compté (« service charge ») — vérifie l'addition.",
  IE: "~10 % au restaurant si le service n'est pas inclus.",
  JP: "🚫 Pas de pourboire — ça peut même être perçu comme impoli. Le service est toujours impeccable !",
  CN: "Pas d'usage de pourboire (hors hôtels très touristiques).",
  KR: "Pas d'usage de pourboire.",
  TH: "Apprécié : arrondir ou laisser 20-50 THB. ~10 % dans les bons restaurants.",
  VN: "Pas obligatoire, mais arrondir fait toujours plaisir (10-20k VND).",
  ID: "5-10 % apprécié si le service (souvent +10 %) n'est pas déjà compté.",
  IN: "~10 % au restaurant, petites pièces aux porteurs et guides.",
  AU: "Pas d'usage strict — 10 % dans les bons restaurants si très satisfait.",
  NZ: "Pas d'usage de pourboire, sauf service exceptionnel.",
  AE: "10 % usuel si non inclus ; petits pourboires fréquents (bagagistes, taxis).",
  MA: "Très répandu : 5-10 % au café/restaurant, petites pièces aux guides et gardiens.",
  TN: "Apprécié : 5-10 % au restaurant, dinars aux porteurs.",
  EG: "Le « bakchich » fait partie de la culture : petites coupures partout (1 € ≈ 50 EGP).",
  TR: "5-10 % au restaurant, arrondir le taxi.",
  BR: "Souvent +10 % « serviço » déjà inclus dans l'addition — rien à ajouter.",
  AR: "~10 % au restaurant (« propina »), en liquide de préférence.",
  ZA: "10-15 % attendu au restaurant, pourboire aux gardiens de parking."
};
const TIPS_EU = "Le service est inclus en Europe — arrondir ou laisser ~5-10 % si tu es très satisfait.";
const TIPS_DEFAULT = "Pas de règle stricte ici : arrondir l'addition fait toujours plaisir. 😊";

/* ===== Chasse aux défis (à relever pendant le voyage) ===== */

const DEFIS = [
  "Goûter une spécialité locale inconnue 🍽️", "Dire bonjour dans la langue locale à un inconnu 👋",
  "Prendre un coucher de soleil en photo 🌇", "Acheter quelque chose au marché local 🧺",
  "Apprendre 5 mots de la langue 🗣️", "Trouver le monument le plus moche 🏚️",
  "Photographier un animal 📸🐾", "Se baigner (mer, lac ou rivière) 🏊",
  "Faire une photo de famille devant LE monument 👨‍👩‍👧", "Repérer une plaque d'immatriculation française 🚗",
  "Manger une glace d'un parfum jamais testé 🍦", "Envoyer une vraie carte postale 💌",
  "Demander son chemin à un habitant 🗺️", "Faire un selfie avec une statue 🗿",
  "Goûter une boisson locale 🥤", "Trouver un souvenir à moins de 5 € 🎁",
  "Danser ou chanter en public 🎤", "Imiter une pub touristique en photo 📷",
  "Se lever pour un lever de soleil 🌅", "Tenir une journée sans téléphone (sauf photos) 📵"
];

/* ===== Pendu : mots sur le thème du voyage ===== */

const PENDU_WORDS = [
  "AVENTURE", "PASSEPORT", "VALISE", "BOUSSOLE", "HORIZON", "MONTAGNE", "PLAGE", "DESERT",
  "AEROPORT", "DOUANE", "SOUVENIR", "RANDONNEE", "VOLCAN", "CASCADE", "ARCHIPEL", "LAGON",
  "PYRAMIDE", "CHATEAU", "MARCHE", "BOUSSOLE", "DECALAGE HORAIRE", "CARTE POSTALE",
  "SAC A DOS", "HOTEL", "AUBERGE", "FRONTIERE", "ESCALE", "EMBARQUEMENT", "PANORAMA",
  "GLACIER", "OASIS", "JUNGLE", "SAFARI", "PHARE", "TROPIQUE", "EQUATEUR", "CARAVANE"
];

/* ===== Divers ===== */

const STICKERS = ["🏖️", "🍕", "🚂", "🎢", "🌋", "🏰", "🛵", "🍦", "⛩️", "🐒", "🌈", "⭐", "🎉", "😋", "📸", "🥾", "🤿", "🗿", "🦜", "🍹"];

const PERSON_EMOJIS = ["🧑", "👩", "👨", "🧒", "👧", "👦", "👵", "👴", "🧔", "👱‍♀️", "🧑‍🦰", "👩‍🦱"];

const DEVISES_CONV = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "THB", "MAD", "TND", "TRY", "MXN", "BRL", "IDR", "VND", "INR", "CNY", "KRW", "AED", "ZAR"];

const BADGES_DEFS = [
  { emoji: "🐣", label: "Premier envol",      desc: "Terminer son premier voyage",        test: s => s.voyages >= 1 },
  { emoji: "🧭", label: "Baroudeur",          desc: "5 voyages terminés",                 test: s => s.voyages >= 5 },
  { emoji: "🌟", label: "Grand voyageur",     desc: "10 voyages terminés",                test: s => s.voyages >= 10 },
  { emoji: "🗺️", label: "Explorateur",       desc: "3 pays visités",                     test: s => s.pays >= 3 },
  { emoji: "🌍", label: "Globe-trotteur",     desc: "10 pays visités",                    test: s => s.pays >= 10 },
  { emoji: "🌏", label: "Citoyen du monde",   desc: "20 pays visités",                    test: s => s.pays >= 20 },
  { emoji: "🧳", label: "Nomade",             desc: "30 jours de voyage cumulés",         test: s => s.jours >= 30 },
  { emoji: "💯", label: "Centurion",          desc: "100 jours de voyage cumulés",        test: s => s.jours >= 100 },
  { emoji: "🚀", label: "Longue distance",    desc: "10 000 km parcourus",                test: s => s.km >= 10000 },
  { emoji: "🌐", label: "Tour du monde",      desc: "40 075 km parcourus",                test: s => s.km >= 40075 },
  { emoji: "🧩", label: "Multi-continents",   desc: "3 continents visités",               test: s => s.continents >= 3 },
  { emoji: "🏆", label: "Maître du monde",    desc: "5 continents visités",               test: s => s.continents >= 5 },
  { emoji: "📔", label: "Écrivain voyageur",  desc: "10 souvenirs dans le journal",       test: s => s.journal >= 10 },
  { emoji: "💫", label: "Rêveur",             desc: "5 destinations dans la liste d'envies", test: s => s.envies >= 5 },
  { emoji: "📷", label: "Reporter",           desc: "10 photos géolocalisées sur les cartes", test: s => s.photos >= 10 },
  { emoji: "🗓️", label: "Organisateur",      desc: "20 activités planifiées",            test: s => s.activites >= 20 }
];
