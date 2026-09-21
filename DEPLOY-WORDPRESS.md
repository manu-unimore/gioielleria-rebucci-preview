# Pubblicare questo sito su WordPress

Il sito e' stato messo online come **bozza** su <https://manu.magulab.it>
(WordPress 7.1.1, tema Twenty Twenty-Five). Questo documento serve a
rifare il lavoro senza ripercorrere gli errori.

## Come e' montato

Il sito e' una pagina sola con CSS e JavaScript su misura, legati alla
struttura esatta del DOM. **Non va ricostruito a blocchi Gutenberg**:
qualsiasi conversione rompe il legame fra markup, stili e animazioni.
Va incollato cosi' com'e' dentro un unico blocco `core/html`.

| Pezzo | Dove sta |
|---|---|
| Pagina | `gioielleria-rebucci`, id **35**, impostata come homepage |
| Template | `rebucci-schermo-intero` — solo `<!-- wp:post-content /-->`, niente intestazione ne' pie' di pagina |
| Foto | Libreria media, id 16-31 |
| Plugin | WPCode, solo per i meta nel `<head>` |

Serve l'accesso via REST API con una **Application Password**; il resto
si fa da `tools/build-wordpress.py`.

```bash
curl -u utente:password 'https://SITO/wp-json/wp/v2/media?per_page=100' > media.json
python3 tools/build-wordpress.py --media media.json --out page.json
curl -u utente:password -X PUT -H 'Content-Type: application/json' \
     --data-binary @page.json 'https://SITO/wp-json/wp/v2/pages/35'
```

## Le due trappole, spiegate

### 1. WordPress corrompe le `&` nel JavaScript

`wptexturize` trasforma parte dei `&&` in `&#038;&#038;` e il codice smette
di funzionare. Non colpisce tutti: nel nostro caso 6 su 20.

La causa e' sottile. WordPress protegge il contenuto di `<script>`, ma per
farlo deve sapere dove quel tag comincia e finisce. Le comparazioni
JavaScript — `d < 460`, `o > 0.6` — al suo parser sembrano tag HTML, gli
sballano lo stack, e da quel punto in poi la protezione salta.

**Soluzione adottata:** il JavaScript viaggia in base64. Quell'alfabeto non
contiene `&`, `<` o `>`, quindi nessun filtro puo' toccarlo; un piccolo
loader lo ricostruisce come Blob e lo esegue. Anche il loader e' scritto
senza quei caratteri — attenzione a non reintrodurli modificandolo
(per esempio una funzione freccia `c => c.charCodeAt(0)` contiene `>`).

Il CSS invece passa intatto: non contiene `&`.

### 2. Il tema sposta i livelli fissi

Twenty Twenty-Five applica `margin-block-start` ai figli di
`.entry-content`. Su un elemento `position: fixed` con `top: 0; bottom: 0`
quel margine lo spinge giu' di 19,2px **e ne accorcia l'altezza**: compare
una banda in cima e tutta la scena 3D va fuori asse.

Non basta azzerare i margini di `.wp-site-blocks > *`: le nostre sezioni
sono figlie di `.entry-content`. Il reset completo e' in `WP_CSS` dentro
lo script di build.

## Immagini responsive

Caricando le foto, WordPress genera da solo le varianti ridotte (300px,
768px). Lo script costruisce `srcset` e `sizes` da quelle, con le larghezze
prese da `styles.css` (breakpoint 760px). Su un telefono DPR 2 il peso
delle foto scende da **569 KB a 317 KB**, il 44% in meno. Su desktop il
guadagno e' minimo (3%), perche' le foto sono gia' vicine alla dimensione
utile.

Due dettagli da non perdere:

- **`data-full` e lo zoom.** Il dialog fa `img.currentSrc`, che con srcset
  restituisce la *variante scelta*, non l'originale: senza correzione lo
  zoom mostrerebbe l'immagine piccola ingrandita. Ora `script.js` prova
  prima `img.dataset.full`, che lo script di build scrive su ogni foto.
- **Varianti inutili.** Per `r13` la variante da 768px pesa *piu'*
  dell'originale da 799px. Lo script scarta le varianti piu' larghe o piu'
  pesanti dell'originale.

Non serve invece combattere il `sizes="auto"` che WordPress aggiunge alle
immagini `loading="lazy"`: e' stato verificato con URL mai visti dal
browser e sceglie correttamente la variante giusta. Se in prova sembra
scegliere gli originali, e' la **cache**: un browser che ha gia' il file
grande preferisce quello.

## Indicizzazione

Il sito e' una bozza e **non deve finire sui motori di ricerca**: un sito
di un'attivita' reale indicizzato su un dominio personale fa concorrenza
al sito vero quando arrivera'.

`blog_public` non e' esposto via REST e WPCode non ha API, quindi questo
passaggio e' **manuale**. Da *WordPress → Code Snippets → Header & Footer*,
riquadro Header:

```html
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0A1613">
```

Un `<meta robots>` messo nel corpo della pagina non serve: i crawler lo
leggono solo nel `<head>`.

## Rimasto da decidere

Note che erano nei commenti di `index.html`. Lo script di build li rimuove
dalla pagina pubblicata — su un sito fatto per mostrarlo alla cliente non
devono comparire nel sorgente — quindi sono riportate qui.

- **Anno di apertura**: 1964 nel testo 46vie, 1963 sulla pagina Facebook.
- **Numero civico**: 15 (46vie) oppure 17 (Facebook). Finisce anche nel
  JSON-LD, quindi sbagliarlo ha conseguenze.
- **Orari**: non pubblicati da nessuna parte; per ora il sito rimanda al
  telefono.
- **Foto Instagram**: segnaposto dall'archivio, da sostituire con i post
  reali. La sezione promette "le novita', prima in vetrina e poi qui".
