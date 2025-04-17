// Données des courses - Structure partagée entre les pages
const courseData = {
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
                { n: "5", cheval: "SAINT FLORENT", jockey: "MARVIN GRANDIN", entraineur: "J. REYNIER (S)", proprietaire: "LE MARAIS SAS", eleveurs: "HARAS DU LOGIS SAINT GERMAIN", poids: "58 kg", performances: "" }
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
                { n: "4", cheval: "BLACK BOSS", jockey: "GUILLAUME MILLET", entraineur: "R. FRADET (S)", proprietaire: "MR FABRICE FANTAUZZA", eleveurs: "SUC. D.DE LA HERONNIERE", poids: "58 kg", performances: "2p2p" }
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
    "SAINT-CLOUD": [
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
    ]
};

// Données de classement pour le calcul des scores théoriques
const classementData = {
    chevaux: {
        // Top chevaux avec scores et rangs
        "CHARMING CAT": { score: 85, rang: 12 },
        "THE BLACK STONE": { score: 82, rang: 15 },
        "HELLO SPRING": { score: 79, rang: 18 },
        "FRAGANCE": { score: 76, rang: 23 },
        "WHITE NIGHT": { score: 75, rang: 25 },
        "CLEA CHOPE": { score: 73, rang: 28 },
        "REMENBER CHOPE": { score: 80, rang: 17 },
        "ILE AUX ROSES": { score: 71, rang: 31 },
        "PINK ROCHE": { score: 69, rang: 34 },
        "FINK PLOYD": { score: 84, rang: 13 },
        "BLACK TIE": { score: 86, rang: 10 },
        "NELLO": { score: 77, rang: 22 },
        "UNFURLED": { score: 75, rang: 26 },
        "SAINT FLORENT": { score: 83, rang: 14 },
        "FIUMICCINO": { score: 81, rang: 16 },
        "GREEN HEAD": { score: 74, rang: 27 },
        "GOLDEN BROWN": { score: 88, rang: 8 },
        "BLACK BOSS": { score: 79, rang: 19 },
        "GALACTIC STAR": { score: 92, rang: 3 },
        "SWIFT VICTORY": { score: 90, rang: 5 },
        "URBAN LEGEND": { score: 87, rang: 9 },
        "ROYAL DESTINY": { score: 91, rang: 4 },
        "DIAMOND LIGHT": { score: 89, rang: 6 }
    },
    jockeys: {
        // Top jockeys
        "HUGO BESNIER": { score: 78, rang: 8 },
        "ALEJANDRO GUTIERREZ VAL": { score: 72, rang: 14 },
        "DAVID BREUX": { score: 70, rang: 18 },
        "MME MICKAELLE MICHEL": { score: 82, rang: 6 },
        "MME MANON GERMAIN": { score: 77, rang: 9 },
        "ANTONIO ORANI": { score: 75, rang: 11 },
        "IORITZ MENDIZABAL": { score: 83, rang: 5 },
        "MME CORALIE PACAUT": { score: 76, rang: 10 },
        "SYLVAIN RUIS": { score: 74, rang: 12 },
        "VALENTIN SEGUY": { score: 75, rang: 11 },
        "JEAN-BERNARD EYQUEM": { score: 84, rang: 4 },
        "ANTHONY CRASTUS": { score: 79, rang: 7 },
        "MARVIN GRANDIN": { score: 73, rang: 13 },
        "MICKAEL FOREST": { score: 76, rang: 10 },
        "GUILLAUME MILLET": { score: 71, rang: 16 },
        "CHRISTOPHE SOUMILLON": { score: 92, rang: 1 },
        "MAXIME GUYON": { score: 90, rang: 2 },
        "MICKAEL BARZALONA": { score: 88, rang: 3 },
        "STEPHANE PASQUIER": { score: 85, rang: 4 },
        "PIERRE-CHARLES BOUDOT": { score: 89, rang: 3 }
    },
    entraineurs: {
        // Top entraineurs
        "P. COTTIER": { score: 75, rang: 12 },
        "MME J. SOUBAGNE": { score: 72, rang: 15 },
        "T. RICHARD (S)": { score: 76, rang: 11 },
        "JPJ. DUBOIS": { score: 84, rang: 5 },
        "C. ESCUDER": { score: 78, rang: 9 },
        "MME M. SCANDELLA-LACAILLE": { score: 73, rang: 14 },
        "J. REYNIER (S)": { score: 82, rang: 7 },
        "JC. ROUGET (S)": { score: 88, rang: 3 },
        "N. PERRET (S)": { score: 77, rang: 10 },
        "R. FRADET (S)": { score: 74, rang: 13 },
        "Y. BONNEFOY (S)": { score: 73, rang: 14 },
        "A. FABRE (S)": { score: 92, rang: 1 },
        "F. HEAD (S)": { score: 86, rang: 4 },
        "C. LAFFON-PARIAS": { score: 83, rang: 6 }
    },
    eleveurs: {
        // Top éleveurs
        "X. RICHARD": { score: 74, rang: 15 },
        "TAKE FIVE SAS, MME J. SOUBAGNE": { score: 72, rang: 18 },
        "H. MONCHAUX": { score: 70, rang: 21 },
        "JPJ. DUBOIS": { score: 80, rang: 9 },
        "MME L. LEMIERE DUBOIS": { score: 75, rang: 14 },
        "A. CHOPARD": { score: 73, rang: 16 },
        "A. CHOPARD, MME R. KHADDAM, LEMZAR SARL": { score: 71, rang: 19 },
        "GUY PARIENTE HOLDING": { score: 79, rang: 10 },
        "SCEA MARMION VAUVILLE": { score: 70, rang: 21 },
        "P. JABOT": { score: 72, rang: 18 },
        "E. PUERARI, ECURIE DU PARC MONCEAU, MME A. GRAVEREAUX, OCEANIC BLOODSTOCK INC": { score: 83, rang: 7 },
        "T.DE LA HERONNIERE": { score: 75, rang: 14 },
        "SUC. D.DE LA HERONNIERE": { score: 74, rang: 15 },
        "E.A.R.L. ELEVAGE DES LOGES": { score: 68, rang: 22 },
        "HARAS DU LOGIS SAINT GERMAIN": { score: 77, rang: 12 },
        "ECURIE BERTRAND MILLIERE, C. MILLIERE": { score: 69, rang: 22 },
        "HARAS DE GRANDCAMP EARL": { score: 82, rang: 8 },
        "DARLEY": { score: 90, rang: 2 },
        "WERTHEIMER ET FRERE": { score: 88, rang: 3 }
    },
    proprietaires: {
        // Top propriétaires
        "GOUSSERIE RACING": { score: 73, rang: 14 },
        "TAKE FIVE SAS": { score: 70, rang: 17 },
        "H.MONCHAUX/MME K.RICHARD": { score: 68, rang: 20 },
        "MR JEAN-PIERRE-JOSEPH DUBOIS": { score: 82, rang: 7 },
        "EC.PUGLIA/EC.J.PIASCO/EC.METAL": { score: 70, rang: 17 },
        "R.CAPOZZI/MME M.BLANC": { score: 69, rang: 19 },
        "MR BERNARD GIRAUDON": { score: 72, rang: 15 },
        "MME CRISTEL MARTINA": { score: 68, rang: 20 },
        "G.AUGUSTIN-NORMAND": { score: 78, rang: 10 },
        "ECURIE D.LAYANI/GOUSSERIE RACING": { score: 75, rang: 12 },
        "ECURIE DU SUD": { score: 71, rang: 16 },
        "ECURIE THOMAS SIVADIER": { score: 67, rang: 21 },
        "LE MARAIS SAS": { score: 74, rang: 13 },
        "ECURIE BERTRAND MILLIERE": { score: 69, rang: 19 },
        "ECURIE VIVALDI": { score: 77, rang: 11 },
        "MR FABRICE FANTAUZZA": { score: 65, rang: 22 },
        "GODOLPHIN SNC": { score: 89, rang: 3 },
        "WERTHEIMER & FRERE": { score: 87, rang: 4 }
    }
};

// Fonction pour calculer le score théorique d'un participant
function calculerScoreTheorique(chevalNom, jockeyNom, entraineurNom, eleveursNom, proprietaireNom) {
    // Récupérer les scores existants ou utiliser des valeurs par défaut
    const scoreCheval = (classementData.chevaux[chevalNom]?.score) || 50;
    const scoreJockey = (classementData.jockeys[jockeyNom]?.score) || 50;
    const scoreEntraineur = (classementData.entraineurs[entraineurNom]?.score) || 50;
    const scoreEleveur = (classementData.eleveurs[eleveursNom]?.score) || 50;
    const scoreProprietaire = (classementData.proprietaires[proprietaireNom]?.score) || 50;

    // Calculer le score pondéré selon les coefficients
    return (
        0.55 * scoreCheval +
        0.15 * scoreJockey +
        0.12 * scoreEntraineur +
        0.10 * scoreEleveur +
        0.08 * scoreProprietaire
    );
}