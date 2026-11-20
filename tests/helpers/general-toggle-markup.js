// Asserts a checkbox toggle ships inside the General settings section with a
// label wired to its i18n key. Returns the label for further assertions.
export function expectGeneralToggleMarkup(html, { id, i18nKey }) {
  const parsed = document.implementation.createHTMLDocument('New Tab');
  parsed.documentElement.innerHTML = html;

  const checkbox = parsed.getElementById(id);
  expect(checkbox).not.toBeNull();
  expect(checkbox.getAttribute('type')).toBe('checkbox');

  const general = parsed.querySelector('.settings-section[data-section="general"]');
  expect(general).not.toBeNull();
  expect(general.contains(checkbox)).toBe(true);

  const label = general.querySelector(`label[for="${id}"]`);
  expect(label).not.toBeNull();
  expect(label.getAttribute('data-i18n')).toBe(i18nKey);
  return label;
}
