import { flushSync, mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const app = flushSync(() =>
  mount(App, {
    target: document.getElementById('app')!,
  }),
);

export default app;
