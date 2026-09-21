#!/usr/bin/env python3
"""
Genera il contenuto della pagina WordPress a partire dal sito statico.

Il sito e' una pagina sola con CSS e JS su misura, fortemente legati alla
struttura del DOM: non va ricostruito a blocchi Gutenberg, va incollato
dentro un unico blocco core/html in un template senza intestazione.

    python3 tools/build-wordpress.py --media media.json --out page.json

`media.json` e' la risposta di GET /wp-json/wp/v2/media?per_page=100
(campi id, source_url, media_details). Serve per riscrivere gli URL delle
foto e per costruire srcset dalle varianti che WordPress ha generato.

Il risultato e' un JSON {"content": ...} da mandare in PUT a
/wp-json/wp/v2/pages/<id>.

Due trappole di WordPress, spiegate in DEPLOY-WORDPRESS.md, sono gia'
gestite qui: le "e commerciali" nel JavaScript e i margini del tema.
"""
import argparse, base64, json, os, re, sys

# Larghezze prese da styles.css: breakpoint a 760px.
#   .tall min(30vw,26rem) / 56vw   .wide min(44vw,44rem) / 80vw
#   .small min(17vw,15rem) / 32vw  .square min(32vw,30rem) / 62vw
#   .frame min(27vw,28rem) / 44vw  (meno il padding)  .feed -> due colonne
SIZES = {
    'square': '(max-width: 760px) 62vw, 32vw',
    'tall':   '(max-width: 760px) 56vw, 30vw',
    'wide':   '(max-width: 760px) 80vw, 44vw',
    'small':  '(max-width: 760px) 32vw, 17vw',
    'frame':  '(max-width: 760px) 38vw, 24vw',
    'feed':   '(max-width: 760px) 31vw, 18vw',
}

WP_CSS = """/* ---- innesto WordPress ---- */
/* I contenitori del tema non devono aggiungere spazi ne' limiti di larghezza. */
.wp-site-blocks,.entry-content,.wp-block-post-content{margin:0!important;padding:0!important;max-width:none!important;display:block!important}
/* Twenty Twenty-Five mette margin-block-start sui figli di .entry-content.
   Su un elemento position:fixed con top:0/bottom:0 quel margine lo sposta
   di 19,2px e ne accorcia l'altezza: la scena finisce disallineata. */
.wp-site-blocks>*,.entry-content>*,.wp-block-post-content>*{margin-block-start:0!important;margin-block-end:0!important;margin-top:0!important;margin-bottom:0!important;max-width:none!important}
/* Nessun contenitore deve creare un containing block per position:fixed. */
.wp-site-blocks,.entry-content,.wp-block-post-content{transform:none!important;filter:none!important;perspective:none!important;contain:none!important;will-change:auto!important}
/* Barra di amministrazione, visibile solo da loggati. */
body.admin-bar{margin-top:0!important}
#wpadminbar{position:fixed!important;z-index:99999}
"""

BOOTSTRAP = """<script>
(function(){
  var r=document.documentElement;
  if(!r.dataset.tone) r.dataset.tone="soglia";
  if(!new URLSearchParams(location.search).has("piatto")){
    r.classList.add("is-3d");
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) r.classList.add("calmo");
  }
})();
</script>"""


def catalogo_media(media):
    """Per ogni file: le varianti che conviene servire, piu' l'originale."""
    out = {}
    for m in media:
        nome = m['source_url'].split('/')[-1]
        d = m.get('media_details') or {}
        if 'width' not in d:
            continue
        piena_w, piena_peso = d['width'], d.get('filesize') or 0
        varianti = []
        for chiave, v in (d.get('sizes') or {}).items():
            if chiave in ('thumbnail', 'full'):
                continue
            # scarta le varianti inutili: piu' larghe o piu' pesanti dell'originale
            if v['width'] >= piena_w:
                continue
            if (v.get('filesize') or 0) >= piena_peso:
                continue
            varianti.append((v['width'], v['source_url']))
        varianti.append((piena_w, m['source_url']))
        out[nome] = {'varianti': sorted(set(varianti)), 'piena': m['source_url']}
    return out


def classe_foto(contesto):
    classi = ' '.join(re.findall(r'class="([^"]*)"', contesto)[-3:])
    for k in ('feed', 'frame', 'square', 'tall', 'wide', 'small'):
        if k in classi:
            return k
    return 'tall'


def costruisci(radice, media):
    cat = catalogo_media(media)
    per_nome = {m['source_url'].split('/')[-1]: m['source_url'] for m in media}

    html = open(os.path.join(radice, 'index.html'), encoding='utf-8').read()
    css = open(os.path.join(radice, 'styles.css'), encoding='utf-8').read()
    js = open(os.path.join(radice, 'script.js'), encoding='utf-8').read()

    corpo = html[html.find('<body>') + len('<body>'):html.rfind('</body>')]
    # Le note interne non devono finire nel sorgente pubblico.
    corpo = re.sub(r'<!--.*?-->', '', corpo, flags=re.S)

    mancanti = []

    def con_srcset(m):
        tag, nome = m.group(0), m.group(1)
        if nome not in cat:
            mancanti.append(nome)
            return tag
        c = cat[nome]
        tipo = classe_foto(corpo[max(0, m.start() - 320):m.start()])
        srcset = ', '.join(f'{u} {w}w' for w, u in c['varianti'])
        # data-full: lo zoom deve aprire l'originale, non la variante scelta
        # da srcset. Senza questo, img.currentSrc restituisce la miniatura.
        return tag.replace('<img',
            f'<img srcset="{srcset}" sizes="{SIZES[tipo]}" data-full="{c["piena"]}"', 1)

    corpo = re.sub(r'<img[^>]*src="assets/foto/([^"]+)"[^>]*>', con_srcset, corpo)
    corpo = re.sub(r'(src="|href="|url\(\s*[\'"]?)assets/(?:foto/)?([A-Za-z0-9._-]+)',
                   lambda m: f'{m.group(1)}{per_nome[m.group(2).split("/")[-1]]}'
                   if m.group(2).split('/')[-1] in per_nome else m.group(0), corpo)

    resti = re.findall(r'assets/[A-Za-z0-9./_-]+', corpo)
    if resti or mancanti:
        print(f'  ATTENZIONE: non mappati {set(mancanti) | set(resti)}', file=sys.stderr)

    font = '\n'.join(re.findall(
        r'<link rel="(?:preconnect|stylesheet)"[^>]*fonts\.g[^>]*>', html))

    # --- il JavaScript viaggia in base64 ---
    # wptexturize trasforma parte dei "&&" in "&#038;&#038;": le comparazioni
    # JS (d < 460, o > 0.6) sembrano tag HTML al parser di WordPress e gli
    # sballano lo stack che dovrebbe proteggere <script>. L'alfabeto base64
    # non contiene & < >, quindi nessun filtro puo' toccarlo. Anche il loader
    # qui sotto e' scritto senza quei caratteri.
    b64 = base64.b64encode(js.encode('utf-8')).decode('ascii')
    loader = ('<script>\n(function(){\n  var p="%s";\n  function go(){\n'
              '    var b=atob(p), n=b.length, a=new Uint8Array(n), i=0;\n'
              '    for(i=0;i!==n;i++){ a[i]=b.charCodeAt(i); }\n'
              '    var u=URL.createObjectURL(new Blob([a],{type:"text/javascript"}));\n'
              '    var s=document.createElement("script");\n    s.src=u;\n'
              '    s.onload=function(){ URL.revokeObjectURL(u); };\n'
              '    document.body.appendChild(s);\n  }\n'
              '  if(document.readyState==="loading"){'
              ' document.addEventListener("DOMContentLoaded",go); } else { go(); }\n'
              '})();\n</script>\n') % b64

    contenuto = (font + '\n' + BOOTSTRAP + '\n<style>\n' + css + '\n' + WP_CSS
                 + '\n</style>\n' + corpo + '\n' + loader)
    return '<!-- wp:html -->\n' + contenuto + '\n<!-- /wp:html -->'


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--radice', default='.', help='cartella del sito statico')
    ap.add_argument('--media', required=True, help='JSON di /wp/v2/media')
    ap.add_argument('--out', default='page.json', help='file da scrivere')
    a = ap.parse_args()

    media = json.load(open(a.media))
    blocco = costruisci(a.radice, media)
    json.dump({'content': blocco}, open(a.out, 'w'))
    print(f'  scritto {a.out}: {len(blocco):,} caratteri')
    print(f'  immagini con srcset: {blocco.count("srcset=")}')


if __name__ == '__main__':
    main()
