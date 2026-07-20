import { injectScript } from './helpers/inject-script.js';

describe('add-app bootstrap', () => {
  it('initializes the add-app modal when the DOM is already ready', () => {
    window.initAddAppModal = vi.fn();
    injectScript('src/ui/add-app.js');
    expect(window.initAddAppModal).toHaveBeenCalledOnce();
    delete window.initAddAppModal;
  });
});
