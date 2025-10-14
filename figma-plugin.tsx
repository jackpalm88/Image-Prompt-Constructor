import React from 'react';
import { createRoot } from 'react-dom/client';

import FigmaPluginApp from './figma-plugin/App';

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <FigmaPluginApp />
    </React.StrictMode>,
  );
}
