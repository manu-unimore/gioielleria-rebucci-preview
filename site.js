// Gioielleria Rebucci — comportamenti minimi. Nessuna dipendenza.

// 1. Testata: passa a stato "stuck" quando la sentinella esce dal viewport.
const testata = document.querySelector('.testata');
const sentinella = document.querySelector('#sentinella');
if (testata && sentinella) {
  new IntersectionObserver(
    ([voce]) => testata.dataset.stuck = String(!voce.isIntersecting),
    { rootMargin: '-1px 0px 0px 0px', threshold: 0 }
  ).observe(sentinella);
}

// 2. Dropdown desktop: hover è gestito in CSS, qui solo tastiera e tocco.
const apribili = document.querySelectorAll('.voce > button[aria-expanded]');
const chiudiTutti = (tranne) => apribili.forEach((b) => {
  if (b !== tranne) b.setAttribute('aria-expanded', 'false');
});

apribili.forEach((bottone) => {
  bottone.addEventListener('click', () => {
    const aperto = bottone.getAttribute('aria-expanded') === 'true';
    chiudiTutti(bottone);
    bottone.setAttribute('aria-expanded', String(!aperto));
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const aperto = document.querySelector('.voce > button[aria-expanded="true"]');
  if (aperto) { aperto.setAttribute('aria-expanded', 'false'); aperto.focus(); }
});

document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.voce')) chiudiTutti(null);
});

// 3. Drawer mobile.
const cassetto = document.querySelector('#cassetto');
const apriMenu = document.querySelector('.apri-menu');
if (cassetto && apriMenu) {
  apriMenu.addEventListener('click', () => {
    if (cassetto.open) {
      cassetto.close();
    } else {
      cassetto.showModal();
      apriMenu.setAttribute('aria-expanded', 'true');
    }
  });

  cassetto.addEventListener('close', () => {
    apriMenu.setAttribute('aria-expanded', 'false');
  });

  cassetto.querySelector('.chiudi')?.addEventListener('click', () => cassetto.close());

  cassetto.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => cassetto.close());
  });

  if (!('closedBy' in cassetto)) {
    cassetto.addEventListener('click', (e) => {
      if (e.target === cassetto) cassetto.close();
    });
  }
}

// 4. Lightbox della vetrina.
const luce = document.querySelector('#luce');
if (luce) {
  const immagine = luce.querySelector('img');
  const didascalia = luce.querySelector('p');

  document.querySelectorAll('.lastra button').forEach((bottone) => {
    bottone.addEventListener('click', () => {
      const foto = bottone.querySelector('img');
      immagine.src = foto.src;
      immagine.alt = foto.alt;
      didascalia.textContent = bottone.closest('.lastra').querySelector('figcaption')?.textContent ?? '';
      luce.showModal();
    });
  });

  // fallback per browser senza `closedby="any"`
  if (!('closedBy' in luce)) {
    luce.addEventListener('click', (e) => { if (e.target === luce) luce.close(); });
  }
}

// 5. Modulo contatti.
const moduloContatti = document.querySelector('.modulo');
if (moduloContatti) {
  moduloContatti.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!moduloContatti.checkValidity()) {
      moduloContatti.reportValidity();
      return;
    }

    const dati = new FormData(moduloContatti);
    const nome = (dati.get('nome') || '').toString().trim();
    const email = (dati.get('email') || '').toString().trim();
    const motivo = (dati.get('motivo') || 'Richiesta informazioni').toString().trim();
    const messaggio = (dati.get('messaggio') || '').toString().trim();

    const oggetto = encodeURIComponent(`Richiesta dal sito: ${motivo} (${nome})`);
    const corpo = encodeURIComponent(
      `Nome: ${nome}\n` +
      `Email: ${email}\n` +
      `Motivo: ${motivo}\n\n` +
      `Messaggio:\n${messaggio}\n`
    );

    window.location.href = `mailto:r_alessandra@me.com?subject=${oggetto}&body=${corpo}`;

    const esito = document.createElement('div');
    esito.className = 'modulo-esito';
    esito.setAttribute('role', 'status');
    esito.innerHTML = `
      <h3>Grazie${nome ? ', ' + nome : ''}.</h3>
      <p>Abbiamo aperto il tuo programma di posta con il messaggio precompilato pronto da inviare ad Alessandra.</p>
      <p class="piccolo fumo">Se il programma di posta non si &egrave; aperto automaticamente, puoi scriverci direttamente a
        <a href="mailto:r_alessandra@me.com">r_alessandra@me.com</a>.</p>
    `;

    moduloContatti.replaceWith(esito);
  });
}

