import { createRoot } from 'react-dom/client';
import App from './App';
import './theme/tokens.css';
import { t } from './lib/i18n';

const container = document.getElementById('root');
if (!container) {
  throw new Error(t('找不到 #root 容器'));
}

createRoot(container).render(<App />);
