// Tidslinje-øy: periodefilter (paritet med gamle TimelinePage). Knapperaden er
// SSR-rendret men skjult uten JS — her slås den på og kobles til seksjonene.

const row = document.querySelector('[data-timeline-filter]');
if (row) {
  row.hidden = false;
  const sections = Array.from(document.querySelectorAll('[data-period]'));
  row.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const value = btn.dataset.value || '';
      for (const section of sections) {
        section.hidden = !!value && section.dataset.period !== value;
      }
    });
  });
}
