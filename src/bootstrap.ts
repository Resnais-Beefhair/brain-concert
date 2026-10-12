// A small entry point keeps useful HTML visible if the application cannot load.
let saved: string | null = null;
try {
  saved = localStorage.getItem('brain-concert-language');
} catch {}
const lang = saved === 'fi' ? 'fi' : 'en';
const boot = document.getElementById('boot');
if (boot) {
  document.documentElement.lang = lang;
  const label = document.getElementById('boot-label');
  if (label)
    label.textContent = lang === 'fi' ? 'Avataan aivokonserttia…' : 'Opening the brain concert…';
}
void import('./main').catch(() => {
  if (boot?.isConnected) {
    boot.classList.add('failed');
    const label = document.getElementById('boot-label');
    if (label)
      label.textContent =
        lang === 'fi'
          ? 'Sovellusta ei voitu ladata. Tarkista verkkoyhteys ja lataa sivu uudelleen.'
          : 'The application could not load. Check your connection and reload the page.';
  }
});
