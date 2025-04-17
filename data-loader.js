/**
 * Chargeur de données pour les courses hippiques
 * Ce module gère le chargement des données à partir des fichiers JSON en fonction de la date
 */

// Configuration du chemin des données
const DATA_PATH = 'data/';
const DEFAULT_TYPE_FILTER = ''; // Pas de filtre par défaut pour voir toutes les courses

/**
 * Obtient la date du jour au format YYYY-MM-DD
 * @returns {string} Date formatée
 */
function getTodayDateFormatted() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

/**
 * Extrait le nom de l'hippodrome à partir du nom du fichier
 * @param {string} filename - Nom du fichier JSON
 * @returns {string} Nom de l'hippodrome formaté
 */
function extractHippodromeName(filename) {
    // Par exemple: "2025-04-17_salon_provence.json" => "SALON PROVENCE"
    const match = filename.match(/\d{4}-\d{2}-\d{2}_(.+)\.json/);
    if (match && match[1]) {
        return match[1].replace(/_/g, ' ').toUpperCase();
    }
    return "HIPPODROME INCONNU";
}

/**
 * Données de secours à utiliser si les fichiers JSON ne sont pas disponibles
 */
const FALLBACK_DATA = {
    "SALON PROVENCE": [
        {
            nom: "PRIX DE LA COTE BLEUE",
            horaire: "11h51",
            numero: "1",
            type: "Plat",
            participants: [
                { n: "1", cheval: "CHARMING CAT", jockey: "HUGO BESNIER", entraineur: "P. COTTIER", proprietaire: "GOUSSERIE RACING", eleveurs: "X. RICHARD", poids: "58 kg", performances: "1p" },
                { n: "2", cheval: "THE BLACK STONE", jockey: "ALEJANDRO GUTIERREZ VAL", entraineur: "MME J. SOUBAGNE", proprietaire: "TAKE FIVE SAS", eleveurs: "TAKE FIVE SAS, MME J. SOUBAGNE", poids: "58 kg", performances: "1p" },
                { n: "3", cheval: "HELLO SPRING", jockey: "DAVID BREUX", entraineur: "T. RICHARD (S)", proprietaire: "H.MONCHAUX/MME K.RICHARD", eleveurs: "H. MONCHAUX", poids: "54,5 kg", performances: "" },
                { n: "4", cheval: "FRAGANCE", jockey: "MME MICKAELLE MICHEL", entraineur: "JPJ. DUBOIS", proprietaire: "MR JEAN-PIERRE-JOSEPH DUBOIS", eleveurs: "JPJ. DUBOIS", poids: "52,5 kg(54 kg)", performances: "6p" },
                { n: "5", cheval: "WHITE NIGHT", jockey: "MME MANON GERMAIN", entraineur: "JPJ. DUBOIS", proprietaire: "MR JEAN-PIERRE-JOSEPH DUBOIS", eleveurs: "JPJ. DUBOIS", poids: "52,5 kg(54 kg)", performances: "8p" },
                { n: "6", cheval: "CLEA CHOPE", jockey: "ANTONIO ORANI", entraineur: "C. ESCUDER", proprietaire: "EC.PUGLIA/EC.J.PIASCO/EC.METAL", eleveurs: "A. CHOPARD", poids: "54 kg", performances: "6p" },
                { n: "7", cheval: "REMENBER CHOPE", jockey: "IORITZ MENDIZABAL", entraineur: "MME M. SCANDELLA-LACAILLE", proprietaire: "R.CAPOZZI/MME M.BLANC", eleveurs: "A. CHOPARD, MME R. KHADDAM, LEMZAR SARL", poids: "54 kg", performances: "3p" },
                { n: "8", cheval: "ILE AUX ROSES", jockey: "MME CORALIE PACAUT", entraineur: "C. ESCUDER", proprietaire: "MR BERNARD GIRAUDON", eleveurs: "GUY PARIENTE HOLDING", poids: "51,5 kg(53 kg)", performances: "" },
                { n: "9", cheval: "PINK ROCHE", jockey: "SYLVAIN RUIS", entraineur: "C. ESCUDER", proprietaire: "MME CRISTEL MARTINA", eleveurs: "SCEA MARMION VAUVILLE", poids: "53 kg", performances: "" }
            ]
        },
        {
            nom: "PRIX D'EYGUIERES",
            horaire: "12h23",
            numero: "2",
            type: "Plat",
            participants: [
                { n: "1", cheval: "FINK PLOYD", jockey: "VALENTIN SEGUY", entraineur: "J. REYNIER (S)", proprietaire: "G.AUGUSTIN-NORMAND", eleveurs: "P. JABOT", poids: "58 kg", performances: "" },
                { n: "2", cheval: "BLACK TIE", jockey: "JEAN-BERNARD EYQUEM", entraineur: "JC. ROUGET (S)", proprietaire: "ECURIE D.LAYANI/GOUSSERIE RACING", eleveurs: "E. PUERARI, ECURIE DU PARC MONCEAU, MME A. GRAVEREAUX, OCEANIC BLOODSTOCK INC", poids: "58 kg", performances: "" },
                { n: "3", cheval: "NELLO", jockey: "HUGO BESNIER", entraineur: "P. COTTIER", proprietaire: "ECURIE DU SUD", eleveurs: "T.DE LA HERONNIERE", poids: "58 kg", performances: "" },
                { n: "4", cheval: "UNFURLED", jockey: "ANTHONY CRASTUS", entraineur: "N. PERRET (S)", proprietaire: "ECURIE THOMAS SIVADIER", eleveurs: "E.A.R.L. ELEVAGE DES LOGES", poids: "58 kg", performances: "" },
                { n: "5", cheval: "SAINT FLORENT", jockey: "MARVIN GRANDIN", entraineur: "J. REYNIER (S)", proprietaire: "LE MARAIS SAS", eleveurs: "HARAS DU LOGIS SAINT GERMAIN", poids: "58 kg", performances: "" },
                { n: "6", cheval: "THE MOON'S ANGEL", jockey: "GUILLAUME MILLET", entraineur: "R. FRADET (S)", proprietaire: "MR MICHEL NIKITAS", eleveurs: "MME R. DWEK, MME C. SIMON, MME T.DE BEAUREGARD, D. SOURDEAU DE BEAUREGARD", poids: "58 kg", performances: "" },
                { n: "7", cheval: "ZELKOVA (IRE)", jockey: "MME CORALIE PACAUT", entraineur: "JC. ROUGET (S)", proprietaire: "AL SHAQAB RACING", eleveurs: "AL SHAQAB RACING", poids: "55 kg(56,5 kg)", performances: "" },
                { n: "8", cheval: "RUGLES", jockey: "NON PARTANT", entraineur: "J. REYNIER (S)", proprietaire: "MR GERARD AUGUSTIN-NORMAND", eleveurs: "FRANKLIN FINANCE S.A.", poids: "56,5 kg", performances: "" },
                { n: "9", cheval: "DENGIE", jockey: "SYLVAIN RUIS", entraineur: "N. PERRET (S)", proprietaire: "MR JEAN-CLAUDE SEROUL", eleveurs: "JC. SEROUL", poids: "56,5 kg", performances: "" },
                { n: "10", cheval: "DISBAY", jockey: "IORITZ MENDIZABAL", entraineur: "J. ANDREU (S)", proprietaire: "MR JEAN-CLAUDE SEROUL", eleveurs: "JC. SEROUL", poids: "56,5 kg", performances: "" },
                { n: "11", cheval: "HOODWINK", jockey: "MME MANON GERMAIN", entraineur: "J. REYNIER (S)", proprietaire: "MR JAMES WIGAN", eleveurs: "LONDON THOROUGHBRED SERVICES", poids: "55 kg(56,5 kg)", performances: "" }
            ]
        },
        {
            nom: "PRIX D'ARLES",
            horaire: "12h55",
            numero: "3",
            type: "Plat",
            participants: [
                { n: "1", cheval: "FIUMICCINO", jockey: "HUGO BESNIER", entraineur: "P. COTTIER", proprietaire: "MR JEAN-PIERRE-JOSEPH DUBOIS", eleveurs: "MME L. LEMIERE DUBOIS", poids: "58 kg", performances: "0p5p2p4p" },
                { n: "2", cheval: "GREEN HEAD", jockey: "MICKAEL FOREST", entraineur: "Y. BONNEFOY (S)", proprietaire: "ECURIE BERTRAND MILLIERE", eleveurs: "ECURIE BERTRAND MILLIERE, C. MILLIERE", poids: "58 kg", performances: "(24)0p" },
                { n: "3", cheval: "GOLDEN BROWN", jockey: "JEAN-BERNARD EYQUEM", entraineur: "JC. ROUGET (S)", proprietaire: "ECURIE VIVALDI", eleveurs: "HARAS DE GRANDCAMP EARL", poids: "58 kg", performances: "3p 2p(24)4p3p2p3p" },
                { n: "4", cheval: "BLACK BOSS", jockey: "GUILLAUME MILLET", entraineur: "R. FRADET (S)", proprietaire: "MR FABRICE FANTAUZZA", eleveurs: "SUC. D.DE LA HERONNIERE", poids: "58 kg", performances: "2p2p" },
                { n: "5", cheval: "CANNOLO (IRE)", jockey: "ANTHONY CRASTUS", entraineur: "C. ESCUDER", proprietaire: "N.RICIGNUOLO/EQUUS RACING/MEKKI", eleveurs: "MME P. CARPENTIER, SCEA JLC, SCEA L'AUBAY", poids: "58 kg", performances: "4p9p" },
                { n: "6", cheval: "IL BIONDINO", jockey: "MME CORALIE PACAUT", entraineur: "C. ESCUDER", proprietaire: "N.RICIGNUOLO/F.GRIMA/B.MEKKI", eleveurs: "HARAS DES TROIS CHAPELLES", poids: "56,5 kg(58 kg)", performances: "0p" },
                { n: "7", cheval: "C'EST VRAI", jockey: "SYLVAIN RUIS", entraineur: "N. PERRET (S)", proprietaire: "MR JEAN-CLAUDE SEROUL", eleveurs: "JC. SEROUL", poids: "58 kg", performances: "5p" },
                { n: "8", cheval: "DREAM IN BROOKE", jockey: "MME MARINA BRUNELLI", entraineur: "MME M. SCANDELLA-LACAILLE", proprietaire: "V.GUEDJ/P.GUEDJ/JL.MEDINA STUD", eleveurs: "P. GUEDJ, V. GUEDJ, JL. MEDINA", poids: "53 kg(56,5 kg)", performances: "4p 6p" },
                { n: "9", cheval: "ALMERIA", jockey: "MME MANON GERMAIN", entraineur: "J. REYNIER (S)", proprietaire: "MR JAMES WIGAN", eleveurs: "LONDON THOROUGHBRED SERVICES", poids: "55 kg(56,5 kg)", performances: "4p" }
            ]
        },
        {
            nom: "PRIX DE LA SOCIETE DES COURSES DE SALON-DE-PROVENCE",
            horaire: "13h27",
            numero: "4",
            type: "Plat",
            participants: [
                { n: "1", cheval: "PRADO", jockey: "ANTHONY CRASTUS", entraineur: "P. COTTIER", proprietaire: "MR JEAN-PIERRE-JOSEPH DUBOIS", eleveurs: "JPJ. DUBOIS", poids: "57 kg", performances: "4p3p3p1p3p(24)3p2p7p" },
                { n: "2", cheval: "MONDO", jockey: "JEAN-BERNARD EYQUEM", entraineur: "JC. ROUGET (S)", proprietaire: "ECURIE C. MARZOCCO", eleveurs: "HARAS D'ETREHAM, RIVIERA EQUINE S.A.R.L", poids: "57 kg", performances: "4p(24)7p1p3p" },
                { n: "3", cheval: "ZARAKCHIC", jockey: "ANTONIO ORANI", entraineur: "J. REYNIER (S)", proprietaire: "G.PARIENTE/JC.SEROUL/AUGUSTIN-N.", eleveurs: "GUY PARIENTE HOLDING", poids: "57 kg", performances: "4p(24)1p3p" },
                { n: "4", cheval: "MARCHEMALO", jockey: "HUGO BESNIER", entraineur: "P. COTTIER", proprietaire: "JF.GRIBOMONT/EC.SUD/D.DUMOULIN", eleveurs: "JF. GRIBOMONT", poids: "57 kg", performances: "1p" },
                { n: "5", cheval: "DIOPTASE (IRE)", jockey: "MARVIN GRANDIN", entraineur: "JC. ROUGET (S)", proprietaire: "LE MARAIS/EC.STEMPNIAK/PARIENTE", eleveurs: "SCEA MARMION VAUVILLE, ECURIE SKYMARC FARM, NIGHTCHILL LLC", poids: "57 kg", performances: "2p5p1p" },
                { n: "6", cheval: "STEF LE MAGNIFIQUE", jockey: "GUILLAUME MILLET", entraineur: "R. FRADET (S)", proprietaire: "MR MICHEL NIKITAS", eleveurs: "W. NEUMANN, EARL HARAS DU LOGIS, J. INCE", poids: "57 kg", performances: "6p2p(24)2p1p" },
                { n: "7", cheval: "KLYCOT", jockey: "SYLVAIN RUIS", entraineur: "N. PERRET (S)", proprietaire: "MR JEAN-CLAUDE SEROUL", eleveurs: "JC. SEROUL", poids: "57 kg", performances: "1p6p" }
            ]
        },
        {
            nom: "PRIX DU CENTRE D'ENTRAINEMENT DE CALAS",
            horaire: "14h12",
            numero: "5",
            type: "Plat",
            participants: [
                { n: "1", cheval: "BOOGIE", jockey: "ANTHONY CRASTUS", entraineur: "N. PERRET (S)", proprietaire: "MR HERVE GUILLET", eleveurs: "RY. SIMON, N. SIMON, MME V. SIMON, MME C. SIMON", poids: "59 kg", performances: "1p1p2p 0p1p(24)2p1p9p2p" },
                { n: "2", cheval: "INTERSTELLA GER", jockey: "MME MARINA BRUNELLI", entraineur: "MME M. SCANDELLA-LACAILLE", proprietaire: "ECURIE JOYA RACING SAS", eleveurs: "MME U. IMM, J. IMM", poids: "54 kg(57,5 kg)", performances: "1p4p 6p7p9p(24)4p1p6p5p" },
                { n: "3", cheval: "ZLARA", jockey: "IORITZ MENDIZABAL", entraineur: "M. CESANDRI (S)", proprietaire: "MR JEAN-CLAUDE RAVIER", eleveurs: "BLOODSTOCK AGENCY LTD, MME M. RISI", poids: "57,5 kg", performances: "(24)1p8p8p4p 4p0p1p1p2p" },
                { n: "4", cheval: "POLYSPEED (IRE)", jockey: "ANTONIO ORANI", entraineur: "MME M. SCANDELLA-LACAILLE", proprietaire: "AA.AMELINE/AGV KARWIN/EC.EQUUS", eleveurs: "WERTHEIMER & FRERE", poids: "57 kg", performances: "1p2p2p(24)5p" },
                { n: "5", cheval: "BACK TO BLACK", jockey: "MARVIN GRANDIN", entraineur: "J. REYNIER (S)", proprietaire: "ECURIE MG", eleveurs: "F. VERMEULEN", poids: "56 kg", performances: "7p(24)3p4p5p(23)5p6p5p4p" },
                { n: "6", cheval: "MY CHARMING PRINCE", jockey: "GUILLAUME MILLET", entraineur: "E. MIKHALIDES (S)", proprietaire: "MR STEPHANE GRANDIN", eleveurs: "EARL HARAS DU CAMP BENARD", poids: "56 kg", performances: "0p7p(23)3p1p9p9p 2p6p3p" },
                { n: "7", cheval: "BLACK SAXON", jockey: "HUGO BESNIER", entraineur: "N. BELLANGER (S)", proprietaire: "MR DIDIER MARS", eleveurs: "LE THENNEY", poids: "56 kg", performances: "6p(24)7p1p3p4p" },
                { n: "8", cheval: "LADY MANA", jockey: "MME MANON GERMAIN", entraineur: "F. FORESI", proprietaire: "MR GUILLAUME DUROT", eleveurs: "HARAS DU HOGUENET, P. NATAF", poids: "53 kg(54,5 kg)", performances: "9p(24)0p2p4p3p 7p1p0p3p" },
                { n: "9", cheval: "AMELIELYMPIQUE (IRE)", jockey: "SYLVAIN RUIS", entraineur: "N. PERRET (S)", proprietaire: "MR JEAN-CLAUDE SEROUL", eleveurs: "JC. SEROUL", poids: "54,5 kg", performances: "0p(24)Tp3p5p8p 4p(23)3p5p" }
            ]
        },
        {
            nom: "PRIX JEAN-JACQUES NAPOLI",
            horaire: "14h47",
            numero: "6",
            type: "Plat",
            participants: [
                { n: "1", cheval: "SHAMSABAD", jockey: "ANTONIO ORANI", entraineur: "C. MARTINON", proprietaire: "ECURIE DU PERROQUET SAUVAGE", eleveurs: "SUC. S.A. AGA KHAN", poids: "60 kg", performances: "2p9p6p 6p6p3p8p(24)0p0p" },
                { n: "2", cheval: "ALROMY", jockey: "MME MANON GERMAIN", entraineur: "MME L. SALTON", proprietaire: "MME LAURA SALTON", eleveurs: "SCA ELEVAGE DE TOURGEVILLE, MME H. ERCULIANI", poids: "58,5 kg(60 kg)", performances: "1p9p0p(24)0p3p9p1p 7p1p" },
                { n: "3", cheval: "TIGRE ROUGE", jockey: "MICKAEL FOREST", entraineur: "RC. MONTENEGRO", proprietaire: "MME SUSANNE RITSON", eleveurs: "MME S. RITSON", poids: "58,5 kg", performances: "4p3p2p(24)8p2p1p1p 4p1p" },
                { n: "4", cheval: "DREAM OF EMERAUDE", jockey: "GUILLAUME MILLET", entraineur: "J. VAN HANDENHOVE", proprietaire: "ECURIE DE LA VERTE VALLEE", eleveurs: "MME A. DELARUE", poids: "58,5 kg", performances: "5p0p0p5p(24)1p9p6p3p 6p" },
                { n: "5", cheval: "MOUTRAKI IRE", jockey: "HUGO BESNIER", entraineur: "N. PERRET (S)", proprietaire: "MR ERIC D' ANGELO", eleveurs: "LIMESTONE STUD, TARA STUD", poids: "58 kg", performances: "6p9p4p(24)8p2p6p7p 0p8p" },
                { n: "6", cheval: "BUSINESS PLAN", jockey: "MARVIN GRANDIN", entraineur: "S. LABATE (S)", proprietaire: "P.FAUCAMPRE/B.ROTGER/N.MICHELOTT", eleveurs: "V. BUKHTOYAROV, E. KAPPUSHEV", poids: "57 kg", performances: "9p8p9p6p6p(24)4p4p4p6p" },
                { n: "7", cheval: "FOR BETTY", jockey: "GREGOIRE LEGRAS", entraineur: "N. PERRET (S)", proprietaire: "MME CRISTEL MARTINA", eleveurs: "THOUSAND DREAMS", poids: "57 kg", performances: "2p(24)0p6p" },
                { n: "8", cheval: "HADLEIGH", jockey: "IORITZ MENDIZABAL", entraineur: "J. ANDREU (S)", proprietaire: "MR ROBERT MINICHIELLO", eleveurs: "ECURIE KURA", poids: "56 kg", performances: "4p0p4p7p 5p(24)0p0p4p4p" }
            ]
        },
        {
            nom: "PRIX DE MIRAMAS",
            horaire: "15h22",
            numero: "7",
            type: "Plat",
            participants: [
                { n: "1", cheval: "COTE JARDIN", jockey: "JIRI CHALOUPKA", entraineur: "J. CHALOUPKA", proprietaire: "CAJDASROT S.R.O.", eleveurs: "F. BOZO, SUC. P. BOZO, MME MC. BOZO, JC. BOZO", poids: "60 kg", performances: "(24)6p0p0p5p(23)0p6p8p6p" },
                { n: "2", cheval: "AL HABISSET", jockey: "HUGO BESNIER", entraineur: "F. BOUALEM", proprietaire: "MR FAOUZI BOUALEM", eleveurs: "HARAS DU GRAND COURGEON", poids: "59,5 kg", performances: "5p6p 6p3p8p(24)2p3p3p3p" },
                { n: "3", cheval: "ASPEN", jockey: "ANTONIO ORANI", entraineur: "R. FRADET (S)", proprietaire: "MR MICHEL NIKITAS", eleveurs: "ALEYRION BLOODSTOCK LTD", poids: "59,5 kg", performances: "3p0p0p 0p7p(24)8p1p0p4p" },
                { n: "4", cheval: "GAMECHANGER", jockey: "EMILIEN PUILLET-RODA", entraineur: "JC. SARAIS", proprietaire: "MR DANIEL ORTU", eleveurs: "ECURIE SKYMARC FARM", poids: "58 kg(59,5 kg)", performances: "1p0p1p9p 5p4p(24)6p7p6p" },
                { n: "5", cheval: "INTO FAITH", jockey: "MME CORALIE PACAUT", entraineur: "C. ESCUDER", proprietaire: "MR ALEXANDRE DE LANFRANCHI", eleveurs: "THE KATHRYN STUD", poids: "58 kg(59,5 kg)", performances: "4p1p7p6p6p(24)5p2p2p1p" },
                { n: "6", cheval: "LESSARD", jockey: "MME MICKAELLE MICHEL", entraineur: "MME M. SCANDELLA-LACAILLE", proprietaire: "MR GERARD AUGUSTIN-NORMAND", eleveurs: "FRANKLIN FINANCE S.A.", poids: "58 kg(59,5 kg)", performances: "2p0p9p9p2p(24)5p1p1p2p" },
                { n: "7", cheval: "EXHIT", jockey: "RUDY PIMBONNET", entraineur: "M. PIMBONNET", proprietaire: "B.BIMOZ/ECURIE SAINT-HILAIRE", eleveurs: "WERTHEIMER & FRERE", poids: "58 kg", performances: "8p0p1p1p 2p7p(24)0p2p6p" }
            ]
        },
        {
            nom: "PRIX CHRISTIAN FORNAROLI",
            horaire: "15h57",
            numero: "8",
            type: "Plat",
            participants: [
                { n: "1", cheval: "LOU MAN", jockey: "GREG BENOIST", entraineur: "P. DAULIER", proprietaire: "MME SYLVIE DAULIER", eleveurs: "K. RHATIGAN", poids: "60 kg", performances: "4p 0p0p(24)7p6p0p0p0p0p" },
                { n: "2", cheval: "ROSEDALE", jockey: "SYLVAIN RUIS", entraineur: "P. COTTIER", proprietaire: "MR JEAN-PIERRE-JOSEPH DUBOIS", eleveurs: "JPJ. DUBOIS", poids: "60 kg", performances: "2p(24)2p4p 2p1p3p 5p7p" },
                { n: "3", cheval: "YATT", jockey: "MARVIN GRANDIN", entraineur: "J. REYNIER (S)", proprietaire: "ECURIE NICOLAS", eleveurs: "HARAS DE LA PERELLE", poids: "59 kg", performances: "(24)3p1p4p5p(23)5p1p2p4p" },
                { n: "4", cheval: "ACCLAM", jockey: "ANTHONY CRASTUS", entraineur: "P. COTTIER", proprietaire: "EC.DES CHARMES/MR R.TALBOT", eleveurs: "THE ACCLAMATION SYNDICATE", poids: "58,5 kg", performances: "0p 1p(24)0p8p6p(23)6p(22)" },
                { n: "5", cheval: "BELLAGIO", jockey: "HUGO BESNIER", entraineur: "N. PERRET (S)", proprietaire: "MR JEAN-CLAUDE SEROUL", eleveurs: "JC. SEROUL", poids: "58,5 kg", performances: "9p4p(24)1p8p1p2p 7p2p6p" },
                { n: "6", cheval: "BONS BAISERS", jockey: "ANTONIO ORANI", entraineur: "P. COTTIER", proprietaire: "EC.DES CHARMES/MME V.FAVE", eleveurs: "LA TOUQUES BLOODSTOCK", poids: "57,5 kg", performances: "6p(24)9p0p3p0p 2p(23)3p" },
                { n: "7", cheval: "LYKION", jockey: "MICKAEL FOREST", entraineur: "RC. MONTENEGRO", proprietaire: "E.BUCHER/J.SCHOENENBERGER", eleveurs: "G. KERN, E. BUCHER", poids: "57,5 kg", performances: "1p(24)9p5p0p 5p4p8p0p0p" },
                { n: "8", cheval: "STAR VICTORY", jockey: "IORITZ MENDIZABAL", entraineur: "M. CESANDRI (S)", proprietaire: "MR JEAN-CLAUDE SEROUL", eleveurs: "JC. SEROUL", poids: "57,5 kg", performances: "9p5p(24)0p0p1p5p3p 0p3p" }
            ]
        }
    ],
    "LONGCHAMP": [
        {
            nom: "PRIX DE PARIS",
            horaire: "14h20",
            numero: "1",
            type: "Plat",
            participants: [
                { n: "1", cheval: "GALACTIC STAR", jockey: "CHRISTOPHE SOUMILLON", entraineur: "A. FABRE (S)", proprietaire: "GODOLPHIN SNC", eleveurs: "DARLEY", poids: "58 kg", performances: "1p1p2p" },
                { n: "2", cheval: "SWIFT VICTORY", jockey: "MAXIME GUYON", entraineur: "F. HEAD (S)", proprietaire: "WERTHEIMER & FRERE", eleveurs: "WERTHEIMER ET FRERE", poids: "58 kg", performances: "2p1p3p" },
                { n: "3", cheval: "URBAN LEGEND", jockey: "MICKAEL BARZALONA", entraineur: "A. FABRE (S)", proprietaire: "GODOLPHIN SNC", eleveurs: "DARLEY", poids: "57 kg", performances: "2p3p1p" }
            ]
        }
    ],
    "PARISLONGCHAMP": [
        {
            nom: "PRIX DE LA SEINE",
            horaire: "15h15",
            numero: "1",
            type: "Plat",
            participants: [
                { n: "1", cheval: "ROYAL DESTINY", jockey: "STEPHANE PASQUIER", entraineur: "C. LAFFON-PARIAS", proprietaire: "WERTHEIMER & FRERE", eleveurs: "WERTHEIMER ET FRERE", poids: "58 kg", performances: "2p1p" },
                { n: "2", cheval: "DIAMOND LIGHT", jockey: "PIERRE-CHARLES BOUDOT", entraineur: "A. FABRE (S)", proprietaire: "GODOLPHIN SNC", eleveurs: "DARLEY", poids: "58 kg", performances: "1p2p" }
            ]
        }
    ],
    "SAN SEBASTIAN": [
        {
            nom: "GRAN PREMIO DE SAN SEBASTIAN",
            horaire: "16h30",
            numero: "1",
            type: "Plat",
            participants: [
                { n: "1", cheval: "SUENA EL DEMBOW", jockey: "VACLAV JANACEK", entraineur: "H. PEREIRA", proprietaire: "YEGUADA ROCIO", eleveurs: "YEGUADA ROCIO", poids: "57 kg", performances: "1p1p2p" },
                { n: "2", cheval: "JOUMA", jockey: "RICARDO SOUSA", entraineur: "G. ARIZKORRETA", proprietaire: "IVAES", eleveurs: "IVAES", poids: "57 kg", performances: "2p1p3p" },
                { n: "3", cheval: "ALCAZAR DE SEGOVIA", jockey: "BORJA FAYOS", entraineur: "O. ANAYA", proprietaire: "NANINA", eleveurs: "NANINA", poids: "57 kg", performances: "3p2p1p" },
                { n: "4", cheval: "GANO Y VUELVO", jockey: "JAIME GELABERT", entraineur: "E. LEON", proprietaire: "TINERFE", eleveurs: "TINERFE", poids: "57 kg", performances: "4p3p1p" },
                { n: "5", cheval: "WHITE SPIRIT", jockey: "JOSE LUIS BORREGO", entraineur: "J. CALDERÓN", proprietaire: "ODISEA", eleveurs: "ODISEA", poids: "57 kg", performances: "5p4p2p" }
            ]
        }
    ],
    "ARG PALERMO": [
        {
            nom: "GRAN PREMIO PALERMO",
            horaire: "21h45",
            numero: "1",
            type: "Plat",
            participants: [
                { n: "1", cheval: "EL MAGNIFICO", jockey: "EDUARDO ORTEGA", entraineur: "R. PELLEGATTA", proprietaire: "HARAS LA QUEBRADA", eleveurs: "HARAS LA QUEBRADA", poids: "57 kg", performances: "1p1p2p" },
                { n: "2", cheval: "ROMAN EMPEROR", jockey: "PABLO FALERO", entraineur: "J.C. ETCHECHOURY", proprietaire: "HARAS FIRMAMENTO", eleveurs: "HARAS FIRMAMENTO", poids: "57 kg", performances: "2p1p3p" },
                { n: "3", cheval: "WINNING CAUSE", jockey: "WILSON MOREYRA", entraineur: "N. MARTIN FERRO", proprietaire: "HARAS VACACION", eleveurs: "HARAS VACACION", poids: "57 kg", performances: "1p3p2p" },
                { n: "4", cheval: "MASTER OF HOUNDS", jockey: "FRANCISCO GONCALVES", entraineur: "A. GAITAN", proprietaire: "STUD MATRERA", eleveurs: "STUD MATRERA", poids: "57 kg", performances: "3p2p1p" }
            ]
        }
    ]
};

/**
 * Liste les fichiers JSON disponibles pour une date spécifique
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Promise<string[]>} Liste des noms de fichiers
 */
async function listAvailableFiles(date) {
    try {
        console.log("Recherche des fichiers pour la date:", date);
        
        // Liste des fichiers potentiels pour cette date
        const potentialFiles = [
            `${date}_salon_provence.json`,
            `${date}_longchamp.json`,
            `${date}_parislongchamp.json`,
            `${date}_san_sebastian.json`,
            `${date}_arg_palermo.json`,
            `${date}_valparaiso.json`,
            `${date}_palermo.json`,
            `${date}_auteuil.json`,
            `${date}_chantilly.json`,
            `${date}_saint_cloud.json`,
            `${date}_deauville.json`,
            `${date}_vichy.json`,
            `${date}_toulouse.json`
        ];
        
        // Vérifier quels fichiers existent réellement
        const availableFiles = [];
        
        for (const file of potentialFiles) {
            try {
                // Tenter de charger le fichier pour vérifier son existence
                console.log(`Vérification du fichier: ${DATA_PATH}${file}`);
                const response = await fetch(`${DATA_PATH}${file}`, { 
                    method: 'HEAD',
                    cache: 'no-store' // Éviter le cache du navigateur
                });
                
                if (response.ok) {
                    console.log(`✅ Fichier trouvé: ${file}`);
                    availableFiles.push(file);
                } else {
                    console.log(`❌ Fichier non trouvé (statut ${response.status}): ${file}`);
                }
            } catch (e) {
                // Si le fichier n'existe pas, continuer silencieusement
                console.log(`❌ Erreur lors de la vérification du fichier: ${file}`, e);
            }
        }
        
        console.log(`Total des fichiers trouvés: ${availableFiles.length}`);
        return availableFiles;
    } catch (error) {
        console.error("Erreur lors de la recherche des fichiers:", error);
        return [];
    }
}

/**
 * Charge les données d'un fichier JSON
 * @param {string} filename - Nom du fichier à charger
 * @returns {Promise<Object>} Données chargées
 */
async function loadJsonFile(filename) {
    try {
        console.log(`Chargement du fichier: ${DATA_PATH}${filename}`);
        const response = await fetch(`${DATA_PATH}${filename}`, {
            cache: 'no-store' // Éviter le cache du navigateur
        });
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✅ Fichier ${filename} chargé avec succès`);
        return data;
    } catch (error) {
        console.error(`❌ Erreur lors du chargement du fichier ${filename}:`, error);
        return null;
    }
}

/**
 * Convertit les données JSON au format attendu par l'interface
 * @param {Object} rawData - Données brutes du fichier JSON
 * @returns {Array} Données formatées pour l'interface
 */
function convertRawData(rawData) {
    if (!rawData || !rawData.courses || !Array.isArray(rawData.courses)) {
        console.error("Format de données JSON invalide:", rawData);
        return [];
    }

    // Formatage des données pour l'interface
    return rawData.courses.map(course => {
        // Formatage des participants
        const participants = Array.isArray(course.participants) ? course.participants.map(p => {
            // Récupération du numéro (n°, n ou place)
            const numero = p.n || p.n° || p.place || "";
            
            // Nettoyer le nom du cheval (enlever les caractères après le premier espace si besoin)
            let cheval = p.cheval || "";
            if (cheval.includes("  ")) {
                cheval = cheval.split("  ")[0];
            }
            
            return {
                n: numero,
                cheval: cheval,
                jockey: p.jockey || "",
                entraineur: p.entraineur || p.entraîneur || "",
                proprietaire: p.proprietaire || "",
                eleveurs: p.eleveurs || p.éleveurs || "",
                poids: p.poids || "",
                performances: p.performances || ""
            };
        }) : [];

        return {
            nom: course.nom || "",
            horaire: course.horaire || "",
            numero: course.numero || "",
            type: course.type || "Plat",
            participants: participants
        };
    });
}

/**
 * Charge les données de courses pour une date spécifique
 * @param {string} date - Date au format YYYY-MM-DD
 * @param {string} typeFilter - Filtre optionnel par type de course (ex: 'Plat')
 * @returns {Promise<Object>} Données des courses par hippodrome
 */
async function loadRacesData(date, typeFilter = DEFAULT_TYPE_FILTER) {
    // Si aucune date n'est fournie, utiliser la date du jour
    const targetDate = date || getTodayDateFormatted();
    let coursesData = {};
    
    try {
        console.log(`Chargement des données pour la date: ${targetDate}, filtre: ${typeFilter || 'aucun'}`);
        
        // Récupérer la liste des fichiers disponibles pour cette date
        const availableFiles = await listAvailableFiles(targetDate);
        
        // Si aucun fichier n'est disponible, utiliser les données de secours
        if (availableFiles.length === 0) {
            console.log("Aucun fichier disponible, utilisation des données de secours");
            return FALLBACK_DATA;
        }
        
        // Charger chaque fichier et extraire les données
        for (const file of availableFiles) {
            const hippodromeName = extractHippodromeName(file);
            
            // Charger les données
            const rawData = await loadJsonFile(file);
            
            if (rawData) {
                // Convertir les données brutes au format attendu par l'interface
                const formattedCourses = convertRawData(rawData);
                
                // Appliquer le filtre par type si spécifié
                let filteredCourses = formattedCourses;
                if (typeFilter) {
                    filteredCourses = formattedCourses.filter(course => 
                        course.type && course.type.toLowerCase() === typeFilter.toLowerCase()
                    );
                }
                
                // Si des courses correspondent au filtre, les ajouter au résultat
                if (filteredCourses.length > 0) {
                    coursesData[hippodromeName] = filteredCourses;
                    console.log(`✅ ${filteredCourses.length} courses trouvées pour ${hippodromeName}`);
                } else {
                    console.log(`❌ Aucune course correspondant au filtre pour ${hippodromeName}`);
                }
            }
        }
        
        // Si aucune donnée n'a été trouvée dans les fichiers, utiliser les données de secours
        if (Object.keys(coursesData).length === 0) {
            console.log("Aucune course trouvée dans les fichiers, utilisation des données de secours");
            return FALLBACK_DATA;
        }
        
        console.log(`Nombre total d'hippodromes avec des courses: ${Object.keys(coursesData).length}`);
        return coursesData;
    } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
        // En cas d'erreur, utiliser les données de secours
        console.log("Utilisation des données de secours suite à une erreur");
        return FALLBACK_DATA;
    }
}

/**
 * Formate une date pour l'affichage
 * @param {string} dateStr - Date au format YYYY-MM-DD
 * @returns {string} Date formatée pour l'affichage (DD/MM/YYYY)
 */
function formattedDate(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

/**
 * Met à jour l'affichage de la date dans l'interface
 * @param {string} dateStr - Date au format YYYY-MM-DD
 */
function updateDisplayDate(dateStr) {
    const currentDateSpan = document.getElementById('current-date');
    if (currentDateSpan) {
        const displayDate = dateStr;
        const dateParts = displayDate.split('-');
        const formattedDateStr = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        
        // Vérifier si c'est aujourd'hui ou demain
        const today = getTodayDateFormatted();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDate = tomorrow.toISOString().split('T')[0];
        
        if (displayDate === today) {
            currentDateSpan.textContent = `Aujourd'hui (${formattedDateStr})`;
        } else if (displayDate === tomorrowDate) {
            currentDateSpan.textContent = `Demain (${formattedDateStr})`;
        } else {
            currentDateSpan.textContent = formattedDateStr;
        }
    }
    
    // Mettre à jour la date de dernière mise à jour
    const lastUpdateEl = document.getElementById('last-update');
    if (lastUpdateEl) {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        lastUpdateEl.textContent = `${day}/${month}/${year}`;
    }
}

/**
 * Charge les courses pour la date du jour ou une date spécifiée
 * et met à jour l'interface utilisateur
 * @param {string} date - Date au format YYYY-MM-DD (optionnel)
 * @param {Function} successCallback - Fonction appelée avec les données chargées
 * @param {Function} errorCallback - Fonction appelée en cas d'erreur
 */
async function loadAndDisplayRaces(date, successCallback, errorCallback) {
    try {
        // Afficher un indicateur de chargement
        const resultsContainer = document.getElementById('results-container');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p>Chargement des courses...</p>
                </div>
            `;
        }
        
        // Utiliser la date fournie ou celle du jour
        const targetDate = date || getTodayDateFormatted();
        console.log(`Chargement des courses pour la date: ${targetDate}`);
        
        // Charger les données - Tous les types de courses (pas de filtre)
        const data = await loadRacesData(targetDate, '');
        
        // Si aucune donnée n'est trouvée (ce qui ne devrait plus arriver grâce aux données de secours)
        if (Object.keys(data).length === 0) {
            if (errorCallback) {
                errorCallback("Aucune course trouvée pour cette date");
            } else {
                if (resultsContainer) {
                    resultsContainer.innerHTML = `
                        <div class="no-results">
                            <i class="fas fa-search"></i>
                            <h3>Aucune course trouvée pour le ${formattedDate(targetDate)}</h3>
                            <p>Essayez une autre date ou consultez les courses récentes.</p>
                        </div>
                    `;
                }
            }
            return;
        }
        
        // Si des données sont trouvées, appeler le callback de succès
        if (successCallback) {
            console.log("Appel du callback de succès avec les données chargées");
            successCallback(data);
        }
        
        // Mettre à jour la date d'affichage
        updateDisplayDate(targetDate);
    } catch (error) {
        console.error("Erreur lors du chargement et de l'affichage des courses:", error);
        if (errorCallback) {
            errorCallback(error.message);
        }
    }
}

// Exporter les fonctions pour utilisation externe
window.hippique = {
    getTodayDateFormatted,
    loadRacesData,
    loadAndDisplayRaces,
    DEFAULT_TYPE_FILTER,
    formattedDate
};
