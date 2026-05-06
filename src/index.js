import { createWidget } from './components/Map.js';
import styles from './styles/widget.css';

class EcoWidget extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._widget = null;
  }

  static get observedAttributes() {
    return ['region', 'lang', 'iqair-key', 'openaq-key'];
  }

  connectedCallback() {
    const cfg = {
      region:    this.getAttribute('region')     || 'volyn',
      lang:      this.getAttribute('lang')       || 'uk',
      iqairKey:  this.getAttribute('iqair-key')  || process.env.IQAIR_KEY  || '',
      openaqKey: this.getAttribute('openaq-key') || process.env.OPENAQ_KEY || '',
    };

    // Inject widget styles into Shadow DOM
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    this._shadow.appendChild(styleEl);

    // Mount widget
    this._widget = createWidget(this._shadow, cfg);
  }

  attributeChangedCallback() {
    if (this._widget) {
      this._widget.destroy();
      this._shadow.innerHTML = '';
      this.connectedCallback();
    }
  }

  disconnectedCallback() {
    if (this._widget) {
      this._widget.destroy();
      this._widget = null;
    }
  }
}

customElements.define('eco-widget', EcoWidget);
export default EcoWidget;
