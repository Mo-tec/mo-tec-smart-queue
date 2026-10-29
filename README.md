# MO TEC SMART QUEUE PREMIUM

## Foleni kwenye TV
Admin akishaingia, bonyeza **FUNGUA FOLENI YA TV**, au fungua `display.html` kwenye browser ya TV na uweke full screen. TV inaonyesha namba inayohudumiwa sasa na namba tano zinazofuata; kwenye Firebase inasikiliza mabadiliko moja kwa moja, na kwenye Demo inajisasisha kila sekunde 5. Admin akibonyeza **ITA**, namba inaonekana kwenye TV; **MALIZA** huiondoa kwenye sehemu ya anayehudumiwa. TV inaonyesha namba na huduma pekee, bila jina au simu ya mteja. Demo inafanya kazi kati ya tabs za browser/origin moja pekee. Ili TV, admin na simu za wateja zishirikiane kwenye vifaa tofauti, jaza `firebase-config.js`, wezesha Firebase na deploy Hosting pamoja na Firestore rules.

## 1. Jaribio bila Firebase
Demo inaweza kufunguliwa kwa kubonyeza `index.html` moja kwa moja. Kwa majaribio ya QR kwenye kifaa hicho, ni bora kuitumia kupitia web server: ukiwa na Python, fungua terminal kwenye folder la project na endesha `python -m http.server 8000`, kisha tembelea `http://localhost:8000`. Kamera ya browser inahitaji HTTPS au localhost. Firebase halisi inahitaji hosting ya HTTPS.

Demo huhifadhi data kwenye browser hiyo tu (localStorage), si kwa wateja wengi. Ukurasa wa mwanzo una QR ya pamoja yenye kiungo cha `?entry=1`. Mtu akiiscan, anachagua Mteja, Admin au Mahudhurio. Mteja hujaza taarifa, huduma na uhakiki hatua kwa hatua kisha hupata tiketi. Admin huingiza email na nywila kabla ya kufungua Dashboard, Kiosk, Scan Tiketi na usajili wa wafanyakazi. Mahudhurio yana scan ya QR ya mfanyakazi kwa kuingia na kutoka. Admin anaweza kupakua QR ya mwanzo na QR ya mteja kwenye Dashboard. QR ya mteja ya `?register=1` bado hufungua hatua ya kwanza moja kwa moja.

Kwa demo, mtu wa kwanza anayechagua Admin hutengeneza email na nywila ya majaribio kwenye browser hiyo. Login hii ni ya majaribio ya kifaa kimoja; si ulinzi wa matumizi halisi. Tovuti ya HTTPS na Firebase zinahitajika kwa wateja wa vifaa tofauti. QR ya localhost ni ya kifaa hicho pekee.

## 2. Firebase Spark (bure)
1. Tengeneza Firebase project, wezesha Firestore na Authentication > Sign-in method > Anonymous **na** Email/Password.
2. Project Settings > Your apps > Web App: nakili config ndani ya `firebase-config.js`.
3. Install Node.js na Firebase CLI (`npm install -g firebase-tools`).
4. Kwenye folder ya project, tumia `firebase login`, `firebase use --add`, kisha `firebase deploy --only firestore:rules,hosting`. Usi-deploy `functions` kwenye Spark.
5. Firebase Console > Authentication > Users: tengeneza admin user (Email/Password), nakili UID. Firestore > `admins` > document ID = UID; field `enabled` (boolean) = `true`. Usifanye admin kwa anonymous user.
6. Fungua Firebase Hosting URL (HTTPS), scan QR ya mwanzo au nenda kwenye `?staff=1`, kisha ingia kwa email/password ya admin. Pakua QR ya mwanzo kwenye Dashboard na uichapishe au uisambaze. Mteja akiscan anachagua Mteja, anajaza huduma na kupata tiketi. Kiosk na Scan Tiketi zinapatikana baada ya admin kuingia.

Folder la `functions/` ni code ya toleo la awali na halitumiki kwenye Spark. Usi-deploy Functions hizo pamoja na toleo hili; ukihamia Blaze baadaye, kazi za seva zitahitaji kusawazishwa na muundo mpya wa Firestore kwanza.

**Tahadhari:** Spark ina vikomo vya matumizi. Data ya tiketi yenye namba na huduma inasomeka kwa umma ili TV ifanye kazi; jina, simu na maelezo yako kwenye `ticketDetails` yanayosomwa na admin pekee. Namba hutolewa kwa Firestore transaction na sheria za Firestore. Admin pekee hubadilisha hali ya foleni. Kwa matumizi makubwa, ongeza App Check, kinga ya spam, na sera ya kufuta data. Kwa kuwa QR ya mahudhurio ni siri ya mhusika, mtu anayeipata anaweza kusaini kwa niaba yake; Spark haina uthibitisho wa seva wa uwepo wa mfanyakazi.

## 3. SMS za Beem Africa
SMS hazijaunganishwa bado. Usiweke Beem API keys kwenye HTML/JS ya browser. Tumia Cloud Function na Firebase Secrets kwa API credentials, na tuma SMS baada ya tiketi kuundwa; weka idempotency/retry ili SMS zisijirudie. Hii starter haidai SMS zimetumwa.

## 4. QR na camera
QR ya mwanzo ina kiungo cha `?entry=1` na kufungua uchaguzi wa sehemu tatu. QR ya mteja ina `?register=1` na kufungua fomu moja kwa moja. QR ya tiketi inasimba namba ya foleni (mfano `A001`), ambayo admin anaweza kuitafuta kwenye Scan Tiketi. QR ya mfanyakazi inafungua Mahudhurio. Kamera ya scanner ya ndani inahitaji HTTPS au localhost na ruhusa ya camera. Scanner hutumia html5-qrcode iliyohifadhiwa ndani ya mradi, ina fallback ya BarcodeDetector, na ikishindikana namba inaweza kuingizwa kwa mkono.

Maktaba ya kutengeneza QR imejumuishwa ndani ya `index.html`, kwa hiyo QR ya mwanzo haitegemei `public/qrcode.min.js` kupakiwa kando. Ukibadilisha tovuti kwenye GitHub Pages au Hosting, pakia `index.html` mpya. QR iliyotengenezwa kutoka `file://` au `localhost` haitafunguka kwenye simu nyingine; fungua tovuti ya HTTPS kabla ya kuchapisha QR.

## 5. Usalama
Kwa production, zingatia kuweka kikomo cha matumizi kwa anonymous users, kulinda taarifa binafsi, na kuepuka kutuma taarifa za wateja kwa huduma zisizoidhinishwa. Usichapishe secrets kwenye repository.

## 6. Mahudhurio ya wafanyakazi

Admin akiingia kwenye Dashboard anaweza kusajili mfanyakazi kwa jina. Mfumo utatoa QR na msimbo binafsi wa herufi 16 mara moja; pakua QR na umpe mhusika kwa njia salama. Mfanyakazi akiiscan kwa kamera ya simu, ukurasa wa Mahudhurio utafunguka na kumwonyesha jina pamoja na kitufe cha kuthibitisha kuingia. Akiscan tena anapotoka, ataona kitufe cha kuthibitisha kutoka. Kwenye kifaa cha mapokezi anaweza kutumia kitufe cha kamera ndani ya ukurasa, au kuingiza msimbo kwa mkono. Dashboard inaonyesha saa za kuingia na kutoka kwa siku ya Tanzania. Kila hatua inaruhusiwa mara moja tu kwa siku.

Katika Firebase Spark, muda wa kusaini unawekwa na `serverTimestamp()` na sheria za Firestore zinahitaji ulingane na muda wa seva. Admin husoma rekodi kupitia Firestore. Deploy sheria za `firestore.rules` pamoja na Hosting. QR ya localhost haitafunguka kwenye simu nyingine: tumia tovuti ya HTTPS. Katika demo, data ni ya browser moja tu, hivyo haiwezi kutumika kama rekodi rasmi ya vifaa vingi. QR au msimbo ni uthibitisho wa mwenye kuingia; mtu aliyepewa QR ya mwenzake anaweza kusaini kwa niaba yake.
